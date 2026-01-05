/**
 * Thought Block Component - Collapsible AI thinking process
 */

import { useState } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { ExpandIcon, CollapseIcon } from './Icon';
import './ThoughtBlock.scss';

interface ThoughtBlockProps {
    content: string;
    defaultExpanded?: boolean;
}

export function ThoughtBlock({ content, defaultExpanded = false }: ThoughtBlockProps) {
    const { t } = useI18n();
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    return (
        <div className="thought-block">
            <button
                className="thought-header"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className="thought-toggle-icon">
                    {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
                </span>
                <span className="thought-title">{t('Agent.Thought')}</span>
            </button>

            {isExpanded && (
                <div className="thought-content">
                    {content}
                </div>
            )}
        </div>
    );
}
