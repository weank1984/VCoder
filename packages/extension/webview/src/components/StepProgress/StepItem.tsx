/**
 * Step Item Component
 * Displays a single step with its entries
 */

import { useMemo } from 'react';
import type { Step } from '../../utils/stepAggregator';
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

    // Terminal commands: show a single output line when available.
    if (isTerminalToolName(name)) {
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
    
    // Generate rich title (action + target) for single-entry steps
    const displayTitle = useMemo(() => {
        if (step.isSingleEntry && step.entries.length === 1) {
            const entry = step.entries[0];
            const actionText = t(entry.actionKey);
            return `${actionText} ${entry.target.name}`;
        }
        return step.title;
    }, [step, t]);

    const collapsedPreview = useMemo(() => {
        if (!isCollapsed) return undefined;
        if (step.entries.length !== 1) return undefined;
        return deriveCollapsedPreview(step.entries[0].toolCall);
    }, [isCollapsed, step.entries]);
    
    // Get error message for failed steps
    const errorMessage = useMemo(() => {
        if (step.status !== 'failed') return null;
        
        // Find first error in entries
        const errorEntry = step.entries.find(e => e.status === 'error' && e.toolCall.error);
        if (!errorEntry) return null;
        
        return errorEntry.toolCall.error;
    }, [step.status, step.entries]);
    
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
                        title={errorMessage || undefined}
                    >
                        {statusIcon}
                    </span>
                </div>
                <span className="step-expand-icon">
                    {isCollapsed ? <ExpandIcon /> : <CollapseIcon />}
                </span>
            </div>
            
            {!isCollapsed && (
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
            )}
        </div>
    );
}
