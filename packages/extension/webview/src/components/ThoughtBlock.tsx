/**
 * Thought Block Component - Inline "Thought for Ns" display
 * Matches Claude Code desktop UI: simple inline text with duration tracking
 */

import { useState, useRef, useEffect } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import './ThoughtBlock.scss';

interface ThoughtBlockProps {
    content: string;
    defaultExpanded?: boolean;
    isComplete?: boolean;
}

export function ThoughtBlock({ content, defaultExpanded = false, isComplete = true }: ThoughtBlockProps) {
    const { t } = useI18n();
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const wasCompleteRef = useRef(isComplete);
    const startTimeRef = useRef<number>(Date.now());
    const [duration, setDuration] = useState<number | null>(null);
    const isThinking = !isComplete;

    // Track thinking duration
    useEffect(() => {
        if (isThinking) {
            startTimeRef.current = Date.now();
            setDuration(null);
        }
    }, [isThinking]);

    // When thinking transitions from in-progress to complete, compute duration and auto-collapse
    useEffect(() => {
        const wasComplete = wasCompleteRef.current;
        wasCompleteRef.current = isComplete;

        if (isComplete && !wasComplete) {
            const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
            setDuration(elapsed > 0 ? elapsed : 1);
            const timeoutId = setTimeout(() => setIsExpanded(false), 0);
            return () => clearTimeout(timeoutId);
        }
    }, [isComplete]);

    const displayContent = content || (isThinking ? `${t('Agent.Thinking')}...` : '');

    // Format the label: "Thought for Ns" when complete, "Thinking..." when in progress
    const label = isThinking
        ? t('Agent.ThinkingFor')
        : duration !== null
            ? t('Agent.ThoughtFor', [String(duration)])
            : t('Agent.Thought');

    return (
        <div className={`thought-block ${isExpanded ? 'is-expanded' : ''} ${isThinking ? 'is-thinking' : ''}`}>
            <div
                className="thought-header"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className="thought-label">{label}</span>
            </div>

            {isExpanded && displayContent && (
                <div className="thought-content">
                    {displayContent}
                </div>
            )}
        </div>
    );
}
