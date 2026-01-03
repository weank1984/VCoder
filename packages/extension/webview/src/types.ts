/**
 * Webview Types
 */

import type { UpdateNotificationParams, Session, Task, ModelId, ErrorUpdate, SubagentRunUpdate, HistorySession, HistoryChatMessage } from '@vcoder/shared';

export type UiLanguage = 'auto' | 'en-US' | 'zh-CN';

// Message types from Extension to Webview
export interface UpdateMessage {
    type: 'update';
    data: UpdateNotificationParams;
}

export interface CompleteMessage {
    type: 'complete';
    data: { sessionId: string };
}

export interface SessionsMessage {
    type: 'sessions';
    data: Session[];
}

export interface CurrentSessionMessage {
    type: 'currentSession';
    data: { sessionId: string };
}

export interface ShowHistoryMessage {
    type: 'showHistory';
}

export interface UiLanguageMessage {
    type: 'uiLanguage';
    data: { uiLanguage: UiLanguage };
}

// Message types from Webview to Extension
export interface SendMessage {
    type: 'send';
    content: string;
    attachments?: Array<{
        type: 'file' | 'selection';
        path?: string;
        content?: string;
    }>;
}

export interface NewSessionMessage {
    type: 'newSession';
    title?: string;
}

export interface ListSessionsMessage {
    type: 'listSessions';
}

export interface SwitchSessionMessage {
    type: 'switchSession';
    sessionId: string;
}

export interface DeleteSessionMessage {
    type: 'deleteSession';
    sessionId: string;
}

export interface AcceptChangeMessage {
    type: 'acceptChange';
    path: string;
}

export interface RejectChangeMessage {
    type: 'rejectChange';
    path: string;
}

export interface SetModelMessage {
    type: 'setModel';
    model: ModelId;
}

export interface SetPlanModeMessage {
    type: 'setPlanMode';
    enabled: boolean;
}

export interface ConfirmBashMessage {
    type: 'confirmBash';
    commandId: string;
}

export interface SkipBashMessage {
    type: 'skipBash';
    commandId: string;
}

export interface ConfirmPlanMessage {
    type: 'confirmPlan';
}

export interface CancelMessage {
    type: 'cancel';
}

export interface ExecuteCommandMessage {
    type: 'executeCommand';
    command: string;
}

export interface GetWorkspaceFilesMessage {
    type: 'getWorkspaceFiles';
}

export interface WorkspaceFilesMessage {
    type: 'workspaceFiles';
    data: string[];
}

export interface ListHistoryMessage {
    type: 'listHistory';
}

export interface LoadHistoryMessage {
    type: 'loadHistory';
    sessionId: string;
}

export interface DeleteHistoryMessage {
    type: 'deleteHistory';
    sessionId: string;
}

export interface SetUiLanguageMessage {
    type: 'setUiLanguage';
    uiLanguage: UiLanguage;
}

export interface HistorySessionsMessage {
    type: 'historySessions';
    data: HistorySession[];
}

export interface HistoryMessagesMessage {
    type: 'historyMessages';
    data: HistoryChatMessage[];
    sessionId: string;
}

export type ExtensionMessage = 
    | UpdateMessage 
    | CompleteMessage 
    | SessionsMessage 
    | CurrentSessionMessage 
    | WorkspaceFilesMessage 
    | ShowHistoryMessage
    | UiLanguageMessage
    | HistorySessionsMessage
    | HistoryMessagesMessage;

export type WebviewMessage =
    | SendMessage
    | NewSessionMessage
    | ListSessionsMessage
    | SwitchSessionMessage
    | DeleteSessionMessage
    | AcceptChangeMessage
    | RejectChangeMessage
    | SetModelMessage
    | SetPlanModeMessage
    | ConfirmBashMessage
    | SkipBashMessage
    | ConfirmPlanMessage
    | CancelMessage
    | ExecuteCommandMessage
    | GetWorkspaceFilesMessage
    | ListHistoryMessage
    | LoadHistoryMessage
    | DeleteHistoryMessage
    | SetUiLanguageMessage;
export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    thought?: string;
    toolCalls?: ToolCall[];
    isComplete: boolean;
}

export interface ToolCall {
    id: string;
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    input?: unknown;
    result?: unknown;
    error?: string;
}

export interface AppState {
    sessions: Session[];
    currentSessionId: string | null;
    messages: ChatMessage[];
    tasks: Task[];
    subagentRuns: SubagentRunUpdate[];
    planMode: boolean;
    model: ModelId;
    isLoading: boolean;
    error: ErrorUpdate | null;
    workspaceFiles: string[];
    uiLanguage: UiLanguage;
    // History
    historySessions: HistorySession[];
    viewMode: 'live' | 'history';
}
