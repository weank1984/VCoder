/**
 * Thought Block Component - Collapsible AI thinking process
 */

import { useState, useRef, useEffect } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { ChevronRightIcon } from './Icon';
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
    const isThinking = !isComplete;
    
    // 当思考从进行中变为完成时，自动折叠
    // When thinking transitions from in-progress to complete, auto-collapse
    useEffect(() => {
        const wasComplete = wasCompleteRef.current;
        wasCompleteRef.current = isComplete;

        if (isComplete && !wasComplete) {
            const timeoutId = setTimeout(() => setIsExpanded(false), 0);
            return () => clearTimeout(timeoutId);
        }
    }, [isComplete]);
    const thinkingLabel = t('Agent.Thinking');
    const displayContent = content || (isThinking ? `${thinkingLabel}...` : '');
    const label = isThinking ? t('Agent.Thinking') : t('Agent.Thought');

    return (
        <div className={`thought-block ${isExpanded ? 'is-expanded' : ''} ${isThinking ? 'is-thinking' : ''}`}>
            <div 
                className="thought-header" 
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className={`codicon codicon-chevron-${isExpanded ? 'down' : 'right'}`}>
                    <ChevronRightIcon />
                </span>
                <span className="thought-label">{label}</span>
                {isThinking && <span className="thought-duration">{t('Common.JustNow')}</span>}
            </div>
            
            {isExpanded && (
                <div className="thought-content">
                    {displayContent}
                </div>
            )}
        </div>
    );
}
