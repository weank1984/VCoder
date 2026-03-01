import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let mockedHomeDir = '';

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return {
    ...actual,
    homedir: () => mockedHomeDir,
  };
});

import { listHistorySessions, loadHistorySession, loadHistorySessionFull } from '../../packages/server/src/history/transcriptStore';

function writeJsonl(filePath: string, lines: unknown[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    lines.map((l) => JSON.stringify(l)).join('\n') + '\n',
    'utf8'
  );
}

describe('TranscriptStore', () => {
  let tempHome: string;
  let workspacePath: string;
  let prevClaudeDir: string | undefined;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'vcoder-home-'));
    workspacePath = path.join(tempHome, 'myws');
    fs.mkdirSync(workspacePath, { recursive: true });
    mockedHomeDir = tempHome;
    prevClaudeDir = process.env.VCODER_CLAUDE_DIR;
    delete process.env.VCODER_CLAUDE_DIR;
  });

  afterEach(() => {
    if (prevClaudeDir === undefined) delete process.env.VCODER_CLAUDE_DIR;
    else process.env.VCODER_CLAUDE_DIR = prevClaudeDir;
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('lists sessions when projectKey differs by leading separator', async () => {
    // Simulate a Claude projectKey that strips the leading "/" before replacing separators.
    const keyNoLeading = path.normalize(workspacePath).replace(/^[\\/]+/, '').replace(/[/\\]/g, '-');
    const sessionId = 'session1';
    const transcriptPath = path.join(tempHome, '.claude', 'projects', keyNoLeading, `${sessionId}.jsonl`);

    writeJsonl(transcriptPath, [
      { type: 'user', timestamp: 1000, message: { content: 'hello world' } },
      { type: 'assistant', timestamp: 2000, message: { content: [{ type: 'text', text: 'ok' }] } },
    ]);

    const sessions = await listHistorySessions(workspacePath);
    expect(sessions.map((s) => s.id)).toContain(sessionId);
    const s = sessions.find((x) => x.id === sessionId)!;
    expect(s.projectKey).toBe(keyNoLeading);
    expect(s.title).toContain('hello world');
    expect(new Date(s.createdAt).getTime()).toBeGreaterThan(0);
    expect(new Date(s.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(s.createdAt).getTime());
  });

  it('parses message events with message.role and attaches tool_result', async () => {
    const keyNoLeading = path.normalize(workspacePath).replace(/^[\\/]+/, '').replace(/[/\\]/g, '-');
    const sessionId = 'session2';
    const transcriptPath = path.join(tempHome, '.claude', 'projects', keyNoLeading, `${sessionId}.jsonl`);

    writeJsonl(transcriptPath, [
      { type: 'message', timestamp: 1000, message: { role: 'user', content: [{ type: 'text', text: 'hi' }] } },
      {
        type: 'message',
        timestamp: 2000,
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'yo' },
            { type: 'tool_use', id: 't1', name: 'bash', input: { command: 'echo 1' } },
          ],
        },
      },
      {
        type: 'message',
        timestamp: 3000,
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '1', is_error: false }] },
      },
    ]);

    const messages = await loadHistorySession(sessionId, workspacePath);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('hi');
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].content).toContain('yo');
    expect(messages[1].toolCalls?.[0].id).toBe('t1');
    expect(messages[1].toolCalls?.[0].result).toBe('1');
    expect(messages[1].toolCalls?.[0].status).toBe('completed');
    expect(messages[1].contentBlocks).toEqual([
      { type: 'text', content: 'yo' },
      { type: 'tools', toolCallIds: ['t1'] },
    ]);
  });

  it('falls back to ~/.claude/history.jsonl when project directory cannot be derived', async () => {
    const sessionId = 'session3';
    const transcriptPath = path.join(tempHome, '.claude', 'projects', 'random-project-key', `${sessionId}.jsonl`);
    writeJsonl(transcriptPath, [
      { type: 'user', timestamp: 1000, message: { content: 'from index' } },
      { type: 'assistant', timestamp: 2000, message: { content: [{ type: 'text', text: 'ok' }] } },
    ]);

    const historyIndexPath = path.join(tempHome, '.claude', 'history.jsonl');
    writeJsonl(historyIndexPath, [
      { project: workspacePath, sessionId, timestamp: 1234, display: 'from index' },
    ]);

    const sessions = await listHistorySessions(workspacePath);
    expect(sessions.map((s) => s.id)).toContain(sessionId);
    expect(sessions.find((s) => s.id === sessionId)?.projectKey).toBe('random-project-key');
  });

  it('lists sessions across all projects when workspacePath is empty', async () => {
    const projectKey = 'some-project';
    const sessionId = 'session4';
    const transcriptPath = path.join(tempHome, '.claude', 'projects', projectKey, `${sessionId}.jsonl`);
    writeJsonl(transcriptPath, [
      { type: 'user', timestamp: 1000, message: { content: 'global list' } },
      { type: 'assistant', timestamp: 2000, message: { content: [{ type: 'text', text: 'ok' }] } },
    ]);

    const sessions = await listHistorySessions('');
    expect(sessions.map((s) => s.id)).toContain(sessionId);
    expect(sessions.find((s) => s.id === sessionId)?.projectKey).toBe(projectKey);
  });

  it('uses VCODER_CLAUDE_DIR to locate history', async () => {
    const customClaudeDir = path.join(tempHome, 'custom-claude');
    process.env.VCODER_CLAUDE_DIR = customClaudeDir;

    const projectKey = 'custom-project';
    const sessionId = 'session5';
    const transcriptPath = path.join(customClaudeDir, 'projects', projectKey, `${sessionId}.jsonl`);
    writeJsonl(transcriptPath, [
      { type: 'user', timestamp: 1000, message: { content: 'custom dir' } },
      { type: 'assistant', timestamp: 2000, message: { content: [{ type: 'text', text: 'ok' }] } },
    ]);

    const sessions = await listHistorySessions('');
    expect(sessions.map((s) => s.id)).toContain(sessionId);
    expect(sessions.find((s) => s.id === sessionId)?.projectKey).toBe(projectKey);
  });

  // =========================================================================
  // Internal message filtering tests
  // =========================================================================

  it('filters teammate messages out of messages and extracts to teamMessages', async () => {
    const keyNoLeading = path.normalize(workspacePath).replace(/^[\\/]+/, '').replace(/[/\\]/g, '-');
    const sessionId = 'session-teammate';
    const transcriptPath = path.join(tempHome, '.claude', 'projects', keyNoLeading, `${sessionId}.jsonl`);

    writeJsonl(transcriptPath, [
      { type: 'user', timestamp: 1000, message: { content: 'real user question' } },
      {
        type: 'assistant', timestamp: 2000,
        message: { content: [{ type: 'text', text: 'thinking...' }] },
      },
      // Teammate message (should be filtered from messages, extracted to teamMessages)
      {
        type: 'user', timestamp: 3000,
        message: { content: '<teammate-message teammate_id="researcher" color="green" summary="found results">Here are my findings</teammate-message>' },
      },
      {
        type: 'assistant', timestamp: 4000,
        message: { content: [{ type: 'text', text: 'final answer' }] },
      },
    ]);

    const result = await loadHistorySessionFull(sessionId, workspacePath);

    // 1 user + 2 assistant messages (merging happens in UI layer, not here)
    // The key point: the teammate message is NOT in the messages array
    expect(result.messages).toHaveLength(3);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[0].content).toBe('real user question');
    expect(result.messages[1].role).toBe('assistant');
    expect(result.messages[1].content).toContain('thinking...');
    expect(result.messages[2].role).toBe('assistant');
    expect(result.messages[2].content).toContain('final answer');
    // No internal messages in the messages array
    const allContent = result.messages.map(m => m.content).join(' ');
    expect(allContent).not.toContain('teammate-message');

    // teamMessages should be extracted
    expect(result.teamMessages).toBeDefined();
    expect(result.teamMessages).toHaveLength(1);
    expect(result.teamMessages![0].teammateId).toBe('researcher');
    expect(result.teamMessages![0].color).toBe('green');
    expect(result.teamMessages![0].summary).toBe('found results');
    expect(result.teamMessages![0].content).toBe('Here are my findings');
  });

  it('filters system-reminder and CLI command messages from messages', async () => {
    const keyNoLeading = path.normalize(workspacePath).replace(/^[\\/]+/, '').replace(/[/\\]/g, '-');
    const sessionId = 'session-system';
    const transcriptPath = path.join(tempHome, '.claude', 'projects', keyNoLeading, `${sessionId}.jsonl`);

    writeJsonl(transcriptPath, [
      { type: 'user', timestamp: 1000, message: { content: 'user prompt' } },
      { type: 'assistant', timestamp: 2000, message: { content: [{ type: 'text', text: 'response' }] } },
      // system-reminder (should be skipped)
      { type: 'user', timestamp: 3000, message: { content: '<system-reminder>some system info</system-reminder>' } },
      // CLI command (should be skipped)
      { type: 'user', timestamp: 4000, message: { content: '<command-name>/help</command-name>' } },
      // local-command-caveat (should be skipped)
      { type: 'user', timestamp: 5000, message: { content: '<local-command-caveat>caveat text</local-command-caveat>' } },
      // local-command-stdout (should be skipped)
      { type: 'user', timestamp: 6000, message: { content: '<local-command-stdout>output text</local-command-stdout>' } },
    ]);

    const result = await loadHistorySessionFull(sessionId, workspacePath);

    // Only real messages
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[0].content).toBe('user prompt');
    expect(result.messages[1].role).toBe('assistant');
    // No team messages either
    expect(result.teamMessages).toBeUndefined();
  });

  it('does not use internal messages as session title', async () => {
    const keyNoLeading = path.normalize(workspacePath).replace(/^[\\/]+/, '').replace(/[/\\]/g, '-');
    const sessionId = 'session-title';
    const transcriptPath = path.join(tempHome, '.claude', 'projects', keyNoLeading, `${sessionId}.jsonl`);

    writeJsonl(transcriptPath, [
      // First user event is a teammate message - should NOT become title
      {
        type: 'user', timestamp: 1000,
        message: { content: '<teammate-message teammate_id="agent1" summary="init">starting work</teammate-message>' },
      },
      // Second user event is a system-reminder - should NOT become title
      {
        type: 'user', timestamp: 2000,
        message: { content: '<system-reminder>context info</system-reminder>' },
      },
      // Third user event is the real user message - SHOULD become title
      { type: 'user', timestamp: 3000, message: { content: 'Fix the login bug' } },
      { type: 'assistant', timestamp: 4000, message: { content: [{ type: 'text', text: 'ok' }] } },
    ]);

    const sessions = await listHistorySessions(workspacePath);
    const session = sessions.find((s) => s.id === sessionId);
    expect(session).toBeDefined();
    expect(session!.title).toBe('Fix the login bug');
  });

  it('preserves tool_result from internal user events', async () => {
    const keyNoLeading = path.normalize(workspacePath).replace(/^[\\/]+/, '').replace(/[/\\]/g, '-');
    const sessionId = 'session-tool-result';
    const transcriptPath = path.join(tempHome, '.claude', 'projects', keyNoLeading, `${sessionId}.jsonl`);

    writeJsonl(transcriptPath, [
      { type: 'user', timestamp: 1000, message: { content: 'do something' } },
      {
        type: 'assistant', timestamp: 2000,
        message: {
          content: [
            { type: 'text', text: 'running tool' },
            { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'echo hi' } },
          ],
        },
      },
      // Internal user event containing BOTH a tool_result AND a teammate message
      {
        type: 'user', timestamp: 3000,
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 't1', content: 'hi', is_error: false },
            { type: 'text', text: '<teammate-message teammate_id="worker" summary="done">finished</teammate-message>' },
          ],
        },
      },
    ]);

    const result = await loadHistorySessionFull(sessionId, workspacePath);

    // The tool_result should still be attached to the tool call
    expect(result.messages).toHaveLength(2);
    const assistantMsg = result.messages[1];
    expect(assistantMsg.toolCalls).toHaveLength(1);
    expect(assistantMsg.toolCalls![0].id).toBe('t1');
    expect(assistantMsg.toolCalls![0].result).toBe('hi');
    expect(assistantMsg.toolCalls![0].status).toBe('completed');

    // The teammate message should be extracted
    expect(result.teamMessages).toHaveLength(1);
    expect(result.teamMessages![0].teammateId).toBe('worker');
  });
});
