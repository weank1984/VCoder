import type { SliceCreator, UiSlice } from './types';
import { createSessionState, DEFAULT_MAX_THINKING_TOKENS } from './helpers';
import { postMessage } from '../../utils/vscode';

export const createUiSlice: SliceCreator<UiSlice> = (set, _get) => ({
    setPlanMode: (enabled) => {
        set((state) => {
            const shouldClear = enabled && !state.planMode;
            const currentSessionId = state.currentSessionId;
            if (!currentSessionId) {
                return {
                    planMode: enabled,
                    tasks: shouldClear ? [] : state.tasks,
                    subagentRuns: shouldClear ? [] : state.subagentRuns,
                };
            }

            const newSessionStates = new Map(state.sessionStates);
            const sessionState = newSessionStates.get(currentSessionId) ?? createSessionState(currentSessionId);
            newSessionStates.set(currentSessionId, {
                ...sessionState,
                tasks: shouldClear ? [] : sessionState.tasks,
                subagentRuns: shouldClear ? [] : sessionState.subagentRuns,
                updatedAt: Date.now(),
            });

            return {
                planMode: enabled,
                tasks: shouldClear ? [] : state.tasks,
                subagentRuns: shouldClear ? [] : state.subagentRuns,
                sessionStates: newSessionStates,
            };
        });
        postMessage({ type: 'setPlanMode', enabled });
    },

    setPermissionMode: (mode) => {
        set((state) => {
            const switchingToPlan = mode === 'plan' && state.permissionMode !== 'plan';
            const currentSessionId = state.currentSessionId;

            if (!currentSessionId) {
                return {
                    permissionMode: mode,
                    planMode: mode === 'plan',
                    tasks: switchingToPlan ? [] : state.tasks,
                    subagentRuns: switchingToPlan ? [] : state.subagentRuns,
                    pendingFileChanges: switchingToPlan ? [] : state.pendingFileChanges,
                };
            }

            const newSessionStates = new Map(state.sessionStates);
            const sessionState = newSessionStates.get(currentSessionId) ?? createSessionState(currentSessionId);
            newSessionStates.set(currentSessionId, {
                ...sessionState,
                tasks: switchingToPlan ? [] : sessionState.tasks,
                subagentRuns: switchingToPlan ? [] : sessionState.subagentRuns,
                pendingFileChanges: switchingToPlan ? [] : sessionState.pendingFileChanges,
                updatedAt: Date.now(),
            });

            return {
                permissionMode: mode,
                planMode: mode === 'plan',
                tasks: switchingToPlan ? [] : state.tasks,
                subagentRuns: switchingToPlan ? [] : state.subagentRuns,
                pendingFileChanges: switchingToPlan ? [] : state.pendingFileChanges,
                sessionStates: newSessionStates,
            };
        });
        postMessage({ type: 'setPermissionMode', mode });
    },

    setThinkingEnabled: (enabled) => {
        set({ thinkingEnabled: enabled });
        postMessage({
            type: 'setThinking',
            enabled,
            maxThinkingTokens: enabled ? DEFAULT_MAX_THINKING_TOKENS : 0,
        });
    },

    setModel: (model) => {
        set({ model });
        postMessage({ type: 'setModel', model });
    },

    setLoading: (isLoading) => set({ isLoading }),

    setError: (error) => set({ error }),

    setWorkspaceFiles: (files) => set({ workspaceFiles: files }),

    setUiLanguage: (uiLanguage, source = 'user') => {
        set({ uiLanguage });
        if (source === 'user') {
            postMessage({ type: 'setUiLanguage', uiLanguage });
        }
    },

    setPromptMode: (mode) => {
        set({ promptMode: mode });
        postMessage({ type: 'setPromptMode', mode });
    },
});
