import { useMemo, useCallback } from 'react';
import { useStore } from '../store/useStore';
import type { ToolCall } from '../types';

export interface FloatingApprovalState {
    /** Most recent top-level awaiting_confirmation tool call */
    pendingToolCall: ToolCall | null;
    /** Total number of pending top-level approvals */
    pendingCount: number;
    /** Whether it's a user_question type */
    isQuestion: boolean;
    /** Approve or deny a tool call */
    onConfirm: (tc: ToolCall, approved: boolean, options?: { trustAlways?: boolean; editedContent?: string }) => void;
    /** Answer a question */
    onAnswer: (tc: ToolCall, answer: string) => void;
}

/**
 * Hook that finds the most recent awaiting_confirmation tool call
 * (excluding subagent child calls) and provides action callbacks.
 */
export function useFloatingApproval(): FloatingApprovalState {
    const { messages, confirmTool, answerQuestion } = useStore();

    const { pendingToolCall, pendingCount, isQuestion } = useMemo(() => {
        let latest: ToolCall | null = null;
        let count = 0;

        // Reverse scan: find the most recent awaiting_confirmation tool call
        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            if (!msg.toolCalls) continue;
            for (let j = msg.toolCalls.length - 1; j >= 0; j--) {
                const tc = msg.toolCalls[j];
                if (tc.status === 'awaiting_confirmation') {
                    count++;
                    if (!latest) {
                        latest = tc;
                    }
                }
            }
        }

        return {
            pendingToolCall: latest,
            pendingCount: count,
            isQuestion: latest?.confirmationType === 'user_question',
        };
    }, [messages]);

    const onConfirm = useCallback(
        (tc: ToolCall, approved: boolean, options?: { trustAlways?: boolean; editedContent?: string }) => {
            confirmTool(tc.id, approved, options);
        },
        [confirmTool],
    );

    const onAnswer = useCallback(
        (tc: ToolCall, answer: string) => {
            answerQuestion(tc.id, answer);
        },
        [answerQuestion],
    );

    return { pendingToolCall, pendingCount, isQuestion, onConfirm, onAnswer };
}
