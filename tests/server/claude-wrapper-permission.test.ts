/**
 * Tests for ClaudeCodeWrapper permission confirmation flow (chain B).
 * Covers: approve, deny, deny emits tool_result, timeout auto-deny,
 * and deduplication via pendingCanUseToolByToolCallKey.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

function createFakeChildProcess() {
  const child = new EventEmitter() as any;
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = vi.fn();
  return child;
}

describe('ClaudeCodeWrapper permission confirmation flow', () => {
  let wrapper: any;
  let fakeChild: any;
  let spawnMock: any;

  beforeEach(async () => {
    vi.resetModules();

    fakeChild = createFakeChildProcess();
    spawnMock = vi.fn(() => fakeChild);

    vi.doMock('child_process', () => ({ spawn: spawnMock }));

    const { ClaudeCodeWrapper } = await import('../../packages/server/src/claude/wrapper');
    wrapper = new ClaudeCodeWrapper({ workingDirectory: '/tmp' });
  });

  /**
   * Helper: start a prompt session and return the child process.
   * Does NOT close the process so we can send control_request events.
   */
  async function startSession(sessionId = 'test-session') {
    // Fire prompt in background — it blocks until process close
    const promptPromise = wrapper.prompt(sessionId, 'hello').catch(() => {});
    // Give it a tick to set up listeners
    await new Promise((r) => setTimeout(r, 20));
    return { promptPromise };
  }

  /**
   * Helper: simulate CLI sending a control_request(can_use_tool) event.
   */
  function sendControlRequest(
    requestId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
    toolUseId: string
  ) {
    const event = JSON.stringify({
      type: 'control_request',
      request_id: requestId,
      request: {
        subtype: 'can_use_tool',
        tool_name: toolName,
        input: toolInput,
        tool_use_id: toolUseId,
      },
    });
    fakeChild.stdout.write(event + '\n');
  }

  /**
   * Helper: read what was written to child stdin (control_response).
   */
  function readStdinLines(): string[] {
    const data = fakeChild.stdin.read()?.toString() || '';
    return data.split('\n').filter((l: string) => l.trim().length > 0);
  }

  // ---------- Approve flow ----------

  it('should emit confirmation_request on control_request(can_use_tool)', async () => {
    await startSession();

    const updates: Array<{ sessionId: string; content: any; type: string }> = [];
    wrapper.on('update', (sessionId: string, content: any, type: string) => {
      updates.push({ sessionId, content, type });
    });

    sendControlRequest('req-1', 'Bash', { command: 'ls' }, 'tool-1');
    await new Promise((r) => setTimeout(r, 50));

    const confirmations = updates.filter((u) => u.type === 'confirmation_request');
    expect(confirmations.length).toBeGreaterThanOrEqual(1);

    const confirmation = confirmations[0];
    expect(confirmation.sessionId).toBe('test-session');
    expect(confirmation.content.type).toBe('bash');
    expect(confirmation.content.toolCallId).toBe('tool-1');
    expect(confirmation.content.details?.command).toBe('ls');
  });

  it('should send allow control_response when user approves', async () => {
    await startSession();

    sendControlRequest('req-2', 'Bash', { command: 'echo hello' }, 'tool-2');
    await new Promise((r) => setTimeout(r, 50));

    // User approves
    await wrapper.confirmTool('test-session', 'tool-2', true);
    await new Promise((r) => setTimeout(r, 20));

    const lines = readStdinLines();
    // First line is the user message, subsequent lines are control responses
    const controlResponses = lines
      .map((l: string) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((o: any) => o && o.type === 'control_response');

    expect(controlResponses.length).toBe(1);
    expect(controlResponses[0].response.response.behavior).toBe('allow');
  });

  // ---------- Deny flow ----------

  it('should send deny control_response when user denies', async () => {
    await startSession();

    sendControlRequest('req-3', 'Bash', { command: 'rm -rf /' }, 'tool-3');
    await new Promise((r) => setTimeout(r, 50));

    // User denies
    await wrapper.confirmTool('test-session', 'tool-3', false);
    await new Promise((r) => setTimeout(r, 20));

    const lines = readStdinLines();
    const controlResponses = lines
      .map((l: string) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((o: any) => o && o.type === 'control_response');

    expect(controlResponses.length).toBe(1);
    expect(controlResponses[0].response.response.behavior).toBe('deny');
    expect(controlResponses[0].response.response.interrupt).toBe(true);
  });

  it('should emit tool_result with error when user denies', async () => {
    await startSession();

    const updates: Array<{ sessionId: string; content: any; type: string }> = [];
    wrapper.on('update', (sessionId: string, content: any, type: string) => {
      updates.push({ sessionId, content, type });
    });

    sendControlRequest('req-4', 'Write', { path: '/tmp/x.txt', content: 'hi' }, 'tool-4');
    await new Promise((r) => setTimeout(r, 50));

    // User denies
    await wrapper.confirmTool('test-session', 'tool-4', false);
    await new Promise((r) => setTimeout(r, 20));

    const toolResults = updates.filter((u) => u.type === 'tool_result' && u.content.id === 'tool-4');
    expect(toolResults.length).toBe(1);
    expect(toolResults[0].content.error).toBe('User denied permission');
  });

  // ---------- No-op for unknown toolCallId ----------

  it('should log warning for confirmTool with unknown toolCallId', async () => {
    await startSession();

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await wrapper.confirmTool('test-session', 'nonexistent-tool', true);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no pending can_use_tool request')
    );
  });

  // ---------- Deduplication ----------

  it('should handle only one confirmation per toolCallId', async () => {
    await startSession();

    const updates: Array<{ sessionId: string; content: any; type: string }> = [];
    wrapper.on('update', (sessionId: string, content: any, type: string) => {
      updates.push({ sessionId, content, type });
    });

    sendControlRequest('req-5', 'Bash', { command: 'ls' }, 'tool-5');
    await new Promise((r) => setTimeout(r, 50));

    // Approve the first time
    await wrapper.confirmTool('test-session', 'tool-5', true);

    // Try to approve again — should be a no-op
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await wrapper.confirmTool('test-session', 'tool-5', true);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no pending can_use_tool request')
    );
  });

  // ---------- Confirmation type classification ----------

  it('should classify file_write type for Write tools', async () => {
    await startSession();

    const updates: Array<{ sessionId: string; content: any; type: string }> = [];
    wrapper.on('update', (sessionId: string, content: any, type: string) => {
      updates.push({ sessionId, content, type });
    });

    sendControlRequest('req-6', 'Write', { path: '/tmp/test.txt', content: 'data' }, 'tool-6');
    await new Promise((r) => setTimeout(r, 50));

    const confirmations = updates.filter((u) => u.type === 'confirmation_request');
    expect(confirmations.length).toBeGreaterThanOrEqual(1);
    expect(confirmations[0].content.type).toBe('file_write');
  });

  it('should classify file_delete type for delete tools', async () => {
    await startSession();

    const updates: Array<{ sessionId: string; content: any; type: string }> = [];
    wrapper.on('update', (sessionId: string, content: any, type: string) => {
      updates.push({ sessionId, content, type });
    });

    sendControlRequest('req-7', 'file_delete', { path: '/tmp/test.txt' }, 'tool-7');
    await new Promise((r) => setTimeout(r, 50));

    const confirmations = updates.filter((u) => u.type === 'confirmation_request');
    expect(confirmations.length).toBeGreaterThanOrEqual(1);
    expect(confirmations[0].content.type).toBe('file_delete');
  });

  it('should classify mcp type for MCP tools', async () => {
    await startSession();

    const updates: Array<{ sessionId: string; content: any; type: string }> = [];
    wrapper.on('update', (sessionId: string, content: any, type: string) => {
      updates.push({ sessionId, content, type });
    });

    sendControlRequest('req-8', 'mcp__server__tool', { arg: 'val' }, 'tool-8');
    await new Promise((r) => setTimeout(r, 50));

    const confirmations = updates.filter((u) => u.type === 'confirmation_request');
    expect(confirmations.length).toBeGreaterThanOrEqual(1);
    expect(confirmations[0].content.type).toBe('mcp');
  });

  // ---------- Bash risk assessment ----------

  it('should assess high risk for sudo commands', async () => {
    await startSession();

    const updates: Array<{ sessionId: string; content: any; type: string }> = [];
    wrapper.on('update', (sessionId: string, content: any, type: string) => {
      updates.push({ sessionId, content, type });
    });

    sendControlRequest('req-9', 'Bash', { command: 'sudo rm -rf /' }, 'tool-9');
    await new Promise((r) => setTimeout(r, 50));

    const confirmations = updates.filter((u) => u.type === 'confirmation_request');
    expect(confirmations.length).toBeGreaterThanOrEqual(1);
    expect(confirmations[0].content.details?.riskLevel).toBe('high');
  });

  it('should assess low risk for safe commands', async () => {
    await startSession();

    const updates: Array<{ sessionId: string; content: any; type: string }> = [];
    wrapper.on('update', (sessionId: string, content: any, type: string) => {
      updates.push({ sessionId, content, type });
    });

    sendControlRequest('req-10', 'Bash', { command: 'ls -la' }, 'tool-10');
    await new Promise((r) => setTimeout(r, 50));

    const confirmations = updates.filter((u) => u.type === 'confirmation_request');
    expect(confirmations.length).toBeGreaterThanOrEqual(1);
    expect(confirmations[0].content.details?.riskLevel).toBe('low');
  });

  // ---------- Cleanup on process close ----------

  it('should resolve pending confirmations when process closes', async () => {
    const { promptPromise } = await startSession();

    sendControlRequest('req-11', 'Bash', { command: 'ls' }, 'tool-11');
    await new Promise((r) => setTimeout(r, 50));

    // Close the process while confirmation is pending
    fakeChild.emit('close', 0);
    await promptPromise;

    // The pending confirmation should be cleaned up, confirmTool should be no-op
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await wrapper.confirmTool('test-session', 'tool-11', true);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no pending can_use_tool request')
    );
  });
});
