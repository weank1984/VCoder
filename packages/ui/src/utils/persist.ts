/**
 * State Persistence Utilities
 * Persists selected UI state to VSCode webview state
 */

import { getState, setState } from '../bridge';

import type { PermissionMode } from '@vcoder/shared';

// Keys to persist
export type PersistedState = {
    model?: string;
    planMode?: boolean;
    permissionMode?: PermissionMode;
    thinkingEnabled?: boolean;
    currentSessionId?: string | null;
    uiLanguage?: string;
    inputDraft?: string;
    experimentalAgentTeams?: boolean;
    sidebarCollapsed?: boolean;
};

const PERSIST_KEY = 'vcoder-ui-state';

/**
 * Load persisted state from VSCode
 */
export function loadPersistedState(): PersistedState {
    try {
        const stored = getState<{ [PERSIST_KEY]: PersistedState }>();
        return stored?.[PERSIST_KEY] ?? {};
    } catch {
        return {};
    }
}

/**
 * Save state to VSCode
 */
export function savePersistedState(state: PersistedState): void {
    try {
        const current = getState<Record<string, unknown>>() ?? {};
        const existing = (current[PERSIST_KEY] as PersistedState) ?? {};
        setState({
            ...current,
            [PERSIST_KEY]: {
                ...existing,
                ...state,
            },
        });
    } catch (err) {
        console.warn('[VCoder] Failed to persist state:', err);
    }
}

/**
 * Clear persisted state
 */
export function clearPersistedState(): void {
    try {
        const current = getState<Record<string, unknown>>() ?? {};
        delete current[PERSIST_KEY];
        setState(current);
    } catch {
        // Ignore errors
    }
}
