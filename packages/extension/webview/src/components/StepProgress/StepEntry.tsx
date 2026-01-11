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
import { TerminalOutput } from './TerminalOutput';
import { DiffViewer } from './DiffViewer';
import { McpToolDisplay } from './McpToolDisplay';

interface StepEntryProps {
    entry: StepEntryType;
    onViewFile?: (path: string, lineRange?: [number, number]) => void;
    onConfirm?: (tc: ToolCall, approve: boolean, options?: { trustAlways?: boolean; editedContent?: string }) => void;
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
    
    // Check if this is a terminal/Bash tool
    const isTerminalTool = tc.name === 'Bash' || 
                           tc.name === 'BashOutput' || 
                           tc.name === 'run_command' ||
                           tc.name === 'mcp__acp__BashOutput' ||
                           tc.name.includes('terminal');
    
    // Check if this is a file editing tool
    const isFileEditTool = tc.name === 'Write' ||
                           tc.name === 'Edit' ||
                           tc.name === 'StrReplace' ||
                           tc.name === 'MultiEdit' ||
                           tc.name === 'mcp__acp__Write' ||
                           tc.name === 'mcp__acp__Edit';
    
    // Extract terminal data from tool input/result
    const terminalData = useMemo(() => {
        if (!isTerminalTool) return null;
        
        const input = tc.input as any;
        const result = tc.result as any;
        
        return {
            command: input?.command || input?.cmd || '',
            cwd: input?.cwd || input?.working_dir || '',
            output: typeof result === 'string' ? result : (result?.output || result?.stdout || ''),
            exitCode: result?.exitCode ?? result?.exit_code,
            signal: result?.signal,
            terminalId: result?.terminalId ?? result?.terminal_id,
            isRunning: tc.status === 'running',
        };
    }, [isTerminalTool, tc.input, tc.result, tc.status]);
    
    // Extract diff data from file editing tools
    const diffData = useMemo(() => {
        if (!isFileEditTool) return null;
        
        const input = tc.input as any;
        const result = tc.result as any;
        
        // Try to extract file path
        const filePath = input?.path || input?.file_path || input?.file || entry.target.fullPath || '';
        
        // Try to extract diff
        let diff = '';
        if (typeof result === 'string' && result.includes('@@')) {
            diff = result;
        } else if (result?.diff) {
            diff = result.diff;
        } else if (input?.diff) {
            diff = input.diff;
        }
        
        // Try to extract new content
        const newContent = input?.contents || input?.content || input?.new_string || '';
        
        return {
            filePath,
            diff,
            newContent,
            hasChanges: diff.length > 0 || newContent.length > 0,
        };
    }, [isFileEditTool, tc.input, tc.result, entry.target.fullPath]);

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
    
    // Skip specialized MCP tools that are handled elsewhere (terminal, file editing)
    const isMcpGenericTool = isMcp && !isTerminalTool && !isFileEditTool;
    
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
                            onApprove={(options) => onConfirm(tc, true, options)}
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
                    
                    {/* Terminal Output - specialized rendering for Bash/terminal tools */}
                    {isTerminalTool && terminalData && terminalData.output && (
                        <TerminalOutput
                            command={terminalData.command}
                            cwd={terminalData.cwd}
                            output={terminalData.output}
                            exitCode={terminalData.exitCode}
                            signal={terminalData.signal}
                            isRunning={terminalData.isRunning}
                            terminalId={terminalData.terminalId}
                            defaultCollapsed={false}
                        />
                    )}
                    
                    {/* Diff Viewer - specialized rendering for file editing tools */}
                    {isFileEditTool && diffData && diffData.hasChanges && (
                        <DiffViewer
                            filePath={diffData.filePath}
                            diff={diffData.diff}
                            newContent={diffData.newContent}
                            onAccept={onConfirm ? () => onConfirm(tc, true) : undefined}
                            onReject={onConfirm ? () => onConfirm(tc, false) : undefined}
                            actionsDisabled={tc.status !== 'awaiting_confirmation'}
                            defaultCollapsed={false}
                            onViewFile={onViewFile ? (path) => onViewFile(path) : undefined}
                        />
                    )}
                    
                    {/* MCP Tool Display - enhanced display for generic MCP tools */}
                    {isMcpGenericTool && (
                        <McpToolDisplay
                            toolName={tc.name}
                            input={tc.input}
                            result={tc.result}
                            status={tc.status === 'completed' ? 'completed' : 
                                    tc.status === 'failed' ? 'failed' :
                                    tc.status === 'running' ? 'running' : 'pending'}
                            error={tc.error}
                            defaultCollapsed={false}
                        />
                    )}
                    
                    {/* Tool Result - using enhanced display with action buttons */}
                    {/* Skip rendering if we already showed terminal output, diff, or MCP tool */}
                    {tc.result !== undefined && !isTerminalTool && !isFileEditTool && !isMcpGenericTool && (
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
