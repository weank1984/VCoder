/**
 * Unit Tests for Webview Types (ShowHistoryMessage, ExtensionMessage union)
 */

import { describe, it, expect } from 'vitest';
import type {
  ExtensionMessage,
  ShowHistoryMessage,
  SendMessage,
  WorkspaceFilesMessage,
} from '../../packages/extension/webview/src/types';

describe('Webview types', () => {
  describe('ShowHistoryMessage', () => {
    it('should create valid ShowHistoryMessage', () => {
      const message: ShowHistoryMessage = {
        type: 'showHistory',
      };

      expect(message.type).toBe('showHistory');
    });
  });

  describe('ExtensionMessage union', () => {
    it('should accept showHistory as valid ExtensionMessage', () => {
      const message: ExtensionMessage = {
        type: 'showHistory',
      };

      expect(message.type).toBe('showHistory');
    });

    it('should accept workspaceFiles as valid ExtensionMessage', () => {
      const message: ExtensionMessage = {
        type: 'workspaceFiles',
        data: ['file1.ts', 'file2.ts'],
      };

      expect(message.type).toBe('workspaceFiles');
      expect((message as WorkspaceFilesMessage).data).toHaveLength(2);
    });
  });

  describe('SendMessage with attachments', () => {
    it('should create SendMessage with empty attachments', () => {
      const message: SendMessage = {
        type: 'send',
        content: 'Hello',
        attachments: [],
      };

      expect(message.content).toBe('Hello');
      expect(message.attachments).toEqual([]);
    });

    it('should create SendMessage with file attachments', () => {
      const message: SendMessage = {
        type: 'send',
        content: 'Check this file',
        attachments: [
          { type: 'file', path: '/path/to/file.ts', content: 'base64...' },
        ],
      };

      expect(message.attachments).toHaveLength(1);
      expect(message.attachments?.[0].type).toBe('file');
      expect(message.attachments?.[0].path).toBe('/path/to/file.ts');
    });

    it('should create SendMessage with selection attachments', () => {
      const message: SendMessage = {
        type: 'send',
        content: '',
        attachments: [
          { type: 'selection', content: 'selected code snippet' },
        ],
      };

      expect(message.attachments?.[0].type).toBe('selection');
      expect(message.attachments?.[0].content).toBe('selected code snippet');
    });

    it('should allow sending message without attachments field', () => {
      const message: SendMessage = {
        type: 'send',
        content: 'Just text',
      };

      expect(message.content).toBe('Just text');
      expect(message.attachments).toBeUndefined();
    });
  });
});
