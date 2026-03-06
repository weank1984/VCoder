/**
 * Context Usage Bar — thin progress bar showing context window consumption.
 * Confirmed portion (from last inputTokens) + estimated portion (current input + attachments).
 */

import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import type { ModelId } from '@vcoder/shared';
import './ContextUsageBar.scss';

/** Known context window sizes per model (in tokens). */
const MODEL_CONTEXT_WINDOW: Record<ModelId, number> = {
    'claude-haiku-4-5-20251001': 200_000,
    'claude-sonnet-4-5-20250929': 200_000,
    'glm-4.6': 128_000,
};

const DEFAULT_CONTEXT_WINDOW = 200_000;

/** Rough character-to-token ratio for estimation (conservative). */
const CHARS_PER_TOKEN = 3.5;

function estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function formatTokenCount(tokens: number): string {
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
    if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}k`;
    return `${tokens}`;
}

interface ContextUsageBarProps {
    inputText: string;
    attachments: { content?: string }[];
}

export function ContextUsageBar({ inputText, attachments }: ContextUsageBarProps) {
    const { model, messages } = useStore();

    const contextWindow = MODEL_CONTEXT_WINDOW[model] ?? DEFAULT_CONTEXT_WINDOW;

    // Find the latest assistant message with usage data (= confirmed context consumption)
    const confirmedTokens = useMemo(() => {
        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            if (msg.role === 'assistant' && msg.usage?.inputTokens) {
                return msg.usage.inputTokens;
            }
        }
        return 0;
    }, [messages]);

    // Estimate tokens for current draft input + attachments
    const estimatedTokens = useMemo(() => {
        let total = estimateTokens(inputText);
        for (const att of attachments) {
            if (att.content) {
                total += estimateTokens(att.content);
            }
        }
        return total;
    }, [inputText, attachments]);

    const confirmedPct = Math.min((confirmedTokens / contextWindow) * 100, 100);
    const estimatedPct = Math.min((estimatedTokens / contextWindow) * 100, 100 - confirmedPct);
    const totalPct = confirmedPct + estimatedPct;

    // Don't render if no data at all
    if (confirmedTokens === 0 && estimatedTokens === 0) return null;

    const isHigh = totalPct > 80;
    const isCritical = totalPct > 95;

    return (
        <div
            className={`context-usage-bar ${isCritical ? 'context-usage-bar--critical' : isHigh ? 'context-usage-bar--high' : ''}`}
            title={`Context: ${formatTokenCount(confirmedTokens)}${estimatedTokens > 0 ? ` + ~${formatTokenCount(estimatedTokens)}` : ''} / ${formatTokenCount(contextWindow)} tokens`}
        >
            <div className="context-usage-bar__track">
                <div
                    className="context-usage-bar__confirmed"
                    style={{ width: `${confirmedPct}%` }}
                />
                {estimatedPct > 0 && (
                    <div
                        className="context-usage-bar__estimated"
                        style={{ width: `${estimatedPct}%`, left: `${confirmedPct}%` }}
                    />
                )}
            </div>
            <span className="context-usage-bar__label">
                {Math.round(totalPct)}%
            </span>
        </div>
    );
}
