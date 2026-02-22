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

    const parsedDiff = parseDiff(diff);
    const stats = calculateDiffStats(parsedDiff);
    const displayLines = showFullDiff ? parsedDiff : parsedDiff.slice(0, 20);

    return (
        <div className="approval-content">
            {parsedDiff.length > 0 && (
                <div className={`inline-diff ${showFullDiff ? 'is-expanded' : ''}`}>
                    {displayLines.map((line, index) => (
                        <div key={index} className={`diff-line ${line.type}`}>
                            <span className="line-num">{line.lineNum}</span>
                            <span className="line-prefix">{line.prefix}</span>
                            <span className="line-content">{line.content}</span>
                        </div>
                    ))}
                    {!showFullDiff && parsedDiff.length > 20 && (
                        <div className="diff-more" onClick={handleToggleFullDiff}>
                            ... {parsedDiff.length - 20} more lines
                        </div>
                    )}
                    <div className="diff-stats">
                        <span className="stat-added">{t('Agent.LinesAdded', stats.added)}</span>
                        {stats.removed > 0 && <span className="stat-removed">{t('Agent.LinesRemoved', stats.removed)}</span>}
                        <button className="diff-open-btn" onClick={handleOpenInEditor} disabled={!filePath}>
                            {t('Agent.OpenInEditor')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

interface DiffLine {
    type: 'diff-add' | 'diff-remove' | 'diff-context';
    content: string;
    prefix: string;
    lineNum: number | '';
}

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

function parseDiff(diff: string): DiffLine[] {
    if (!diff) return [];

    const lines = diff.split('\n');
    const result: DiffLine[] = [];
    let newLineNum = 0;
    let oldLineNum = 0;

    for (const line of lines) {
        // Parse @@ header for line numbers
        if (line.startsWith('@@')) {
            const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
            if (match) {
                oldLineNum = parseInt(match[1], 10) - 1;
                newLineNum = parseInt(match[2], 10) - 1;
            }
            continue;
        }
        if (isMetaLine(line)) continue;

        if (line.startsWith('+')) {
            newLineNum++;
            result.push({
                type: 'diff-add',
                content: line.slice(1),
                prefix: '+',
                lineNum: newLineNum,
            });
        } else if (line.startsWith('-')) {
            oldLineNum++;
            result.push({
                type: 'diff-remove',
                content: line.slice(1),
                prefix: '-',
                lineNum: oldLineNum,
            });
        } else if (line.startsWith(' ') || line === '') {
            oldLineNum++;
            newLineNum++;
            const content = line.startsWith(' ') ? line.slice(1) : line;
            if (content.trim() !== '') {
                result.push({
                    type: 'diff-context',
                    content,
                    prefix: ' ',
                    lineNum: newLineNum,
                });
            }
        }
    }

    return result;
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
