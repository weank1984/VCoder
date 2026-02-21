import type { SliceCreator, SessionsSlice, AppState, SessionState } from './types';
import { createSessionState, flushTextBuffer, cleanupTextBuffer } from './helpers';

export const createSessionsSlice: SliceCreator<SessionsSlice> = (set, get) => ({
    setSessions: (sessions) =>
        set((state) => ({
            sessions,
            currentSessionId: state.currentSessionId ?? sessions[0]?.id ?? null,
            pendingFileChanges: state.currentSessionId ? state.pendingFileChanges : [],
        })),

    setCurrentSession: (sessionId) => {
        set((prevState) => {
            if (prevState.currentSessionId && prevState.currentSessionId !== sessionId) {
                flushTextBuffer({ appendToLastMessage: prevState.appendToLastMessage }, prevState.currentSessionId);
                cleanupTextBuffer(prevState.currentSessionId);
            }

            const newSessionStates = new Map(prevState.sessionStates);

            let sessionState = sessionId ? newSessionStates.get(sessionId) : undefined;
            if (!sessionState && sessionId) {
                sessionState = createSessionState(sessionId);
                newSessionStates.set(sessionId, sessionState);
            }

            // When switching from no-session to a new empty session while there are
            // in-flight messages (e.g. user msg + placeholder added before session was
            // created), migrate them so they're not lost.
            const switchingFromNoSession = !prevState.currentSessionId && sessionId;
            if (switchingFromNoSession && sessionState && sessionState.messages.length === 0 && prevState.messages.length > 0) {
                sessionState = { ...sessionState, messages: prevState.messages, updatedAt: Date.now() };
                newSessionStates.set(sessionId!, sessionState);
            }

            const currentSessionData = sessionState || {
                messages: [],
                tasks: [],
                subagentRuns: [],
                pendingFileChanges: [],
                sessionStatus: 'idle' as const,
                lastActivityTime: Date.now(),
            };

            return {
                currentSessionId: sessionId,
                sessionStates: newSessionStates,
                viewMode: 'live',
                messages: currentSessionData.messages,
                tasks: currentSessionData.tasks,
                subagentRuns: currentSessionData.subagentRuns,
                sessionStatus: currentSessionData.sessionStatus,
                sessionCompleteReason: sessionState?.sessionCompleteReason,
                sessionCompleteMessage: sessionState?.sessionCompleteMessage,
                pendingFileChanges: currentSessionData.pendingFileChanges,
                error: null,
                // Preserve isLoading — don't reset it when a session is created mid-flight
            };
        });
    },

    setTasks: (tasks, sessionId) => {
        const state = get();
        const targetSessionId = sessionId ?? state.currentSessionId;
        if (!targetSessionId) {
            set((prevState) => ({ tasks: [...tasks], sessionStatus: prevState.sessionStatus }));
            return;
        }

        set((prevState) => {
            const newSessionStates = new Map(prevState.sessionStates);
            const sessionState = newSessionStates.get(targetSessionId) ?? createSessionState(targetSessionId);
            const nextSessionState = { ...sessionState, tasks, updatedAt: Date.now() };
            newSessionStates.set(targetSessionId, nextSessionState);

            return {
                sessionStates: newSessionStates,
                tasks: targetSessionId === prevState.currentSessionId ? nextSessionState.tasks : prevState.tasks,
            };
        });
    },

    setSubagentRuns: (subagentRuns, sessionId) =>
        set((state) => {
            const targetSessionId = sessionId ?? state.currentSessionId;
            if (!targetSessionId) {
                return { subagentRuns: [...subagentRuns] };
            }

            const newSessionStates = new Map(state.sessionStates);
            const sessionState = newSessionStates.get(targetSessionId) ?? createSessionState(targetSessionId);
            newSessionStates.set(targetSessionId, { ...sessionState, subagentRuns, updatedAt: Date.now() });

            return {
                sessionStates: newSessionStates,
                subagentRuns: targetSessionId === state.currentSessionId ? subagentRuns : state.subagentRuns,
            };
        }),

    clearPendingFileChanges: () =>
        set((state) => {
            const currentSessionId = state.currentSessionId;
            if (!currentSessionId) {
                return { pendingFileChanges: [] };
            }

            const newSessionStates = new Map(state.sessionStates);
            const sessionState = newSessionStates.get(currentSessionId) ?? createSessionState(currentSessionId);
            newSessionStates.set(currentSessionId, {
                ...sessionState,
                pendingFileChanges: [],
                updatedAt: Date.now(),
            });

            return { pendingFileChanges: [], sessionStates: newSessionStates };
        }),

    setSessionStatus: (sessionStatus, sessionId) =>
        set((state) => {
            const targetSessionId = sessionId ?? state.currentSessionId;
            if (!targetSessionId) return {};

            const newSessionStates = new Map(state.sessionStates);
            const sessionState = newSessionStates.get(targetSessionId) ?? createSessionState(targetSessionId);
            newSessionStates.set(targetSessionId, { ...sessionState, sessionStatus, updatedAt: Date.now() });

            return {
                sessionStates: newSessionStates,
                sessionStatus: targetSessionId === state.currentSessionId ? sessionStatus : state.sessionStatus,
            };
        }),

    handleSessionComplete: (reason, message, error, sessionId) => {
        const state = get();
        const targetSessionId = sessionId ?? state.currentSessionId;
        if (!targetSessionId) return;

        let status: 'completed' | 'cancelled' | 'timeout' | 'error';
        switch (reason) {
            case 'completed': status = 'completed'; break;
            case 'cancelled': status = 'cancelled'; break;
            case 'timeout': status = 'timeout'; break;
            default: status = 'error'; break;
        }

        set((prevState) => {
            const newSessionStates = new Map(prevState.sessionStates);
            const sessionState = newSessionStates.get(targetSessionId) ?? createSessionState(targetSessionId);
            newSessionStates.set(targetSessionId, {
                ...sessionState,
                sessionStatus: status,
                sessionCompleteReason: reason,
                sessionCompleteMessage: message,
                updatedAt: Date.now(),
            });

            return {
                sessionStates: newSessionStates,
                sessionStatus: targetSessionId === prevState.currentSessionId ? status : prevState.sessionStatus,
                sessionCompleteReason: targetSessionId === prevState.currentSessionId ? reason : prevState.sessionCompleteReason,
                sessionCompleteMessage: targetSessionId === prevState.currentSessionId ? message : prevState.sessionCompleteMessage,
                isLoading: targetSessionId === prevState.currentSessionId ? false : prevState.isLoading,
            };
        });

        flushTextBuffer(get(), targetSessionId);

        set((state) => {
            const newSessionStates = new Map(state.sessionStates);
            const sessionState = newSessionStates.get(targetSessionId);
            if (!sessionState) return {};

            const messages = [...sessionState.messages];
            if (messages.length > 0) {
                const lastIndex = messages.length - 1;
                const last = messages[lastIndex];
                if (last.role === 'assistant' && !last.isComplete) {
                    messages[lastIndex] = { ...last, isComplete: true };
                }
            }

            newSessionStates.set(targetSessionId, { ...sessionState, messages, updatedAt: Date.now() });
            return {
                sessionStates: newSessionStates,
                messages: targetSessionId === state.currentSessionId ? messages : state.messages,
            };
        });

        if (error && targetSessionId === state.currentSessionId) {
            get().setError(error);
        }
    },

    updateActivity: (sessionId) =>
        set((state) => {
            const targetSessionId = sessionId ?? state.currentSessionId;
            if (!targetSessionId) return {};

            const now = Date.now();
            const newSessionStates = new Map(state.sessionStates);
            const sessionState = newSessionStates.get(targetSessionId) ?? createSessionState(targetSessionId);
            newSessionStates.set(targetSessionId, {
                ...sessionState,
                lastActivityTime: now,
                sessionStatus: 'active',
                updatedAt: now,
            });

            return {
                sessionStates: newSessionStates,
                lastActivityTime: targetSessionId === state.currentSessionId ? now : state.lastActivityTime,
                sessionStatus: targetSessionId === state.currentSessionId ? 'active' : state.sessionStatus,
            };
        }),

    getCurrentSessionState: (): SessionState | null => {
        const state = get();
        const { currentSessionId } = state;
        if (!currentSessionId) return null;
        return state.sessionStates.get(currentSessionId) || null;
    },

    getOrCreateSessionState: (sessionId: string): SessionState => {
        const state = get();
        let sessionState = state.sessionStates.get(sessionId);
        if (!sessionState) {
            sessionState = createSessionState(sessionId);
            set((prevState: AppState) => {
                const newSessionStates = new Map(prevState.sessionStates);
                newSessionStates.set(sessionId, sessionState!);
                return { sessionStates: newSessionStates };
            });
        }
        return sessionState;
    },

    updateCurrentSessionState: (updates: Partial<SessionState>): void => {
        const state = get();
        const { currentSessionId } = state;
        if (!currentSessionId) return;

        set((prevState: AppState) => {
            const newSessionStates = new Map(prevState.sessionStates);
            const currentSessionState = newSessionStates.get(currentSessionId) ?? createSessionState(currentSessionId);
            newSessionStates.set(currentSessionId, { ...currentSessionState, ...updates });
            return { sessionStates: newSessionStates };
        });
    },
});
