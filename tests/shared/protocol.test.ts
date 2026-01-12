/**
 * @vcoder/shared Package Tests
 */

import { describe, it, expect } from 'vitest';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  InitializeParams,
  InitializeResult,
  Session,
  PromptParams,
  Attachment,
  SettingsChangeParams,
  FileChangeUpdate,
  UpdateNotificationParams,
  Task,
  ModelId,
} from '@vcoder/shared/protocol';

describe('Protocol Types', () => {
  describe('JSON-RPC 2.0 Types', () => {
    it('should create valid JsonRpcRequest', () => {
      const request: JsonRpcRequest<{ test: string }> = {
        jsonrpc: '2.0',
        id: 1,
        method: 'test/method',
        params: { test: 'value' },
      };

      expect(request.jsonrpc).toBe('2.0');
      expect(request.id).toBe(1);
      expect(request.method).toBe('test/method');
      expect(request.params).toEqual({ test: 'value' });
    });

    it('should create valid JsonRpcResponse', () => {
      const response: JsonRpcResponse<string> = {
        jsonrpc: '2.0',
        id: 1,
        result: 'success',
      };

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.result).toBe('success');
      expect(response.error).toBeUndefined();
    });

    it('should create valid JsonRpcResponse with error', () => {
      const response: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32600,
          message: 'Invalid Request',
        },
      };

      expect(response.jsonrpc).toBe('2.0');
      expect(response.error?.code).toBe(-32600);
      expect(response.error?.message).toBe('Invalid Request');
    });

    it('should create valid JsonRpcNotification', () => {
      const notification: JsonRpcNotification<{ data: string }> = {
        jsonrpc: '2.0',
        method: 'event/notify',
        params: { data: 'value' },
      };

      expect(notification.jsonrpc).toBe('2.0');
      expect(notification.method).toBe('event/notify');
      expect(notification.params).toEqual({ data: 'value' });
    });
  });

  describe('Initialize Types', () => {
    it('should create valid InitializeParams', () => {
      const params: InitializeParams = {
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
          multiSession: false,
        },
        workspaceFolders: ['/path/to/workspace'],
      };

      expect(params.clientInfo.name).toBe('test-client');
      expect(params.capabilities.streaming).toBe(true);
      expect(params.workspaceFolders).toHaveLength(1);
    });

    it('should create valid InitializeResult', () => {
      const result: InitializeResult = {
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        capabilities: {
          models: ['claude-haiku-4-5-20251001'],
          mcp: true,
          planMode: true,
        },
      };

      expect(result.serverInfo.name).toBe('test-server');
      expect(result.capabilities.models).toContain('claude-haiku-4-5-20251001');
      expect(result.capabilities.planMode).toBe(true);
    });
  });

  describe('Session Types', () => {
    it('should create valid Session', () => {
      const session: Session = {
        id: 'session-123',
        title: 'Test Session',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T01:00:00Z',
      };

      expect(session.id).toBe('session-123');
      expect(session.title).toBe('Test Session');
    });
  });

  describe('Prompt Types', () => {
    it('should create valid PromptParams', () => {
      const attachment: Attachment = {
        type: 'file',
        path: '/path/to/file.txt',
        name: 'file.txt',
      };

      const params: PromptParams = {
        sessionId: 'session-123',
        content: 'Hello, AI!',
        attachments: [attachment],
      };

      expect(params.sessionId).toBe('session-123');
      expect(params.content).toBe('Hello, AI!');
      expect(params.attachments).toHaveLength(1);
      expect(params.attachments?.[0].type).toBe('file');
    });

    it('should create all attachment types', () => {
      const fileAttachment: Attachment = { type: 'file', path: '/path', name: 'file.txt' };
      const selectionAttachment: Attachment = { type: 'selection', content: 'selected text' };
      const imageAttachment: Attachment = { type: 'image', path: '/image.png', name: 'image.png' };

      expect(fileAttachment.type).toBe('file');
      expect(selectionAttachment.type).toBe('selection');
      expect(imageAttachment.type).toBe('image');
    });
  });

  describe('Update Types', () => {
    it('should create FileChangeUpdate for created file', () => {
      const update: FileChangeUpdate = {
        type: 'created',
        path: '/new/file.txt',
        proposed: true,
        content: 'new file content',
      };

      expect(update.type).toBe('created');
      expect(update.proposed).toBe(true);
      expect(update.content).toBe('new file content');
    });

    it('should create FileChangeUpdate for modified file with diff', () => {
      const update: FileChangeUpdate = {
        type: 'modified',
        path: '/existing/file.txt',
        diff: '- old line\n+ new line',
        proposed: false,
      };

      expect(update.type).toBe('modified');
      expect(update.diff).toContain('- old line');
      expect(update.proposed).toBe(false);
    });

    it('should create UpdateNotificationParams with all update types', () => {
      const fileUpdate: UpdateNotificationParams = {
        sessionId: 'session-123',
        type: 'file_change',
        content: {
          type: 'created',
          path: '/file.txt',
          proposed: false,
        },
      };

      expect(fileUpdate.type).toBe('file_change');
      expect(fileUpdate.sessionId).toBe('session-123');
    });

    it('should create Task with nested children', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Parent Task',
        status: 'in_progress',
        children: [
          {
            id: 'task-2',
            title: 'Child Task',
            status: 'pending',
          },
        ],
      };

      expect(task.id).toBe('task-1');
      expect(task.status).toBe('in_progress');
      expect(task.children).toHaveLength(1);
      expect(task.children?.[0].id).toBe('task-2');
    });
  });

  describe('Settings Types', () => {
    it('should create valid SettingsChangeParams', () => {
      const params: SettingsChangeParams = {
        sessionId: 'session-123',
        model: 'claude-haiku-4-5-20251001',
        planMode: true,
      };

      expect(params.model).toBe('claude-haiku-4-5-20251001');
      expect(params.planMode).toBe(true);
    });

    it('should accept all valid model IDs', () => {
      const validModels: ModelId[] = [
        'claude-haiku-4-5-20251001',
        'claude-sonnet-4-5-20250929',
      ];

      validModels.forEach((model) => {
        const params: SettingsChangeParams = {
          sessionId: 'session-123',
          model,
        };
        expect(params.model).toBe(model);
      });
    });
  });
});
