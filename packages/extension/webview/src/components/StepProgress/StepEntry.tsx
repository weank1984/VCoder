/**
 * Step Entry Component
 * Displays a single tool call entry within a step
 * Supports specialized rendering for different tool types
 */

import { useMemo, useState } from 'react';
import type { StepEntry as StepEntryType } from '../../utils/stepAggregator';
import type { ToolCall } from '../../types';
import { useI18n } from '../../i18n/I18nProvider';
import { 
    FileIcon, 
    TerminalIcon, 
    SearchIcon, 
    WebIcon,
    PlayIcon,
    CheckIcon,
    ErrorIcon,
    LoadingIcon,
    ExpandIcon,
    CollapseIcon,
    InfoIcon,
    StopIcon,
    RocketIcon,
    ListCheckIcon,
    McpIcon,
    NotebookIcon,
    CopyIcon,
    EditorIcon,
} from '../Icon';
import { ToolResultDisplay } from './ToolResultDisplay';
import { SmartToolInput } from './SmartToolInput';
import { TodoWriteEntry } from './TodoWriteEntry';
import { TaskEntry } from './TaskEntry';
import { ApprovalUI } from './ApprovalUI';

interface StepEntryProps {
    entry: StepEntryType;
    onViewFile?: (path: string, lineRange?: [number, number]) => void;
    onConfirm?: (tc: ToolCall, approve: boolean) => void;
    /** Hide the summary line (for single-entry steps to avoid duplication) */
    hideSummary?: boolean;
}

/**
 * Get icon based on entry type
 */
function getEntryIcon(type: StepEntryType['type']) {
    switch (type) {
        case 'file': return <FileIcon />;
        case 'command': return <TerminalIcon />;
        case 'search': return <SearchIcon />;
        case 'browser': return <WebIcon />;
        case 'task': return <RocketIcon />;
        case 'plan': return <ListCheckIcon />;
        case 'mcp': return <McpIcon />;
        case 'notebook': return <NotebookIcon />;
        default: return <PlayIcon />;
    }
}

/**
 * Format line range for display
 */
function formatLineRange(lineRange?: [number, number]): string {
    if (!lineRange) return '';
    const [start, end] = lineRange;
    if (start === end) return `:L${start}`;
    return `:L${start}-${end}`;
}

/**
 * Map entry status to task entry status
 */
function mapEntryStatus(status: StepEntryType['status']): 'pending' | 'running' | 'success' | 'error' {
    switch (status) {
        case 'success': return 'success';
        case 'error': return 'error';
        case 'running': return 'running';
        case 'pending': return 'pending';
        default: return 'pending';
    }
}

/**
 * Safe JSON stringify for copying
 */
function safeStringify(value: unknown): string {
    if (value === undefined) return '';
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

/**
 * Copy to clipboard helper
 */
function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).catch(err => {
        console.error('Failed to copy:', err);
    });
}

export function StepEntry({ entry, onViewFile, onConfirm, hideSummary = false }: StepEntryProps) {
    const { t } = useI18n();
    // Auto-expand if hideSummary is true (single entry mode)
    const [isExpanded, setIsExpanded] = useState(hideSummary);
    
    const tc = entry.toolCall;
    const isPending = tc.status === 'pending';
    const isCommandPending = isPending && (tc.name === 'Bash' || tc.name === 'run_command');
    const isAwaitingConfirmation = tc.status === 'awaiting_confirmation';

    // Get localized action text
    const actionText = useMemo(() => {
        // actionKey is like 'StepProgress.Analyzed'
        const key = entry.actionKey;
        return t(key);
    }, [entry.actionKey, t]);
    
    // Status icon
    const statusIcon = useMemo(() => {
        switch (entry.status) {
            case 'success': return <CheckIcon />;
            case 'error': return <ErrorIcon />;
            case 'running':
            case 'pending': return <LoadingIcon />;
            default: return null;
        }
    }, [entry.status]);
    
    // Check if it's an MCP tool
    const isMcp = tc.name.startsWith('mcp__');
    const mcpInfo = useMemo(() => {
        if (!isMcp) return null;
        const parts = tc.name.split('__');
        return {
            server: parts[1] || 'unknown',
            tool: parts.slice(2).join('__') || tc.name,
        };
    }, [tc.name, isMcp]);
    
    // Specialized rendering for certain tool types
    // TodoWrite - show as task list
    if (tc.name === 'TodoWrite') {
        return (
            <TodoWriteEntry 
                input={tc.input} 
                isExpanded={isExpanded}
                onToggle={() => setIsExpanded(!isExpanded)}
            />
        );
    }
    
    // Task (subagent) - show with special styling
    if (tc.name === 'Task') {
        return (
            <TaskEntry 
                toolCall={tc}
                status={mapEntryStatus(entry.status)}
            />
        );
    }
    
    // Handle view button click
    const handleView = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (entry.target.fullPath && onViewFile) {
            onViewFile(entry.target.fullPath, entry.target.lineRange);
        }
    };
    
    // Handle confirm/reject
    const handleConfirm = (approve: boolean) => (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onConfirm) {
            onConfirm(tc, approve);
        }
    };
    
    // Check if we should show View button
    const showViewBtn = entry.target.fullPath && (
        entry.type === 'file' || 
        entry.type === 'notebook'
    );
    
    return (
        <div className={`step-entry ${entry.status} ${entry.type} ${hideSummary ? 'summary-hidden' : ''}`}>
            {!hideSummary && (
                <div className="entry-summary" onClick={() => setIsExpanded(!isExpanded)}>
                    <span className="entry-icon">{getEntryIcon(entry.type)}</span>
                    <span className="entry-action">{actionText}</span>
                    <span className="entry-target" title={entry.target.fullPath}>
                        {isMcp && mcpInfo && (
                            <span className="mcp-badge" title={`MCP: ${mcpInfo.server}`}>
                                [{mcpInfo.server}]
                            </span>
                        )}
                        {entry.target.name}
                        {entry.target.lineRange && (
                            <span className="entry-line-range">
                                {formatLineRange(entry.target.lineRange)}
                            </span>
                        )}
                    </span>
                    <span 
                        className={`entry-status-icon ${entry.status}`}
                        title={tc.error || undefined}
                    >
                        {statusIcon}
                    </span>
                    {showViewBtn && (
                        <button 
                            className="entry-view-btn"
                            onClick={handleView}
                            title={t('StepProgress.View')}
                        >
                            {t('StepProgress.View')}
                        </button>
                    )}
                    <span className="entry-expand-icon">
                        {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
                    </span>
                </div>
            )}
            
            {(isExpanded || hideSummary) && (
                <div className="entry-details">
                    {/* New Approval UI for awaiting confirmation */}
                    {isAwaitingConfirmation && onConfirm && (
                        <ApprovalUI 
                            toolCall={tc}
                            onApprove={() => onConfirm(tc, true)}
                            onReject={() => onConfirm(tc, false)}
                        />
                    )}
                    
                    {/* Legacy approval UI for pending bash commands (backward compatibility) */}
                    {!isAwaitingConfirmation && isCommandPending && onConfirm && (
                        <div className="entry-approval">
                            <div className="approval-message">
                                <InfoIcon />
                                <span>{t('Agent.ApprovalRequired')}</span>
                            </div>
                            <div className="approval-buttons">
                                <button className="btn-approve" onClick={handleConfirm(true)}>
                                    <CheckIcon /> {t('Agent.Approve')}
                                </button>
                                <button className="btn-reject" onClick={handleConfirm(false)}>
                                    <StopIcon /> {t('Agent.Reject')}
                                </button>
                            </div>
                        </div>
                    )}
                    
                    {/* Tool Input - using smart display */}
                    {tc.input !== undefined && (
                        <div className="detail-section input">
                            <div className="detail-header">{t('Agent.ToolInput')}</div>
                            <div className="detail-content">
                                <SmartToolInput input={tc.input} toolName={tc.name} />
                            </div>
                        </div>
                    )}
                    
                    {/* Tool Result - using enhanced display with action buttons */}
                    {tc.result !== undefined && (
                        <div className="detail-section result">
                            <div className="detail-header">
                                <span>{t('Agent.ToolResult')}</span>
                                <div className="header-actions">
                                    <button 
                                        className="action-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            copyToClipboard(safeStringify(tc.result));
                                        }}
                                        title="复制内容"
                                    >
                                        <CopyIcon />
                                    </button>
                                    {entry.target.fullPath && (
                                        <button 
                                            className="action-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (onViewFile) {
                                                    onViewFile(entry.target.fullPath!, entry.target.lineRange);
                                                }
                                            }}
                                            title="在编辑器中打开"
                                        >
                                            <EditorIcon />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="detail-content">
                                <ToolResultDisplay result={tc.result} toolName={tc.name} />
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
