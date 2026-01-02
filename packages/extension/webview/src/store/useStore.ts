/**
 * App State Store using Zustand
 */

import { create } from './createStore';
import type { AppState, ChatMessage, ToolCall } from '../types';
import type { Task, ModelId, UpdateNotificationParams, ErrorUpdate } from '@vcoder/shared';
import { postMessage } from '../utils/vscode';

interface AppStore extends AppState {
    // Actions
    addMessage: (message: ChatMessage) => void;
    updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
    appendToLastMessage: (text: string) => void;
    setThought: (thought: string, isComplete: boolean) => void;
    addToolCall: (toolCall: ToolCall) => void;
    updateToolCall: (id: string, updates: Partial<ToolCall>) => void;
    setTasks: (tasks: Task[]) => void;
    setSessions: (sessions: AppState['sessions']) => void;
    setCurrentSession: (sessionId: string | null) => void;
    setPlanMode: (enabled: boolean) => void;
    setModel: (model: ModelId) => void;
    setLoading: (loading: boolean) => void;
    setError: (error: ErrorUpdate | null) => void;
    handleUpdate: (update: UpdateNotificationParams) => void;
    setWorkspaceFiles: (files: string[]) => void;
    reset: () => void;
}

const initialState: AppState = {
    sessions: [],
    currentSessionId: null,
    messages: [],
    tasks: [],
    planMode: false,
    model: 'claude-sonnet-4-20250514',
    isLoading: false,
    error: null,
    workspaceFiles: [],
};

export const useStore = create<AppStore>((set, get) => ({
    ...initialState,

    addMessage: (message) =>
        set((state) => ({ messages: [...state.messages, message] })),

    updateMessage: (id, updates) =>
        set((state) => ({
            messages: state.messages.map((m) =>
                m.id === id ? { ...m, ...updates } : m
            ),
        })),

    appendToLastMessage: (text) =>
        set((state) => {
            const messages = [...state.messages];
            const last = messages[messages.length - 1];
            if (last && last.role === 'assistant') {
                last.content += text;
            }
            return { messages };
        }),

    setThought: (thought, isComplete) =>
        set((state) => {
            const messages = [...state.messages];
            const last = messages[messages.length - 1];
            if (last && last.role === 'assistant') {
                last.thought = isComplete ? thought : (last.thought || '') + thought;
            }
            return { messages };
        }),

    addToolCall: (toolCall) =>
        set((state) => {
            const messages = [...state.messages];
            const last = messages[messages.length - 1];
            if (last && last.role === 'assistant') {
                last.toolCalls = [...(last.toolCalls || []), toolCall];
            }
            return { messages };
        }),

    updateToolCall: (id, updates) =>
        set((state) => {
            const messages = [...state.messages];
            const last = messages[messages.length - 1];
            if (last && last.toolCalls) {
                last.toolCalls = last.toolCalls.map((tc) =>
                    tc.id === id ? { ...tc, ...updates } : tc
                );
            }
            return { messages };
        }),

    setTasks: (tasks) => set({ tasks }),

    setSessions: (sessions) =>
        set((state) => ({
            sessions,
            currentSessionId: state.currentSessionId ?? sessions[0]?.id ?? null,
        })),

    setCurrentSession: (sessionId) => set({ currentSessionId: sessionId }),

    setPlanMode: (enabled) => {
        set({ planMode: enabled });
        postMessage({ type: 'setPlanMode', enabled });
    },

    setModel: (model) => {
        set({ model });
        postMessage({ type: 'setModel', model });
    },

    setLoading: (isLoading) => set({ isLoading }),

    setError: (error) => set({ error }),

    handleUpdate: (update) => {
        const { type, content } = update;

        switch (type) {
            case 'thought': {
                const { content: text, isComplete } = content as { content: string; isComplete: boolean };
                get().setThought(text, isComplete);
                break;
            }
            case 'text': {
                const { text } = content as { text: string };
                get().appendToLastMessage(text);
                break;
            }
            case 'tool_use': {
                const tc = content as ToolCall;
                get().addToolCall(tc);
                break;
            }
            case 'tool_result': {
                const { id, result, error } = content as { id: string; result?: unknown; error?: string };
                get().updateToolCall(id, {
                    status: error ? 'failed' : 'completed',
                    result,
                    error,
                });
                break;
            }
            case 'task_list': {
                const { tasks } = content as { tasks: Task[] };
                get().setTasks(tasks);
                break;
            }
            case 'error': {
                const errorUpdate = content as ErrorUpdate;
                get().setError(errorUpdate);
                get().setLoading(false);
                break;
            }
        }
    },

    setWorkspaceFiles: (files) => set({ workspaceFiles: files }),

    reset: () => set(initialState),
}));
