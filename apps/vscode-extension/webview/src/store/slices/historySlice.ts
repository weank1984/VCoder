import type { SliceCreator, HistorySlice, ChatMessage, ToolCall, HistoryChatMessage } from './types';
import { normalizeToolName, createSessionState, appendContentBlock, cleanupAllTextBuffers } from './helpers';

function mergeHistoryMessages(historyMessages: HistoryChatMessage[]): ChatMessage[] {
    const out: ChatMessage[] = [];

    const upsertToolCall = (target: ChatMessage, toolCall: ToolCall): void => {
        const normalized: ToolCall = {
            ...toolCall,
            name: normalizeToolName(toolCall.name),
        };
        const existing = target.toolCalls ?? [];
        const idx = existing.findIndex((tc) => tc.id === normalized.id);
        if (idx === -1) {
            target.toolCalls = [...existing, normalized];
            return;
        }
        const next = [...existing];
        next[idx] = { ...next[idx], ...normalized };
        target.toolCalls = next;
    };

    const appendHistoryBlocks = (target: ChatMessage, blocks: NonNullable<HistoryChatMessage['contentBlocks']>): void => {
        for (const block of blocks) {
            if (block.type === 'text') {
                if (!block.content) continue;
                target.content = (target.content || '') + block.content;
                appendContentBlock(target, { type: 'text', content: block.content });
                continue;
            }
            if (block.type === 'thought') {
                if (!block.content) continue;
                target.thought = (target.thought || '') + block.content;
                target.thoughtIsComplete = block.isComplete;
                appendContentBlock(target, { type: 'thought', content: block.content, isComplete: block.isComplete });
                continue;
            }
            if (block.type === 'tools') {
                if (!block.toolCallIds || block.toolCallIds.length === 0) continue;
                appendContentBlock(target, { type: 'tools', toolCallIds: block.toolCallIds });
            }
        }
    };

    for (const msg of historyMessages) {
        if (msg.role === 'user') {
            out.push({
                id: msg.id,
                role: 'user',
                content: msg.content,
                isComplete: true,
            });
            continue;
        }

        const last = out[out.length - 1];
        const target =
            last && last.role === 'assistant'
                ? last
                : (() => {
                      const created: ChatMessage = {
                          id: msg.id,
                          role: 'assistant',
                          content: '',
                          isComplete: true,
                      };
                      out.push(created);
                      return created;
                  })();

        if (msg.toolCalls) {
            for (const tc of msg.toolCalls) {
                upsertToolCall(target, {
                    id: tc.id,
                    name: tc.name,
                    status: tc.status,
                    input: tc.input,
                    result: tc.result,
                    error: tc.error,
                });
            }
        }

        const blocks =
            msg.contentBlocks ??
            ([
                ...(msg.thought
                    ? [{ type: 'thought' as const, content: msg.thought, isComplete: true }]
                    : []),
                ...(msg.toolCalls && msg.toolCalls.length > 0
                    ? [{ type: 'tools' as const, toolCallIds: msg.toolCalls.map((t) => t.id) }]
                    : []),
                ...(msg.content ? [{ type: 'text' as const, content: msg.content }] : []),
            ] as NonNullable<HistoryChatMessage['contentBlocks']>);

        appendHistoryBlocks(target, blocks);
    }

    return out;
}

export const createHistorySlice: SliceCreator<HistorySlice> = (set, _get) => ({
    setHistorySessions: (historySessions) => set({ historySessions }),

    loadHistorySession: (sessionId, historyMessages) => set((state) => {
        const messages = mergeHistoryMessages(historyMessages);

        const newSessionStates = new Map(state.sessionStates);
        const existingState = newSessionStates.get(sessionId);
        const now = Date.now();
        newSessionStates.set(sessionId, {
            ...(existingState ?? createSessionState(sessionId)),
            messages,
            updatedAt: now,
        });

        return {
            viewMode: 'history',
            currentSessionId: sessionId,
            sessionStates: newSessionStates,
            messages,
            isLoading: false,
            pendingFileChanges: [],
        };
    }),

    exitHistoryMode: () => {
        cleanupAllTextBuffers();
        set({
            viewMode: 'live',
            currentSessionId: null,
            messages: [],
            pendingFileChanges: [],
        });
    },
});
