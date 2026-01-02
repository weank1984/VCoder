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

function createId(): string {
    const anyCrypto = (globalThis as unknown as { crypto?: unknown }).crypto as { randomUUID?: () => string } | undefined;
    if (anyCrypto && typeof anyCrypto.randomUUID === 'function') return anyCrypto.randomUUID();
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatBashName(command: string): string {
    const normalized = command.trim().replace(/\s+/g, ' ');
    if (!normalized) return 'Bash';
    const maxLen = 80;
    return normalized.length > maxLen ? `Bash: ${normalized.slice(0, maxLen)}…` : `Bash: ${normalized}`;
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
            const target: ChatMessage =
                last && last.role === 'assistant' && !last.isComplete
                    ? last
                    : (messages[messages.length] = {
                          id: createId(),
                          role: 'assistant',
                          content: '',
                          isComplete: false,
                      });

            target.content += text;
            return { messages };
        }),

    setThought: (thought, isComplete) =>
        set((state) => {
            const messages = [...state.messages];
            const last = messages[messages.length - 1];
            const target: ChatMessage =
                last && last.role === 'assistant' && !last.isComplete
                    ? last
                    : (messages[messages.length] = {
                          id: createId(),
                          role: 'assistant',
                          content: '',
                          isComplete: false,
                      });

            target.thought = isComplete ? thought : (target.thought || '') + thought;
            return { messages };
        }),

    addToolCall: (toolCall) =>
        set((state) => {
            const messages = [...state.messages];
            const last = messages[messages.length - 1];
            const target: ChatMessage =
                last && last.role === 'assistant' && !last.isComplete
                    ? last
                    : (messages[messages.length] = {
                          id: createId(),
                          role: 'assistant',
                          content: '',
                          isComplete: false,
                      });

            const existing = target.toolCalls?.find((tc) => tc.id === toolCall.id);
            if (existing) {
                Object.assign(existing, toolCall);
            } else {
                target.toolCalls = [...(target.toolCalls || []), toolCall];
            }
            return { messages };
        }),

    updateToolCall: (id, updates) =>
        set((state) => {
            const messages = [...state.messages];
            for (let i = messages.length - 1; i >= 0; i--) {
                const message = messages[i];
                if (message.role !== 'assistant' || !message.toolCalls?.length) continue;
                const idx = message.toolCalls.findIndex((tc) => tc.id === id);
                if (idx === -1) continue;
                message.toolCalls[idx] = { ...message.toolCalls[idx], ...updates };
                return { messages };
            }

            const last = messages[messages.length - 1];
            const target: ChatMessage =
                last && last.role === 'assistant' && !last.isComplete
                    ? last
                    : (messages[messages.length] = {
                          id: createId(),
                          role: 'assistant',
                          content: '',
                          isComplete: false,
                      });

            target.toolCalls = [
                ...(target.toolCalls || []),
                {
                    id,
                    name: typeof updates.name === 'string' && updates.name ? updates.name : 'Tool',
                    status: updates.status ?? 'running',
                    input: updates.input,
                    result: updates.result,
                    error: updates.error,
                },
            ];
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
                get().addToolCall({
                    id: tc.id,
                    name: tc.name,
                    status: tc.status,
                    input: (tc as unknown as { input?: unknown }).input,
                });
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
            case 'mcp_call': {
                const mcp = content as {
                    id: string;
                    server: string;
                    tool: string;
                    input: Record<string, unknown>;
                    status: ToolCall['status'];
                    result?: unknown;
                    error?: string;
                };
                get().addToolCall({
                    id: mcp.id,
                    name: `mcp__${mcp.server}__${mcp.tool}`,
                    status: mcp.status,
                    input: mcp.input,
                    result: mcp.result,
                    error: mcp.error,
                });
                break;
            }
            case 'bash_request': {
                const bash = content as { id: string; command: string };
                get().addToolCall({
                    id: bash.id,
                    name: formatBashName(bash.command),
                    status: 'pending',
                    input: { command: bash.command },
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
