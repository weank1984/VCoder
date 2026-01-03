import { create } from './createStore';
import type { AppState, ChatMessage, ToolCall, UiLanguage } from '../types';
import type { Task, ModelId, UpdateNotificationParams, ErrorUpdate, SubagentRunUpdate, HistorySession, HistoryChatMessage } from '@vcoder/shared';
import { postMessage } from '../utils/vscode';

// rAF batch processing for streaming text updates
let textBuffer = '';
let rafId: number | null = null;

// Exported for use when immediate flush is needed (e.g., on completion)
export function flushTextBuffer(store: { appendToLastMessage: (text: string) => void }) {
    if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
    if (textBuffer) {
        store.appendToLastMessage(textBuffer);
        textBuffer = '';
    }
}

function queueTextUpdate(text: string, store: { appendToLastMessage: (text: string) => void }) {
    textBuffer += text;
    if (rafId !== null) return; // Already scheduled
    rafId = requestAnimationFrame(() => {
        rafId = null;
        if (textBuffer) {
            store.appendToLastMessage(textBuffer);
            textBuffer = '';
        }
    });
}

interface AppStore extends AppState {
    // Actions
    addMessage: (message: ChatMessage) => void;
    updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
    appendToLastMessage: (text: string) => void;
    setThought: (thought: string, isComplete: boolean) => void;
    addToolCall: (toolCall: ToolCall) => void;
    updateToolCall: (id: string, updates: Partial<ToolCall>) => void;
    setTasks: (tasks: Task[]) => void;
    setSubagentRuns: (runs: SubagentRunUpdate[]) => void;
    setSessions: (sessions: AppState['sessions']) => void;
    setCurrentSession: (sessionId: string | null) => void;
    setPlanMode: (enabled: boolean) => void;
    setModel: (model: ModelId) => void;
    setLoading: (loading: boolean) => void;
    setError: (error: ErrorUpdate | null) => void;
    handleUpdate: (update: UpdateNotificationParams) => void;
    setWorkspaceFiles: (files: string[]) => void;
    setUiLanguage: (uiLanguage: UiLanguage, source?: 'user' | 'extension') => void;
    // History Actions
    setHistorySessions: (sessions: HistorySession[]) => void;
    loadHistorySession: (sessionId: string, messages: HistoryChatMessage[]) => void;
    exitHistoryMode: () => void;
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
    subagentRuns: [],
    planMode: true,
    model: 'claude-sonnet-4-20250514',
    isLoading: false,
    error: null,
    workspaceFiles: [],
    uiLanguage: 'auto',
    // History
    historySessions: [],
    viewMode: 'live',
};

// Restore persisted state on load
import { loadPersistedState, savePersistedState } from '../utils/persist';
const persisted = loadPersistedState();

function isUiLanguage(value: unknown): value is UiLanguage {
    return value === 'auto' || value === 'en-US' || value === 'zh-CN';
}

function getInitialUiLanguage(): UiLanguage {
    if (isUiLanguage(persisted.uiLanguage)) return persisted.uiLanguage;
    const fromWindow = (globalThis as unknown as { __vcoderUiLanguage?: unknown }).__vcoderUiLanguage;
    if (isUiLanguage(fromWindow)) return fromWindow;
    return 'auto';
}

const restoredState: AppState = {
    ...initialState,
    model: (persisted.model as ModelId) || initialState.model,
    planMode: true,
    currentSessionId: persisted.currentSessionId ?? initialState.currentSessionId,
    uiLanguage: getInitialUiLanguage(),
};

export const useStore = create<AppStore>((set, get) => ({
    ...restoredState,


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

    setSubagentRuns: (subagentRuns) => set({ subagentRuns }),

    setSessions: (sessions) =>
        set((state) => ({
            sessions,
            currentSessionId: state.currentSessionId ?? sessions[0]?.id ?? null,
        })),

    setCurrentSession: (sessionId) => set({ currentSessionId: sessionId, viewMode: 'live' }),

    setPlanMode: (enabled) => {
        set((state) => ({
            planMode: enabled,
            // Avoid showing stale plan/tasks when switching into planning.
            tasks: enabled && !state.planMode ? [] : state.tasks,
            subagentRuns: enabled && !state.planMode ? [] : state.subagentRuns,
        }));
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
                // Use rAF batching to reduce render frequency
                queueTextUpdate(text, get());
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
            case 'subagent_run': {
                const run = content as SubagentRunUpdate;
                set((state) => {
                    const subagentRuns = [...state.subagentRuns];
                    const idx = subagentRuns.findIndex((r) => r.id === run.id);
                    if (idx >= 0) {
                        subagentRuns[idx] = { ...subagentRuns[idx], ...run };
                    } else {
                        subagentRuns.push(run);
                    }
                    return { subagentRuns };
                });
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

    setUiLanguage: (uiLanguage, source = 'user') => {
        set({ uiLanguage });
        if (source === 'user') {
            postMessage({ type: 'setUiLanguage', uiLanguage });
        }
    },

    setHistorySessions: (historySessions) => set({ historySessions }),

    loadHistorySession: (sessionId, historyMessages) => set({
        viewMode: 'history',
        currentSessionId: sessionId,
        messages: historyMessages.map(msg => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            thought: msg.thought,
            toolCalls: msg.toolCalls?.map(tc => ({
                id: tc.id,
                name: tc.name, // HistoryToolCall name matches ToolCall name
                status: tc.status,
                input: tc.input,
                result: tc.result,
                error: tc.error
            })) as ToolCall[] | undefined,
            isComplete: true, // History messages are always complete
        })),
        isLoading: false,
    }),

    exitHistoryMode: () => set({
        viewMode: 'live',
        currentSessionId: null, // Returning to live mode usually starts fresh or needs session restore (not implemented yet)
        messages: [],
    }),

    reset: () => set(initialState),
}));

// Subscribe to state changes and persist selected fields
let prevPersistedFields = {
    model: restoredState.model,
    planMode: restoredState.planMode,
    currentSessionId: restoredState.currentSessionId,
    uiLanguage: restoredState.uiLanguage,
};

useStore.subscribe(() => {
    const state = useStore.getState();
    // Only persist when these specific fields change
    if (
        state.model !== prevPersistedFields.model ||
        state.planMode !== prevPersistedFields.planMode ||
        state.currentSessionId !== prevPersistedFields.currentSessionId ||
        state.uiLanguage !== prevPersistedFields.uiLanguage
    ) {
        prevPersistedFields = {
            model: state.model,
            planMode: state.planMode,
            currentSessionId: state.currentSessionId,
            uiLanguage: state.uiLanguage,
        };
        savePersistedState(prevPersistedFields);
    }
});
