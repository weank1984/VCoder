/**
 * Tool Call List Component
 */

import { useState } from 'react';
import type { ToolCall } from '../types';
import './ToolCallList.css';

interface ToolCallListProps {
    toolCalls: ToolCall[];
}

export function ToolCallList({ toolCalls }: ToolCallListProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    const completedCount = toolCalls.filter(tc => tc.status === 'completed').length;
    const failedCount = toolCalls.filter(tc => tc.status === 'failed').length;

    const getStatusIcon = (status: ToolCall['status']) => {
        switch (status) {
            case 'completed': return '✓';
            case 'failed': return '✗';
            case 'running': return '⏳';
            default: return '○';
        }
    };

    return (
        <div className="tool-call-list">
            <button
                className="tool-list-header"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className="status-icon">✓</span>
                <span className="tool-list-title">
                    工具调用
                    {failedCount > 0 && <span className="failed-badge">{failedCount} 失败</span>}
                </span>
                <span className="call-count">{completedCount}/{toolCalls.length}</span>
                <span className="tool-list-expand-icon">{isExpanded ? '▼' : '▶'}</span>
            </button>

            {isExpanded && (
                <div className="tool-list-content">
                    {toolCalls.map((tc) => (
                        <div
                            key={tc.id}
                            className={`tool-call-item ${tc.status}`}
                        >
                            <span className="tool-status">{getStatusIcon(tc.status)}</span>
                            <span className="tool-name">{tc.name}</span>
                            {tc.error && (
                                <span className="tool-error" title={tc.error}>
                                    错误
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
