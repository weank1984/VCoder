/**
 * Thought Block Component - Collapsible AI thinking process
 */

import { useState, useRef, useEffect } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { ChevronRightIcon, ThinkIcon, LoadingIcon } from './Icon';
import './ThoughtBlock.scss';

interface ThoughtBlockProps {
    content: string;
    defaultExpanded?: boolean;
    isComplete?: boolean;
}

function truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen).trim() + '...';
}

export function ThoughtBlock({ content, defaultExpanded = false, isComplete = true }: ThoughtBlockProps) {
    const { t } = useI18n();
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const wasCompleteRef = useRef(isComplete);
    const contentRef = useRef<HTMLDivElement>(null);
    const [contentHeight, setContentHeight] = useState<number | undefined>();
    
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

    // Calculate content height for animation
    useEffect(() => {
        if (contentRef.current) {
            setContentHeight(contentRef.current.scrollHeight);
        }
    }, [content]);

    return (
        <div className={`thought-block ${isThinking ? 'is-thinking' : ''} ${isExpanded ? 'is-expanded' : ''}`}>
            {/* Thinking pulse background */}
            {isThinking && <div className="thought-pulse" />}
            
            <button
                className="thought-header"
                onClick={() => setIsExpanded(!isExpanded)}
                aria-expanded={isExpanded}
            >
                <span className={`thought-expand-icon ${isExpanded ? 'rotated' : ''}`}>
                    <ChevronRightIcon />
                </span>
                
                <span className="thought-icon">
                    <ThinkIcon />
                </span>
                
                <span className="thought-title">
                    {isThinking ? thinkingLabel : t('Agent.Thought')}
                </span>
                
                {isThinking && (
                    <span className="thought-loading">
                        <LoadingIcon />
                    </span>
                )}
                
                {!isThinking && content && !isExpanded && (
                    <span className="thought-preview">
                        {truncate(content, 60)}
                    </span>
                )}
            </button>

            <div 
                className="thought-content-wrapper"
                style={{ 
                    maxHeight: isExpanded ? (contentHeight || 500) : 0,
                }}
            >
                <div className="thought-content" ref={contentRef}>
                    {displayContent}
                </div>
            </div>
        </div>
    );
}
