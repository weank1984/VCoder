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

/**
 * Client capabilities for ACP capability negotiation.
 * When enabled, agent will disable built-in tools and use mcp__acp__* proxy tools.
 */
export interface ClientCapabilities {
    /** File system capabilities */
    fs?: {
        /** Client can handle fs/readTextFile requests */
        readTextFile?: boolean;
        /** Client can handle fs/writeTextFile requests (with diff review) */
        writeTextFile?: boolean;
    };
    /** Client can handle terminal/* requests (create/output/kill/etc.) */
    terminal?: boolean;
    /** Editor capabilities (optional extensions) */
    editor?: {
        /** Client can handle editor/openFile requests */
        openFile?: boolean;
        /** Client can handle editor/getSelection requests */
        getSelection?: boolean;
    };
}

export interface InitializeParams {
    /** Protocol version (1 for V0.2) */
    protocolVersion: number;
    clientInfo: {
        name: string;
        version: string;
    };
    /** Client capabilities for capability negotiation (V0.2) */
    clientCapabilities?: ClientCapabilities;
    /** Legacy UI capabilities (V0.1) */
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

/**
 * MCP Server configuration for agent injection.
 */
export interface McpServerConfig {
    /** Server type: stdio, http, or sse */
    type: 'stdio' | 'http' | 'sse';
    /** Server URL (for http/sse) */
    url?: string;
    /** Command to start server (for stdio) */
    command?: string;
    /** Arguments for command (for stdio) */
    args?: string[];
    /** Environment variables (for stdio) */
    env?: Record<string, string>;
    /** Server name/identifier */
    name?: string;
}

export interface NewSessionParams {
    title?: string;
    /** Working directory for the session (V0.2) */
    cwd?: string;
    /** MCP servers to inject into agent (V0.2) */
    mcpServers?: McpServerConfig[];
}

export interface NewSessionResult {
    /** Legacy format */
    session?: Session;
    /** New format from Claude Code CLI */
    sessionId?: string;
    /** Available models */
    models?: {
        availableModels?: Array<{
            modelId: string;
            name: string;
            description?: string;
        }>;
    };
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
    | 'claude-haiku-4-5-20251001'
    | 'claude-sonnet-4-5-20250929'
    | 'glm-4.6';

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

/**
 * Parameters for confirming/rejecting a tool that requires user approval.
 */
export interface ConfirmToolParams {
    sessionId: string;
    toolCallId: string;
    confirmed: boolean;
    options?: {
        /** Trust this type of tool always */
        trustAlways?: boolean;
        /** User-edited content (for file modifications) */
        editedContent?: string;
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
 * Ordered content blocks for history replay.
 * Preserves the original block order (text/thinking/tool_use) from the transcript.
 */
export type HistoryContentBlock =
    | { type: 'text'; content: string }
    | { type: 'thought'; content: string; isComplete: boolean }
    | { type: 'tools'; toolCallIds: string[] };

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
    /** Ordered blocks for consistent UI replay */
    contentBlocks?: HistoryContentBlock[];
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

// =============================================================================
// V0.2: Structured Permission Protocol
// =============================================================================

/**
 * Permission request from agent to client (bidirectional JSON-RPC).
 * Replaces TTY-based y/n prompts for headless mode compatibility.
 */
export interface RequestPermissionParams {
    sessionId: string;
    /** Unique ID for this tool call */
    toolCallId: string;
    /** Tool name requesting permission */
    toolName: string;
    /** Tool input (for display/risk assessment) */
    toolInput: Record<string, unknown>;
    /** Optional metadata for UI */
    metadata?: {
        /** Risk level assessment */
        riskLevel?: 'low' | 'medium' | 'high';
        /** Human-readable summary */
        summary?: string;
        /** Command to execute (for terminal tools) */
        command?: string;
        /** File path (for file tools) */
        filePath?: string;
    };
}

export interface RequestPermissionResult {
    /** Permission outcome */
    outcome: 'allow' | 'deny';
    /** Optional reason for denial */
    reason?: string;
    /** Updated permission rules (if "Always allow" selected) */
    updatedRules?: {
        /** Tools/patterns to always allow */
        allowAlways?: string[];
    };
}

// =============================================================================
// V0.2: ACP Terminal Capabilities (node-pty based)
// =============================================================================

export interface TerminalCreateParams {
    /** Command to execute */
    command: string;
    /** Command arguments */
    args?: string[];
    /** Working directory */
    cwd?: string;
    /** Environment variables */
    env?: Record<string, string>;
}

export interface TerminalCreateResult {
    /** Unique terminal ID */
    terminalId: string;
}

export interface TerminalOutputParams {
    terminalId: string;
    /** Maximum bytes to return (for truncation) */
    outputByteLimit?: number;
}

export interface TerminalOutputResult {
    /** Incremental output since last call */
    output: string;
    /** Exit code if process completed */
    exitCode?: number;
    /** Signal if process was killed */
    signal?: string;
    /** Whether output was truncated */
    truncated?: boolean;
}

export interface TerminalWaitForExitParams {
    terminalId: string;
}

export interface TerminalWaitForExitResult {
    exitCode: number;
    signal?: string;
}

export interface TerminalKillParams {
    terminalId: string;
    /** Signal to send (default: SIGTERM) */
    signal?: string;
}

export interface TerminalReleaseParams {
    terminalId: string;
}

// =============================================================================
// V0.2: ACP File System Capabilities
// =============================================================================

export interface FsReadTextFileParams {
    /** Session ID for permission tracking */
    sessionId: string;
    /** File path (workspace-relative or absolute) */
    path: string;
    /** Optional: start line (1-indexed) */
    line?: number;
    /** Optional: max lines to read */
    limit?: number;
}

export interface FsReadTextFileResult {
    /** File content (full or sliced) */
    content: string;
    /** Whether content was truncated */
    truncated?: boolean;
}

export interface FsWriteTextFileParams {
    /** Session ID for permission tracking */
    sessionId: string;
    /** File path (workspace-relative or absolute) */
    path: string;
    /** New file content */
    content: string;
}

export interface FsWriteTextFileResult {
    /** Write success */
    success: boolean;
    /** Optional error message */
    error?: string;
}

// =============================================================================
// V0.2: Agent Profile Configuration
// =============================================================================

/**
 * Agent profile for multi-agent support.
 */
export interface AgentProfile {
    /** Unique profile ID */
    id: string;
    /** Display name */
    name: string;
    /** Command to start agent */
    command: string;
    /** Command arguments */
    args?: string[];
    /** Environment variables */
    env?: Record<string, string>;
}
