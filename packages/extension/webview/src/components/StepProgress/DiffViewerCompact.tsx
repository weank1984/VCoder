import { useState, useMemo, useCallback } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import {
    parseDiffStats,
    processLines,
    formatDiffLine,
    ESTIMATED_LINE_HEIGHT,
    LARGE_FILE_LINE_THRESHOLD,
} from './diffUtils';
import type { ProcessedLine } from './diffUtils';

interface DiffViewerCompactProps {
    filePath: string;
    diff: string;
    defaultCollapsed?: boolean;
}

export function DiffViewerCompact({
    filePath,
    diff,
    defaultCollapsed = false,
}: DiffViewerCompactProps) {
    const { t } = useI18n();
    const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
    const [showAllLines] = useState(false);

    const stats = useMemo(() => parseDiffStats(diff), [diff]);
    const basename = filePath.split(/[\\/]/).pop() || filePath;

    const processedLines = useMemo(() => processLines(diff), [diff]);

    const compactLines = useMemo(() => {
        return processedLines.filter(
            ({ lineType }) => lineType === 'add' || lineType === 'remove' || lineType === 'chunk'
        );
    }, [processedLines]);

    const isLargeFile = compactLines.length > LARGE_FILE_LINE_THRESHOLD;

    const displayLines = useMemo(() => {
        if (isLargeFile && !showAllLines) {
            return compactLines.slice(0, 100);
        }
        return compactLines;
    }, [compactLines, isLargeFile, showAllLines]);

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
        <div className={`diff-viewer ${isCollapsed ? 'collapsed' : ''} diff-viewer--compact`}>
            <div className="diff-header" onClick={() => setIsCollapsed(!isCollapsed)}>
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
            </div>

            {!isCollapsed && (
                <div className="diff-content">
                    {diff && displayLines.length > 0 ? (
                        <pre className="diff-lines">
                            {displayLines.map(renderDiffLine)}
                        </pre>
                    ) : (
                        <div className="diff-empty">
                            <span>{t('Agent.FileModified')}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
