/**
 * Step Item Component
 * Displays a single step with its entries
 */

import { useMemo } from 'react';
import type { Step, StepEntry as StepEntryType } from '../../utils/stepAggregator';
import type { ToolCall } from '../../types';
import { StepEntry } from './StepEntry';
import { useI18n } from '../../i18n/I18nProvider';
import { 
    CheckIcon, 
    LoadingIcon, 
    ErrorIcon,
    ExpandIcon,
    CollapseIcon,
} from '../Icon';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
    isRecord(value) ? value : undefined;

const asString = (value: unknown): string | undefined =>
    typeof value === 'string' ? value : undefined;

const asNumber = (value: unknown): number | undefined =>
    typeof value === 'number' ? value : undefined;

function truncateText(text: string, max = 80): string {
    const trimmed = text.trim();
    if (trimmed.length <= max) return trimmed;
    return `${trimmed.slice(0, max - 1)}…`;
}

function firstMeaningfulLine(text: string): string | undefined {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return undefined;
    return lines[0];
}

function isTerminalToolName(name: string) {
    const lower = name.toLowerCase();
    return (
        lower === 'bash' ||
        lower === 'bashoutput' ||
        lower === 'bash_output' ||
        lower === 'run_command' ||
        lower === 'mcp__acp__bashoutput' ||
        lower.includes('terminal')
    );
}

function isFileEditToolName(name: string) {
    const lower = name.toLowerCase();
    return (
        lower === 'write' ||
        lower === 'edit' ||
        lower === 'strreplace' ||
        lower === 'multiedit' ||
        lower === 'write_to_file' ||
        lower === 'replace_file_content' ||
        lower === 'multi_replace_file_content' ||
        lower === 'apply_patch' ||
        lower === 'str_replace' ||
        lower === 'mcp__acp__write' ||
        lower === 'mcp__acp__edit'
    );
}

function countDiffHunks(diff: string): { added: number; removed: number } {
    let added = 0;
    let removed = 0;
    for (const line of diff.split('\n')) {
        if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) continue;
        if (line.startsWith('+')) added++;
        else if (line.startsWith('-')) removed++;
    }
    return { added, removed };
}

function deriveCollapsedPreview(toolCall: ToolCall): string | undefined {
    const name = toolCall.name;
    const lower = name.toLowerCase();

    // Avoid noisy previews for file contents.
    if (lower === 'read' || lower === 'read_file' || lower === 'view_file') return undefined;

    // Terminal commands: show "Rejected" for failed/rejected, or output line otherwise.
    if (isTerminalToolName(name)) {
        if (toolCall.status === 'failed') {
            return 'Rejected';
        }
        if (typeof toolCall.result === 'string') {
            const line = firstMeaningfulLine(toolCall.result);
            return line ? truncateText(line, 96) : undefined;
        }
        const result = asRecord(toolCall.result);
        const output = asString(result?.output) ?? asString(result?.stdout);
        const line = output ? firstMeaningfulLine(output) : undefined;
        const exitCode = asNumber(result?.exitCode) ?? asNumber(result?.exit_code);
        if (line) return truncateText(line, 96);
        if (exitCode !== undefined) return `exit: ${exitCode}`;
        return undefined;
    }

    // File edit tools: show +/- stats.
    if (isFileEditToolName(name)) {
        const result = asRecord(toolCall.result);
        const input = asRecord(toolCall.input);
        const diff =
            (typeof toolCall.result === 'string' && toolCall.result.includes('@@') ? toolCall.result : undefined) ??
            asString(result?.diff) ??
            asString(input?.diff);
        if (!diff) return undefined;
        const { added, removed } = countDiffHunks(diff);
        if (added === 0 && removed === 0) return undefined;
        return `+${added} -${removed}`;
    }

    // Array-like results: show counts.
    if (Array.isArray(toolCall.result)) {
        if (lower === 'grep' || lower === 'grep_search' || lower === 'codebase_search') {
            return `${toolCall.result.length} match${toolCall.result.length === 1 ? '' : 'es'}`;
        }
        return `${toolCall.result.length} item${toolCall.result.length === 1 ? '' : 's'}`;
    }

    return undefined;
}

/**
 * Generate summary text for multiple tool calls
 * Following Cursor's style: "Explored 3 files 2 searches" (space-separated)
 */
function generateToolCallsSummary(entries: StepEntryType[], t: (key: string) => string): string {
    const groups = new Map<string, { type: string; count: number; actionKey: string }>();
    
    // Group entries by type
    for (const entry of entries) {
        const key = entry.type;
        const existing = groups.get(key);
        if (existing) {
            existing.count++;
        } else {
            groups.set(key, {
                type: key,
                count: 1,
                actionKey: entry.actionKey,
            });
        }
    }
    
    // Generate summary parts
    const summaryParts: string[] = [];
    
    // Sort groups for consistent order: file, search, command, others
    const typeOrder = ['file', 'search', 'command', 'browser', 'task', 'plan', 'mcp', 'notebook', 'other'];
    const sortedGroups = Array.from(groups.values()).sort((a, b) => {
        const aIndex = typeOrder.indexOf(a.type);
        const bIndex = typeOrder.indexOf(b.type);
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
    });
    
    // Check if all entries have the same action
    const uniqueActions = new Set(entries.map(e => e.actionKey));
    const useCommonAction = uniqueActions.size === 1;
    
    if (useCommonAction) {
        // All same action: "Analyzed 3 files"
        const actionText = t(entries[0].actionKey);
        const totalCount = entries.length;
        const primaryType = sortedGroups[0]?.type || 'item';
        
        if (primaryType === 'file') {
            return `${actionText} ${totalCount} file${totalCount > 1 ? 's' : ''}`;
        } else if (primaryType === 'search') {
            return `${totalCount} search${totalCount > 1 ? 'es' : ''}`;
        } else if (primaryType === 'command') {
            return `${actionText} ${totalCount} command${totalCount > 1 ? 's' : ''}`;
        } else {
            return `${actionText} ${totalCount} item${totalCount > 1 ? 's' : ''}`;
        }
    }
    
    // Multiple actions: "Explored 3 files 2 searches"
    for (const group of sortedGroups) {
        const count = group.count;
        const isFirstGroup = summaryParts.length === 0;
        
        if (group.type === 'file') {
            if (isFirstGroup) {
                const actionText = t(group.actionKey);
                summaryParts.push(`${actionText} ${count} file${count > 1 ? 's' : ''}`);
            } else {
                summaryParts.push(`${count} file${count > 1 ? 's' : ''}`);
            }
        } else if (group.type === 'search') {
            summaryParts.push(`${count} search${count > 1 ? 'es' : ''}`);
        } else if (group.type === 'command') {
            if (isFirstGroup) {
                const actionText = t(group.actionKey);
                summaryParts.push(`${actionText} ${count} command${count > 1 ? 's' : ''}`);
            } else {
                summaryParts.push(`${count} command${count > 1 ? 's' : ''}`);
            }
        } else {
            summaryParts.push(`${count} ${group.type}${count > 1 ? 's' : ''}`);
        }
    }
    
    // Join with space (Cursor style)
    return summaryParts.join(' ');
}

interface StepItemProps {
    step: Step;
    isCollapsed: boolean;
    onToggle: () => void;
    onViewFile?: (path: string, lineRange?: [number, number]) => void;
    onConfirm?: (tc: ToolCall, approve: boolean, options?: { trustAlways?: boolean; editedContent?: string }) => void;
}

export function StepItem({ 
    step, 
    isCollapsed, 
    onToggle, 
    onViewFile,
    onConfirm 
}: StepItemProps) {
    const { t } = useI18n();
    
    // Check if this is a rejected terminal command
    const isRejectedTerminal = useMemo(() => {
        if (step.entries.length !== 1) return false;
        const tc = step.entries[0].toolCall;
        return isTerminalToolName(tc.name) && (tc.status === 'failed');
    }, [step.entries]);

    // Generate rich title
    const displayTitle = useMemo(() => {
        // For single-entry steps: show "Action Target" format
        if (step.isSingleEntry && step.entries.length === 1) {
            const entry = step.entries[0];
            const tc = entry.toolCall;

            // Rejected terminal command: "Rejected command: docker info"
            if (isTerminalToolName(tc.name) && (tc.status === 'failed')) {
                const cmd = asString(asRecord(tc.input)?.command) ?? entry.target.name;
                return `${t('StepProgress.RejectedCommand')}: ${truncateText(cmd, 60)}`;
            }

            const actionText = t(entry.actionKey);
            return `${actionText} ${entry.target.name}`;
        }

        // For multi-entry steps: always show aggregated summary (both collapsed and expanded)
        if (step.entries.length > 1) {
            return generateToolCallsSummary(step.entries, t);
        }

        // Default: use step title
        return step.title;
    }, [step, t]);

    const collapsedPreview = useMemo(() => {
        if (!isCollapsed) return undefined;
        // Only show preview for single-entry steps
        if (step.entries.length !== 1) return undefined;
        return deriveCollapsedPreview(step.entries[0].toolCall);
    }, [isCollapsed, step.entries]);
    
    // Get error information for failed steps
    const errorInfo = useMemo(() => {
        if (step.status !== 'failed') return null;
        
        // Find first error in entries
        const errorEntry = step.entries.find(e => e.status === 'error' && e.toolCall.error);
        if (!errorEntry) return null;
        
        const error = errorEntry.toolCall.error || '';
        
        // Parse error message to provide friendly descriptions
        let friendlyMessage = error;
        let errorType = 'error';
        
        // Common error patterns
        if (error.includes('timeout') || error.includes('timed out')) {
            friendlyMessage = t('Error.Timeout');
            errorType = 'timeout';
        } else if (error.includes('permission denied') || error.includes('EACCES')) {
            friendlyMessage = t('Error.PermissionDenied');
            errorType = 'permission';
        } else if (error.includes('not found') || error.includes('ENOENT')) {
            friendlyMessage = t('Error.NotFound');
            errorType = 'notfound';
        } else if (error.includes('connection') || error.includes('network')) {
            friendlyMessage = t('Error.ConnectionFailed');
            errorType = 'connection';
        } else if (error.includes('cancelled') || error.includes('canceled')) {
            friendlyMessage = t('Error.Cancelled');
            errorType = 'cancelled';
        }
        
        return {
            message: friendlyMessage,
            rawMessage: error,
            type: errorType,
            toolName: errorEntry.toolCall.name,
        };
    }, [step.status, step.entries, t]);
    
    // Step status icon with tooltip for errors
    const statusIcon = useMemo(() => {
        switch (step.status) {
            case 'completed': return <CheckIcon />;
            case 'failed': return <ErrorIcon />;
            case 'running': return <LoadingIcon />;
            default: return <LoadingIcon />;
        }
    }, [step.status]);
    
    return (
        <div className={`step-item ${step.status} ${step.isSingleEntry ? 'single-entry' : ''}`}>
            <div className="step-header" onClick={onToggle}>
                <span className={`step-number ${step.status}`}>{step.index}</span>
                <div className="step-info">
                    <div className="step-text">
                        <span className="step-title" title={displayTitle}>{displayTitle}</span>
                        {collapsedPreview && (
                            <span className="step-preview" title={collapsedPreview}>
                                {collapsedPreview}
                            </span>
                        )}
                    </div>
                    <span 
                        className={`step-status-icon ${step.status}`}
                        title={errorInfo?.message || undefined}
                    >
                        {statusIcon}
                    </span>
                </div>
                <span className="step-expand-icon">
                    {isCollapsed ? <ExpandIcon /> : <CollapseIcon />}
                </span>
            </div>
            
            {/* Error banner - shown when collapsed and has error, but not for rejected terminal commands */}
            {isCollapsed && errorInfo && !isRejectedTerminal && (
                <div className="step-error-banner" onClick={(e) => {
                    e.stopPropagation();
                    onToggle();
                }}>
                    <ErrorIcon />
                    <span className="step-error-message">{errorInfo.message}</span>
                    <span className="step-error-expand">{t('Error.ViewDetails')}</span>
                </div>
            )}
            
            {!isCollapsed && (
                <>
                    {/* Error details - shown when expanded */}
                    {errorInfo && (
                        <div className="step-error-details">
                            <div className="step-error-header">
                                <ErrorIcon />
                                <span className="step-error-title">{t('Error.ErrorOccurred')}</span>
                            </div>
                            <div className="step-error-body">
                                <div className="step-error-friendly">{errorInfo.message}</div>
                                {errorInfo.rawMessage !== errorInfo.message && (
                                    <details className="step-error-raw">
                                        <summary>{t('Error.TechnicalDetails')}</summary>
                                        <pre>{errorInfo.rawMessage}</pre>
                                    </details>
                                )}
                            </div>
                        </div>
                    )}
                    
                    <div className="step-entries">
                        {step.entries.map((entry) => (
                            <StepEntry
                                key={entry.id}
                                entry={entry}
                                onViewFile={onViewFile}
                                onConfirm={onConfirm}
                                hideSummary={step.isSingleEntry}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
