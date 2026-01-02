/**
 * Thought Block Component - Collapsible AI thinking process
 */

import { useState } from 'react';
import './ThoughtBlock.scss';

interface ThoughtBlockProps {
    content: string;
}

export function ThoughtBlock({ content }: ThoughtBlockProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="thought-block">
            <button
                className="thought-header"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className="thought-icon">💭</span>
                <span className="thought-title">思考过程</span>
                <span className="thought-expand-icon">{isExpanded ? '▼' : '▶'}</span>
            </button>

            {isExpanded && (
                <div className="thought-content">
                    {content}
                </div>
            )}
        </div>
    );
}
