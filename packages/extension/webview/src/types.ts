/**
 * Webview Types
 */

import {
    UpdateNotificationParams,
    Session,
    Task,
    ModelId,
} from '@z-code/shared';

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

export type ExtensionMessage = UpdateMessage | CompleteMessage | SessionsMessage;

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
    | ConfirmPlanMessage;

// UI State
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
    result?: unknown;
    error?: string;
}

export interface AppState {
    sessions: Session[];
    currentSessionId: string | null;
    messages: ChatMessage[];
    tasks: Task[];
    planMode: boolean;
    model: ModelId;
    isLoading: boolean;
    error: string | null;
}
