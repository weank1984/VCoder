/**
 * Desktop Shell - AuditLogger Tests
 * Tests for DesktopAuditLogger: JSONL writing, truncation, rotation, error swallowing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockStat, mockAppendFile, mockRename, mockReadFile, mockWriteFile, mockMkdir } = vi.hoisted(() => ({
  mockStat: vi.fn(),
  mockAppendFile: vi.fn(),
  mockRename: vi.fn(),
  mockReadFile: vi.fn(),
  mockWriteFile: vi.fn(),
  mockMkdir: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  default: {
    stat: mockStat,
    appendFile: mockAppendFile,
    rename: mockRename,
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    mkdir: mockMkdir,
  },
}));

import { DesktopAuditLogger } from '../../apps/desktop-shell/src/auditLogger.js';

describe('DesktopAuditLogger', () => {
  let logger: DesktopAuditLogger;
  const stateDir = '/tmp/test-state';

  beforeEach(() => {
    mockStat.mockReset();
    mockAppendFile.mockReset();
    mockRename.mockReset();
    mockReadFile.mockReset();
    mockWriteFile.mockReset();
    mockMkdir.mockReset();

    // Default: file does not exist (stat throws)
    mockStat.mockRejectedValue(new Error('ENOENT'));
    mockAppendFile.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);

    logger = new DesktopAuditLogger(stateDir);
  });

  describe('log()', () => {
    it('should write an entry as JSONL (one JSON line)', async () => {
      const entry = {
        timestamp: '2026-01-01T00:00:00.000Z',
        sessionId: 'sess-1',
        eventType: 'session_start' as const,
        data: { source: 'user' },
      };

      logger.log(entry);

      // Wait for the internal write queue to drain
      await vi.waitFor(() => {
        expect(mockAppendFile).toHaveBeenCalledTimes(1);
      });

      const writtenLine = mockAppendFile.mock.calls[0][1] as string;
      expect(writtenLine.endsWith('\n')).toBe(true);

      const parsed = JSON.parse(writtenLine.trim());
      expect(parsed.sessionId).toBe('sess-1');
      expect(parsed.eventType).toBe('session_start');
      expect(parsed.data.source).toBe('user');
    });

    it('should write to the correct log path', async () => {
      logger.log({
        timestamp: '2026-01-01T00:00:00.000Z',
        sessionId: 'sess-1',
        eventType: 'session_start',
        data: {},
      });

      await vi.waitFor(() => {
        expect(mockAppendFile).toHaveBeenCalledTimes(1);
      });

      expect(mockAppendFile.mock.calls[0][0]).toBe(`${stateDir}/audit.jsonl`);
      expect(mockAppendFile.mock.calls[0][2]).toBe('utf-8');
    });

    it('should swallow write errors silently', async () => {
      mockAppendFile.mockRejectedValue(new Error('disk full'));

      // This should not throw
      logger.log({
        timestamp: '2026-01-01T00:00:00.000Z',
        sessionId: 'sess-1',
        eventType: 'error',
        data: {},
      });

      // Give the queue time to process and swallow
      await new Promise((r) => setTimeout(r, 50));

      // No error should propagate; the test passing is the assertion
    });
  });

  describe('logUserPrompt()', () => {
    it('should log a user_prompt entry', async () => {
      logger.logUserPrompt('sess-1', 'Hello world');

      await vi.waitFor(() => {
        expect(mockAppendFile).toHaveBeenCalledTimes(1);
      });

      const parsed = JSON.parse((mockAppendFile.mock.calls[0][1] as string).trim());
      expect(parsed.eventType).toBe('user_prompt');
      expect(parsed.data.prompt).toBe('Hello world');
      expect(parsed.timestamp).toBeDefined();
    });

    it('should truncate prompts longer than 500 characters', async () => {
      const longPrompt = 'x'.repeat(600);
      logger.logUserPrompt('sess-1', longPrompt);

      await vi.waitFor(() => {
        expect(mockAppendFile).toHaveBeenCalledTimes(1);
      });

      const parsed = JSON.parse((mockAppendFile.mock.calls[0][1] as string).trim());
      // truncate(s, 500) returns first 500 chars + ellipsis character
      expect(parsed.data.prompt.length).toBe(501);
      expect(parsed.data.prompt.startsWith('x'.repeat(500))).toBe(true);
    });

    it('should not truncate prompts of exactly 500 characters', async () => {
      const exactPrompt = 'y'.repeat(500);
      logger.logUserPrompt('sess-1', exactPrompt);

      await vi.waitFor(() => {
        expect(mockAppendFile).toHaveBeenCalledTimes(1);
      });

      const parsed = JSON.parse((mockAppendFile.mock.calls[0][1] as string).trim());
      expect(parsed.data.prompt).toBe(exactPrompt);
      expect(parsed.data.prompt.length).toBe(500);
    });
  });

  describe('logToolCall()', () => {
    it('should log a tool_call entry with toolName and input', async () => {
      logger.logToolCall('sess-1', 'readFile', { path: '/foo.ts' }, 'tc-42');

      await vi.waitFor(() => {
        expect(mockAppendFile).toHaveBeenCalledTimes(1);
      });

      const parsed = JSON.parse((mockAppendFile.mock.calls[0][1] as string).trim());
      expect(parsed.eventType).toBe('tool_call');
      expect(parsed.data.toolName).toBe('readFile');
      expect(parsed.data.toolCallId).toBe('tc-42');
      expect(parsed.data.input).toEqual({ path: '/foo.ts' });
    });
  });

  describe('logFileOperation()', () => {
    it('should log a file_operation entry', async () => {
      logger.logFileOperation('sess-1', '/src/app.ts', 'write', 'accepted');

      await vi.waitFor(() => {
        expect(mockAppendFile).toHaveBeenCalledTimes(1);
      });

      const parsed = JSON.parse((mockAppendFile.mock.calls[0][1] as string).trim());
      expect(parsed.eventType).toBe('file_operation');
      expect(parsed.data.path).toBe('/src/app.ts');
      expect(parsed.data.op).toBe('write');
      expect(parsed.data.decision).toBe('accepted');
    });
  });

  describe('logTerminalCommand()', () => {
    it('should log a terminal_command entry', async () => {
      logger.logTerminalCommand('sess-1', 'npm test', '/workspace', 0, 1234);

      await vi.waitFor(() => {
        expect(mockAppendFile).toHaveBeenCalledTimes(1);
      });

      const parsed = JSON.parse((mockAppendFile.mock.calls[0][1] as string).trim());
      expect(parsed.eventType).toBe('terminal_command');
      expect(parsed.data.command).toBe('npm test');
      expect(parsed.data.cwd).toBe('/workspace');
      expect(parsed.data.exitCode).toBe(0);
      expect(parsed.data.durationMs).toBe(1234);
    });
  });

  describe('logSessionStart()', () => {
    it('should log a session_start entry', async () => {
      logger.logSessionStart('sess-1', 'user', 'My Session');

      await vi.waitFor(() => {
        expect(mockAppendFile).toHaveBeenCalledTimes(1);
      });

      const parsed = JSON.parse((mockAppendFile.mock.calls[0][1] as string).trim());
      expect(parsed.eventType).toBe('session_start');
      expect(parsed.data.source).toBe('user');
      expect(parsed.data.title).toBe('My Session');
    });
  });

  describe('logSessionEnd()', () => {
    it('should log a session_end entry', async () => {
      logger.logSessionEnd('sess-1', 'user_closed');

      await vi.waitFor(() => {
        expect(mockAppendFile).toHaveBeenCalledTimes(1);
      });

      const parsed = JSON.parse((mockAppendFile.mock.calls[0][1] as string).trim());
      expect(parsed.eventType).toBe('session_end');
      expect(parsed.data.reason).toBe('user_closed');
    });
  });

  describe('logError()', () => {
    it('should log an error entry', async () => {
      logger.logError('sess-1', 'connection_error', 'Lost connection');

      await vi.waitFor(() => {
        expect(mockAppendFile).toHaveBeenCalledTimes(1);
      });

      const parsed = JSON.parse((mockAppendFile.mock.calls[0][1] as string).trim());
      expect(parsed.eventType).toBe('error');
      expect(parsed.data.errorType).toBe('connection_error');
      expect(parsed.data.message).toBe('Lost connection');
    });

    it('should truncate error messages longer than 300 characters', async () => {
      const longMessage = 'e'.repeat(400);
      logger.logError('sess-1', 'overflow', longMessage);

      await vi.waitFor(() => {
        expect(mockAppendFile).toHaveBeenCalledTimes(1);
      });

      const parsed = JSON.parse((mockAppendFile.mock.calls[0][1] as string).trim());
      expect(parsed.data.message.length).toBe(301);
      expect(parsed.data.message.startsWith('e'.repeat(300))).toBe(true);
    });
  });

  describe('rotation', () => {
    it('should rotate when file exceeds 10MB', async () => {
      const tenMB = 10 * 1024 * 1024;
      mockStat.mockResolvedValue({ size: tenMB });

      logger.log({
        timestamp: '2026-01-01T00:00:00.000Z',
        sessionId: 'sess-1',
        eventType: 'session_start',
        data: {},
      });

      await vi.waitFor(() => {
        expect(mockRename).toHaveBeenCalledTimes(1);
      });

      expect(mockRename).toHaveBeenCalledWith(
        `${stateDir}/audit.jsonl`,
        `${stateDir}/audit.1.jsonl`,
      );
      expect(mockAppendFile).toHaveBeenCalledTimes(1);
    });

    it('should not rotate when file is under 10MB', async () => {
      mockStat.mockResolvedValue({ size: 100 });

      logger.log({
        timestamp: '2026-01-01T00:00:00.000Z',
        sessionId: 'sess-1',
        eventType: 'session_start',
        data: {},
      });

      await vi.waitFor(() => {
        expect(mockAppendFile).toHaveBeenCalledTimes(1);
      });

      expect(mockRename).not.toHaveBeenCalled();
    });

    it('should not rotate when stat fails (file does not exist)', async () => {
      mockStat.mockRejectedValue(new Error('ENOENT'));

      logger.log({
        timestamp: '2026-01-01T00:00:00.000Z',
        sessionId: 'sess-1',
        eventType: 'session_start',
        data: {},
      });

      await vi.waitFor(() => {
        expect(mockAppendFile).toHaveBeenCalledTimes(1);
      });

      expect(mockRename).not.toHaveBeenCalled();
    });
  });
});
