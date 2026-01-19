import { create } from './createStore';
import type { AppState, ChatMessage, ContentBlock, ToolCall, UiLanguage, AgentInfo, SessionStatus, SessionState } from '../types';
import type { Task, ModelId, PermissionMode, UpdateNotificationParams, ErrorUpdate, SubagentRunUpdate, HistorySession, HistoryChatMessage, FileChangeUpdate, SessionCompleteReason } from '@vcoder/shared';
import { postMessage } from '../utils/vscode';

const debugThinking = (globalThis as unknown as { __vcoderDebugThinking?: boolean }).__vcoderDebugThinking === true;
const DEFAULT_MAX_THINKING_TOKENS = 16000;

// Streaming text update batching with adaptive throttling
let textBuffer = '';
let rafId: number | null = null;
let lastFlushTime = 0;
const MIN_FLUSH_INTERVAL = 16; // ~60fps, minimum time between flushes
const MAX_BUFFER_SIZE = 100; // Force flush if buffer gets too large (for responsiveness)

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
        lastFlushTime = Date.now();
    }
}

function queueTextUpdate(text: string, store: { appendToLastMessage: (text: string) => void }) {
    const anyGlobal = globalThis as unknown as { requestAnimationFrame?: (cb: () => void) => number };
    
    // Node/test environments: apply immediately (no rAF available).
    if (typeof anyGlobal.requestAnimationFrame !== 'function') {
        store.appendToLastMessage(text);
        return;
    }
    
    textBuffer += text;
    
    // Force immediate flush for large buffers or when enough time has passed
    const now = Date.now();
    const timeSinceLastFlush = now - lastFlushTime;
    
    if (textBuffer.length >= MAX_BUFFER_SIZE || timeSinceLastFlush >= MIN_FLUSH_INTERVAL * 2) {
        // Immediate flush for better responsiveness
        if (rafId !== null) {
            const caf = anyGlobal as unknown as { cancelAnimationFrame?: (id: number) => void };
            if (typeof caf.cancelAnimationFrame === 'function') {
                caf.cancelAnimationFrame(rafId);
            }
            rafId = null;
        }
        store.appendToLastMessage(textBuffer);
        textBuffer = '';
        lastFlushTime = now;
        return;
    }
    
    if (rafId !== null) return; // Already scheduled
    
    rafId = anyGlobal.requestAnimationFrame(() => {
        rafId = null;
        if (textBuffer) {
            store.appendToLastMessage(textBuffer);
            textBuffer = '';
            lastFlushTime = Date.now();
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
    clearPendingFileChanges: () => void;
    setPlanMode: (enabled: boolean) => void;
    setPermissionMode: (mode: PermissionMode) => void;
    setThinkingEnabled: (enabled: boolean) => void;
    setModel: (model: ModelId) => void;
    setLoading: (loading: boolean) => void;
    setError: (error: ErrorUpdate | null) => void;
    handleUpdate: (update: UpdateNotificationParams) => void;
    setWorkspaceFiles: (files: string[]) => void;
    setUiLanguage: (uiLanguage: UiLanguage, source?: 'user' | 'extension') => void;
    // Session status Actions
    setSessionStatus: (status: SessionStatus) => void;
    handleSessionComplete: (reason: SessionCompleteReason, message?: string, error?: ErrorUpdate) => void;
    updateActivity: () => void;
    // Session management helpers
    getCurrentSessionState: () => SessionState | null;
    getOrCreateSessionState: (sessionId: string) => SessionState;
    updateCurrentSessionState: (updates: Partial<SessionState>) => void;
    // History Actions
    setHistorySessions: (sessions: HistorySession[]) => void;
    loadHistorySession: (sessionId: string, messages: HistoryChatMessage[]) => void;
    exitHistoryMode: () => void;
    // Agent Actions
    setAgents: (agents: AgentInfo[]) => void;
    setCurrentAgent: (agentId: string | null) => void;
    selectAgent: (agentId: string) => void;
    reset: () => void;
}

function createId(): string {
    const anyCrypto = (globalThis as unknown as { crypto?: unknown }).crypto as { randomUUID?: () => string } | undefined;
    if (anyCrypto && typeof anyCrypto.randomUUID === 'function') return anyCrypto.randomUUID();
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeToolName(name: string): string {
    const raw = (name ?? '').trim();
    if (!raw) return 'Tool';
    if (raw.startsWith('mcp__')) return raw;

    const lower = raw.toLowerCase();

    // Shell / terminal
    if (lower === 'bash' || lower === 'bash_request' || lower === 'shell') return 'Bash';
    if (lower === 'bashoutput' || lower === 'bash_output') return 'BashOutput';
    if (lower === 'killshell' || lower === 'kill_shell') return 'KillShell';

    // Common tools (case normalization)
    if (lower === 'read') return 'Read';
    if (lower === 'write') return 'Write';
    if (lower === 'edit') return 'Edit';
    if (lower === 'notebookedit' || lower === 'notebook_edit') return 'NotebookEdit';
    if (lower === 'glob') return 'Glob';
    if (lower === 'grep') return 'Grep';
    if (lower === 'task') return 'Task';
    if (lower === 'todowrite' || lower === 'todo_write') return 'TodoWrite';

    return raw;
}

function mergeHistoryMessages(historyMessages: HistoryChatMessage[]): ChatMessage[] {
    const out: ChatMessage[] = [];

    const upsertToolCall = (target: ChatMessage, toolCall: ToolCall): void => {
        const normalized: ToolCall = {
            ...toolCall,
            name: normalizeToolName(toolCall.name),
        };
        const existing = target.toolCalls ?? [];
        const idx = existing.findIndex((tc) => tc.id === normalized.id);
        if (idx === -1) {
            target.toolCalls = [...existing, normalized];
            return;
        }
        const next = [...existing];
        next[idx] = { ...next[idx], ...normalized };
        target.toolCalls = next;
    };

    const appendHistoryBlocks = (target: ChatMessage, blocks: NonNullable<HistoryChatMessage['contentBlocks']>): void => {
        for (const block of blocks) {
            if (block.type === 'text') {
                if (!block.content) continue;
                target.content = (target.content || '') + block.content;
                appendContentBlock(target, { type: 'text', content: block.content });
                continue;
            }
            if (block.type === 'thought') {
                if (!block.content) continue;
                target.thought = (target.thought || '') + block.content;
                target.thoughtIsComplete = block.isComplete;
                appendContentBlock(target, { type: 'thought', content: block.content, isComplete: block.isComplete });
                continue;
            }
            if (block.type === 'tools') {
                if (!block.toolCallIds || block.toolCallIds.length === 0) continue;
                appendContentBlock(target, { type: 'tools', toolCallIds: block.toolCallIds });
            }
        }
    };

    for (const msg of historyMessages) {
        if (msg.role === 'user') {
            out.push({
                id: msg.id,
                role: 'user',
                content: msg.content,
                isComplete: true,
            });
            continue;
        }

        const last = out[out.length - 1];
        const target =
            last && last.role === 'assistant'
                ? last
                : (() => {
                      const created: ChatMessage = {
                          id: msg.id,
                          role: 'assistant',
                          content: '',
                          isComplete: true,
                      };
                      out.push(created);
                      return created;
                  })();

        // Merge tool calls first so tool blocks can resolve immediately.
        if (msg.toolCalls) {
            for (const tc of msg.toolCalls) {
                upsertToolCall(target, {
                    id: tc.id,
                    name: tc.name,
                    status: tc.status,
                    input: tc.input,
                    result: tc.result,
                    error: tc.error,
                });
            }
        }

        const blocks =
            msg.contentBlocks ??
            ([
                ...(msg.thought
                    ? [{ type: 'thought' as const, content: msg.thought, isComplete: true }]
                    : []),
                ...(msg.toolCalls && msg.toolCalls.length > 0
                    ? [{ type: 'tools' as const, toolCallIds: msg.toolCalls.map((t) => t.id) }]
                    : []),
                ...(msg.content ? [{ type: 'text' as const, content: msg.content }] : []),
            ] as NonNullable<HistoryChatMessage['contentBlocks']>);

        appendHistoryBlocks(target, blocks);
    }

    return out;
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
    sessionStates: new Map(),
    // Legacy fields for backward compatibility during migration
    messages: [],
    tasks: [],
    subagentRuns: [],
    pendingFileChanges: [],
    planMode: false,
    permissionMode: 'default',
    thinkingEnabled: false,
    model: 'claude-haiku-4-5-20251001',
    isLoading: false,
    error: null,
    workspaceFiles: [],
    uiLanguage: 'auto',
    // Session status tracking - managed both in sessionStates and legacy fields
    sessionStatus: 'idle',
    sessionCompleteReason: undefined,
    sessionCompleteMessage: undefined,
    lastActivityTime: Date.now(),
    // History
    historySessions: [],
    viewMode: 'live',
    // Agent
    agents: [],
    currentAgentId: null,
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

function isModelId(value: unknown): value is ModelId {
    return (
        value === 'claude-haiku-4-5-20251001' ||
        value === 'claude-sonnet-4-5-20250929' ||
        value === 'glm-4.6'
    );
}

function getInitialUiLanguage(): UiLanguage {
    if (isUiLanguage(persisted.uiLanguage)) return persisted.uiLanguage;
    const fromWindow = (globalThis as unknown as { __vcoderUiLanguage?: unknown }).__vcoderUiLanguage;
    if (isUiLanguage(fromWindow)) return fromWindow;
    return 'auto';
}

const restoredState: AppState = {
    ...initialState,
    model: isModelId(persisted.model) ? persisted.model : initialState.model,
    planMode: isBoolean(persisted.planMode) ? persisted.planMode : initialState.planMode,
    permissionMode: isPermissionMode(persisted.permissionMode) ? persisted.permissionMode : initialState.permissionMode,
    thinkingEnabled: isBoolean(persisted.thinkingEnabled) ? persisted.thinkingEnabled : initialState.thinkingEnabled,
    currentSessionId: persisted.currentSessionId ?? initialState.currentSessionId,
    uiLanguage: getInitialUiLanguage(),
};

export const useStore = create<AppStore>((set, get) => ({
    ...restoredState,


    addMessage: (message) => {
        const state = get();
        if (!state.currentSessionId) return;
        
        set((prevState) => {
            const newSessionStates = new Map(prevState.sessionStates);
            const sessionState = newSessionStates.get(state.currentSessionId!) || {
                id: state.currentSessionId!,
                messages: [],
                tasks: [],
                subagentRuns: [],
                sessionStatus: 'idle',
                lastActivityTime: Date.now(),
            };
            
            sessionState.messages = [...sessionState.messages, message];
            newSessionStates.set(state.currentSessionId!, sessionState);
            
            return { 
                sessionStates: newSessionStates,
                // Keep legacy field in sync for backward compatibility
                messages: sessionState.messages 
            };
        });
    },

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

            const normalizedToolCall: ToolCall = {
                ...toolCall,
                name: normalizeToolName(toolCall.name),
            };

            const existing = target.toolCalls?.find((tc) => tc.id === normalizedToolCall.id);
            if (existing) {
                // Create new toolCalls array with updated tool
                target.toolCalls = target.toolCalls!.map((tc) =>
                    tc.id === normalizedToolCall.id ? { ...tc, ...normalizedToolCall } : tc
                );
            } else {
                target.toolCalls = [...(target.toolCalls || []), normalizedToolCall];
                // Track content block for chronological display (only for new tools)
                appendContentBlock(target, { type: 'tools', toolCallIds: [normalizedToolCall.id] });
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
                const normalizedUpdates: Partial<ToolCall> = {
                    ...updates,
                    ...(typeof updates.name === 'string' ? { name: normalizeToolName(updates.name) } : null),
                };
                newToolCalls[idx] = { ...newToolCalls[idx], ...normalizedUpdates };
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
                    name:
                        typeof updates.name === 'string' && updates.name
                            ? normalizeToolName(updates.name)
                            : 'Tool',
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

    setTasks: (tasks) => {
        const state = get();
        if (!state.currentSessionId) return;
        
        set((prevState) => {
            const newSessionStates = new Map(prevState.sessionStates);
            const sessionState = newSessionStates.get(state.currentSessionId!) || {
                id: state.currentSessionId!,
                messages: [],
                tasks: [],
                subagentRuns: [],
                sessionStatus: 'idle',
                lastActivityTime: Date.now(),
            };
            
            sessionState.tasks = tasks;
            newSessionStates.set(state.currentSessionId!, sessionState);
            
            return { 
                sessionStates: newSessionStates,
                // Keep legacy field in sync for backward compatibility
                tasks: sessionState.tasks 
            };
        });
    },

    setSubagentRuns: (subagentRuns) => set({ subagentRuns }),

    setSessions: (sessions) =>
        set((state) => ({
            sessions,
            currentSessionId: state.currentSessionId ?? sessions[0]?.id ?? null,
            pendingFileChanges: state.currentSessionId ? state.pendingFileChanges : [],
        })),

    setCurrentSession: (sessionId) => {
        set((prevState) => {
            const newSessionStates = new Map(prevState.sessionStates);
            
            let sessionState = sessionId ? newSessionStates.get(sessionId) : undefined;
            if (!sessionState && sessionId) {
                sessionState = {
                    id: sessionId,
                    messages: [],
                    tasks: [],
                    subagentRuns: [],
                    sessionStatus: 'idle',
                    lastActivityTime: Date.now(),
                };
                newSessionStates.set(sessionId, sessionState);
            }
            
            const currentSessionData = sessionState || {
                messages: [],
                tasks: [],
                subagentRuns: [],
                sessionStatus: 'idle' as const,
                lastActivityTime: Date.now(),
            };
            
            return {
                currentSessionId: sessionId,
                sessionStates: newSessionStates,
                viewMode: 'live',
                messages: currentSessionData.messages,
                tasks: currentSessionData.tasks,
                subagentRuns: currentSessionData.subagentRuns,
                sessionStatus: currentSessionData.sessionStatus,
                pendingFileChanges: [],
                sessionCompleteReason: undefined,
                sessionCompleteMessage: undefined,
                error: null,
            };
        });
    },

    clearPendingFileChanges: () => set({ pendingFileChanges: [] }),

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

    setSessionStatus: (sessionStatus) => set({ sessionStatus }),

    handleSessionComplete: (reason, message, error) => {
        set({
            sessionStatus: reason === 'completed' ? 'completed' : 
                         reason === 'cancelled' ? 'cancelled' :
                         reason === 'timeout' ? 'timeout' : 'error',
            sessionCompleteReason: reason,
            sessionCompleteMessage: message,
            isLoading: false,
        });
        
        // Flush any pending text updates
        flushTextBuffer(get());
        
        // Mark last assistant message as complete
        set((state) => {
            const messages = [...state.messages];
            if (messages.length > 0) {
                const lastIndex = messages.length - 1;
                const last = messages[lastIndex];
                if (last.role === 'assistant' && !last.isComplete) {
                    messages[lastIndex] = { ...last, isComplete: true };
                }
            }
            return { messages };
        });
        
        // Show error if present
        if (error) {
            get().setError(error);
        }
    },

    updateActivity: () => set({ lastActivityTime: Date.now(), sessionStatus: 'active' }),

    handleUpdate: (update) => {
        const { type, content, sessionId } = update;
        const state = get();
        
        // Strict session filtering: ignore updates for other sessions
        if (sessionId && state.currentSessionId && sessionId !== state.currentSessionId) {
            return;
        }
        
        // Update activity timestamp for any update
        get().updateActivity();

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
                    name: 'Bash',
                    status: 'pending',
                    input: { command: bash.command, CommandLine: bash.command },
                });
                break;
            }
            case 'task_list': {
                const { tasks } = content as { tasks: Task[] };
                get().setTasks(tasks);
                break;
            }
            case 'file_change': {
                const change = content as FileChangeUpdate;
                set((state) => {
                    // Ignore updates for other sessions when multi-session is enabled.
                    if (state.currentSessionId && sessionId && sessionId !== state.currentSessionId) {
                        return {};
                    }

                    const existing = state.pendingFileChanges.filter((c) => c.path !== change.path);
                    if (change.proposed) {
                        existing.push({ ...change, sessionId: sessionId ?? state.currentSessionId ?? '', receivedAt: Date.now() });
                    }
                    return { pendingFileChanges: existing };
                });
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
                // Set session status based on error recoverability
                if (!errorUpdate.recoverable) {
                    get().setSessionStatus('error');
                }
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
        // History mode should mirror live rendering as closely as possible.
        // Live streaming aggregates all assistant activity (text/thought/tools) into a single assistant message until
        // completion; do the same for history by merging consecutive assistant transcript messages.
        messages: mergeHistoryMessages(historyMessages),
        isLoading: false,
        pendingFileChanges: [],
    }),

    exitHistoryMode: () => set({
        viewMode: 'live',
        currentSessionId: null, // Returning to live mode usually starts fresh or needs session restore (not implemented yet)
        messages: [],
        pendingFileChanges: [],
    }),

    setAgents: (agents) => set({ agents }),

    setCurrentAgent: (currentAgentId) => set({ currentAgentId }),

    selectAgent: (agentId) => {
        set({ currentAgentId: agentId });
        postMessage({ type: 'selectAgent', agentId });
    },

    // Session management helpers
    getCurrentSessionState: (): SessionState | null => {
        const state = useStore.getState();
        const { currentSessionId } = state;
        if (!currentSessionId) return null;
        return state.sessionStates.get(currentSessionId) || null;
    },

    getOrCreateSessionState: (sessionId: string): SessionState => {
        const state = useStore.getState();
        let sessionState = state.sessionStates.get(sessionId);
        if (!sessionState) {
            sessionState = {
                id: sessionId,
                messages: [],
                tasks: [],
                subagentRuns: [],
                sessionStatus: 'idle',
                lastActivityTime: Date.now(),
            };
            set((prevState: AppState) => {
                const newSessionStates = new Map(prevState.sessionStates);
                newSessionStates.set(sessionId, sessionState!);
                return { sessionStates: newSessionStates };
            });
        }
        return sessionState;
    },

    updateCurrentSessionState: (updates: Partial<SessionState>): void => {
        const state = useStore.getState();
        const { currentSessionId } = state;
        if (!currentSessionId) return;
        
        set((prevState: AppState) => {
            const newSessionStates = new Map(prevState.sessionStates);
            const currentSessionState = newSessionStates.get(currentSessionId);
            if (currentSessionState !== undefined) {
                newSessionStates.set(currentSessionId, { ...currentSessionState, ...updates });
            }
            return { sessionStates: newSessionStates };
        });
    },

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
