/**
 * Step Entry Component
 * Displays a single tool call entry within a step
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
} from '../Icon';

interface StepEntryProps {
    entry: StepEntryType;
    onViewFile?: (path: string, lineRange?: [number, number]) => void;
    onConfirm?: (tc: ToolCall, approve: boolean) => void;
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

function safeStringify(value: unknown, pretty: boolean): string {
    if (value === undefined) return '';
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value, null, pretty ? 2 : 0);
    } catch {
        return String(value);
    }
}

export function StepEntry({ entry, onViewFile, onConfirm }: StepEntryProps) {
    const { t } = useI18n();
    const [isExpanded, setIsExpanded] = useState(false);
    
    const tc = entry.toolCall;
    const isPending = tc.status === 'pending';
    
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
    
    return (
        <div className={`step-entry ${entry.status}`}>
            <div className="entry-summary" onClick={() => setIsExpanded(!isExpanded)}>
                <span className="entry-icon">{getEntryIcon(entry.type)}</span>
                <span className="entry-action">{actionText}</span>
                <span className="entry-target" title={entry.target.fullPath}>
                    {entry.target.name}
                    {entry.target.lineRange && (
                        <span className="entry-line-range">
                            {formatLineRange(entry.target.lineRange)}
                        </span>
                    )}
                </span>
                <span className={`entry-status-icon ${entry.status}`}>
                    {statusIcon}
                </span>
                {entry.target.fullPath && entry.type === 'file' && (
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
            
            {isExpanded && (
                <div className="entry-details">
                    {isPending && (
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
}
