/**
 * Unit Tests for Webview Store Session Management
 * Tests setSessions, setCurrentSession, reset behaviors
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../apps/vscode-extension/webview/src/store/useStore';

describe('webview store sessions', () => {
  beforeEach(() => {
    useStore.getState().reset();
  });

  describe('setSessions', () => {
    it('should set sessions array', () => {
      const sessions = [
        { id: 's1', title: 'Session 1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
        { id: 's2', title: 'Session 2', createdAt: '2024-01-02T00:00:00Z', updatedAt: '2024-01-02T00:00:00Z' },
      ];

      useStore.getState().setSessions(sessions);
      const state = useStore.getState();

      expect(state.sessions).toHaveLength(2);
      expect(state.sessions[0].id).toBe('s1');
      expect(state.sessions[1].title).toBe('Session 2');
    });

    it('should replace existing sessions', () => {
      useStore.getState().setSessions([
        { id: 'old', title: 'Old Session', createdAt: '', updatedAt: '' },
      ]);

      useStore.getState().setSessions([
        { id: 'new', title: 'New Session', createdAt: '', updatedAt: '' },
      ]);

      const state = useStore.getState();
      expect(state.sessions).toHaveLength(1);
      expect(state.sessions[0].id).toBe('new');
    });
  });

  describe('setCurrentSession', () => {
    it('should set current session ID', () => {
      useStore.getState().setCurrentSession('session-123');

      const state = useStore.getState();
      expect(state.currentSessionId).toBe('session-123');
    });

    it('should allow null session', () => {
      useStore.getState().setCurrentSession('session-123');
      useStore.getState().setCurrentSession(null);

      const state = useStore.getState();
      expect(state.currentSessionId).toBeNull();
    });
  });

  describe('reset', () => {
    it('should reset all state to initial values', () => {
      const store = useStore.getState();
      
      // Modify state
      store.setSessions([{ id: 's1', title: 'Test', createdAt: '', updatedAt: '' }]);
      store.setCurrentSession('s1');
      store.addMessage({ id: 'm1', role: 'user', content: 'test', isComplete: true });
      store.setPlanMode(true);
      store.setLoading(true);

      // Reset
      store.reset();

      const state = useStore.getState();
      expect(state.sessions).toEqual([]);
      expect(state.currentSessionId).toBeNull();
      expect(state.messages).toEqual([]);
      expect(state.planMode).toBe(false);
      expect(state.isLoading).toBe(false);
    });
  });

  describe('handleUpdate with thought', () => {
    it('should append thought content to last assistant message', () => {
      const store = useStore.getState();
      store.addMessage({ id: 'a1', role: 'assistant', content: '', isComplete: false });

      store.handleUpdate({
        sessionId: 's1',
        type: 'thought',
        content: { content: 'Let me think...', isComplete: false },
      });

      const state = useStore.getState();
      expect(state.messages[0].thought).toBe('Let me think...');
    });

    it('should complete thought when isComplete is true', () => {
      const store = useStore.getState();
      store.addMessage({ id: 'a1', role: 'assistant', content: '', isComplete: false, thought: 'partial' });

      store.handleUpdate({
        sessionId: 's1',
        type: 'thought',
        content: { content: 'full thought', isComplete: true },
      });

      const state = useStore.getState();
      expect(state.messages[0].thought).toBe('full thought');
    });
  });

  describe('handleUpdate with text', () => {
    it('should append text to last assistant message', () => {
      const store = useStore.getState();
      store.addMessage({ id: 'a1', role: 'assistant', content: 'Hello', isComplete: false });

      store.handleUpdate({
        sessionId: 's1',
        type: 'text',
        content: { text: ' world!' },
      });

      const state = useStore.getState();
      expect(state.messages[0].content).toBe('Hello world!');
    });

    it('should create assistant message if none exists', () => {
      const store = useStore.getState();

      store.handleUpdate({
        sessionId: 's1',
        type: 'text',
        content: { text: 'from nothing' },
      });

      const state = useStore.getState();
      expect(state.messages.length).toBe(1);
      expect(state.messages[0].role).toBe('assistant');
      expect(state.messages[0].content).toBe('from nothing');
    });
  });

  describe('handleUpdate with error', () => {
    it('should set error state', () => {
      const store = useStore.getState();

      store.handleUpdate({
        sessionId: 's1',
        type: 'error',
        content: {
          code: 'API_ERROR',
          message: 'Something went wrong',
          action: { label: 'Retry', command: 'vcoder.restart' },
        },
      });

      const state = useStore.getState();
      expect(state.error).toMatchObject({
        code: 'API_ERROR',
        message: 'Something went wrong',
      });
      expect(state.error?.action?.label).toBe('Retry');
    });
  });
});
