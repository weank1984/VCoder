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
import { copyToClipboard } from '../../utils/clipboard';
import {
    parseDiffStats,
    processLines,
    formatDiffLine,
    ESTIMATED_LINE_HEIGHT,
    LARGE_FILE_LINE_THRESHOLD,
    VIRTUAL_SCROLL_THRESHOLD,
} from './diffUtils';
import type { ProcessedLine } from './diffUtils';

interface DiffViewerFullProps {
    filePath: string;
    diff: string;
    onAccept?: () => void;
    onReject?: () => void;
    actionsDisabled?: boolean;
    defaultCollapsed?: boolean;
    onViewFile?: (path: string) => void;
}

export function DiffViewerFull({
    filePath,
    diff,
    onAccept,
    onReject,
    actionsDisabled = false,
    defaultCollapsed = false,
    onViewFile,
}: DiffViewerFullProps) {
    const { t } = useI18n();
    const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
    const [showAllLines, setShowAllLines] = useState(false);

    const stats = useMemo(() => parseDiffStats(diff), [diff]);
    const processedLines = useMemo(() => processLines(diff), [diff]);

    const isLargeFile = processedLines.length > LARGE_FILE_LINE_THRESHOLD;
    const shouldUseVirtualScroll = processedLines.length > VIRTUAL_SCROLL_THRESHOLD;

    const displayLines = useMemo(() => {
        if (isLargeFile && !showAllLines) {
            return processedLines.slice(0, 100);
        }
        return processedLines;
    }, [processedLines, isLargeFile, showAllLines]);

    const virtualList = useVirtualList({
        itemCount: displayLines.length,
        estimatedItemHeight: ESTIMATED_LINE_HEIGHT,
        overscan: 5,
    });

    const isNewFile = useMemo(() => {
        return diff.includes('--- /dev/null') || diff.includes('new file mode');
    }, [diff]);

    const isDeletedFile = useMemo(() => {
        return diff.includes('+++ /dev/null') || diff.includes('deleted file mode');
    }, [diff]);

    const fileTypeLabel = useMemo(() => {
        if (isNewFile) return t('Agent.Created');
        if (isDeletedFile) return t('Agent.Deleted');
        return t('Agent.Edited');
    }, [isNewFile, isDeletedFile, t]);

    const renderDiffLine = useCallback(({ line, lineType, index }: ProcessedLine) => {
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

    return (
        <div className={`diff-viewer ${isCollapsed ? 'collapsed' : ''}`}>
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

            {!isCollapsed && (
                <div className="diff-content">
                    {isLargeFile && !showAllLines && (
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
                        shouldUseVirtualScroll && showAllLines ? (
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
                            <pre className="diff-lines">
                                {displayLines.map(renderDiffLine)}
                            </pre>
                        )
                    ) : (
                        <div className="diff-empty">
                            <span>{t('Agent.FileModified')}</span>
                        </div>
                    )}

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
