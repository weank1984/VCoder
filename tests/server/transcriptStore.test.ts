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

import { listHistorySessions, loadHistorySession } from '../../packages/server/src/history/transcriptStore';

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
});
