import type { SliceCreator, UiSlice, ChatMessage } from './types';
import { createSessionState, DEFAULT_MAX_THINKING_TOKENS } from './helpers';
import { postMessage } from '../../bridge';

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
            const switchingFromPlan = mode !== 'plan' && state.permissionMode === 'plan';
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

            // 仅在有消息历史时注入系统事件行，避免空会话出现无意义分隔
            let messages = sessionState.messages;
            if ((switchingToPlan || switchingFromPlan) && messages.length > 0) {
                const eventType = switchingToPlan ? 'plan_mode_enter' : 'plan_mode_exit';
                const sysMsg: ChatMessage = {
                    id: `sys-plan-${Date.now()}`,
                    role: 'system',
                    content: '',
                    isComplete: true,
                    systemEvent: { type: eventType },
                };
                messages = [...messages, sysMsg];
            }

            newSessionStates.set(currentSessionId, {
                ...sessionState,
                messages,
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
                // 同步 legacy messages 字段（当前 session 有修改时更新）
                messages: messages,
                sessionStates: newSessionStates,
            };
        });
        postMessage({ type: 'setPermissionMode', mode });
    },

    setPermissionModeFromSystem: (mode) => {
        set((state) => {
            const fromMode = state.permissionMode;
            if (fromMode === mode) return {};

            const switchingToPlan = mode === 'plan' && fromMode !== 'plan';
            const switchingFromPlan = mode !== 'plan' && fromMode === 'plan';
            const currentSessionId = state.currentSessionId;

            if (!currentSessionId) {
                return {
                    permissionMode: mode,
                    planMode: mode === 'plan',
                    tasks: switchingToPlan ? [] : state.tasks,
                    subagentRuns: switchingToPlan ? [] : state.subagentRuns,
                    pendingFileChanges: switchingToPlan ? [] : state.pendingFileChanges,
                    systemModeChange: { fromMode, toMode: mode, id: Date.now() },
                };
            }

            const newSessionStates = new Map(state.sessionStates);
            const sessionState = newSessionStates.get(currentSessionId) ?? createSessionState(currentSessionId);

            let messages = sessionState.messages;
            if ((switchingToPlan || switchingFromPlan) && messages.length > 0) {
                const eventType = switchingToPlan ? 'plan_mode_enter' : 'plan_mode_exit';
                const sysMsg: ChatMessage = {
                    id: `sys-plan-${Date.now()}`,
                    role: 'system',
                    content: '',
                    isComplete: true,
                    systemEvent: { type: eventType },
                };
                messages = [...messages, sysMsg];
            }

            newSessionStates.set(currentSessionId, {
                ...sessionState,
                messages,
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
                messages,
                sessionStates: newSessionStates,
                systemModeChange: { fromMode, toMode: mode, id: Date.now() },
            };
        });
        // 不回传 postMessage，避免循环
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

    setExperimentalAgentTeams: (enabled) => {
        set({ experimentalAgentTeams: enabled });
    },

    setMcSelectedRunId: (id) => {
        set({ mcSelectedRunId: id });
    },
});
