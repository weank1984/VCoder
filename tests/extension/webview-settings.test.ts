/**
 * Unit Tests for Webview Store Model and Loading State
 * Tests setModel, setLoading, setPlanMode behaviors
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../packages/extension/webview/src/store/useStore';
import type { ModelId } from '@vcoder/shared';

describe('webview store settings', () => {
  beforeEach(() => {
    useStore.getState().reset();
  });

  describe('setModel', () => {
    it('should set model ID', () => {
      useStore.getState().setModel('claude-3-5-haiku-20241022');

      const state = useStore.getState();
      expect(state.model).toBe('claude-3-5-haiku-20241022');
    });

    it('should accept all valid model IDs', () => {
      const models: ModelId[] = [
        'claude-sonnet-4-20250514',
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-20240229',
      ];

      models.forEach((model) => {
        useStore.getState().setModel(model);
        expect(useStore.getState().model).toBe(model);
      });
    });
  });

  describe('setLoading', () => {
    it('should set loading state to true', () => {
      useStore.getState().setLoading(true);

      const state = useStore.getState();
      expect(state.isLoading).toBe(true);
    });

    it('should set loading state to false', () => {
      useStore.getState().setLoading(true);
      useStore.getState().setLoading(false);

      const state = useStore.getState();
      expect(state.isLoading).toBe(false);
    });
  });

  describe('setPlanMode', () => {
    it('should enable plan mode', () => {
      useStore.getState().setPlanMode(true);

      const state = useStore.getState();
      expect(state.planMode).toBe(true);
    });

    it('should disable plan mode', () => {
      useStore.getState().setPlanMode(true);
      useStore.getState().setPlanMode(false);

      const state = useStore.getState();
      expect(state.planMode).toBe(false);
    });
  });

  describe('setWorkspaceFiles', () => {
    it('should set workspace files array', () => {
      const files = ['src/index.ts', 'package.json', 'README.md'];
      useStore.getState().setWorkspaceFiles(files);

      const state = useStore.getState();
      expect(state.workspaceFiles).toEqual(files);
    });

    it('should replace existing workspace files', () => {
      useStore.getState().setWorkspaceFiles(['old.ts']);
      useStore.getState().setWorkspaceFiles(['new.ts', 'another.ts']);

      const state = useStore.getState();
      expect(state.workspaceFiles).toHaveLength(2);
      expect(state.workspaceFiles).not.toContain('old.ts');
    });
  });

  describe('message management', () => {
    it('should add message to empty list', () => {
      useStore.getState().addMessage({
        id: 'm1',
        role: 'user',
        content: 'Hello',
        isComplete: true,
      });

      const state = useStore.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].content).toBe('Hello');
    });

    it('should update existing message', () => {
      useStore.getState().addMessage({
        id: 'm1',
        role: 'assistant',
        content: 'Partial',
        isComplete: false,
      });

      useStore.getState().updateMessage('m1', {
        content: 'Full response',
        isComplete: true,
      });

      const state = useStore.getState();
      expect(state.messages[0].content).toBe('Full response');
      expect(state.messages[0].isComplete).toBe(true);
    });

    it('should append text to last message', () => {
      useStore.getState().addMessage({
        id: 'm1',
        role: 'assistant',
        content: 'Start',
        isComplete: false,
      });

      useStore.getState().appendToLastMessage(' end');

      const state = useStore.getState();
      expect(state.messages[0].content).toBe('Start end');
    });
  });
});
