/**
 * Thought Block Component - Collapsible AI thinking process
 */

import React, { useState } from 'react';
import './ThoughtBlock.css';

interface ThoughtBlockProps {
    content: string;
}

export const ThoughtBlock: React.FC<ThoughtBlockProps> = ({ content }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="thought-block">
            <button
                className="thought-header"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className="thought-icon">💭</span>
                <span className="thought-title">Thinking...</span>
                <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
            </button>

            {isExpanded && (
                <div className="thought-content">
                    {content}
                </div>
            )}
        </div>
    );
};
