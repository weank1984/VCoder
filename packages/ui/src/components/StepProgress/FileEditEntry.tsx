import { useMemo } from 'react';
import type { ToolCall } from '../../types';
import { asRecord, asString } from '../../utils/typeGuards';
import { DiffViewer } from './DiffViewer';

interface FileEditEntryProps {
    toolCall: ToolCall;
    fallbackPath: string;
    onConfirm?: (tc: ToolCall, approve: boolean) => void;
    onViewFile?: (path: string) => void;
}

/**
 * Generate a simple unified diff from old_string/new_string input fields.
 * Used when Edit tool is auto-approved and no real diff is available.
 */
function generateDiffFromInput(input: Record<string, unknown> | undefined): string {
    if (!input) return '';
    const oldStr = asString(input.old_string) ?? '';
    const newStr = asString(input.new_string) ?? '';
    if (!oldStr && !newStr) return '';

    const lines: string[] = [];
    lines.push('@@ edit @@');
    if (oldStr) {
        for (const line of oldStr.split('\n')) {
            lines.push(`-${line}`);
        }
    }
    if (newStr) {
        for (const line of newStr.split('\n')) {
            lines.push(`+${line}`);
        }
    }
    return lines.join('\n');
}

export function useDiffData(toolCall: ToolCall, fallbackPath: string) {
    return useMemo(() => {
        const input = asRecord(toolCall.input);
        const result = asRecord(toolCall.result);
        const confirmData = toolCall.confirmationData;

        const filePath =
            asString(input?.path) ??
            asString(input?.file_path) ??
            asString(input?.file) ??
            confirmData?.filePath ??
            fallbackPath;

        // Priority order for finding diff:
        // 1. confirmationData.diff (from confirmation flow, persists after approval)
        // 2. result as unified diff string (raw string with @@)
        // 3. result.diff field
        // 4. input.diff field
        // 5. Generate from old_string/new_string (auto-approved Edit tools)
        let diff = '';
        if (confirmData?.diff) {
            diff = confirmData.diff;
        } else if (typeof toolCall.result === 'string' && toolCall.result.includes('@@')) {
            diff = toolCall.result;
        } else {
            diff = asString(result?.diff) ?? asString(input?.diff) ?? '';
        }

        // Fallback: generate diff from Edit tool's old_string/new_string
        if (!diff) {
            diff = generateDiffFromInput(input);
        }

        return {
            filePath,
            diff,
            hasChanges: diff.length > 0,
        };
    }, [toolCall.input, toolCall.result, toolCall.confirmationData, fallbackPath]);
}

export function shouldShowDiff(toolCall: ToolCall): boolean {
    return toolCall.status !== 'awaiting_confirmation';
}

export function FileEditEntry({ toolCall, fallbackPath, onConfirm, onViewFile }: FileEditEntryProps) {
    const data = useDiffData(toolCall, fallbackPath);

    if (!shouldShowDiff(toolCall)) return null;

    return (
        <DiffViewer
            filePath={data.filePath}
            diff={data.diff}
            variant={toolCall.status === 'awaiting_confirmation' ? 'full' : 'compact'}
            onAccept={onConfirm ? () => onConfirm(toolCall, true) : undefined}
            onReject={onConfirm ? () => onConfirm(toolCall, false) : undefined}
            actionsDisabled={toolCall.status !== 'awaiting_confirmation'}
            defaultCollapsed={false}
            onViewFile={onViewFile}
        />
    );
}
