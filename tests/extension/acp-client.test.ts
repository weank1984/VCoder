/**
 * vcoder extension Package Tests
 * ACP Client Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Readable, Writable } from 'stream';
import { ACPClient } from '../../packages/extension/src/acp/client';
import type { InitializeParams, Session, UpdateNotificationParams } from '@vcoder/shared';

describe('ACPClient', () => {
  let mockStdin: Writable;
  let mockStdout: Readable;
  let client: ACPClient;
  let writtenData: string[];

  beforeEach(() => {
    writtenData = [];

    // Create mock stdout (Readable)
    mockStdout = new Readable({
      read() {
        // Mock read function
      },
    });

    // Create mock stdin (Writable)
    mockStdin = new Writable();
    mockStdin._write = (chunk: Buffer, encoding, callback) => {
      writtenData.push(chunk.toString());
      callback();
    };

    // Create client with mocked stdio
    client = new ACPClient({ stdin: mockStdin, stdout: mockStdout });
  });

  describe('Initialization', () => {
    it('should create client instance', () => {
      expect(client).toBeDefined();
      expect(client.getCurrentSession()).toBeNull();
    });

    it('should send initialize request', async () => {
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

      const initPromise = client.initialize(initParams);

      // Simulate server response
      const response = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: {
          serverInfo: {
            name: 'vcoder-server',
            version: '0.1.0',
          },
          capabilities: {
            models: ['claude-sonnet-4-20250514'],
            mcp: true,
            planMode: true,
          },
        },
      }) + '\n';

      // Push the response to stdout in next tick
      process.nextTick(() => {
        mockStdout.push(response);
      });

      const result = await initPromise;

      expect(result.serverInfo.name).toBe('vcoder-server');
      expect(result.capabilities.mcp).toBe(true);
      expect(writtenData).toHaveLength(1);
      expect(writtenData[0]).toContain('initialize');
    });
  });

  describe('Session Management', () => {
    it('should create new session', async () => {
      const newSessionPromise = client.newSession('Test Session');

      // Simulate server response after request is sent
      const response = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: {
          session: {
            id: 'session-123',
            title: 'Test Session',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        },
      }) + '\n';

      // Use setImmediate to ensure the request has been sent
      await new Promise<void>((resolve) => {
        setImmediate(() => {
          mockStdout.push(response);
          resolve();
        });
      });

      const session = await newSessionPromise;

      expect(session.id).toBe('session-123');
      expect(session.title).toBe('Test Session');
      expect(client.getCurrentSession()).toEqual(session);
    });

    it('should list sessions', async () => {
      const listPromise = client.listSessions();

      const response = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: {
          sessions: [
            {
              id: 'session-1',
              title: 'Session 1',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
            {
              id: 'session-2',
              title: 'Session 2',
              createdAt: '2024-01-01T01:00:00Z',
              updatedAt: '2024-01-01T01:00:00Z',
            },
          ],
        },
      }) + '\n';

      // Use setImmediate to ensure the request has been sent
      await new Promise<void>((resolve) => {
        setImmediate(() => {
          mockStdout.push(response);
          resolve();
        });
      });

      const sessions = await listPromise;

      expect(sessions).toHaveLength(2);
      expect(sessions[0].title).toBe('Session 1');
      expect(sessions[1].title).toBe('Session 2');
    });

    it('should switch session', async () => {
      // First create a session
      const createPromise = client.newSession('Initial Session');
      process.nextTick(() => {
        mockStdout.push(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: {
              session: {
                id: 'session-1',
                title: 'Initial Session',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
              },
            },
          }) + '\n'
        );
      });
      await createPromise;

      // Now switch to another session
      const switchPromise = client.switchSession('session-2');
      process.nextTick(() => {
        mockStdout.push(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            result: null,
          }) + '\n'
        );
      });

      await switchPromise;

      const currentSession = client.getCurrentSession();
      expect(currentSession?.id).toBe('session-2');
    });

    it('should delete session', async () => {
      // Create a session first
      const createPromise = client.newSession('To Delete');
      process.nextTick(() => {
        mockStdout.push(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: {
              session: {
                id: 'session-delete',
                title: 'To Delete',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
              },
            },
          }) + '\n'
        );
      });
      await createPromise;

      // Delete the session
      const deletePromise = client.deleteSession('session-delete');
      process.nextTick(() => {
        mockStdout.push(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            result: null,
          }) + '\n'
        );
      });

      await deletePromise;

      expect(client.getCurrentSession()).toBeNull();
    });
  });

  describe('Prompt Operations', () => {
    it('should send prompt without active session (auto-create)', async () => {
      const promptPromise = client.prompt('Hello, AI!');

      // First response - session creation
      await new Promise<void>((resolve) => {
        setImmediate(() => {
          mockStdout.push(
            JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              result: {
                session: {
                  id: 'auto-session',
                  title: 'New Chat',
                  createdAt: '2024-01-01T00:00:00Z',
                  updatedAt: '2024-01-01T00:00:00Z',
                },
              },
            }) + '\n'
          );
          resolve();
        });
      });

      // Second response - prompt confirmation
      await new Promise<void>((resolve) => {
        setImmediate(() => {
          mockStdout.push(
            JSON.stringify({
              jsonrpc: '2.0',
              id: 2,
              result: null,
            }) + '\n'
          );
          resolve();
        });
      });

      await promptPromise;

      expect(client.getCurrentSession()?.id).toBe('auto-session');
      expect(writtenData.length).toBeGreaterThanOrEqual(2);
    });

    it('should send prompt with active session', async () => {
      // Create a session first
      const createPromise = client.newSession('Existing Session');
      mockStdout.push(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            session: {
              id: 'existing-session',
              title: 'Existing Session',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
          },
        }) + '\n'
      );
      await createPromise;

      // Send prompt
      const promptPromise = client.prompt('Another question');
      mockStdout.push(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          result: null,
        }) + '\n'
      );

      await promptPromise;

      const lastRequest = JSON.parse(writtenData[writtenData.length - 1]);
      expect(lastRequest.method).toBe('session/prompt');
      expect(lastRequest.params.sessionId).toBe('existing-session');
      expect(lastRequest.params.content).toBe('Another question');
    });
  });

  describe('Settings Operations', () => {
    it('should change settings with active session', async () => {
      // Create a session first
      const createPromise = client.newSession('Test Session');
      mockStdout.push(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            session: {
              id: 'session-123',
              title: 'Test Session',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
          },
        }) + '\n'
      );
      await createPromise;

      // Change settings
      const settingsPromise = client.changeSettings({
        model: 'claude-3-5-sonnet-20241022',
        planMode: true,
      });
      mockStdout.push(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          result: null,
        }) + '\n'
      );

      await settingsPromise;

      const lastRequest = JSON.parse(writtenData[writtenData.length - 1]);
      expect(lastRequest.method).toBe('settings/change');
      expect(lastRequest.params.model).toBe('claude-3-5-sonnet-20241022');
      expect(lastRequest.params.planMode).toBe(true);
    });

    it('should not change settings without active session', async () => {
      await client.changeSettings({ model: 'claude-3-5-sonnet-20241022' });

      // Should not send any request
      expect(writtenData).toHaveLength(0);
    });
  });

  describe('File Operations', () => {
    beforeEach(async () => {
      // Create a session for file operations
      const createPromise = client.newSession('Test Session');
      mockStdout.push(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            session: {
              id: 'session-123',
              title: 'Test Session',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
          },
        }) + '\n'
      );
      await createPromise;
      writtenData = []; // Clear written data
    });

    it('should accept file change', async () => {
      const acceptPromise = client.acceptFileChange('/test/file.txt');
      mockStdout.push(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          result: null,
        }) + '\n'
      );

      await acceptPromise;

      const request = JSON.parse(writtenData[0]);
      expect(request.method).toBe('file/accept');
      expect(request.params.path).toBe('/test/file.txt');
    });

    it('should reject file change', async () => {
      const rejectPromise = client.rejectFileChange('/test/file.txt');
      mockStdout.push(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          result: null,
        }) + '\n'
      );

      await rejectPromise;

      const request = JSON.parse(writtenData[0]);
      expect(request.method).toBe('file/reject');
      expect(request.params.path).toBe('/test/file.txt');
    });
  });

  describe('Bash Operations', () => {
    beforeEach(async () => {
      // Create a session for bash operations
      const createPromise = client.newSession('Test Session');
      mockStdout.push(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            session: {
              id: 'session-123',
              title: 'Test Session',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
          },
        }) + '\n'
      );
      await createPromise;
      writtenData = []; // Clear written data
    });

    it('should confirm bash command', async () => {
      const confirmPromise = client.confirmBash('cmd-123');
      mockStdout.push(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          result: null,
        }) + '\n'
      );

      await confirmPromise;

      const request = JSON.parse(writtenData[0]);
      expect(request.method).toBe('bash/confirm');
      expect(request.params.commandId).toBe('cmd-123');
    });

    it('should skip bash command', async () => {
      const skipPromise = client.skipBash('cmd-123');
      mockStdout.push(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          result: null,
        }) + '\n'
      );

      await skipPromise;

      const request = JSON.parse(writtenData[0]);
      expect(request.method).toBe('bash/skip');
      expect(request.params.commandId).toBe('cmd-123');
    });
  });

  describe('Plan Operations', () => {
    beforeEach(async () => {
      // Create a session for plan operations
      const createPromise = client.newSession('Test Session');
      mockStdout.push(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            session: {
              id: 'session-123',
              title: 'Test Session',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
          },
        }) + '\n'
      );
      await createPromise;
      writtenData = []; // Clear written data
    });

    it('should confirm plan', async () => {
      const confirmPromise = client.confirmPlan();
      mockStdout.push(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          result: null,
        }) + '\n'
      );

      await confirmPromise;

      const request = JSON.parse(writtenData[0]);
      expect(request.method).toBe('plan/confirm');
      expect(request.params.sessionId).toBe('session-123');
    });
  });

  describe('Notifications', () => {
    it('should emit session/update notification', async () => {
      const promise = new Promise<void>((resolve) => {
        client.once('session/update', (params: UpdateNotificationParams) => {
          expect(params.sessionId).toBe('session-123');
          expect(params.type).toBe('text');
          resolve();
        });
      });

      const notification = JSON.stringify({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId: 'session-123',
          type: 'text',
          content: {
            text: 'Hello from AI',
          },
        },
      }) + '\n';

      mockStdout.push(notification);

      await promise;
    });

    it('should emit session/complete notification', async () => {
      const promise = new Promise<void>((resolve) => {
        client.once('session/complete', (params) => {
          expect(params.sessionId).toBe('session-123');
          expect(params.usage?.inputTokens).toBe(100);
          expect(params.usage?.outputTokens).toBe(50);
          resolve();
        });
      });

      const notification = JSON.stringify({
        jsonrpc: '2.0',
        method: 'session/complete',
        params: {
          sessionId: 'session-123',
          usage: {
            inputTokens: 100,
            outputTokens: 50,
          },
        },
      }) + '\n';

      mockStdout.push(notification);

      await promise;
    });
  });
});
