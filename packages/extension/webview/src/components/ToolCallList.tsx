/**
 * Tool Call List Component
 */

import { useMemo, useState } from 'react';
import type { ToolCall } from '../types';
import './ToolCallList.css';

interface ToolCallListProps {
    toolCalls: ToolCall[];
}

function safeStringify(value: unknown, pretty: boolean): string {
    if (value === undefined) return '';
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value, null, pretty ? 2 : 0);
    } catch {
        return String(value);
    }
}

function summarizeToolInput(name: string, input: unknown): string {
    if (!input || typeof input !== 'object') return '';
    const obj = input as Record<string, unknown>;

    if (name === 'Bash' && typeof obj.command === 'string') return obj.command;
    if ((name === 'Read' || name === 'Write' || name === 'Edit') && typeof obj.path === 'string') return obj.path;
    if (name === 'Task') {
        if (typeof obj.description === 'string') return obj.description;
        if (typeof obj.prompt === 'string') return obj.prompt;
        if (typeof obj.subagent === 'string') return obj.subagent;
        if (typeof obj.subagent_name === 'string') return obj.subagent_name;
        if (typeof obj.subagentName === 'string') return obj.subagentName;
    }

    const fallback = safeStringify(input, false).replace(/\s+/g, ' ').trim();
    const maxLen = 160;
    return fallback.length > maxLen ? `${fallback.slice(0, maxLen)}…` : fallback;
}

export function ToolCallList({ toolCalls }: ToolCallListProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [expandedToolIds, setExpandedToolIds] = useState<Set<string>>(() => new Set());

    const completedCount = toolCalls.filter(tc => tc.status === 'completed').length;
    const failedCount = toolCalls.filter(tc => tc.status === 'failed').length;
    const runningCount = toolCalls.filter(tc => tc.status === 'running').length;

    const getStatusIcon = (status: ToolCall['status']) => {
        switch (status) {
            case 'completed': return '✓';
            case 'failed': return '✗';
            case 'running': return '⏳';
            default: return '○';
        }
    };

    const headerStatusIcon = useMemo(() => {
        if (failedCount > 0) return '✗';
        if (runningCount > 0) return '⏳';
        return '✓';
    }, [failedCount, runningCount]);

    const toggleTool = (id: string) => {
        setExpandedToolIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    return (
        <div className="tool-call-list">
            <button
                className="tool-list-header"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className={`status-icon ${failedCount > 0 ? 'failed' : runningCount > 0 ? 'running' : 'completed'}`}>{headerStatusIcon}</span>
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
                        <div key={tc.id} className={`tool-call-item ${tc.status}`}>
                            <button
                                className="tool-call-item-header"
                                onClick={() => toggleTool(tc.id)}
                                title={tc.name}
                            >
                                <span className="tool-status">{getStatusIcon(tc.status)}</span>
                                <span className="tool-name">{tc.name}</span>
                                {tc.input !== undefined && (
                                    <span className="tool-summary" title={safeStringify(tc.input, true)}>
                                        {summarizeToolInput(tc.name, tc.input)}
                                    </span>
                                )}
                                {tc.error && (
                                    <span className="tool-error" title={tc.error}>
                                        错误
                                    </span>
                                )}
                                <span className="tool-item-expand">{expandedToolIds.has(tc.id) ? '▼' : '▶'}</span>
                            </button>

                            {expandedToolIds.has(tc.id) && (
                                <div className="tool-call-item-details">
                                    {tc.input !== undefined && (
                                        <div className="tool-detail-block">
                                            <div className="tool-detail-title">Input</div>
                                            <pre className="tool-detail-pre">{safeStringify(tc.input, true)}</pre>
                                        </div>
                                    )}
                                    {tc.result !== undefined && (
                                        <div className="tool-detail-block">
                                            <div className="tool-detail-title">Result</div>
                                            <pre className="tool-detail-pre">{safeStringify(tc.result, true)}</pre>
                                        </div>
                                    )}
                                    {tc.error && (
                                        <div className="tool-detail-block tool-detail-block-error">
                                            <div className="tool-detail-title">Error</div>
                                            <pre className="tool-detail-pre">{tc.error}</pre>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
