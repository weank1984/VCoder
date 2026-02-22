/**
 * Thought Block Component - Inline "Thought for Ns" display
 * Matches Claude Code desktop UI: simple inline text with duration tracking
 */

import { useState, useRef, useEffect } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { ChevronRightIcon } from './Icon';
import { Collapsible } from './Collapsible';
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

    // Format the label: "Thinking..." when in progress, "Thought for Ns" when complete
    function getThoughtLabel(): string {
        if (isThinking) return t('Agent.ThinkingFor');
        if (duration !== null) return t('Agent.ThoughtFor', [String(duration)]);
        return t('Agent.Thought');
    }
    const label = getThoughtLabel();

    return (
        <div className={`thought-block ${isExpanded ? 'is-expanded' : ''} ${isThinking ? 'is-thinking' : ''}`}>
            <div
                className="thought-header"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className={`thought-chevron ${isExpanded ? 'is-open' : ''}`}>
                    <ChevronRightIcon />
                </span>
                <span className="thought-label">{label}</span>
            </div>

            <Collapsible isOpen={isExpanded && !!displayContent}>
                <div className="thought-content">
                    {displayContent}
                </div>
            </Collapsible>
        </div>
    );
}
