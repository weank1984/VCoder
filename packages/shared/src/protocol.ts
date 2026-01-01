/**
 * Z-Code ACP Protocol Types
 * Agent Client Protocol over JSON-RPC 2.0
 */

// =============================================================================
// JSON-RPC 2.0 Base Types
// =============================================================================

export interface JsonRpcRequest<T = unknown> {
    jsonrpc: '2.0';
    id: number | string;
    method: string;
    params?: T;
}

export interface JsonRpcResponse<T = unknown> {
    jsonrpc: '2.0';
    id: number | string | null;
    result?: T;
    error?: JsonRpcError;
}

export interface JsonRpcNotification<T = unknown> {
    jsonrpc: '2.0';
    method: string;
    params?: T;
}

export interface JsonRpcError {
    code: number;
    message: string;
    data?: unknown;
}

// =============================================================================
// ACP Initialize
// =============================================================================

export interface InitializeParams {
    clientInfo: {
        name: string;
        version: string;
    };
    capabilities: {
        streaming: boolean;
        diffPreview: boolean;
        thought: boolean;
        toolCallList: boolean;
        taskList: boolean;
        multiSession: boolean;
    };
    workspaceFolders: string[];
}

export interface InitializeResult {
    serverInfo: {
        name: string;
        version: string;
    };
    capabilities: {
        models: string[];
        mcp: boolean;
        planMode: boolean;
    };
}

// =============================================================================
// Session Management
// =============================================================================

export interface Session {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
}

export interface NewSessionParams {
    title?: string;
}

export interface NewSessionResult {
    session: Session;
}

export interface ListSessionsResult {
    sessions: Session[];
}

export interface SwitchSessionParams {
    sessionId: string;
}

export interface DeleteSessionParams {
    sessionId: string;
}

// =============================================================================
// Prompt
// =============================================================================

export interface PromptParams {
    sessionId: string;
    content: string;
    attachments?: Attachment[];
}

export interface Attachment {
    type: 'file' | 'selection' | 'image';
    path?: string;
    content?: string;
    name?: string;
}

// =============================================================================
// Settings
// =============================================================================

export type ModelId =
    | 'claude-sonnet-4-20250514'
    | 'claude-3-5-sonnet-20241022'
    | 'claude-3-5-haiku-20241022'
    | 'claude-3-opus-20240229';

export interface SettingsChangeParams {
    sessionId: string;
    model?: ModelId;
    planMode?: boolean;
}

// =============================================================================
// File Operations
// =============================================================================

export interface FileAcceptParams {
    sessionId: string;
    path: string;
}

export interface FileRejectParams {
    sessionId: string;
    path: string;
}

// =============================================================================
// Bash Confirmation
// =============================================================================

export interface BashConfirmParams {
    sessionId: string;
    commandId: string;
}

export interface BashSkipParams {
    sessionId: string;
    commandId: string;
}

// =============================================================================
// Plan Confirmation
// =============================================================================

export interface PlanConfirmParams {
    sessionId: string;
}

// =============================================================================
// Session Update Notifications
// =============================================================================

export type UpdateType =
    | 'thought'
    | 'text'
    | 'tool_use'
    | 'tool_result'
    | 'file_change'
    | 'mcp_call'
    | 'task_list'
    | 'bash_request'
    | 'plan_ready'
    | 'error';

export interface UpdateNotificationParams {
    sessionId: string;
    type: UpdateType;
    content:
    | ThoughtUpdate
    | TextUpdate
    | ToolUseUpdate
    | ToolResultUpdate
    | FileChangeUpdate
    | McpCallUpdate
    | TaskListUpdate
    | BashRequestUpdate
    | PlanReadyUpdate
    | ErrorUpdate;
}

export interface ThoughtUpdate {
    content: string;
    isComplete: boolean;
}

export interface TextUpdate {
    text: string;
}

export interface ToolUseUpdate {
    id: string;
    name: string;
    input: Record<string, unknown>;
    status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface ToolResultUpdate {
    id: string;
    result: unknown;
    error?: string;
}

export interface FileChangeUpdate {
    type: 'created' | 'modified' | 'deleted';
    path: string;
    diff?: string;
    proposed: boolean;
}

export interface McpCallUpdate {
    id: string;
    server: string;
    tool: string;
    input: Record<string, unknown>;
    status: 'pending' | 'running' | 'completed' | 'failed';
    result?: unknown;
    error?: string;
}

export interface Task {
    id: string;
    title: string;
    status: 'pending' | 'in_progress' | 'completed';
    children?: Task[];
}

export interface TaskListUpdate {
    tasks: Task[];
    currentTaskId?: string;
}

export interface BashRequestUpdate {
    id: string;
    command: string;
}

export interface PlanReadyUpdate {
    tasks: Task[];
    summary: string;
}

export interface ErrorUpdate {
    code: string;
    message: string;
    action?: {
        label: string;
        command: string;
    };
}

// =============================================================================
// Session Complete Notification
// =============================================================================

export interface SessionCompleteParams {
    sessionId: string;
    usage?: {
        inputTokens: number;
        outputTokens: number;
    };
}
