import type { SliceCreator, MessagesSlice, ChatMessage, ToolCall } from './types';
import { createId, normalizeToolName, createSessionState, appendContentBlock, debugThinking } from './helpers';
import { postMessage } from '../../bridge';

export const createMessagesSlice: SliceCreator<MessagesSlice> = (set, get) => ({
    addMessage: (message, sessionId) => {
        const state = get();
        const targetSessionId = sessionId ?? state.currentSessionId;
        if (!targetSessionId) {
            set((prevState) => ({ messages: [...prevState.messages, message] }));
            return;
        }

        set((prevState) => {
            const newSessionStates = new Map(prevState.sessionStates);
            const sessionState = newSessionStates.get(targetSessionId) ?? createSessionState(targetSessionId);
            const messages = [...sessionState.messages, message];
            const nextSessionState = { ...sessionState, messages, updatedAt: Date.now() };
            newSessionStates.set(targetSessionId, nextSessionState);

            return {
                sessionStates: newSessionStates,
                messages: targetSessionId === prevState.currentSessionId ? messages : prevState.messages,
            };
        });
    },

    updateMessage: (id, updates, sessionId) =>
        set((state) => {
            const targetSessionId = sessionId ?? state.currentSessionId;
            if (!targetSessionId) {
                return {
                    messages: state.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
                };
            }

            const newSessionStates = new Map(state.sessionStates);
            const sessionState = newSessionStates.get(targetSessionId) ?? createSessionState(targetSessionId);
            const messages = sessionState.messages.map((m) => (m.id === id ? { ...m, ...updates } : m));
            newSessionStates.set(targetSessionId, { ...sessionState, messages, updatedAt: Date.now() });

            return {
                sessionStates: newSessionStates,
                messages: targetSessionId === state.currentSessionId ? messages : state.messages,
            };
        }),

    appendToLastMessage: (text, sessionId) =>
        set((state) => {
            const targetSessionId = sessionId ?? state.currentSessionId;
            if (!targetSessionId) {
                const messages = [...state.messages];
                const lastIndex = messages.length - 1;
                const last = messages[lastIndex];

                let target: ChatMessage;
                let targetIndex: number;

                if (last && last.role === 'assistant' && !last.isComplete) {
                    target = { ...last };
                    targetIndex = lastIndex;
                } else {
                    target = {
                        id: createId(),
                        role: 'assistant',
                        content: '',
                        isComplete: false,
                    };
                    targetIndex = messages.length;
                }

                target.content = (target.content || '') + text;
                appendContentBlock(target, { type: 'text', content: text });
                messages[targetIndex] = target;

                return { messages };
            }

            const newSessionStates = new Map(state.sessionStates);
            const sessionState = newSessionStates.get(targetSessionId) ?? createSessionState(targetSessionId);
            const messages = [...sessionState.messages];
            const lastIndex = messages.length - 1;
            const last = messages[lastIndex];

            let target: ChatMessage;
            let targetIndex: number;

            if (last && last.role === 'assistant' && !last.isComplete) {
                target = { ...last };
                targetIndex = lastIndex;
            } else {
                target = {
                    id: createId(),
                    role: 'assistant',
                    content: '',
                    isComplete: false,
                };
                targetIndex = messages.length;
            }

            target.content = (target.content || '') + text;
            appendContentBlock(target, { type: 'text', content: text });

            messages[targetIndex] = target;
            newSessionStates.set(targetSessionId, { ...sessionState, messages, updatedAt: Date.now() });

            return {
                sessionStates: newSessionStates,
                messages: targetSessionId === state.currentSessionId ? messages : state.messages,
            };
        }),

    setThought: (thought, isComplete, sessionId) =>
        set((state) => {
            const targetSessionId = sessionId ?? state.currentSessionId;
            if (!targetSessionId) {
                if (debugThinking) {
                    console.debug('[VCoder][thinking] setThought', {
                        length: thought.length,
                        isComplete,
                    });
                }

                const messages = [...state.messages];
                const lastIndex = messages.length - 1;
                const last = messages[lastIndex];

                let target: ChatMessage;
                let targetIndex: number;

                if (last && last.role === 'assistant' && !last.isComplete) {
                    target = { ...last };
                    targetIndex = lastIndex;
                } else {
                    target = {
                        id: createId(),
                        role: 'assistant',
                        content: '',
                        isComplete: false,
                    };
                    targetIndex = messages.length;
                }

                target.thought = isComplete ? thought : (target.thought || '') + thought;
                target.thoughtIsComplete = isComplete;
                appendContentBlock(target, { type: 'thought', content: thought, isComplete });
                messages[targetIndex] = target;

                return { messages };
            }

            if (debugThinking) {
                console.debug('[VCoder][thinking] setThought', {
                    length: thought.length,
                    isComplete,
                });
            }

            const newSessionStates = new Map(state.sessionStates);
            const sessionState = newSessionStates.get(targetSessionId) ?? createSessionState(targetSessionId);
            const messages = [...sessionState.messages];
            const lastIndex = messages.length - 1;
            const last = messages[lastIndex];

            let target: ChatMessage;
            let targetIndex: number;

            if (last && last.role === 'assistant' && !last.isComplete) {
                target = { ...last };
                targetIndex = lastIndex;
            } else {
                target = {
                    id: createId(),
                    role: 'assistant',
                    content: '',
                    isComplete: false,
                };
                targetIndex = messages.length;
            }

            target.thought = isComplete ? thought : (target.thought || '') + thought;
            target.thoughtIsComplete = isComplete;
            appendContentBlock(target, { type: 'thought', content: thought, isComplete });

            messages[targetIndex] = target;
            newSessionStates.set(targetSessionId, { ...sessionState, messages, updatedAt: Date.now() });

            return {
                sessionStates: newSessionStates,
                messages: targetSessionId === state.currentSessionId ? messages : state.messages,
            };
        }),

    addToolCall: (toolCall, sessionId) =>
        set((state) => {
            const targetSessionId = sessionId ?? state.currentSessionId;
            if (!targetSessionId) {
                const messages = [...state.messages];
                const lastIndex = messages.length - 1;
                const last = messages[lastIndex];

                let target: ChatMessage;
                let targetIndex: number;

                if (last && last.role === 'assistant' && !last.isComplete) {
                    target = { ...last };
                    targetIndex = lastIndex;
                } else {
                    target = {
                        id: createId(),
                        role: 'assistant',
                        content: '',
                        isComplete: false,
                    };
                    targetIndex = messages.length;
                }

                const normalizedToolCall: ToolCall = {
                    ...toolCall,
                    name: normalizeToolName(toolCall.name),
                };

                const existing = target.toolCalls?.find((tc) => tc.id === normalizedToolCall.id);
                if (existing) {
                    target.toolCalls = target.toolCalls!.map((tc) =>
                        tc.id === normalizedToolCall.id ? { ...tc, ...normalizedToolCall } : tc
                    );
                } else {
                    target.toolCalls = [...(target.toolCalls || []), normalizedToolCall];
                    appendContentBlock(target, { type: 'tools', toolCallIds: [normalizedToolCall.id] });
                }

                messages[targetIndex] = target;
                return { messages };
            }

            const newSessionStates = new Map(state.sessionStates);
            const sessionState = newSessionStates.get(targetSessionId) ?? createSessionState(targetSessionId);
            const messages = [...sessionState.messages];
            const lastIndex = messages.length - 1;
            const last = messages[lastIndex];

            let target: ChatMessage;
            let targetIndex: number;

            if (last && last.role === 'assistant' && !last.isComplete) {
                target = { ...last };
                targetIndex = lastIndex;
            } else {
                target = {
                    id: createId(),
                    role: 'assistant',
                    content: '',
                    isComplete: false,
                };
                targetIndex = messages.length;
            }

            const normalizedToolCall: ToolCall = {
                ...toolCall,
                name: normalizeToolName(toolCall.name),
            };

            const existing = target.toolCalls?.find((tc) => tc.id === normalizedToolCall.id);
            if (existing) {
                target.toolCalls = target.toolCalls!.map((tc) =>
                    tc.id === normalizedToolCall.id ? { ...tc, ...normalizedToolCall } : tc
                );
            } else {
                target.toolCalls = [...(target.toolCalls || []), normalizedToolCall];
                appendContentBlock(target, { type: 'tools', toolCallIds: [normalizedToolCall.id] });
            }

            messages[targetIndex] = target;
            newSessionStates.set(targetSessionId, { ...sessionState, messages, updatedAt: Date.now() });

            return {
                sessionStates: newSessionStates,
                messages: targetSessionId === state.currentSessionId ? messages : state.messages,
            };
        }),

    updateToolCall: (id, updates, sessionId) =>
        set((state) => {
            const targetSessionId = sessionId ?? state.currentSessionId;
            if (!targetSessionId) {
                const messages = [...state.messages];
                for (let i = messages.length - 1; i >= 0; i--) {
                    const message = messages[i];
                    if (message.role !== 'assistant' || !message.toolCalls?.length) continue;
                    const idx = message.toolCalls.findIndex((tc) => tc.id === id);
                    if (idx === -1) continue;

                    const newToolCalls = [...message.toolCalls];
                    const normalizedUpdates: Partial<ToolCall> = {
                        ...updates,
                        ...(typeof updates.name === 'string' ? { name: normalizeToolName(updates.name) } : null),
                    };
                    newToolCalls[idx] = { ...newToolCalls[idx], ...normalizedUpdates };
                    messages[i] = { ...message, toolCalls: newToolCalls };
                    return { messages };
                }

                const lastIndex = messages.length - 1;
                const last = messages[lastIndex];

                let target: ChatMessage;
                let targetIndex: number;

                if (last && last.role === 'assistant' && !last.isComplete) {
                    target = { ...last };
                    targetIndex = lastIndex;
                } else {
                    target = {
                        id: createId(),
                        role: 'assistant',
                        content: '',
                        isComplete: false,
                    };
                    targetIndex = messages.length;
                }

                target.toolCalls = [
                    ...(target.toolCalls || []),
                    {
                        id,
                        name:
                            typeof updates.name === 'string' && updates.name
                                ? normalizeToolName(updates.name)
                                : 'Tool',
                        status: updates.status ?? 'running',
                        input: updates.input,
                        result: updates.result,
                        error: updates.error,
                    },
                ];
                messages[targetIndex] = target;
                return { messages };
            }

            const newSessionStates = new Map(state.sessionStates);
            const sessionState = newSessionStates.get(targetSessionId) ?? createSessionState(targetSessionId);
            const messages = [...sessionState.messages];
            for (let i = messages.length - 1; i >= 0; i--) {
                const message = messages[i];
                if (message.role !== 'assistant' || !message.toolCalls?.length) continue;
                const idx = message.toolCalls.findIndex((tc) => tc.id === id);
                if (idx === -1) continue;

                const newToolCalls = [...message.toolCalls];
                const normalizedUpdates: Partial<ToolCall> = {
                    ...updates,
                    ...(typeof updates.name === 'string' ? { name: normalizeToolName(updates.name) } : null),
                };
                newToolCalls[idx] = { ...newToolCalls[idx], ...normalizedUpdates };
                messages[i] = { ...message, toolCalls: newToolCalls };
                newSessionStates.set(targetSessionId, { ...sessionState, messages, updatedAt: Date.now() });
                return {
                    sessionStates: newSessionStates,
                    messages: targetSessionId === state.currentSessionId ? messages : state.messages,
                };
            }

            const lastIndex = messages.length - 1;
            const last = messages[lastIndex];

            let target: ChatMessage;
            let targetIndex: number;

            if (last && last.role === 'assistant' && !last.isComplete) {
                target = { ...last };
                targetIndex = lastIndex;
            } else {
                target = {
                    id: createId(),
                    role: 'assistant',
                    content: '',
                    isComplete: false,
                };
                targetIndex = messages.length;
            }

            target.toolCalls = [
                ...(target.toolCalls || []),
                {
                    id,
                    name:
                        typeof updates.name === 'string' && updates.name
                            ? normalizeToolName(updates.name)
                            : 'Tool',
                    status: updates.status ?? 'running',
                    input: updates.input,
                    result: updates.result,
                    error: updates.error,
                },
            ];
            messages[targetIndex] = target;
            newSessionStates.set(targetSessionId, { ...sessionState, messages, updatedAt: Date.now() });
            return {
                sessionStates: newSessionStates,
                messages: targetSessionId === state.currentSessionId ? messages : state.messages,
            };
        }),

    confirmTool: (toolCallId, confirmed, options, sessionId) => {
        set((state) => {
            const targetSessionId = sessionId ?? state.currentSessionId;
            if (!targetSessionId) {
                const messages = [...state.messages];
                for (let i = 0; i < messages.length; i++) {
                    const msg = messages[i];
                    if (msg.toolCalls) {
                        const tcIdx = msg.toolCalls.findIndex(t => t.id === toolCallId);
                        if (tcIdx !== -1) {
                            const newToolCalls = [...msg.toolCalls];
                            const updatedTc = { ...newToolCalls[tcIdx] };
                            updatedTc.status = confirmed ? 'running' : 'failed';
                            delete updatedTc.confirmationType;
                            delete updatedTc.confirmationData;
                            newToolCalls[tcIdx] = updatedTc;
                            messages[i] = { ...msg, toolCalls: newToolCalls };
                            break;
                        }
                    }
                }
                return { messages };
            }

            const newSessionStates = new Map(state.sessionStates);
            const sessionState = newSessionStates.get(targetSessionId) ?? createSessionState(targetSessionId);
            const messages = [...sessionState.messages];
            for (let i = 0; i < messages.length; i++) {
                const msg = messages[i];
                if (msg.toolCalls) {
                    const tcIdx = msg.toolCalls.findIndex(t => t.id === toolCallId);
                    if (tcIdx !== -1) {
                        const newToolCalls = [...msg.toolCalls];
                        const updatedTc = { ...newToolCalls[tcIdx] };
                        updatedTc.status = confirmed ? 'running' : 'failed';
                        delete updatedTc.confirmationType;
                        delete updatedTc.confirmationData;
                        newToolCalls[tcIdx] = updatedTc;
                        messages[i] = { ...msg, toolCalls: newToolCalls };
                        break;
                    }
                }
            }
            newSessionStates.set(targetSessionId, { ...sessionState, messages, updatedAt: Date.now() });

            return {
                sessionStates: newSessionStates,
                messages: targetSessionId === state.currentSessionId ? messages : state.messages,
            };
        });

        postMessage({
            type: 'confirmTool',
            toolCallId,
            confirmed,
            options,
        });
    },
});
