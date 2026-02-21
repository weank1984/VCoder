import type { ToolCall } from '../../types';
import { useI18n } from '../../i18n/I18nProvider';
import { useState, useCallback } from 'react';
import { postMessage } from '../../bridge';

interface FileApprovalContentProps {
    toolCall: ToolCall;
    isDelete: boolean;
}

export function FileApprovalContent({ toolCall, isDelete }: FileApprovalContentProps) {
    const { t } = useI18n();
    const filePath = toolCall.confirmationData?.filePath || '';
    const diff = toolCall.confirmationData?.diff || '';

    const [showFullDiff, setShowFullDiff] = useState(false);

    // Open file in VSCode editor
    const handleOpenInEditor = useCallback(() => {
        if (!filePath) return;
        postMessage({
            type: 'openFile',
            path: filePath
        });
    }, [filePath]);

    // Toggle full diff view
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
                
                <div className="file-info-row">
                    <svg viewBox="0 0 16 16" fill="currentColor">
                        <path d="M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H4zm0 1h8a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z" />
                    </svg>
                    <span className="file-path">{filePath}</span>
                </div>
                
                <div className="file-delete-notice">
                    {t('Agent.FileDeleteIrreversible')}
                </div>
            </div>
        );
    }
    
    // File write/edit
    const parsedDiff = parseDiff(diff);
    const stats = calculateDiffStats(parsedDiff);
    
    return (
        <div className="approval-content">
            <div className="file-info-row">
                <svg viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H4zm0 1h8a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z" />
                </svg>
                <span className="file-path">{filePath}</span>
            </div>
            
            {/* Quick actions */}
            <div className="quick-actions">
                <button
                    onClick={handleToggleFullDiff}
                    disabled={parsedDiff.length === 0}
                    className={showFullDiff ? 'is-active' : ''}
                >
                    {showFullDiff ? t('Agent.ViewCompactDiff') : t('Agent.ViewFullDiff')}
                </button>
                <button onClick={handleOpenInEditor} disabled={!filePath}>
                    {t('Agent.OpenInEditor')}
                </button>
            </div>

            {/* Inline diff preview */}
            {parsedDiff.length > 0 && (
                <div className={`inline-diff ${showFullDiff ? 'is-expanded' : ''}`}>
                    {(showFullDiff ? parsedDiff : parsedDiff.slice(0, 20)).map((line, index) => (
                        <div key={index} className={`diff-line ${line.type}`}>
                            {line.content}
                        </div>
                    ))}
                    {!showFullDiff && parsedDiff.length > 20 && (
                        <div className="diff-line diff-context">
                            ... {parsedDiff.length - 20} more lines ...
                        </div>
                    )}
                    <div className="diff-stats">
                        {t('Agent.LinesAdded', stats.added)} / {t('Agent.LinesRemoved', stats.removed)}
                    </div>
                </div>
            )}
        </div>
    );
}

interface DiffLine {
    type: 'diff-add' | 'diff-remove' | 'diff-context';
    content: string;
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
        line.startsWith('---') ||
        line.startsWith('@@')
    );
}

/**
 * Strip the +/- prefix from diff lines for cleaner display
 */
function formatDiffContent(line: string, type: string): string {
    if (type === 'diff-add' || type === 'diff-remove') {
        return line.slice(1); // Remove + or - prefix
    }
    if (type === 'diff-context' && line.startsWith(' ')) {
        return line.slice(1); // Remove leading space for context lines
    }
    return line;
}

function parseDiff(diff: string): DiffLine[] {
    if (!diff) return [];
    
    const lines = diff.split('\n');
    return lines
        .filter(line => !isMetaLine(line)) // Filter out metadata lines
        .map(line => {
            if (line.startsWith('+')) {
                return { type: 'diff-add' as const, content: formatDiffContent(line, 'diff-add') };
            } else if (line.startsWith('-')) {
                return { type: 'diff-remove' as const, content: formatDiffContent(line, 'diff-remove') };
            } else {
                return { type: 'diff-context' as const, content: formatDiffContent(line, 'diff-context') };
            }
        })
        .filter(line => line.content.trim() !== '' || line.type !== 'diff-context'); // Remove empty context lines
}

function calculateDiffStats(lines: DiffLine[]): { added: number; removed: number } {
    return lines.reduce(
        (stats, line) => {
            if (line.type === 'diff-add') stats.added++;
            if (line.type === 'diff-remove') stats.removed++;
            return stats;
        },
        { added: 0, removed: 0 }
    );
}
