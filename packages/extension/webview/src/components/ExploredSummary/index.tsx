/**
 * ExploredSummary Component
 * Displays a collapsible "Explored N directory, N files" summary for read-only tool calls.
 * Matches Claude Code desktop UI.
 */

import { useState, useMemo, useCallback } from 'react';
import type { ToolCall } from '../../types';
import { useI18n } from '../../i18n/I18nProvider';
import { postMessage } from '../../utils/vscode';
import { CollapseIcon, ExpandIcon } from '../Icon';
import { asRecord, asString } from '../../utils/typeGuards';
import './index.scss';

interface ExploredSummaryProps {
    toolCalls: ToolCall[];
    isComplete?: boolean;
}

interface ExploredItem {
    action: string;
    target: string;
    fullPath?: string;
    toolCall: ToolCall;
}

/**
 * Extract display info from a tool call
 */
function extractExploredItem(tc: ToolCall, t: (key: string) => string): ExploredItem | null {
    const lower = tc.name.toLowerCase();
    const input = asRecord(tc.input);

    // Read / view_file
    if (lower === 'read' || lower === 'view_file' || lower === 'read_file' || lower.endsWith('__read')) {
        const path = asString(input?.file_path) ?? asString(input?.path) ?? asString(input?.file) ?? '';
        const basename = path.split(/[\\/]/).pop() || path;
        return { action: t('StepProgress.Analyzed'), target: basename, fullPath: path, toolCall: tc };
    }

    // Glob / list_dir / list_files
    if (lower === 'glob' || lower === 'list_dir' || lower === 'list_files' || lower === 'find_files' || lower.endsWith('__glob')) {
        const pattern = asString(input?.pattern) ?? asString(input?.path) ?? asString(input?.directory) ?? '';
        const basename = pattern.split(/[\\/]/).pop() || pattern;
        return { action: t('StepProgress.Listed'), target: basename, fullPath: pattern, toolCall: tc };
    }

    // Grep / search
    if (lower === 'grep' || lower === 'search_files' || lower === 'codebase_search' || lower === 'file_search' || lower.endsWith('__grep')) {
        const pattern = asString(input?.pattern) ?? asString(input?.query) ?? asString(input?.search) ?? '';
        return { action: t('StepProgress.Searched'), target: `"${pattern}"`, toolCall: tc };
    }

    // Generic fallback for any other explored tool
    const path = asString(input?.file_path) ?? asString(input?.path) ?? asString(input?.file) ?? tc.name;
    const basename = path.split(/[\\/]/).pop() || path;
    return { action: t('StepProgress.Explored'), target: basename, fullPath: path, toolCall: tc };
}

export function ExploredSummary({ toolCalls, isComplete = true }: ExploredSummaryProps) {
    const { t } = useI18n();
    const [isExpanded, setIsExpanded] = useState(false);

    const items = useMemo(() => {
        return toolCalls
            .map(tc => extractExploredItem(tc, t))
            .filter((item): item is ExploredItem => item !== null);
    }, [toolCalls, t]);

    // Count directories and files
    const { dirCount, fileCount } = useMemo(() => {
        let dirs = 0;
        let files = 0;
        for (const tc of toolCalls) {
            const lower = tc.name.toLowerCase();
            if (lower === 'glob' || lower === 'list_dir' || lower === 'list_files' || lower === 'find_files' || lower.endsWith('__glob')) {
                dirs++;
            } else {
                files++;
            }
        }
        return { dirCount: dirs, fileCount: files };
    }, [toolCalls]);

    const handleViewFile = useCallback((path: string) => {
        postMessage({ type: 'openFile', path });
    }, []);

    if (items.length === 0) return null;

    // Build summary text: "Explored N directory, N files"
    const dirLabel = dirCount === 1 ? t('StepProgress.DirectoryUnit') : t('StepProgress.DirectoriesUnit');
    const fileLabel = fileCount === 1 ? t('StepProgress.FileUnit') : t('StepProgress.FilesUnit');
    const summaryText = t('StepProgress.ExploredSummary', [
        String(dirCount),
        dirLabel,
        String(fileCount),
        fileLabel,
    ]);

    return (
        <div className="explored-summary">
            <div
                className={`explored-summary__header ${isComplete ? '' : 'is-loading'}`}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className="explored-summary__chevron">
                    {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
                </span>
                <span className="explored-summary__text">{summaryText}</span>
            </div>

            {isExpanded && (
                <div className="explored-summary__list">
                    {items.map((item, idx) => (
                        <div
                            key={`${item.toolCall.id}-${idx}`}
                            className="explored-summary__item"
                            onClick={item.fullPath ? () => handleViewFile(item.fullPath!) : undefined}
                            title={item.fullPath}
                        >
                            <span className="explored-summary__action">{item.action}</span>
                            <span className={`explored-summary__target ${item.fullPath ? 'is-clickable' : ''}`}>
                                {item.target}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
