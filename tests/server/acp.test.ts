/**
 * @vcoder/server Package Tests
 * ACP Server Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Readable, Writable } from 'stream';
import { ACPServer } from '../../packages/server/src/acp/server';
import { ClaudeCodeWrapper } from '../../packages/server/src/claude/wrapper';
import type {
  JsonRpcRequest,
  InitializeParams,
  NewSessionParams,
  Session,
} from '@vcoder/shared';

// Mock ClaudeCodeWrapper
vi.mock('../../packages/server/src/claude/wrapper', () => ({
  ClaudeCodeWrapper: class {
    on = vi.fn();
    prompt = vi.fn().mockResolvedValue(undefined);
    updateSettings = vi.fn();
    bindClaudeSessionId = vi.fn();
    acceptFileChange = vi.fn().mockResolvedValue(undefined);
    rejectFileChange = vi.fn().mockResolvedValue(undefined);
    confirmBash = vi.fn().mockResolvedValue(undefined);
    skipBash = vi.fn().mockResolvedValue(undefined);
    confirmPlan = vi.fn().mockResolvedValue(undefined);
    confirmTool = vi.fn().mockResolvedValue(undefined);
    cancel = vi.fn().mockResolvedValue(undefined);
    promptPersistent = vi.fn().mockResolvedValue(undefined);
    getPersistentSessionStatus = vi.fn().mockReturnValue(null);
    stopPersistentSession = vi.fn().mockResolvedValue(undefined);
    shutdown = vi.fn().mockResolvedValue(undefined);
    constructor(options: unknown) {
      // Mock constructor
    }
  },
}));

describe('ACPServer', () => {
  let mockStdin: Readable;
  let mockStdout: Writable;
  let mockClaudeCode: ClaudeCodeWrapper;
  let server: ACPServer;
  let stdoutData: string[];

  beforeEach(() => {
    // Create mock streams
    mockStdin = new Readable();
    mockStdin._read = vi.fn();

    stdoutData = [];
    mockStdout = new Writable();
    mockStdout._write = (chunk: Buffer, encoding, callback) => {
      stdoutData.push(chunk.toString());
      callback();
    };

    mockClaudeCode = new ClaudeCodeWrapper({ workingDirectory: '/test' });
    server = new ACPServer(mockStdin, mockStdout, mockClaudeCode);
  });

  describe('Initialization', () => {
    it('should create server instance', () => {
      expect(server).toBeDefined();
    });

    it('should handle initialize request', async () => {
      const initParams: InitializeParams = {
        clientInfo: {
          name: 'test-client',
          version: '1.0.0',
        },
        capabilities: {
          streaming: true,
          diffPreview: true,
          thought: true,
          toolCallList: true,
          taskList: true,
          multiSession: true,
        },
        workspaceFolders: ['/workspace'],
      };

      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: initParams,
      };

      // Directly call handleRequest through the server's private method
      // In real scenario, this would be called through stdin
      const response = await (server as any).handleRequest(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      expect(response.result.serverInfo.name).toBe('vcoder-server');
      expect(response.result.capabilities.models).toContain('claude-haiku-4-5-20251001');
    });
  });

  describe('Session Management', () => {
    it('should create new session', async () => {
      const newSessionParams: NewSessionParams = {
        title: 'Test Session',
      };

      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'session/new',
        params: newSessionParams,
      };

      const response = await (server as any).handleRequest(request);

      expect(response.error).toBeUndefined();
      expect(response.result.session).toBeDefined();
      expect(response.result.session.id).toBeDefined();
      expect(response.result.session.title).toBe('Test Session');
    });

    it('should resume a session from Claude CLI history id', async () => {
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'session/resume',
        params: {
          claudeSessionId: 'claude-session-xyz',
          title: 'Resumed',
        },
      };

      const response = await (server as any).handleRequest(request);

      expect(response.error).toBeUndefined();
      expect(response.result.session).toBeDefined();
      expect((response.result.session as Session).title).toBe('Resumed');
      expect((mockClaudeCode as any).bindClaudeSessionId).toHaveBeenCalledTimes(1);
      expect((mockClaudeCode as any).bindClaudeSessionId.mock.calls[0][1]).toBe('claude-session-xyz');
    });

    it('should list sessions', async () => {
      // Create a session first
      await (server as any).handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'session/new',
        params: { title: 'Session 1' },
      });

      // List sessions
      const response = await (server as any).handleRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'session/list',
        params: {},
      });

      expect(response.error).toBeUndefined();
      expect(response.result.sessions).toBeDefined();
      expect(response.result.sessions).toHaveLength(1);
      expect(response.result.sessions[0].title).toBe('Session 1');
    });

    it('should switch session', async () => {
      // Create a session
      const createResponse = await (server as any).handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'session/new',
        params: { title: 'Session 1' },
      });

      const sessionId = createResponse.result.session.id;

      // Switch to the session
      const switchResponse = await (server as any).handleRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'session/switch',
        params: { sessionId },
      });

      expect(switchResponse.error).toBeUndefined();
    });

    it('should delete session', async () => {
      // Create a session
      const createResponse = await (server as any).handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'session/new',
        params: { title: 'Session 1' },
      });

      const sessionId = createResponse.result.session.id;

      // Delete the session
      const deleteResponse = await (server as any).handleRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'session/delete',
        params: { sessionId },
      });

      expect(deleteResponse.error).toBeUndefined();

      // Verify it's deleted
      const listResponse = await (server as any).handleRequest({
        jsonrpc: '2.0',
        id: 3,
        method: 'session/list',
        params: {},
      });

      expect(listResponse.result.sessions).toHaveLength(0);
    });

    it('should return error for non-existent session switch', async () => {
      const response = await (server as any).handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'session/switch',
        params: { sessionId: 'non-existent-id' },
      });

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32000);
    });
  });

  describe('Settings Change', () => {
    it('should handle settings change', async () => {
      const response = await (server as any).handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'settings/change',
        params: {
          sessionId: 'test-session',
          model: 'claude-sonnet-4-5-20250929',
          planMode: true,
        },
      });

      expect(response.error).toBeUndefined();
    });
  });

  describe('File Operations', () => {
    it('should handle file accept', async () => {
      const response = await (server as any).handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'file/accept',
        params: {
          sessionId: 'test-session',
          path: '/test/file.txt',
        },
      });

      expect(response.error).toBeUndefined();
    });

    it('should handle file reject', async () => {
      const response = await (server as any).handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'file/reject',
        params: {
          sessionId: 'test-session',
          path: '/test/file.txt',
        },
      });

      expect(response.error).toBeUndefined();
    });
  });

  describe('Bash Operations', () => {
    it('should handle bash confirm', async () => {
      const response = await (server as any).handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'bash/confirm',
        params: {
          sessionId: 'test-session',
          commandId: 'cmd-123',
        },
      });

      expect(response.error).toBeUndefined();
    });

    it('should handle bash skip', async () => {
      const response = await (server as any).handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'bash/skip',
        params: {
          sessionId: 'test-session',
          commandId: 'cmd-123',
        },
      });

      expect(response.error).toBeUndefined();
    });
  });

  describe('Plan Operations', () => {
    it('should handle plan confirm', async () => {
      const response = await (server as any).handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'plan/confirm',
        params: {
          sessionId: 'test-session',
        },
      });

      expect(response.error).toBeUndefined();
    });
  });

  describe('Tool Confirm (tool/confirm)', () => {
    it('should handle tool/confirm with approve', async () => {
      const response = await (server as any).handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tool/confirm',
        params: {
          sessionId: 'test-session',
          toolCallId: 'tool-123',
          confirmed: true,
        },
      });

      expect(response.error).toBeUndefined();
      expect((mockClaudeCode as any).confirmTool).toHaveBeenCalledWith(
        'test-session',
        'tool-123',
        true,
        undefined
      );
    });

    it('should handle tool/confirm with deny', async () => {
      const response = await (server as any).handleRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tool/confirm',
        params: {
          sessionId: 'test-session',
          toolCallId: 'tool-456',
          confirmed: false,
        },
      });

      expect(response.error).toBeUndefined();
      expect((mockClaudeCode as any).confirmTool).toHaveBeenCalledWith(
        'test-session',
        'tool-456',
        false,
        undefined
      );
    });

    it('should handle tool/confirm with trustAlways option', async () => {
      const response = await (server as any).handleRequest({
        jsonrpc: '2.0',
        id: 3,
        method: 'tool/confirm',
        params: {
          sessionId: 'test-session',
          toolCallId: 'tool-789',
          confirmed: true,
          options: { trustAlways: true },
        },
      });

      expect(response.error).toBeUndefined();
      expect((mockClaudeCode as any).confirmTool).toHaveBeenCalledWith(
        'test-session',
        'tool-789',
        true,
        { trustAlways: true }
      );
    });

    it('should reject tool/confirm with missing toolCallId', async () => {
      const response = await (server as any).handleRequest({
        jsonrpc: '2.0',
        id: 4,
        method: 'tool/confirm',
        params: {
          sessionId: 'test-session',
          confirmed: true,
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain('toolCallId');
    });

    it('should reject tool/confirm with missing confirmed field', async () => {
      const response = await (server as any).handleRequest({
        jsonrpc: '2.0',
        id: 5,
        method: 'tool/confirm',
        params: {
          sessionId: 'test-session',
          toolCallId: 'tool-999',
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain('confirmed');
    });
  });

  describe('Error Handling', () => {
    it('should return method not found error', async () => {
      const response = await (server as any).handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'unknown/method',
        params: {},
      });

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32601);
      expect(response.error.message).toContain('Method not found');
    });
  });
});
