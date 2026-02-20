/**
 * Diff Viewer Component
 * Enhanced diff display with accept/reject actions and detailed stats
 */

import { useState, useMemo, useCallback } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { useVirtualList } from '../../hooks/useVirtualList';
import {
    CheckIcon,
    StopIcon,
    ExpandIcon,
    CollapseIcon,
    FileIcon,
    CopyIcon,
    EditorIcon,
    WarningIcon,
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
    /** Display variant: 'full' = all features, 'compact' = inline card without actions */
    variant?: 'full' | 'compact';
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

// Large file thresholds
const LARGE_FILE_LINE_THRESHOLD = 1000; // Show warning for files > 1000 lines
const VIRTUAL_SCROLL_THRESHOLD = 500;   // Use virtual scrolling for files > 500 lines
const ESTIMATED_LINE_HEIGHT = 20;       // Estimated height per diff line in pixels

export function DiffViewer({
    filePath,
    diff,
    onAccept,
    onReject,
    actionsDisabled = false,
    defaultCollapsed = false,
    onViewFile,
    variant = 'full',
}: DiffViewerProps) {
    const { t } = useI18n();
    const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
    const [showAllLines, setShowAllLines] = useState(false); // Toggle for large files

    // Parse diff stats
    const stats = useMemo(() => parseDiffStats(diff), [diff]);

    // Split diff into lines for rendering and filter metadata
    const processedLines = useMemo(() => {
        return diff.split('\n')
            .map((rawLine, i) => {
                const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
                const lineType = getDiffLineType(line);
                return { line, lineType, index: i };
            })
            .filter(({ lineType }) => lineType !== 'meta'); // Hide metadata lines
    }, [diff]);

    // Check if this is a large file
    const isLargeFile = processedLines.length > LARGE_FILE_LINE_THRESHOLD;
    const shouldUseVirtualScroll = processedLines.length > VIRTUAL_SCROLL_THRESHOLD;

    // For compact variant, filter out context lines to show only changes
    const compactLines = useMemo(() => {
        if (variant !== 'compact') return processedLines;
        return processedLines.filter(({ lineType }) => lineType === 'add' || lineType === 'remove' || lineType === 'chunk');
    }, [processedLines, variant]);

    // For large files, show warning if not expanded
    const displayLines = useMemo(() => {
        const source = variant === 'compact' ? compactLines : processedLines;
        if (isLargeFile && !showAllLines) {
            // Show first 100 lines only
            return source.slice(0, 100);
        }
        return source;
    }, [processedLines, compactLines, isLargeFile, showAllLines, variant]);

    // Virtual scroll setup
    const virtualList = useVirtualList({
        itemCount: displayLines.length,
        estimatedItemHeight: ESTIMATED_LINE_HEIGHT,
        overscan: 5,
    });

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

    // Render diff line helper
    const renderDiffLine = useCallback(({ line, lineType, index }: { line: string; lineType: string; index: number }) => {
        const displayLine = formatDiffLine(line, lineType);
        return (
            <div
                key={index}
                className={`diff-line diff-line-${lineType}`}
                style={{ height: `${ESTIMATED_LINE_HEIGHT}px` }}
            >
                {displayLine || ' '}
            </div>
        );
    }, []);
    
    const isCompact = variant === 'compact';
    const basename = filePath.split(/[\\/]/).pop() || filePath;

    return (
        <div className={`diff-viewer ${isCollapsed ? 'collapsed' : ''} ${isCompact ? 'diff-viewer--compact' : ''}`}>
            {/* Diff Header */}
            <div className="diff-header" onClick={() => setIsCollapsed(!isCollapsed)}>
                {isCompact ? (
                    /* Compact header: "> filename  +N -M" */
                    <>
                        <span className="diff-compact-chevron">
                            {isCollapsed ? '▸' : '▾'}
                        </span>
                        <span className="diff-compact-filename" title={filePath}>
                            {basename}
                        </span>
                        <div className="diff-stats">
                            {stats.additions > 0 && (
                                <span className="diff-stat additions">+{stats.additions}</span>
                            )}
                            {stats.deletions > 0 && (
                                <span className="diff-stat deletions">-{stats.deletions}</span>
                            )}
                        </div>
                    </>
                ) : (
                    /* Full header with icon, path, stats, and action buttons */
                    <>
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
                    </>
                )}
            </div>

            {/* Diff Content */}
            {!isCollapsed && (
                <div className="diff-content">
                    {/* Large file warning (full mode only) */}
                    {!isCompact && isLargeFile && !showAllLines && (
                        <div className="diff-large-file-warning">
                            <WarningIcon />
                            <span>
                                Large diff ({processedLines.length} lines) - Showing first 100 lines
                            </span>
                            <button
                                className="diff-show-all-btn"
                                onClick={() => setShowAllLines(true)}
                            >
                                Show All Lines
                            </button>
                        </div>
                    )}

                    {diff && displayLines.length > 0 ? (
                        shouldUseVirtualScroll && showAllLines && !isCompact ? (
                            // Virtual scrolling for large files (full mode only)
                            <div
                                ref={virtualList.containerRef}
                                className="diff-lines diff-lines--virtual"
                                onScroll={virtualList.onScroll}
                                style={{ height: '400px', overflow: 'auto' }}
                            >
                                <div style={{ height: `${virtualList.totalHeight}px`, position: 'relative' }}>
                                    <div style={{ transform: `translateY(${virtualList.range.topPadding}px)` }}>
                                        {displayLines
                                            .slice(virtualList.range.start, virtualList.range.end)
                                            .map((item, idx) => {
                                                const actualIndex = virtualList.range.start + idx;
                                                return renderDiffLine({ ...item, index: actualIndex });
                                            })}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            // Standard rendering for smaller files or preview
                            <pre className="diff-lines">
                                {displayLines.map(renderDiffLine)}
                            </pre>
                        )
                    ) : (
                        <div className="diff-empty">
                            <span>{t('Agent.FileModified')}</span>
                        </div>
                    )}

                    {/* Action Buttons at Bottom (full mode only) */}
                    {!isCompact && !actionsDisabled && onAccept && onReject && (
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
