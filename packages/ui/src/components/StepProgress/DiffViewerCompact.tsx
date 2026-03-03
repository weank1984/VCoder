import { useState, useMemo } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import {
    parseDiffStats,
    parseDiffEnhanced,
    isDiffLine,
    LARGE_FILE_LINE_THRESHOLD,
} from './diffUtils';
import type { EnhancedDiffLine } from './diffUtils';
import { DiffLine } from './DiffLine';

interface DiffViewerCompactProps {
    filePath: string;
    diff: string;
    defaultCollapsed?: boolean;
    hideHeader?: boolean;
}

export function DiffViewerCompact({
    filePath,
    diff,
    defaultCollapsed = false,
    hideHeader = false,
}: DiffViewerCompactProps) {
    const { t } = useI18n();
    const [isCollapsed, setIsCollapsed] = useState(hideHeader ? false : defaultCollapsed);
    const [showAllLines] = useState(false);

    const stats = useMemo(() => parseDiffStats(diff), [diff]);
    const basename = filePath.split(/[\\/]/).pop() || filePath;

    const parsed = useMemo(() => parseDiffEnhanced(diff), [diff]);

    // Compact: only show add/remove lines
    const compactItems = useMemo(() => {
        return parsed.items.filter(
            (item): item is EnhancedDiffLine =>
                isDiffLine(item) && (item.type === 'add' || item.type === 'remove')
        );
    }, [parsed.items]);

    const isLargeFile = compactItems.length > LARGE_FILE_LINE_THRESHOLD;

    const displayItems = useMemo(() => {
        if (isLargeFile && !showAllLines) {
            return compactItems.slice(0, 100);
        }
        return compactItems;
    }, [compactItems, isLargeFile, showAllLines]);

    return (
        <div className={`diff-viewer ${isCollapsed ? 'collapsed' : ''} diff-viewer--compact ${hideHeader ? 'no-header' : ''}`}>
            {!hideHeader && (
                <div className="diff-header" onClick={() => setIsCollapsed(!isCollapsed)}>
                    <span className="diff-compact-chevron">
                        {isCollapsed ? '\u25B8' : '\u25BE'}
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
            )}

            {!isCollapsed && (
                <div className="diff-content">
                    {diff && displayItems.length > 0 ? (
                        <div className="diff-lines">
                            {displayItems.map((item, index) => (
                                <DiffLine
                                    key={index}
                                    line={item}
                                    showLineNumbers={true}
                                    showWordDiff={true}
                                />
                            ))}
                        </div>
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
