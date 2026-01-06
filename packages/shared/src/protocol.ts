/**
 * V-Coder ACP Protocol Types
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

export interface CancelSessionParams {
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

/**
 * Permission mode for Claude Code CLI.
 * - 'default': Normal permission checks
 * - 'plan': Plan mode - AI plans before executing
 * - 'acceptEdits': Auto-accept file edits
 * - 'bypassPermissions': Skip all permission checks (sandbox only)
 */
export type PermissionMode = 'default' | 'plan' | 'acceptEdits' | 'bypassPermissions';

export interface SettingsChangeParams {
    sessionId: string;
    model?: ModelId;
    planMode?: boolean; // Legacy, kept for compatibility
    permissionMode?: PermissionMode;
    fallbackModel?: ModelId;
    appendSystemPrompt?: string;
    maxThinkingTokens?: number;
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
    | 'subagent_run'
    | 'bash_request'
    | 'plan_ready'
    | 'error'
    | 'confirmation_request';

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
    | SubagentRunUpdate
    | BashRequestUpdate
    | PlanReadyUpdate
    | ErrorUpdate
    | ConfirmationRequestUpdate;
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
    /**
     * Proposed full file content (when available from the CLI).
     * When present, the extension can render a real VSCode diff and apply changes locally.
     */
    content?: string;
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
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    children?: Task[];
}

export interface TaskListUpdate {
    tasks: Task[];
    currentTaskId?: string;
}

export interface SubagentRunUpdate {
    id: string;
    title: string;
    subagentType?: string;
    status: 'running' | 'completed' | 'failed';
    parentTaskId?: string;
    input?: Record<string, unknown>;
    result?: unknown;
    error?: string;
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

export type ConfirmationType = 
    | 'bash'
    | 'file_write'
    | 'file_delete'
    | 'plan'
    | 'mcp'
    | 'dangerous';

export interface ConfirmationRequestUpdate {
    /** 确认请求唯一 ID */
    id: string;
    
    /** 确认类型 */
    type: ConfirmationType;
    
    /** 关联的工具调用 ID */
    toolCallId: string;
    
    /** 简短摘要 */
    summary: string;
    
    /** 详细信息 */
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

// =============================================================================
// History API (Read-only access to Claude Code CLI transcripts)
// =============================================================================

/**
 * Historical session metadata, distinct from live ACP sessions.
 * These are read from ~/.claude/projects/<projectKey>/*.jsonl files.
 */
export interface HistorySession {
    /** Session ID (derived from jsonl filename) */
    id: string;
    /** Title derived from first user message */
    title: string;
    /** ISO timestamp of first event */
    createdAt: string;
    /** ISO timestamp of last event */
    updatedAt: string;
    /** Project key (derived from workspace path) */
    projectKey: string;
}

export interface HistoryListParams {
    /** Workspace path to find history for */
    workspacePath: string;
}

export interface HistoryListResult {
    sessions: HistorySession[];
}

export interface HistoryLoadParams {
    /** Session ID to load */
    sessionId: string;
    /** Workspace path (needed to derive projectKey) */
    workspacePath: string;
}

/**
 * A single tool call within a history message
 */
export interface HistoryToolCall {
    id: string;
    name: string;
    input?: Record<string, unknown>;
    result?: unknown;
    error?: string;
    status: 'completed' | 'failed';
}

/**
 * Unified chat message format for history replay.
 * Converted from Claude Code CLI JSONL events.
 */
export interface HistoryChatMessage {
    /** Unique message ID */
    id: string;
    /** Message role */
    role: 'user' | 'assistant';
    /** Text content (concatenated from text blocks) */
    content: string;
    /** Thinking content (from thinking blocks) */
    thought?: string;
    /** Tool calls (from tool_use/tool_result blocks) */
    toolCalls?: HistoryToolCall[];
    /** ISO timestamp */
    timestamp?: string;
}

export interface HistoryLoadResult {
    messages: HistoryChatMessage[];
}

export interface HistoryDeleteParams {
    /** Session ID to delete */
    sessionId: string;
    /** Workspace path (needed to derive projectKey) */
    workspacePath: string;
}

export interface HistoryDeleteResult {
    deleted: boolean;
}
