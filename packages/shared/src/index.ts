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

    // Server -> Client (Notifications)
    SESSION_UPDATE: 'session/update',
    SESSION_COMPLETE: 'session/complete',
} as const;

export type ACPMethod = typeof ACPMethods[keyof typeof ACPMethods];
