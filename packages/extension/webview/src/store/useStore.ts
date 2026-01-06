import { create } from './createStore';
import type { AppState, ChatMessage, ContentBlock, ToolCall, UiLanguage } from '../types';
import type { Task, ModelId, PermissionMode, UpdateNotificationParams, ErrorUpdate, SubagentRunUpdate, HistorySession, HistoryChatMessage } from '@vcoder/shared';
import { postMessage } from '../utils/vscode';

const debugThinking = (globalThis as unknown as { __vcoderDebugThinking?: boolean }).__vcoderDebugThinking === true;
const DEFAULT_MAX_THINKING_TOKENS = 16000;

// rAF batch processing for streaming text updates
let textBuffer = '';
let rafId: number | null = null;

// Exported for use when immediate flush is needed (e.g., on completion)
export function flushTextBuffer(store: { appendToLastMessage: (text: string) => void }) {
    if (rafId !== null) {
        const anyGlobal = globalThis as unknown as { cancelAnimationFrame?: (id: number) => void };
        if (typeof anyGlobal.cancelAnimationFrame === 'function') {
            anyGlobal.cancelAnimationFrame(rafId);
        }
        rafId = null;
    }
    if (textBuffer) {
        store.appendToLastMessage(textBuffer);
        textBuffer = '';
    }
}

function queueTextUpdate(text: string, store: { appendToLastMessage: (text: string) => void }) {
    const anyGlobal = globalThis as unknown as { requestAnimationFrame?: (cb: () => void) => number };
    if (typeof anyGlobal.requestAnimationFrame !== 'function') {
        // Node/test environments: apply immediately (no rAF available).
        store.appendToLastMessage(text);
        return;
    }
    textBuffer += text;
    if (rafId !== null) return; // Already scheduled
    rafId = anyGlobal.requestAnimationFrame(() => {
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
    confirmTool: (toolCallId: string, confirmed: boolean, options?: { trustAlways?: boolean; editedContent?: string }) => void;
    setTasks: (tasks: Task[]) => void;
    setSubagentRuns: (runs: SubagentRunUpdate[]) => void;
    setSessions: (sessions: AppState['sessions']) => void;
    setCurrentSession: (sessionId: string | null) => void;
    setPlanMode: (enabled: boolean) => void;
    setPermissionMode: (mode: PermissionMode) => void;
    setThinkingEnabled: (enabled: boolean) => void;
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

/**
 * Append to content blocks with merging strategy:
 * - Consecutive text blocks are merged
 * - Consecutive tool blocks are merged (tool IDs appended)
 * - Thought blocks are merged (content appended)
 * 
 * IMPORTANT: Creates new array/object references to ensure React detects changes
 */
function appendContentBlock(target: ChatMessage, block: ContentBlock): void {
    // Create new array reference to trigger React re-render
    const blocks = target.contentBlocks ? [...target.contentBlocks] : [];
    const lastIndex = blocks.length - 1;
    const last = blocks[lastIndex];
    
    if (block.type === 'text') {
        // Merge with last text block if exists
        if (last?.type === 'text') {
            // Create new object instead of mutating
            blocks[lastIndex] = { ...last, content: last.content + block.content };
        } else {
            blocks.push(block);
        }
    } else if (block.type === 'tools') {
        // Merge with last tools block if exists
        if (last?.type === 'tools') {
            // Create new array of tool IDs
            const newToolCallIds = [...last.toolCallIds];
            for (const id of block.toolCallIds) {
                if (!newToolCallIds.includes(id)) {
                    newToolCallIds.push(id);
                }
            }
            // Create new object instead of mutating
            blocks[lastIndex] = { ...last, toolCallIds: newToolCallIds };
        } else {
            blocks.push(block);
        }
    } else if (block.type === 'thought') {
        // Merge with last thought block if exists
        if (last?.type === 'thought') {
            // Create new object instead of mutating
            blocks[lastIndex] = { 
                ...last, 
                content: last.content + block.content, 
                isComplete: block.isComplete 
            };
        } else {
            blocks.push(block);
        }
    }
    
    // Assign new array reference to trigger React re-render
    target.contentBlocks = blocks;
}

const initialState: AppState = {
    sessions: [],
    currentSessionId: null,
    messages: [],
    tasks: [],
    subagentRuns: [],
    planMode: false,
    permissionMode: 'default',
    thinkingEnabled: false,
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

function isBoolean(value: unknown): value is boolean {
    return value === true || value === false;
}

function isPermissionMode(value: unknown): value is PermissionMode {
    return value === 'default' || value === 'plan' || value === 'acceptEdits' || value === 'bypassPermissions';
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
    planMode: isBoolean(persisted.planMode) ? persisted.planMode : initialState.planMode,
    permissionMode: isPermissionMode(persisted.permissionMode) ? persisted.permissionMode : initialState.permissionMode,
    thinkingEnabled: isBoolean(persisted.thinkingEnabled) ? persisted.thinkingEnabled : initialState.thinkingEnabled,
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
            const lastIndex = messages.length - 1;
            const last = messages[lastIndex];
            
            let target: ChatMessage;
            let targetIndex: number;
            
            if (last && last.role === 'assistant' && !last.isComplete) {
                // Clone the existing message to create a new reference
                target = { ...last };
                targetIndex = lastIndex;
            } else {
                // Create new message
                target = {
                    id: createId(),
                    role: 'assistant',
                    content: '',
                    isComplete: false,
                };
                targetIndex = messages.length;
            }

            target.content = (target.content || '') + text;
            // Track content block for chronological display
            appendContentBlock(target, { type: 'text', content: text });
            
            // Replace with new object reference to trigger React re-render
            messages[targetIndex] = target;
            return { messages };
        }),

    setThought: (thought, isComplete) =>
        set((state) => {
            if (debugThinking) {
                console.debug('[VCoder][thinking] setThought', {
                    length: thought.length,
                    isComplete,
                });
            }
            const messages = [...state.messages];
            const lastIndex = messages.length - 1;
            const last = messages[lastIndex];
            
            let target: ChatMessage;
            let targetIndex: number;
            
            if (last && last.role === 'assistant' && !last.isComplete) {
                // Clone the existing message to create a new reference
                target = { ...last };
                targetIndex = lastIndex;
            } else {
                // Create new message
                target = {
                    id: createId(),
                    role: 'assistant',
                    content: '',
                    isComplete: false,
                };
                targetIndex = messages.length;
            }

            target.thought = isComplete ? thought : (target.thought || '') + thought;
            target.thoughtIsComplete = isComplete;
            // Track content block for chronological display
            appendContentBlock(target, { type: 'thought', content: thought, isComplete });
            
            // Replace with new object reference to trigger React re-render
            messages[targetIndex] = target;
            return { messages };
        }),

    addToolCall: (toolCall) =>
        set((state) => {
            const messages = [...state.messages];
            const lastIndex = messages.length - 1;
            const last = messages[lastIndex];
            
            let target: ChatMessage;
            let targetIndex: number;
            
            if (last && last.role === 'assistant' && !last.isComplete) {
                // Clone the existing message to create a new reference
                target = { ...last };
                targetIndex = lastIndex;
            } else {
                // Create new message
                target = {
                    id: createId(),
                    role: 'assistant',
                    content: '',
                    isComplete: false,
                };
                targetIndex = messages.length;
            }

            const existing = target.toolCalls?.find((tc) => tc.id === toolCall.id);
            if (existing) {
                // Create new toolCalls array with updated tool
                target.toolCalls = target.toolCalls!.map((tc) =>
                    tc.id === toolCall.id ? { ...tc, ...toolCall } : tc
                );
            } else {
                target.toolCalls = [...(target.toolCalls || []), toolCall];
                // Track content block for chronological display (only for new tools)
                appendContentBlock(target, { type: 'tools', toolCallIds: [toolCall.id] });
            }
            
            // Replace with new object reference to trigger React re-render
            messages[targetIndex] = target;
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
                
                // Clone the message and update toolCalls to create new references
                const newToolCalls = [...message.toolCalls];
                newToolCalls[idx] = { ...newToolCalls[idx], ...updates };
                messages[i] = { ...message, toolCalls: newToolCalls };
                return { messages };
            }

            // Tool not found - create new message with tool
            const lastIndex = messages.length - 1;
            const last = messages[lastIndex];
            
            let target: ChatMessage;
            let targetIndex: number;
            
            if (last && last.role === 'assistant' && !last.isComplete) {
                target = { ...last };
                targetIndex = lastIndex;
            } else {
                target = {
                    id: createId(),
                    role: 'assistant',
                    content: '',
                    isComplete: false,
                };
                targetIndex = messages.length;
            }

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
            messages[targetIndex] = target;
            return { messages };
        }),

    confirmTool: (toolCallId, confirmed, options) => {
        // Update tool call status
        set((state) => {
            const messages = [...state.messages];
            for (let i = 0; i < messages.length; i++) {
                const msg = messages[i];
                if (msg.toolCalls) {
                    const tcIdx = msg.toolCalls.findIndex(t => t.id === toolCallId);
                    if (tcIdx !== -1) {
                        // Create new references for immutable update
                        const newToolCalls = [...msg.toolCalls];
                        const updatedTc = { ...newToolCalls[tcIdx] };
                        updatedTc.status = confirmed ? 'running' : 'failed';
                        delete updatedTc.confirmationType;
                        delete updatedTc.confirmationData;
                        newToolCalls[tcIdx] = updatedTc;
                        messages[i] = { ...msg, toolCalls: newToolCalls };
                        break;
                    }
                }
            }
            return { messages };
        });
        
        // Send message to extension
        postMessage({
            type: 'confirmTool',
            toolCallId,
            confirmed,
            options,
        });
    },

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

    setPermissionMode: (mode) => {
        set((state) => ({
            permissionMode: mode,
            // Update planMode for backward compatibility
            planMode: mode === 'plan',
            // Clear tasks/subagentRuns when switching to plan mode
            tasks: mode === 'plan' && state.permissionMode !== 'plan' ? [] : state.tasks,
            subagentRuns: mode === 'plan' && state.permissionMode !== 'plan' ? [] : state.subagentRuns,
        }));
        postMessage({ type: 'setPermissionMode', mode });
    },

    setThinkingEnabled: (enabled) => {
        set({ thinkingEnabled: enabled });
        postMessage({
            type: 'setThinking',
            enabled,
            maxThinkingTokens: enabled ? DEFAULT_MAX_THINKING_TOKENS : 0,
        });
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
            case 'confirmation_request': {
                const request = content as {
                    id: string;
                    type: string;
                    toolCallId: string;
                    summary: string;
                    details?: {
                        command?: string;
                        filePath?: string;
                        diff?: string;
                        content?: string;
                        tasks?: Task[];
                        planSummary?: string;
                        riskLevel?: 'low' | 'medium' | 'high';
                        riskReasons?: string[];
                    };
                };
                
                // Update the corresponding ToolCall status
                get().updateToolCall(request.toolCallId, {
                    status: 'awaiting_confirmation',
                    confirmationType: request.type as ToolCall['confirmationType'],
                    confirmationData: request.details,
                });
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
            thoughtIsComplete: msg.thought ? true : undefined,
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
    permissionMode: restoredState.permissionMode,
    thinkingEnabled: restoredState.thinkingEnabled,
    currentSessionId: restoredState.currentSessionId,
    uiLanguage: restoredState.uiLanguage,
};

useStore.subscribe(() => {
    const state = useStore.getState();
    // Only persist when these specific fields change
    if (
        state.model !== prevPersistedFields.model ||
        state.planMode !== prevPersistedFields.planMode ||
        state.permissionMode !== prevPersistedFields.permissionMode ||
        state.thinkingEnabled !== prevPersistedFields.thinkingEnabled ||
        state.currentSessionId !== prevPersistedFields.currentSessionId ||
        state.uiLanguage !== prevPersistedFields.uiLanguage
    ) {
        prevPersistedFields = {
            model: state.model,
            planMode: state.planMode,
            permissionMode: state.permissionMode,
            thinkingEnabled: state.thinkingEnabled,
            currentSessionId: state.currentSessionId,
            uiLanguage: state.uiLanguage,
        };
        savePersistedState(prevPersistedFields);
    }
});
