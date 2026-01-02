/**
 * Tool Call List Component
 */

import { useMemo, useState } from 'react';
import type { ToolCall } from '../types';
import { 
    TerminalIcon, 
    FileIcon, 
    CheckIcon, 
    ErrorIcon, 
    LoadingIcon, 
    ExpandIcon,
    CollapseIcon,
    PlayIcon,
    StopIcon,
    EditIcon,
    SearchIcon,
    InfoIcon,
    WarningIcon,
    WebIcon
} from './Icon';
import { postMessage } from '../utils/vscode';
import './ToolCallList.scss';

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

function getToolIcon(name: string) {
    const n = name.toLowerCase();
    if (n.includes('bash') || n.includes('command') || n.includes('terminal')) return <TerminalIcon />;
    if (n.includes('read') || n.includes('write') || n.includes('file')) return <FileIcon />;
    if (n.includes('edit') || n.includes('replace')) return <EditIcon />;
    if (n.includes('search') || n.includes('grep') || n.includes('find')) return <SearchIcon />;
    if (n.includes('browser') || n.includes('web')) return <WebIcon />;
    return <PlayIcon />;
}

function summarizeToolInput(name: string, input: unknown): { summary: string, detail?: string } {
    if (!input || typeof input !== 'object') return { summary: '' };
    const obj = input as Record<string, unknown>;

    // Bash / Command
    if (name === 'Bash') {
        if (typeof obj.command === 'string') return { 
            summary: obj.command,
            detail: 'Command'
        };
    }
    if (name === 'run_command' && typeof obj.CommandLine === 'string') {
        return {
            summary: obj.CommandLine,
            detail: 'Command'
        };
    }

    // File Ops
    if ((name === 'Read' || name === 'Write' || name === 'Edit') && typeof obj.path === 'string') {
        return { summary: obj.path, detail: 'File' };
    }
    if (name === 'read_file' || name === 'read_url_content' || name === 'view_file') {
         if (typeof obj.Url === 'string') return { summary: obj.Url, detail: 'URL' };
         if (typeof obj.AbsolutePath === 'string') return { summary: obj.AbsolutePath, detail: 'Path' };
    }
    if (name === 'write_to_file' || name === 'replace_file_content' || name === 'multi_replace_file_content') {
        if (typeof obj.TargetFile === 'string') return { summary: obj.TargetFile, detail: 'Target' };
    }
    
    // Search
    if (name === 'grep_search' || name === 'find_by_name') {
        if (typeof obj.Query === 'string') return { summary: obj.Query, detail: 'Query' };
        if (typeof obj.Pattern === 'string') return { summary: obj.Pattern, detail: 'Pattern' };
    }

    // Task
    if (name === 'Task' || name === 'task_boundary') {
        if (typeof obj.description === 'string') return { summary: obj.description };
        if (typeof obj.TaskStatus === 'string') return { summary: obj.TaskStatus };
        if (typeof obj.TaskName === 'string') return { summary: obj.TaskName };
    }

    // Default fallback
    const fallback = safeStringify(input, false).replace(/\s+/g, ' ').trim();
    const maxLen = 80;
    return { 
        summary: fallback.length > maxLen ? `${fallback.slice(0, maxLen)}…` : fallback 
    };
}

export function ToolCallList({ toolCalls }: ToolCallListProps) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [expandedToolIds, setExpandedToolIds] = useState<Set<string>>(() => new Set());
    
    // Auto-expand pending or failed tools on initial load or update
    useMemo(() => {
        const toExpand = new Set<string>();
        toolCalls.forEach(tc => {
            if (tc.status === 'pending' || tc.status === 'failed' || tc.status === 'running') {
                toExpand.add(tc.id);
            }
        });
        if (toExpand.size > 0) {
            setExpandedToolIds(prev => {
                const next = new Set(prev);
                toExpand.forEach(id => next.add(id));
                return next;
            });
        }
    }, [toolCalls.length]); 

    const completedCount = toolCalls.filter(tc => tc.status === 'completed').length;
    const failedCount = toolCalls.filter(tc => tc.status === 'failed').length;
    const runningCount = toolCalls.filter(tc => tc.status === 'running').length;
    const pendingCount = toolCalls.filter(tc => tc.status === 'pending').length;

    const headerStatusIcon = useMemo(() => {
        if (failedCount > 0) return <WarningIcon />;
        if (runningCount > 0 || pendingCount > 0) return <LoadingIcon />;
        return <CheckIcon />;
    }, [failedCount, runningCount, pendingCount]);

    const toggleTool = (id: string) => {
        setExpandedToolIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleConfirm = (tc: ToolCall, approve: boolean) => {
        if (approve) {
            postMessage({ type: 'confirmBash', commandId: tc.id });
        } else {
            postMessage({ type: 'skipBash', commandId: tc.id });
        }
    };

    if (toolCalls.length === 0) return null;

    return (
        <div className="tool-call-list">
            <button 
                className={`tool-list-header ${failedCount > 0 ? 'has-error' : ''}`}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className={`status-icon-wrapper ${failedCount > 0 ? 'failed' : (runningCount > 0 || pendingCount > 0) ? 'running' : 'completed'}`}>
                    {headerStatusIcon}
                </span>
                <span className="tool-list-title">
                    工具调用
                    {failedCount > 0 && <span className="list-badge error">{failedCount} 失败</span>}
                    {pendingCount > 0 && <span className="list-badge warning">{pendingCount} 待批准</span>}
                    {runningCount > 0 && <span className="list-badge info">{runningCount} 执行中</span>}
                </span>
                <span className="tool-count">{completedCount}/{toolCalls.length}</span>
                <span className="expand-icon">{isExpanded ? <CollapseIcon /> : <ExpandIcon />}</span>
            </button>

            {isExpanded && (
                <div className="tool-list-content">
                    {toolCalls.map((tc) => {
                        const { summary, detail } = summarizeToolInput(tc.name, tc.input);
                        const isExpandedItem = expandedToolIds.has(tc.id);
                        
                        return (
                            <div key={tc.id} className={`tool-call-item ${tc.status}`}>
                                <div className="tool-item-summary" onClick={() => toggleTool(tc.id)}>
                                    <span className="tool-icon">{getToolIcon(tc.name)}</span>
                                    <div className="tool-info">
                                        <div className="tool-name-row">
                                            <span className="tool-name">{tc.name}</span>
                                            <span className="tool-status-badge">
                                                {tc.status === 'completed' && <CheckIcon />}
                                                {tc.status === 'failed' && <ErrorIcon />}
                                                {(tc.status === 'running' || tc.status === 'pending') && <LoadingIcon />}
                                            </span>
                                        </div>
                                        <div className="tool-args-preview" title={summary}>
                                            {detail && <span className="arg-label">{detail}:</span>}
                                            {summary}
                                        </div>
                                    </div>
                                    <span className="item-expand-toggle">
                                        {isExpandedItem ? <CollapseIcon /> : <ExpandIcon />}
                                    </span>
                                </div>

                                {isExpandedItem && (
                                    <div className="tool-item-details">
                                        {tc.status === 'pending' && (
                                            <div className="tool-approval-actions">
                                                <div className="approval-message">
                                                    <InfoIcon />
                                                    <span>此操作需要您的批准</span>
                                                </div>
                                                <div className="approval-buttons">
                                                    <button className="btn-approve" onClick={() => handleConfirm(tc, true)}>
                                                        <CheckIcon /> 批准执行
                                                    </button>
                                                    <button className="btn-reject" onClick={() => handleConfirm(tc, false)}>
                                                        <StopIcon /> 拒绝
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                        
                                        {tc.input !== undefined && (
                                            <div className="detail-section">
                                                <div className="detail-header">Input</div>
                                                <div className="code-block">
                                                    <pre>{safeStringify(tc.input, true)}</pre>
                                                </div>
                                            </div>
                                        )}
                                        
                                        {tc.result !== undefined && (
                                            <div className="detail-section">
                                                <div className="detail-header">Result</div>
                                                <div className="code-block result">
                                                    <pre>{safeStringify(tc.result, true)}</pre>
                                                </div>
                                            </div>
                                        )}
                                        
                                        {tc.error && (
                                            <div className="detail-section error">
                                                <div className="detail-header">Error</div>
                                                <div className="code-block error">
                                                    <pre>{tc.error}</pre>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
