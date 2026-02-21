import type { SliceCreator, UpdateSlice, ToolCall, Task, FileChangeUpdate, SubagentRunUpdate, ErrorUpdate } from './types';
import { createSessionState, queueTextUpdate, cleanupAllTextBuffers } from './helpers';
import type { AppState } from './types';

export const createUpdateSlice: SliceCreator<UpdateSlice> = (set, get) => ({
    handleUpdate: (update) => {
        const { type, content, sessionId } = update;
        const state = get();
        const targetSessionId = sessionId ?? state.currentSessionId;
        if (!targetSessionId) return;

        let currentSessionId = state.currentSessionId;
        if (!currentSessionId && sessionId) {
            set((prevState) => {
                const newSessionStates = new Map(prevState.sessionStates);
                if (!newSessionStates.has(sessionId)) {
                    const migratedSession = createSessionState(sessionId);
                    migratedSession.messages = prevState.messages;
                    migratedSession.tasks = prevState.tasks;
                    migratedSession.subagentRuns = prevState.subagentRuns;
                    migratedSession.pendingFileChanges = prevState.pendingFileChanges;
                    migratedSession.sessionStatus = prevState.sessionStatus;
                    migratedSession.sessionCompleteReason = prevState.sessionCompleteReason;
                    migratedSession.sessionCompleteMessage = prevState.sessionCompleteMessage;
                    migratedSession.lastActivityTime = prevState.lastActivityTime;
                    migratedSession.updatedAt = Date.now();
                    newSessionStates.set(sessionId, migratedSession);
                }

                return {
                    currentSessionId: sessionId,
                    viewMode: 'live',
                    sessionStates: newSessionStates,
                };
            });
            currentSessionId = sessionId;
        }

        currentSessionId = currentSessionId ?? targetSessionId;

        get().updateActivity(targetSessionId);

        switch (type) {
            case 'thought': {
                const { content: text, isComplete } = content as { content: string; isComplete: boolean };
                get().setThought(text, isComplete, targetSessionId);
                break;
            }
            case 'text': {
                const { text } = content as { text: string };
                queueTextUpdate(text, get(), targetSessionId);
                break;
            }
            case 'tool_use': {
                const tc = content as ToolCall;
                get().addToolCall({
                    id: tc.id,
                    name: tc.name,
                    status: tc.status,
                    input: (tc as unknown as { input?: unknown }).input,
                }, targetSessionId);
                break;
            }
            case 'tool_result': {
                const { id, result, error } = content as { id: string; result?: unknown; error?: string };
                get().updateToolCall(id, {
                    status: error ? 'failed' : 'completed',
                    result,
                    error,
                }, targetSessionId);
                break;
            }
            case 'mcp_call': {
                const mcp = content as {
                    id: string;
                    server: string;
                    tool: string;
                    input: Record<string, unknown>;
                    status: ToolCall['status'];
                    result?: unknown;
                    error?: string;
                };
                get().addToolCall({
                    id: mcp.id,
                    name: `mcp__${mcp.server}__${mcp.tool}`,
                    status: mcp.status,
                    input: mcp.input,
                    result: mcp.result,
                    error: mcp.error,
                }, targetSessionId);
                break;
            }
            case 'bash_request': {
                const bash = content as { id: string; command: string };
                get().addToolCall({
                    id: bash.id,
                    name: 'Bash',
                    status: 'pending',
                    input: { command: bash.command, CommandLine: bash.command },
                }, targetSessionId);
                break;
            }
            case 'task_list': {
                const { tasks } = content as { tasks: Task[] };
                get().setTasks(tasks, targetSessionId);
                break;
            }
            case 'file_change': {
                const change = content as FileChangeUpdate & { conflict?: boolean };
                set((state) => {
                    const newSessionStates = new Map(state.sessionStates);
                    const sessionState = newSessionStates.get(targetSessionId) ?? createSessionState(targetSessionId);
                    const existing = sessionState.pendingFileChanges.filter((c) => c.path !== change.path);
                    if (change.proposed) {
                        existing.push({ ...change, sessionId: targetSessionId, receivedAt: Date.now(), conflict: change.conflict });
                    }
                    const nextSessionState = {
                        ...sessionState,
                        pendingFileChanges: [...existing],
                        updatedAt: Date.now(),
                    };
                    newSessionStates.set(targetSessionId, nextSessionState);

                    return {
                        sessionStates: newSessionStates,
                        pendingFileChanges: targetSessionId === state.currentSessionId ? [...existing] : state.pendingFileChanges,
                    };
                });
                break;
            }
            case 'subagent_run': {
                const run = content as SubagentRunUpdate;
                set((prevState) => {
                    const newSessionStates = new Map(prevState.sessionStates);
                    const sessionState = newSessionStates.get(targetSessionId) ?? createSessionState(targetSessionId);
                    const subagentRuns = [...sessionState.subagentRuns];
                    const idx = subagentRuns.findIndex((r) => r.id === run.id);
                    if (idx >= 0) {
                        subagentRuns[idx] = { ...subagentRuns[idx], ...run };
                    } else {
                        subagentRuns.push(run);
                    }
                    newSessionStates.set(targetSessionId, {
                        ...sessionState,
                        subagentRuns: [...subagentRuns],
                        updatedAt: Date.now(),
                    });

                    return {
                        subagentRuns: targetSessionId === currentSessionId ? subagentRuns : prevState.subagentRuns,
                        sessionStates: newSessionStates,
                    };
                });
                break;
            }
            case 'error': {
                const errorUpdate = content as ErrorUpdate;
                if (targetSessionId === currentSessionId) {
                    get().setError(errorUpdate);
                    get().setLoading(false);
                }
                if (!errorUpdate.recoverable) {
                    get().setSessionStatus('error', targetSessionId);
                }
                // Auto-switch to oneshot mode when persistent session closes
                if (errorUpdate.code === 'PERSISTENT_SESSION_CLOSED') {
                    set({ promptMode: 'oneshot' });
                }
                break;
            }
            case 'confirmation_request': {
                const request = content as {
                    id: string;
                    type: string;
                    toolCallId: string;
                    summary: string;
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
                };

                // Deduplication: skip if toolCallId is already awaiting_confirmation.
                // Same toolCallId should only prompt the user once.
                const sessionState = get().sessionStates.get(targetSessionId);
                if (sessionState) {
                    for (const msg of sessionState.messages) {
                        const existing = msg.toolCalls?.find(
                            (tc) => tc.id === request.toolCallId && tc.status === 'awaiting_confirmation'
                        );
                        if (existing) break;
                    }
                }

                get().updateToolCall(request.toolCallId, {
                    status: 'awaiting_confirmation',
                    confirmationType: request.type as ToolCall['confirmationType'],
                    confirmationData: request.details,
                }, targetSessionId);
                break;
            }
            case 'session_switch': {
                const switchData = content as { previousSessionId: string | null; newSessionId: string };
                console.log('[updateSlice] session_switch:', switchData.previousSessionId, '->', switchData.newSessionId);
                get().setCurrentSession(switchData.newSessionId);
                break;
            }
        }
    },

    reset: () => {
        cleanupAllTextBuffers();
        set({
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
            agents: [],
            currentAgentId: null,
            permissionRules: [],
            promptMode: 'persistent',
        } satisfies AppState);
    },
});
