import type { ToolCall } from '../../types';
import { useI18n } from '../../i18n/I18nProvider';
import { useState, useCallback, useMemo } from 'react';
import { postMessage } from '../../bridge';
import { parseDiffEnhanced, isDiffLine } from './diffUtils';
import type { EnhancedDiffLine } from './diffUtils';
import { DiffLine } from './DiffLine';

interface FileApprovalContentProps {
    toolCall: ToolCall;
    isDelete: boolean;
}

export function FileApprovalContent({ toolCall, isDelete }: FileApprovalContentProps) {
    const { t } = useI18n();
    const filePath = toolCall.confirmationData?.filePath || '';
    const diff = toolCall.confirmationData?.diff || '';

    const [showFullDiff, setShowFullDiff] = useState(false);

    const handleOpenInEditor = useCallback(() => {
        if (!filePath) return;
        postMessage({
            type: 'openFile',
            path: filePath
        });
    }, [filePath]);

    const handleToggleFullDiff = useCallback(() => {
        setShowFullDiff(prev => !prev);
    }, []);

    if (isDelete) {
        return (
            <div className="approval-content">
                <div className="file-delete-warning">
                    <svg viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
                    </svg>
                    <span>{t('Agent.FileDeleteWarning')}</span>
                </div>
                <div className="file-delete-notice">
                    {t('Agent.FileDeleteIrreversible')}
                </div>
            </div>
        );
    }

    const parsed = useMemo(() => parseDiffEnhanced(diff), [diff]);

    // Only show diff lines (not hunk separators) in approval view
    const diffLines = useMemo(() =>
        parsed.items.filter((item): item is EnhancedDiffLine => isDiffLine(item)),
        [parsed.items]
    );

    const displayLines = showFullDiff ? diffLines : diffLines.slice(0, 20);
    const stats = parsed.stats;

    return (
        <div className="approval-content">
            {diffLines.length > 0 && (
                <div className={`inline-diff ${showFullDiff ? 'is-expanded' : ''}`}>
                    {displayLines.map((line, index) => (
                        <DiffLine
                            key={index}
                            line={line}
                            showLineNumbers={true}
                            showWordDiff={true}
                        />
                    ))}
                    {!showFullDiff && diffLines.length > 20 && (
                        <div className="diff-more" onClick={handleToggleFullDiff}>
                            ... {diffLines.length - 20} more lines
                        </div>
                    )}
                    <div className="diff-stats">
                        <span className="stat-added">{t('Agent.LinesAdded', stats.additions)}</span>
                        {stats.deletions > 0 && <span className="stat-removed">{t('Agent.LinesRemoved', stats.deletions)}</span>}
                        <button className="diff-open-btn" onClick={handleOpenInEditor} disabled={!filePath}>
                            {t('Agent.OpenInEditor')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
