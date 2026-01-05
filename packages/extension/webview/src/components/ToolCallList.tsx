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
import { useI18n } from '../i18n/I18nProvider';
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

function summarizeToolInput(
    name: string,
    input: unknown,
    labels: {
        command: string;
        file: string;
        url: string;
        path: string;
        target: string;
        query: string;
        pattern: string;
    }
): { summary: string, detail?: string } {
    if (!input || typeof input !== 'object') return { summary: '' };
    const obj = input as Record<string, unknown>;

    // Bash / Command
    if (name === 'Bash') {
        if (typeof obj.command === 'string') return { 
            summary: obj.command,
            detail: labels.command
        };
    }
    if (name === 'run_command' && typeof obj.CommandLine === 'string') {
        return {
            summary: obj.CommandLine,
            detail: labels.command
        };
    }

    // File Ops
    if ((name === 'Read' || name === 'Write' || name === 'Edit') && typeof obj.path === 'string') {
        return { summary: obj.path, detail: labels.file };
    }
    if (name === 'read_file' || name === 'read_url_content' || name === 'view_file') {
         if (typeof obj.Url === 'string') return { summary: obj.Url, detail: labels.url };
         if (typeof obj.AbsolutePath === 'string') return { summary: obj.AbsolutePath, detail: labels.path };
    }
    if (name === 'write_to_file' || name === 'replace_file_content' || name === 'multi_replace_file_content') {
        if (typeof obj.TargetFile === 'string') return { summary: obj.TargetFile, detail: labels.target };
    }
    
    // Search
    if (name === 'grep_search' || name === 'find_by_name') {
        if (typeof obj.Query === 'string') return { summary: obj.Query, detail: labels.query };
        if (typeof obj.Pattern === 'string') return { summary: obj.Pattern, detail: labels.pattern };
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
    const { t } = useI18n();
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

    const inputLabels = {
        command: t('Agent.Command'),
        file: t('Agent.File'),
        url: t('Agent.URL'),
        path: t('Agent.Path'),
        target: t('Agent.Target'),
        query: t('Agent.Query'),
        pattern: t('Agent.Pattern'),
    };

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
                    {t('Agent.ToolCalls')}
                    {failedCount > 0 && <span className="list-badge error">{t('Agent.FailedCount', failedCount)}</span>}
                    {pendingCount > 0 && <span className="list-badge warning">{t('Agent.PendingCount', pendingCount)}</span>}
                    {runningCount > 0 && <span className="list-badge info">{t('Agent.RunningCount', runningCount)}</span>}
                </span>
                <span className="tool-count">{completedCount}/{toolCalls.length}</span>
                <span className="expand-icon">{isExpanded ? <CollapseIcon /> : <ExpandIcon />}</span>
            </button>

            {isExpanded && (
                <div className="tool-list-content">
                    {toolCalls.map((tc) => {
                        const { summary, detail } = summarizeToolInput(tc.name, tc.input, inputLabels);
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
                                                    <span>{t('Agent.ApprovalRequired')}</span>
                                                </div>
                                                <div className="approval-buttons">
                                                    <button className="btn-approve" onClick={() => handleConfirm(tc, true)}>
                                                        <CheckIcon /> {t('Agent.Approve')}
                                                    </button>
                                                    <button className="btn-reject" onClick={() => handleConfirm(tc, false)}>
                                                        <StopIcon /> {t('Agent.Reject')}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                        
                                        {tc.input !== undefined && (
                                            <div className="detail-section">
                                                <div className="detail-header">{t('Agent.ToolInput')}</div>
                                                <div className="code-block">
                                                    <pre>{safeStringify(tc.input, true)}</pre>
                                                </div>
                                            </div>
                                        )}
                                        
                                        {tc.result !== undefined && (
                                            <div className="detail-section">
                                                <div className="detail-header">{t('Agent.ToolResult')}</div>
                                                <div className="code-block result">
                                                    <pre>{safeStringify(tc.result, true)}</pre>
                                                </div>
                                            </div>
                                        )}
                                        
                                        {tc.error && (
                                            <div className="detail-section error">
                                                <div className="detail-header">{t('Agent.ToolError')}</div>
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
