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
 * Check if line is metadata that should be hidden
 */
function isMetaLine(line: string): boolean {
    return (
        line.startsWith('diff --git') ||
        line.startsWith('index ') ||
        line.startsWith('new file mode') ||
        line.startsWith('deleted file mode') ||
        line.startsWith('similarity index') ||
        line.startsWith('rename from') ||
        line.startsWith('rename to') ||
        line.startsWith('\\ No newline at end of file') ||
        line.startsWith('+++') ||
        line.startsWith('---')
    );
}

/**
 * Classify diff line type
 */
function getDiffLineType(line: string): 'add' | 'remove' | 'chunk' | 'meta' | 'context' {
    if (isMetaLine(line)) return 'meta';
    if (line.startsWith('+')) return 'add';
    if (line.startsWith('-')) return 'remove';
    if (line.startsWith('@@')) return 'chunk';
    return 'context';
}

/**
 * Strip the +/- prefix from diff lines for cleaner display
 */
function formatDiffLine(line: string, lineType: string): string {
    if (lineType === 'add' || lineType === 'remove') {
        return line.slice(1); // Remove + or - prefix
    }
    if (lineType === 'context' && line.startsWith(' ')) {
        return line.slice(1); // Remove leading space for context lines
    }
    return line;
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
    onAccept,
    onReject,
    actionsDisabled = false,
    defaultCollapsed = false,
    onViewFile,
}: DiffViewerProps) {
    const { t } = useI18n();
    const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
    
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
                                <span>{t('Agent.RejectChanges')}</span>
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
                    {diff && diffLines.length > 0 ? (
                        <pre className="diff-lines">
                            {diffLines
                                .map((rawLine, i) => {
                                    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
                                    const lineType = getDiffLineType(line);
                                    return { line, lineType, index: i };
                                })
                                .filter(({ lineType }) => lineType !== 'meta') // Hide metadata lines
                                .map(({ line, lineType, index }) => {
                                    const displayLine = formatDiffLine(line, lineType);
                                    return (
                                        <div
                                            key={index}
                                            className={`diff-line diff-line-${lineType}`}
                                        >
                                            {displayLine || ' '}
                                        </div>
                                    );
                                })}
                        </pre>
                    ) : (
                        <div className="diff-empty">
                            <span>{t('Agent.FileModified')}</span>
                        </div>
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
                                <span>{t('Agent.RejectChanges')}</span>
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
