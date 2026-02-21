/**
 * ACP Client Multi-Session Isolation Tests
 * Verifies that multiple concurrent sessions remain properly isolated
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Readable, Writable } from 'stream';
import { ACPClient } from '../../apps/vscode-extension/src/acp/client';

describe('ACPClient Multi-Session Isolation', () => {
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

  describe('Session-Isolated Pending Requests', () => {
    it('should cleanup pending requests on session switch', async () => {
      // Create session 1
      const session1Promise = client.newSession('Session 1');
      mockStdout.push(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            session: {
              id: 'session-1',
              title: 'Session 1',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
          },
        }) + '\n'
      );
      await session1Promise;

      // Send a prompt (request will be pending)
      const promptPromise = client.prompt('Hello from session 1');

      // Yield to let prompt() complete its internal await syncDesiredSettings()
      // and actually send the SESSION_PROMPT request before we switch
      await Promise.resolve();

      // Switch to another session before prompt resolves
      const switchPromise = client.switchSession('session-2');

      // Prompt should be rejected due to session switch
      await expect(promptPromise).rejects.toThrow('Session switched');

      // Complete the switch
      mockStdout.push(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          result: null,
        }) + '\n'
      );
      await switchPromise;
    });

    it('should cleanup pending requests on session delete', async () => {
      // Create session
      const sessionPromise = client.newSession('To Delete');
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
      const session = await sessionPromise;

      // Send a prompt that will remain pending
      const promptPromise = client.prompt('This will be interrupted');

      // Yield to let prompt() complete its internal await syncDesiredSettings()
      // and actually send the SESSION_PROMPT request before we delete
      await Promise.resolve();

      // Start delete - this should cleanup the pending prompt
      const deletePromise = client.deleteSession('session-delete');

      // Prompt should be rejected
      await expect(promptPromise).rejects.toThrow('Session session-delete deleted');

      // Complete delete
      mockStdout.push(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          result: null,
        }) + '\n'
      );
      await deletePromise;

      expect(client.getCurrentSession()).toBeNull();
    });

    it('should isolate requests between different sessions', async () => {
      // Create two sessions
      const session1Promise = client.newSession('Session 1');
      mockStdout.push(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            session: {
              id: 'session-1',
              title: 'Session 1',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
          },
        }) + '\n'
      );
      await session1Promise;

      // Send request for session 1
      const settings1Promise = client.changeSettings({ model: 'claude-sonnet-4-5-20250929' });

      // Create session 2
      const session2Promise = client.newSession('Session 2');
      // Response for session/new (id=3)
      mockStdout.push(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          result: {
            session: {
              id: 'session-2',
              title: 'Session 2',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
          },
        }) + '\n'
      );
      // After SESSION_NEW resolves, newSession() internally calls syncDesiredSettings()
      // in a microtask, which re-sends the model setting from changeSettings above.
      // We must wait for that request to be sent before providing the response.
      await new Promise(resolve => setTimeout(resolve, 10));
      // Response for syncDesiredSettings (id=4)
      mockStdout.push(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 4,
          result: null,
        }) + '\n'
      );
      await session2Promise;

      // Complete session 1's request
      mockStdout.push(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          result: null,
        }) + '\n'
      );

      // Should resolve successfully
      await expect(settings1Promise).resolves.toBeUndefined();
    });
  });

  describe('Shutdown Cleanup', () => {
    it('should clean up all pending requests on shutdown', async () => {
      // Create session
      const sessionPromise = client.newSession('Session 1');
      mockStdout.push(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            session: {
              id: 'session-1',
              title: 'Session 1',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
          },
        }) + '\n'
      );
      await sessionPromise;

      // Start pending requests
      const settings1Promise = client.changeSettings({ model: 'claude-sonnet-4-5-20250929' });
      const settings2Promise = client.changeSettings({ planMode: true });

      // Shutdown the client
      await client.shutdown();

      // All pending requests should be rejected
      await expect(settings1Promise).rejects.toThrow('ACPClient shutdown');
      await expect(settings2Promise).rejects.toThrow('ACPClient shutdown');
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle responses to correct sessions', async () => {
      // Create session
      const sessionPromise = client.newSession('Test Session');
      mockStdout.push(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            session: {
              id: 'session-test',
              title: 'Test Session',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
          },
        }) + '\n'
      );
      await sessionPromise;

      // Send two concurrent settings changes
      const request1 = client.changeSettings({ model: 'claude-sonnet-4-5-20250929' });
      const request2 = client.changeSettings({ planMode: true });

      // Respond to both - responses can come in any order
      mockStdout.push(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          result: null,
        }) + '\n'
      );

      mockStdout.push(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          result: null,
        }) + '\n'
      );

      // Both should resolve
      await expect(request1).resolves.toBeUndefined();
      await expect(request2).resolves.toBeUndefined();
    });
  });
});
