import { create } from './createStore';
import type { AppState, UiLanguage } from '../types';
import type { ModelId, PermissionMode } from '@vcoder/shared';
import { loadPersistedState, savePersistedState } from '../utils/persist';
import type { AppStore } from './slices';
import {
    createMessagesSlice,
    createSessionsSlice,
    createUiSlice,
    createHistorySlice,
    createAgentSlice,
    createPermissionRulesSlice,
    createUpdateSlice,
    flushTextBuffer as _flushTextBuffer,
    cleanupTextBuffer as _cleanupTextBuffer,
    cleanupAllTextBuffers as _cleanupAllTextBuffers,
} from './slices';

export { _flushTextBuffer as flushTextBuffer, _cleanupTextBuffer as cleanupTextBuffer, _cleanupAllTextBuffers as cleanupAllTextBuffers };

const persisted = loadPersistedState();

function isUiLanguage(value: unknown): value is UiLanguage {
    return value === 'auto' || value === 'en-US' || value === 'zh-CN';
}

function isBoolean(value: unknown): value is boolean {
    return value === true || value === false;
}

function isPermissionMode(value: unknown): value is PermissionMode {
    return value === 'default' || value === 'plan' || value === 'acceptEdits' || value === 'bypassPermissions';
}

function isModelId(value: unknown): value is ModelId {
    return (
        value === 'claude-haiku-4-5-20251001' ||
        value === 'claude-sonnet-4-5-20250929' ||
        value === 'glm-4.6'
    );
}

function getInitialUiLanguage(): UiLanguage {
    if (isUiLanguage(persisted.uiLanguage)) return persisted.uiLanguage;
    const fromWindow = (globalThis as unknown as { __vcoderUiLanguage?: unknown }).__vcoderUiLanguage;
    if (isUiLanguage(fromWindow)) return fromWindow;
    return 'auto';
}

const initialState: AppState = {
    sessions: [],
    currentSessionId: null,
    sessionStates: new Map(),
    messages: [],
    tasks: [],
    subagentRuns: [],
    pendingFileChanges: [],
    planMode: false,
    permissionMode: 'default',
    thinkingEnabled: false,
    model: 'claude-haiku-4-5-20251001',
    isLoading: false,
    error: null,
    workspaceFiles: [],
    uiLanguage: 'auto',
    sessionStatus: 'idle',
    sessionCompleteReason: undefined,
    sessionCompleteMessage: undefined,
    lastActivityTime: Date.now(),
    historySessions: [],
    viewMode: 'live',
    permissionRules: [],
    promptMode: 'persistent',
    modeStatus: null,
    agents: [],
    currentAgentId: null,
    experimentalAgentTeams: false,
};

const restoredState: AppState = {
    ...initialState,
    model: isModelId(persisted.model) ? persisted.model : initialState.model,
    planMode: isBoolean(persisted.planMode) ? persisted.planMode : initialState.planMode,
    permissionMode: isPermissionMode(persisted.permissionMode) ? persisted.permissionMode : initialState.permissionMode,
    thinkingEnabled: isBoolean(persisted.thinkingEnabled) ? persisted.thinkingEnabled : initialState.thinkingEnabled,
    currentSessionId: persisted.currentSessionId ?? initialState.currentSessionId,
    uiLanguage: getInitialUiLanguage(),
    experimentalAgentTeams: isBoolean(persisted.experimentalAgentTeams) ? persisted.experimentalAgentTeams : false,
};

export const useStore = create<AppStore>((set, get) => ({
    ...restoredState,
    ...createMessagesSlice(set, get),
    ...createSessionsSlice(set, get),
    ...createUiSlice(set, get),
    ...createHistorySlice(set, get),
    ...createAgentSlice(set, get),
    ...createPermissionRulesSlice(set, get),
    ...createUpdateSlice(set, get),
}));

let prevPersistedFields = {
    model: restoredState.model,
    planMode: restoredState.planMode,
    permissionMode: restoredState.permissionMode,
    thinkingEnabled: restoredState.thinkingEnabled,
    currentSessionId: restoredState.currentSessionId,
    uiLanguage: restoredState.uiLanguage,
    experimentalAgentTeams: restoredState.experimentalAgentTeams,
};

useStore.subscribe(() => {
    const state = useStore.getState();
    if (
        state.model !== prevPersistedFields.model ||
        state.planMode !== prevPersistedFields.planMode ||
        state.permissionMode !== prevPersistedFields.permissionMode ||
        state.thinkingEnabled !== prevPersistedFields.thinkingEnabled ||
        state.currentSessionId !== prevPersistedFields.currentSessionId ||
        state.uiLanguage !== prevPersistedFields.uiLanguage ||
        state.experimentalAgentTeams !== prevPersistedFields.experimentalAgentTeams
    ) {
        prevPersistedFields = {
            model: state.model,
            planMode: state.planMode,
            permissionMode: state.permissionMode,
            thinkingEnabled: state.thinkingEnabled,
            currentSessionId: state.currentSessionId,
            uiLanguage: state.uiLanguage,
            experimentalAgentTeams: state.experimentalAgentTeams,
        };
        savePersistedState(prevPersistedFields);
    }
});
