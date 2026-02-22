import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

// Mock preflightCheck to always pass so spawn-arg tests aren't blocked
vi.mock('../../packages/server/src/claude/shared', async () => {
  const actual = await vi.importActual<typeof import('../../packages/server/src/claude/shared')>(
    '../../packages/server/src/claude/shared'
  );
  return {
    ...actual,
    preflightCheck: () => Promise.resolve({ ok: true, checks: [] }),
  };
});

function createFakeChildProcess() {
  const child = new EventEmitter() as any;
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = vi.fn();
  return child;
}

describe('ClaudeCodeWrapper spawn args', () => {
  it('includes --model and --permission-mode plan when enabled', async () => {
    vi.resetModules();

    const fakeChild = createFakeChildProcess();
    const spawnMock = vi.fn(() => {
      // Resolve quickly so prompt() can finish.
      process.nextTick(() => fakeChild.emit('close', 0));
      return fakeChild;
    });

    vi.doMock('child_process', () => ({ spawn: spawnMock }));

    const { ClaudeCodeWrapper } = await import('../../packages/server/src/claude/wrapper');

    const wrapper = new ClaudeCodeWrapper({ workingDirectory: '/tmp' });
    wrapper.updateSettings({ model: 'claude-haiku-4-5-20251001', planMode: true });

    await wrapper.prompt('s1', 'hello');

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const args = spawnMock.mock.calls[0][1] as string[];

    const modelIndex = args.indexOf('--model');
    expect(modelIndex).toBeGreaterThan(-1);
    expect(args[modelIndex + 1]).toBe('claude-haiku-4-5-20251001');

    const permissionIndex = args.indexOf('--permission-mode');
    expect(permissionIndex).toBeGreaterThan(-1);
    expect(args[permissionIndex + 1]).toBe('plan');

    const disallowedIndex = args.indexOf('--disallowed-tools');
    expect(disallowedIndex).toBeGreaterThan(-1);
    expect(args[disallowedIndex + 1]).toBe('AskUserQuestion');

    const permissionPromptIndex = args.indexOf('--permission-prompt-tool');
    expect(permissionPromptIndex).toBeGreaterThan(-1);
    expect(args[permissionPromptIndex + 1]).toBe('stdio');
  });

  it('includes MAX_THINKING_TOKENS env and --include-partial-messages when maxThinkingTokens is set', async () => {
    vi.resetModules();

    const fakeChild = createFakeChildProcess();
    const spawnMock = vi.fn(() => {
      process.nextTick(() => fakeChild.emit('close', 0));
      return fakeChild;
    });

    vi.doMock('child_process', () => ({ spawn: spawnMock }));

    const { ClaudeCodeWrapper } = await import('../../packages/server/src/claude/wrapper');

    const wrapper = new ClaudeCodeWrapper({ workingDirectory: '/tmp' });
    wrapper.updateSettings({ maxThinkingTokens: 16000 });

    await wrapper.prompt('s1', 'hello');

    expect(spawnMock).toHaveBeenCalledTimes(1);
    
    // Verify args include --include-partial-messages
    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).toContain('--include-partial-messages');

    // Verify args include --permission-prompt-tool stdio
    const permissionPromptIndex = args.indexOf('--permission-prompt-tool');
    expect(permissionPromptIndex).toBeGreaterThan(-1);
    expect(args[permissionPromptIndex + 1]).toBe('stdio');
    
    // Verify env includes MAX_THINKING_TOKENS
    const options = spawnMock.mock.calls[0][2] as { env: Record<string, string | undefined> };
    expect(options.env.MAX_THINKING_TOKENS).toBe('16000');
  });

  it('uses --resume when an existing Claude session id is bound', async () => {
    vi.resetModules();

    const fakeChild = createFakeChildProcess();
    const spawnMock = vi.fn(() => {
      process.nextTick(() => fakeChild.emit('close', 0));
      return fakeChild;
    });

    vi.doMock('child_process', () => ({ spawn: spawnMock }));

    const { ClaudeCodeWrapper } = await import('../../packages/server/src/claude/wrapper');

    const wrapper = new ClaudeCodeWrapper({ workingDirectory: '/tmp' });
    wrapper.bindClaudeSessionId('s1', 'claude-session-xyz');

    await wrapper.prompt('s1', 'hello');

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const args = spawnMock.mock.calls[0][1] as string[];

    const resumeIndex = args.indexOf('--resume');
    expect(resumeIndex).toBeGreaterThan(-1);
    expect(args[resumeIndex + 1]).toBe('claude-session-xyz');
    expect(args).not.toContain('--continue');
  });
});
