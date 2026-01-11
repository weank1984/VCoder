/**
 * Diff Viewer Component
 * Enhanced diff display with accept/reject actions and detailed stats
 */

import { useState, useMemo } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { 
    CheckIcon, 
    StopIcon, 
    ExpandIcon, 
    CollapseIcon,
    FileIcon,
    CopyIcon,
    EditorIcon,
} from '../Icon';
import { FilePath } from '../FilePath';

interface DiffViewerProps {
    /** File path being modified */
    filePath: string;
    /** Diff content (unified diff format) */
    diff: string;
    /** Full file content after changes (optional) */
    newContent?: string;
    /** Accept callback */
    onAccept?: () => void;
    /** Reject callback */
    onReject?: () => void;
    /** Whether actions are disabled (e.g., already decided) */
    actionsDisabled?: boolean;
    /** Default collapsed state */
    defaultCollapsed?: boolean;
    /** View file callback */
    onViewFile?: (path: string) => void;
}

interface DiffStats {
    additions: number;
    deletions: number;
    changes: number;
    totalLines: number;
}

/**
 * Parse unified diff to extract statistics
 */
function parseDiffStats(diff: string): DiffStats {
    const lines = diff.split('\n');
    let additions = 0;
    let deletions = 0;
    
    for (const line of lines) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
            additions++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
            deletions++;
        }
    }
    
    return {
        additions,
        deletions,
        changes: additions + deletions,
        totalLines: lines.length,
    };
}

/**
 * Classify diff line type
 */
function getDiffLineType(line: string): 'add' | 'remove' | 'chunk' | 'meta' | 'context' {
    if (line.startsWith('+++') || line.startsWith('---')) return 'meta';
    if (line.startsWith('+')) return 'add';
    if (line.startsWith('-')) return 'remove';
    if (line.startsWith('@@')) return 'chunk';
    return 'context';
}

/**
 * Copy to clipboard helper
 */
function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).catch(err => {
        console.error('Failed to copy:', err);
    });
}

export function DiffViewer({
    filePath,
    diff,
    newContent,
    onAccept,
    onReject,
    actionsDisabled = false,
    defaultCollapsed = false,
    onViewFile,
}: DiffViewerProps) {
    const { t } = useI18n();
    const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
    const [showFullContent, setShowFullContent] = useState(false);
    
    // Parse diff stats
    const stats = useMemo(() => parseDiffStats(diff), [diff]);
    
    // Split diff into lines for rendering
    const diffLines = useMemo(() => diff.split('\n'), [diff]);
    
    // Determine if this is a new file creation
    const isNewFile = useMemo(() => {
        return diff.includes('--- /dev/null') || diff.includes('new file mode');
    }, [diff]);
    
    // Determine if this is a file deletion
    const isDeletedFile = useMemo(() => {
        return diff.includes('+++ /dev/null') || diff.includes('deleted file mode');
    }, [diff]);
    
    // Get file type label
    const fileTypeLabel = useMemo(() => {
        if (isNewFile) return t('Agent.Created');
        if (isDeletedFile) return t('Agent.Deleted');
        return t('Agent.Edited');
    }, [isNewFile, isDeletedFile, t]);
    
    return (
        <div className={`diff-viewer ${isCollapsed ? 'collapsed' : ''}`}>
            {/* Diff Header */}
            <div className="diff-header" onClick={() => setIsCollapsed(!isCollapsed)}>
                <span className="diff-icon">
                    <FileIcon />
                </span>
                <div className="diff-info">
                    <div className="diff-file-path">
                        <FilePath path={filePath} variant="compact" />
                    </div>
                    <div className="diff-stats">
                        <span className="diff-type-label">{fileTypeLabel}</span>
                        {stats.additions > 0 && (
                            <span className="diff-stat additions">
                                +{stats.additions}
                            </span>
                        )}
                        {stats.deletions > 0 && (
                            <span className="diff-stat deletions">
                                -{stats.deletions}
                            </span>
                        )}
                        {stats.changes > 0 && (
                            <span className="diff-stat-summary">
                                {t('Agent.LinesChanged', [stats.changes])}
                            </span>
                        )}
                    </div>
                </div>
                <div className="diff-actions-header">
                    {!actionsDisabled && onAccept && onReject && (
                        <>
                            <button
                                className="diff-accept-btn"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onAccept();
                                }}
                                title={t('Agent.AcceptChanges')}
                            >
                                <CheckIcon />
                                <span>{t('Agent.AcceptChanges')}</span>
                            </button>
                            <button
                                className="diff-reject-btn"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onReject();
                                }}
                                title={t('Agent.RejectChanges')}
                            >
                                <StopIcon />
                                <span>{t('Agent.Reject')}</span>
                            </button>
                        </>
                    )}
                    {onViewFile && (
                        <button
                            className="diff-view-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                onViewFile(filePath);
                            }}
                            title={t('Agent.OpenInEditor')}
                        >
                            <EditorIcon />
                        </button>
                    )}
                    <button
                        className="diff-copy-btn"
                        onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(diff);
                        }}
                        title={t('Agent.CopyCode')}
                    >
                        <CopyIcon />
                    </button>
                    <span className="diff-collapse-icon">
                        {isCollapsed ? <ExpandIcon /> : <CollapseIcon />}
                    </span>
                </div>
            </div>
            
            {/* Diff Content */}
            {!isCollapsed && (
                <div className="diff-content">
                    {/* Tabs for Diff vs Full Content */}
                    {newContent && (
                        <div className="diff-tabs">
                            <button
                                className={`diff-tab ${!showFullContent ? 'active' : ''}`}
                                onClick={() => setShowFullContent(false)}
                            >
                                {t('Agent.ViewFullDiff')}
                            </button>
                            <button
                                className={`diff-tab ${showFullContent ? 'active' : ''}`}
                                onClick={() => setShowFullContent(true)}
                            >
                                Full Content
                            </button>
                        </div>
                    )}
                    
                    {/* Diff View */}
                    {!showFullContent && (
                        <pre className="diff-lines">
                            {diffLines.map((line, i) => {
                                const lineType = getDiffLineType(line);
                                return (
                                    <div 
                                        key={i} 
                                        className={`diff-line diff-line-${lineType}`}
                                        data-line={i + 1}
                                    >
                                        {line}
                                    </div>
                                );
                            })}
                        </pre>
                    )}
                    
                    {/* Full Content View */}
                    {showFullContent && newContent && (
                        <pre className="diff-full-content">
                            {newContent}
                        </pre>
                    )}
                    
                    {/* Action Buttons at Bottom */}
                    {!actionsDisabled && onAccept && onReject && (
                        <div className="diff-actions-footer">
                            <button
                                className="diff-accept-btn primary"
                                onClick={onAccept}
                            >
                                <CheckIcon />
                                <span>{t('Agent.AcceptChanges')}</span>
                            </button>
                            <button
                                className="diff-reject-btn secondary"
                                onClick={onReject}
                            >
                                <StopIcon />
                                <span>{t('Agent.Reject')}</span>
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
