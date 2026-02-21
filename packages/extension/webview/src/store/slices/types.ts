import type { AppState, ChatMessage, ContentBlock, ToolCall, UiLanguage, AgentInfo, SessionStatus, SessionState } from '../../types';
import type { Task, ModelId, PermissionMode, UpdateNotificationParams, ErrorUpdate, SubagentRunUpdate, HistorySession, HistoryChatMessage, FileChangeUpdate, SessionCompleteReason } from '@vcoder/shared';

export type SetState<T extends object> = (
    partial: Partial<T> | ((state: T) => Partial<T>)
) => void;

export type GetState<T extends object> = () => T;

export interface MessagesSlice {
    addMessage: (message: ChatMessage, sessionId?: string) => void;
    updateMessage: (id: string, updates: Partial<ChatMessage>, sessionId?: string) => void;
    appendToLastMessage: (text: string, sessionId?: string) => void;
    setThought: (thought: string, isComplete: boolean, sessionId?: string) => void;
    addToolCall: (toolCall: ToolCall, sessionId?: string) => void;
    updateToolCall: (id: string, updates: Partial<ToolCall>, sessionId?: string) => void;
    confirmTool: (toolCallId: string, confirmed: boolean, options?: { trustAlways?: boolean; editedContent?: string }, sessionId?: string) => void;
}

export interface SessionsSlice {
    setSessions: (sessions: AppState['sessions']) => void;
    setCurrentSession: (sessionId: string | null) => void;
    setTasks: (tasks: Task[], sessionId?: string) => void;
    setSubagentRuns: (runs: SubagentRunUpdate[], sessionId?: string) => void;
    clearPendingFileChanges: () => void;
    setSessionStatus: (status: SessionStatus, sessionId?: string) => void;
    handleSessionComplete: (reason: SessionCompleteReason, message?: string, error?: ErrorUpdate, sessionId?: string) => void;
    updateActivity: (sessionId?: string) => void;
    getCurrentSessionState: () => SessionState | null;
    getOrCreateSessionState: (sessionId: string) => SessionState;
    updateCurrentSessionState: (updates: Partial<SessionState>) => void;
}

export interface UiSlice {
    setPlanMode: (enabled: boolean) => void;
    setPermissionMode: (mode: PermissionMode) => void;
    setThinkingEnabled: (enabled: boolean) => void;
    setModel: (model: ModelId) => void;
    setLoading: (loading: boolean) => void;
    setError: (error: ErrorUpdate | null) => void;
    setWorkspaceFiles: (files: string[]) => void;
    setUiLanguage: (uiLanguage: UiLanguage, source?: 'user' | 'extension') => void;
}

export interface HistorySlice {
    setHistorySessions: (sessions: HistorySession[]) => void;
    loadHistorySession: (sessionId: string, messages: HistoryChatMessage[]) => void;
    exitHistoryMode: () => void;
}

export interface AgentSlice {
    setAgents: (agents: AgentInfo[]) => void;
    setCurrentAgent: (agentId: string | null) => void;
    selectAgent: (agentId: string) => void;
}

export interface UpdateSlice {
    handleUpdate: (update: UpdateNotificationParams) => void;
    reset: () => void;
}

export type AppStore = AppState & MessagesSlice & SessionsSlice & UiSlice & HistorySlice & AgentSlice & UpdateSlice;

export type SliceCreator<T> = (set: SetState<AppStore>, get: GetState<AppStore>) => T;

export type {
    AppState, ChatMessage, ContentBlock, ToolCall, UiLanguage, AgentInfo, SessionStatus, SessionState,
    Task, ModelId, PermissionMode, UpdateNotificationParams, ErrorUpdate, SubagentRunUpdate,
    HistorySession, HistoryChatMessage, FileChangeUpdate, SessionCompleteReason,
};
