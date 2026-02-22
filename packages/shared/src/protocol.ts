/**
 * VCoder ACP Protocol Types
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
    /** HTTP headers (for http/sse, e.g. auth tokens) */
    headers?: Record<string, string>;
}

export interface NewSessionParams {
    title?: string;
    /** Working directory for the session (V0.2) */
    cwd?: string;
    /** MCP servers to inject into agent (V0.2) */
    mcpServers?: McpServerConfig[];
}

export interface ResumeSessionParams {
    /** Existing Claude Code CLI session id to resume (e.g., from history transcripts) */
    claudeSessionId: string;
    /** Optional display title for the resumed session */
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

export interface ResumeSessionResult {
    /** Legacy format */
    session?: Session;
    /** New format */
    sessionId?: string;
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
    | 'error'
    | 'confirmation_request'
    | 'session_switch'
    | 'execution_summary';

export interface SessionSwitchUpdate {
    previousSessionId: string | null;
    newSessionId: string;
}

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
    | ErrorUpdate
    | ConfirmationRequestUpdate
    | SessionSwitchUpdate
    | ExecutionSummaryUpdate;
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
    /** Session ID (used when clearing pending changes) */
    sessionId?: string;
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


export type ErrorCode =
    | 'AGENT_CRASHED'
    | 'CONNECTION_LOST'
    | 'TOOL_TIMEOUT'
    | 'TOOL_FAILED'
    | 'PERMISSION_DENIED'
    | 'SESSION_CANCELLED'
    | 'RATE_LIMITED'
    | 'CONTEXT_TOO_LARGE'
    | 'INVALID_REQUEST'
    | 'UNKNOWN_ERROR'
    | 'CLI_ERROR'
    | 'AUTH_REQUIRED'
    | 'CLI_NOT_FOUND'
    | 'PREFLIGHT_FAILED'
    | 'PERSISTENT_SESSION_CLOSED';

export interface ErrorUpdate {
    code: ErrorCode;
    message: string;
    /** Technical details for debugging */
    details?: string;
    /** Whether the error is recoverable */
    recoverable?: boolean;
    /** Suggested action to recover */
    action?: {
        label: string;
        command: string;
    };
    /** Related tool call ID (if applicable) */
    toolCallId?: string;
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

export type SessionCompleteReason =
    | 'completed' // Normal completion
    | 'cancelled' // User cancelled
    | 'error' // Terminated due to error
    | 'timeout' // Timeout
    | 'max_turns_reached'; // Max conversation turns reached

export interface SessionCompleteParams {
    sessionId: string;
    /** Reason for completion */
    reason: SessionCompleteReason;
    /** Human-readable message */
    message?: string;
    /** Error details (if reason is 'error') */
    error?: ErrorUpdate;
    /** Token usage statistics */
    usage?: {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
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
    /** Full-text search in session title */
    query?: string;
    /** Filter sessions that used a specific tool name (e.g. 'Bash', 'Write') */
    toolName?: string;
    /** Filter sessions that touched a specific file path (substring match) */
    filePath?: string;
    /** Include sessions updated on or after this ISO timestamp */
    dateFrom?: string;
    /** Include sessions updated on or before this ISO timestamp */
    dateTo?: string;
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

export interface PermissionRule {
    id: string;
    toolName?: string;
    pattern?: string;
    action: 'allow' | 'deny';
    createdAt: string;
    updatedAt: string;
    expiresAt?: string;
    description?: string;
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
// Permission Rules Management (V0.6)
// =============================================================================

export interface PermissionRulesListParams {
    sessionId?: string;
    toolName?: string;
}

export interface PermissionRulesListResult {
    rules: PermissionRule[];
}

export interface PermissionRuleAddParams {
    sessionId: string;
    rule: Omit<PermissionRule, 'id' | 'createdAt' | 'updatedAt'>;
}

export interface PermissionRuleUpdateParams {
    sessionId: string;
    ruleId: string;
    updates: Partial<Omit<PermissionRule, 'id' | 'createdAt'>>;
}

export interface PermissionRuleDeleteParams {
    sessionId: string;
    ruleId: string;
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
    /** Absolute or relative file path */
    path: string;
    /** Content to write */
    content: string;
    /** Session ID for access control */
    sessionId?: string;
}

export interface LspGoToDefinitionParams {
    /** Absolute file path */
    filePath: string;
    /** Line number (1-indexed) */
    line: number;
    /** Column number (0-indexed) */
    character: number;
    /** Session ID for access control */
    sessionId?: string;
}

export interface LspGoToDefinitionResult {
    /** Definition location */
    uri?: string;
    /** Line number (1-indexed) */
    line?: number;
    /** Column number (0-indexed) */
    character?: number;
    /** Text range around definition */
    range?: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
}

export interface LspFindReferencesParams {
    /** Absolute file path */
    filePath: string;
    /** Line number (1-indexed) */
    line: number;
    /** Column number (0-indexed) */
    character: number;
    /** Session ID for access control */
    sessionId?: string;
}

export interface LspFindReferencesResult {
    /** Array of reference locations */
    references: Array<{
        uri: string;
        line: number;
        character: number;
        range?: {
            start: { line: number; character: number };
            end: { line: number; character: number };
        };
    }>;
}

export interface LspHoverParams {
    /** Absolute file path */
    filePath: string;
    /** Line number (1-indexed) */
    line: number;
    /** Column number (0-indexed) */
    character: number;
    /** Session ID for access control */
    sessionId?: string;
}

export interface LspHoverResult {
    /** Hover text/markdown content */
    content?: string;
    /** Documentation string */
    documentation?: string;
}

export interface LspDiagnosticsParams {
    /** Absolute file path (optional, if not provided, get workspace diagnostics) */
    filePath?: string;
    /** Session ID for access control */
    sessionId?: string;
}

export interface LspDiagnostic {
    /** Diagnostic severity */
    severity: 1 | 2 | 3 | 4; // Error, Warning, Info, Hint
    /** Diagnostic message */
    message: string;
    /** Source (e.g., 'TypeScript', 'ESLint') */
    source?: string;
    /** Code */
    code?: string | number;
    /** File location */
    uri: string;
    /** Start position */
    range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
}

export interface LspDiagnosticsResult {
    /** Array of diagnostics */
    diagnostics: LspDiagnostic[];
}

export interface FsWriteTextFileResult {
    /** Write success */
    success: boolean;
    /** Optional error message */
    error?: string;
}

// =============================================================================
// CLI Subcommand Forwarding (V0.7)
// =============================================================================

/**
 * Parameters for executing a CLI subcommand (e.g., `plugin list --json`).
 * Used to surface CLI ecosystem features (Skills, Plugins, Hooks) without reimplementation.
 */
export interface CliSubcommandParams {
    /** Subcommand to execute (e.g., 'plugin list --json') */
    subcommand: string;
    /** Additional arguments */
    args?: string[];
    /** Working directory */
    cwd?: string;
}

export interface CliSubcommandResult {
    /** Stdout output from the subcommand */
    stdout: string;
    /** Exit code of the subcommand */
    exitCode: number;
}

// =============================================================================
// Execution Summary (V0.7)
// =============================================================================

/**
 * Aggregated execution summary emitted at the end of each assistant turn.
 * Provides a quick overview of what happened during the turn.
 */
export interface ExecutionSummaryUpdate {
    /** Files modified during this turn */
    filesModified: string[];
    /** Files created during this turn */
    filesCreated: string[];
    /** Files deleted during this turn */
    filesDeleted: string[];
    /** Tools used with invocation counts */
    toolsUsed: Array<{ name: string; count: number }>;
    /** Number of errors encountered */
    errors: number;
    /** Token usage for this turn */
    usage?: { inputTokens: number; outputTokens: number };
    /** Duration of this turn in milliseconds */
    durationMs?: number;
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

// =============================================================================
// ACP Method Constants
// =============================================================================

export const ACPMethods = {
    // Core methods
    INITIALIZE: 'initialize',

    // Session management
    SESSION_NEW: 'session/new',
    SESSION_RESUME: 'session/resume',
    SESSION_UPDATE: 'session/update',
    SESSION_COMPLETE: 'session/complete',
    SESSION_LIST: 'session/list',
    SESSION_SWITCH: 'session/switch',
    SESSION_DELETE: 'session/delete',
    SESSION_CANCEL: 'session/cancel',
    // Interaction
    SESSION_PROMPT: 'session/prompt',
    SESSION_PROMPT_PERSISTENT: 'session/promptPersistent',
    SESSION_MODE_STATUS: 'session/modeStatus',
    SESSION_STOP_PERSISTENT: 'session/stopPersistent',
    SETTINGS_CHANGE: 'settings/change',

    // File operations
    FILE_ACCEPT: 'file/accept',
    FILE_REJECT: 'file/reject',

    // Tool operations
    TOOL_CONFIRM: 'tool/confirm',

    // History operations
    HISTORY_LIST: 'history/list',
    HISTORY_LOAD: 'history/load',
    HISTORY_DELETE: 'history/delete',

    // Permission management
    PERMISSION_RULES_LIST: 'permissionRules/list',
    PERMISSION_RULE_ADD: 'permissionRule/add',
    PERMISSION_RULE_UPDATE: 'permissionRule/update',
    PERMISSION_RULE_DELETE: 'permissionRule/delete',

    // File system operations
    FS_READ_TEXT_FILE: 'fs/readTextFile',
    FS_WRITE_TEXT_FILE: 'fs/writeTextFile',

    // Terminal operations
    TERMINAL_CREATE: 'terminal/create',
    TERMINAL_OUTPUT: 'terminal/output',
    TERMINAL_WAIT_FOR_EXIT: 'terminal/waitForExit',
    TERMINAL_KILL: 'terminal/kill',
    TERMINAL_RELEASE: 'terminal/release',

    // LSP operations
    LSP_GO_TO_DEFINITION: 'lsp/goToDefinition',
    LSP_FIND_REFERENCES: 'lsp/findReferences',
    LSP_HOVER: 'lsp/hover',
    LSP_GET_DIAGNOSTICS: 'lsp/getDiagnostics',

    // CLI subcommand forwarding (V0.7)
    CLI_SUBCOMMAND: 'cli/subcommand',
} as const;

export type ACPMethod = typeof ACPMethods[keyof typeof ACPMethods];
