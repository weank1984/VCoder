/**
 * V-Coder Shared Types
 */

export * from './protocol';

// =============================================================================
// ACP Method Names
// =============================================================================

export const ACPMethods = {
    // Client -> Server
    INITIALIZE: 'initialize',
    SESSION_NEW: 'session/new',
    SESSION_LIST: 'session/list',
    SESSION_SWITCH: 'session/switch',
    SESSION_DELETE: 'session/delete',
    SESSION_PROMPT: 'session/prompt',
    SETTINGS_CHANGE: 'settings/change',
    FILE_ACCEPT: 'file/accept',
    FILE_REJECT: 'file/reject',
    BASH_CONFIRM: 'bash/confirm',
    BASH_SKIP: 'bash/skip',
    PLAN_CONFIRM: 'plan/confirm',
    SESSION_CANCEL: 'session/cancel',
    // History API (read Claude Code CLI transcripts)
    HISTORY_LIST: 'history/list',
    HISTORY_LOAD: 'history/load',
    HISTORY_DELETE: 'history/delete',
    // Persistent Session Mode (Bidirectional Streaming)
    SESSION_PROMPT_PERSISTENT: 'session/promptPersistent',
    SESSION_MODE_STATUS: 'session/modeStatus',
    SESSION_STOP_PERSISTENT: 'session/stopPersistent',
    // Tool confirmation (unified)
    TOOL_CONFIRM: 'tool/confirm',

    // Server -> Client (Notifications)
    SESSION_UPDATE: 'session/update',
    SESSION_COMPLETE: 'session/complete',

    // Agent -> Client (Requests - bidirectional)
    SESSION_REQUEST_PERMISSION: 'session/request_permission',
} as const;


export type ACPMethod = typeof ACPMethods[keyof typeof ACPMethods];
