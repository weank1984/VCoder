import { describe, expect, it, beforeEach } from 'vitest';
import { useStore } from '../../apps/vscode-extension/webview/src/store/useStore';

describe('webview store tool calls', () => {
  beforeEach(() => {
    useStore.getState().reset();
  });

  it('adds MCP calls as tool calls and updates via tool_result', () => {
    useStore.getState().handleUpdate({
      sessionId: 's1',
      type: 'mcp_call',
      content: {
        id: 'tc1',
        server: 'web-reader',
        tool: 'read',
        input: { url: 'https://example.com' },
        status: 'running',
      },
    });

    let state = useStore.getState();
    expect(state.messages.length).toBe(1);
    expect(state.messages[0].role).toBe('assistant');
    expect(state.messages[0].toolCalls?.[0]).toMatchObject({
      id: 'tc1',
      name: 'mcp__web-reader__read',
      status: 'running',
    });

    useStore.getState().handleUpdate({
      sessionId: 's1',
      type: 'tool_result',
      content: { id: 'tc1', result: { ok: true } },
    });

    state = useStore.getState();
    expect(state.messages[0].toolCalls?.[0]).toMatchObject({
      id: 'tc1',
      status: 'completed',
      result: { ok: true },
    });
  });

  it('updates tool calls across earlier messages (not only the last)', () => {
    const store = useStore.getState();

    store.addMessage({ id: 'u1', role: 'user', content: 'hi', isComplete: true });
    store.addMessage({ id: 'a1', role: 'assistant', content: '', isComplete: false, toolCalls: [] });
    store.addToolCall({ id: 'tc-old', name: 'Write', status: 'running' });
    store.updateMessage('a1', { isComplete: true });

    store.addMessage({ id: 'u2', role: 'user', content: 'next', isComplete: true });
    store.addMessage({ id: 'a2', role: 'assistant', content: '', isComplete: false });

    store.handleUpdate({
      sessionId: 's1',
      type: 'tool_result',
      content: { id: 'tc-old', result: 'done' },
    });

    const state = useStore.getState();
    const firstAssistant = state.messages.find((m) => m.id === 'a1')!;
    expect(firstAssistant.toolCalls?.[0]).toMatchObject({
      id: 'tc-old',
      status: 'completed',
      result: 'done',
    });
  });
});

