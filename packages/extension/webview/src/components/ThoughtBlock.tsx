/**
 * Thought Block Component - Collapsible AI thinking process
 */

import { useState } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { ExpandIcon, CollapseIcon, LoadingIcon } from './Icon';
import './ThoughtBlock.scss';

interface ThoughtBlockProps {
    content: string;
    defaultExpanded?: boolean;
    isComplete?: boolean;
}

export function ThoughtBlock({ content, defaultExpanded = false, isComplete = true }: ThoughtBlockProps) {
    const { t } = useI18n();
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const isThinking = !isComplete;
    const thinkingLabel = t('Agent.Thinking');
    const displayContent = content || (isThinking ? `${thinkingLabel}...` : '');

    return (
        <div className={`thought-block ${isThinking ? 'is-streaming' : ''}`}>
            <button
                className="thought-header"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className="thought-toggle-icon">
                    {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
                </span>
                <span className="thought-title">{t('Agent.Thought')}</span>
                {isThinking && (
                    <span className="thought-status">
                        <LoadingIcon />
                        <span>{thinkingLabel}</span>
                    </span>
                )}
            </button>

            {isExpanded && (
                <div className={`thought-content ${isThinking && !content ? 'placeholder' : ''}`}>
                    {displayContent}
                </div>
            )}
        </div>
    );
}
