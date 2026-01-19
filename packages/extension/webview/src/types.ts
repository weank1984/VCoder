/**
 * Webview Types
 */

import type { UpdateNotificationParams, Session, Task, ModelId, PermissionMode, ErrorUpdate, SubagentRunUpdate, HistorySession, HistoryChatMessage, AgentProfile, FileChangeUpdate, SessionCompleteReason, ConfirmationType } from '@vcoder/shared';

export type { SessionCompleteReason };

export type UiLanguage = 'auto' | 'en-US' | 'zh-CN';

export type AgentStatus = 'online' | 'offline' | 'error' | 'starting' | 'reconnecting';

export interface AgentInfo {
    profile: AgentProfile;
    status: AgentStatus;
    isActive: boolean;
}

// Message types from Extension to Webview
export interface UpdateMessage {
    type: 'update';
    data: UpdateNotificationParams;
}

export interface CompleteMessage {
    type: 'complete';
    data: { 
        sessionId: string; 
        reason: SessionCompleteReason;
        message?: string;
        error?: ErrorUpdate;
    };
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

export interface SetPermissionModeMessage {
    type: 'setPermissionMode';
    mode: PermissionMode;
}

export interface SetThinkingMessage {
    type: 'setThinking';
    enabled: boolean;
    maxThinkingTokens?: number;
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

export interface ResumeHistoryMessage {
    type: 'resumeHistory';
    /** Claude CLI session id (from history) */
    sessionId: string;
    /** Optional display title */
    title?: string;
}

export interface DeleteHistoryMessage {
    type: 'deleteHistory';
    sessionId: string;
}

export interface SetUiLanguageMessage {
    type: 'setUiLanguage';
    uiLanguage: UiLanguage;
}

export interface OpenFileMessage {
    type: 'openFile';
    path: string;
    lineRange?: [number, number];
}

export interface OpenSettingsMessage {
    type: 'openSettings';
    setting?: string;
}

export interface RefreshAgentsMessage {
    type: 'refreshAgents';
}

export interface SelectAgentMessage {
    type: 'selectAgent';
    agentId: string;
}

export interface GetPermissionRulesMessage {
    type: 'getPermissionRules';
}

export interface DeletePermissionRuleMessage {
    type: 'deletePermissionRule';
    ruleId: string;
}

export interface ClearPermissionRulesMessage {
    type: 'clearPermissionRules';
}

export interface PermissionRulesMessage {
    type: 'permissionRules';
    data: Array<{
        id: string;
        toolName: string;
        category: string;
        pattern: string;
        createdAt: number;
        sessionId?: string;
    }>;
}

export interface ConfirmToolMessage {
    type: 'confirmTool';
    toolCallId: string;
    confirmed: boolean;
    options?: {
        /** 对此类工具始终信任 */
        trustAlways?: boolean;
        /** 用户编辑后的内容（用于文件修改） */
        editedContent?: string;
    };
}

export interface PermissionRequestMessage {
    type: 'permissionRequest';
    data: {
        requestId: string;
        sessionId: string;
        toolCallId: string;
        toolName: string;
        toolInput: Record<string, unknown>;
        metadata?: {
            riskLevel?: 'low' | 'medium' | 'high';
            summary?: string;
            command?: string;
            filePath?: string;
        };
    };
}

export interface PermissionResponseMessage {
    type: 'permissionResponse';
    requestId: string;
    outcome: 'allow' | 'deny';
    trustAlways?: boolean;
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

export interface ErrorMessage {
    type: 'error';
    data: {
        title?: string;
        message: string;
        action?: {
            label: string;
            command: string;
        };
    };
}

export interface BatchMessage {
    type: 'batch';
    messages: ExtensionMessage[];
}

export interface AgentsMessage {
    type: 'agents';
    data: AgentInfo[];
}

export interface CurrentAgentMessage {
    type: 'currentAgent';
    data: { agentId: string | null };
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
    | HistoryMessagesMessage
    | PermissionRequestMessage
    | ErrorMessage
    | AgentsMessage
    | CurrentAgentMessage
    | PermissionRulesMessage
    | BatchMessage;

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
    | SetPermissionModeMessage
    | SetThinkingMessage
    | ConfirmBashMessage
    | SkipBashMessage
    | ConfirmPlanMessage
    | CancelMessage
    | ExecuteCommandMessage
    | GetWorkspaceFilesMessage
    | ListHistoryMessage
    | LoadHistoryMessage
    | ResumeHistoryMessage
    | DeleteHistoryMessage
    | SetUiLanguageMessage
    | OpenFileMessage
    | OpenSettingsMessage
    | RefreshAgentsMessage
    | SelectAgentMessage
    | GetPermissionRulesMessage
    | DeletePermissionRuleMessage
    | ClearPermissionRulesMessage
    | ConfirmToolMessage
    | PermissionResponseMessage;
export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    thought?: string;
    thoughtIsComplete?: boolean;
    toolCalls?: ToolCall[];
    isComplete: boolean;
    /** 按时间顺序的内容块序列（用于按时序混合显示文本和工具） */
    contentBlocks?: ContentBlock[];
}

/** 内容块类型 - 按时间顺序混合显示 */
export type ContentBlock = 
    | { type: 'text'; content: string }
    | { type: 'thought'; content: string; isComplete: boolean }
    | { type: 'tools'; toolCallIds: string[] };

export interface ToolCall {
    id: string;
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'awaiting_confirmation';
    input?: unknown;
    result?: unknown;
    error?: string;
    /** Parent tool use ID for nested tool calls (e.g., Task subagent) */
    parentToolUseId?: string;
    
    /** 需要确认的操作类型 */
    confirmationType?: ConfirmationType;
    
    /** 确认相关的额外信息 */
    confirmationData?: ConfirmationData;
}



export interface ConfirmationData {
    /** Bash 命令内容 */
    command?: string;
    
    /** 文件路径 */
    filePath?: string;
    
    /** 文件 diff 内容 */
    diff?: string;
    
    /** 完整文件内容（用于预览） */
    content?: string;
    
    /** 计划任务列表 */
    tasks?: Task[];
    
    /** 计划摘要 */
    planSummary?: string;
    
    /** 风险等级 */
    riskLevel?: 'low' | 'medium' | 'high';
    
    /** 风险原因列表 */
    riskReasons?: string[];
}

export type SessionStatus = 'idle' | 'active' | 'completed' | 'cancelled' | 'error' | 'timeout';

// Session-specific state
export interface SessionState {
    id: string;
    messages: ChatMessage[];
    tasks: Task[];
    subagentRuns: SubagentRunUpdate[];
    // Session status tracking
    sessionStatus: SessionStatus;
    sessionCompleteReason?: SessionCompleteReason;
    sessionCompleteMessage?: string;
    lastActivityTime: number;
    createdAt: number;
    updatedAt: number;
}

export interface AppState {
    sessions: Session[];
    currentSessionId: string | null;
    // Session data - organized by session ID
    sessionStates: Map<string, SessionState>;
    // Legacy fields for backward compatibility during migration
    messages: ChatMessage[];
    tasks: Task[];
    subagentRuns: SubagentRunUpdate[];
    sessionStatus: SessionStatus;
    sessionCompleteReason?: SessionCompleteReason;
    sessionCompleteMessage?: string;
    lastActivityTime: number;
    // Global state (not session-specific)
    pendingFileChanges: Array<FileChangeUpdate & { sessionId: string; receivedAt: number }>;
    planMode: boolean;
    permissionMode: PermissionMode;
    thinkingEnabled: boolean;
    model: ModelId;
    isLoading: boolean;
    error: ErrorUpdate | null;
    workspaceFiles: string[];
    uiLanguage: UiLanguage;
    // History
    historySessions: HistorySession[];
    viewMode: 'live' | 'history';
    // Agent
    agents: AgentInfo[];
    currentAgentId: string | null;
}
