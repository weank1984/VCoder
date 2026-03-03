/**
 * Shared diff parsing utilities
 */

import { computeWordDiff, type DiffSpan } from './wordDiff';

export type { DiffSpan };

export interface DiffStats {
    additions: number;
    deletions: number;
    changes: number;
    totalLines: number;
}

export interface ProcessedLine {
    line: string;
    lineType: DiffLineType;
    index: number;
}

export type DiffLineType = 'add' | 'remove' | 'chunk' | 'meta' | 'context';

// ─── Enhanced diff types ───

export interface EnhancedDiffLine {
    content: string;                    // line content without prefix
    prefix: '+' | '-' | ' ';
    type: 'add' | 'remove' | 'context';
    oldLineNum: number | null;          // null for add lines
    newLineNum: number | null;          // null for remove lines
    wordSpans?: DiffSpan[];             // word-level diff spans
}

export interface HunkSeparator {
    type: 'separator';
    header: string;                     // raw @@ text
    oldStart: number;
    oldCount: number;
    newStart: number;
    newCount: number;
    context?: string;                   // function signature after @@
}

export type DiffItem = EnhancedDiffLine | HunkSeparator;

export interface ParsedDiff {
    items: DiffItem[];
    stats: DiffStats;
    isNewFile: boolean;
    isDeletedFile: boolean;
}

export function isDiffLine(item: DiffItem): item is EnhancedDiffLine {
    return item.type !== 'separator';
}

export function isHunkSeparator(item: DiffItem): item is HunkSeparator {
    return item.type === 'separator';
}

export function parseDiffStats(diff: string): DiffStats {
    const lines = diff.split('\n');
    let additions = 0;
    let deletions = 0;

    for (const line of lines) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
            additions++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
            deletions++;
        }
    }

    return {
        additions,
        deletions,
        changes: additions + deletions,
        totalLines: lines.length,
    };
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

export function getDiffLineType(line: string): DiffLineType {
    if (isMetaLine(line)) return 'meta';
    if (line.startsWith('+')) return 'add';
    if (line.startsWith('-')) return 'remove';
    if (line.startsWith('@@')) return 'chunk';
    return 'context';
}

export function formatDiffLine(line: string, lineType: string): string {
    if (lineType === 'add' || lineType === 'remove') {
        return line.slice(1);
    }
    if (lineType === 'context' && line.startsWith(' ')) {
        return line.slice(1);
    }
    return line;
}

/** @deprecated Use parseDiffEnhanced() instead */
export function processLines(diff: string): ProcessedLine[] {
    return diff.split('\n')
        .map((rawLine, i) => {
            const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
            const lineType = getDiffLineType(line);
            return { line, lineType, index: i };
        })
        .filter(({ lineType }) => lineType !== 'meta');
}

export const LARGE_FILE_LINE_THRESHOLD = 1000;
export const VIRTUAL_SCROLL_THRESHOLD = 500;
export const ESTIMATED_LINE_HEIGHT = 20;
export const HUNK_SEPARATOR_HEIGHT = 28;

// ─── Enhanced diff parser ───

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

/**
 * Parse a unified diff into structured items with line numbers, hunk separators,
 * and word-level diff spans for paired remove+add lines.
 */
export function parseDiffEnhanced(diff: string): ParsedDiff {
    if (!diff) {
        return { items: [], stats: { additions: 0, deletions: 0, changes: 0, totalLines: 0 }, isNewFile: false, isDeletedFile: false };
    }

    const rawLines = diff.split('\n');
    const items: DiffItem[] = [];
    let oldLineNum = 0;
    let newLineNum = 0;
    let additions = 0;
    let deletions = 0;
    let isNewFile = false;
    let isDeletedFile = false;

    for (const rawLine of rawLines) {
        const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

        // Detect new/deleted file
        if (line.startsWith('--- /dev/null') || line.startsWith('new file mode')) {
            isNewFile = true;
            continue;
        }
        if (line.startsWith('+++ /dev/null') || line.startsWith('deleted file mode')) {
            isDeletedFile = true;
            continue;
        }

        // Skip meta lines
        if (isMetaLine(line)) continue;

        // Parse hunk header
        const hunkMatch = line.match(HUNK_HEADER_RE);
        if (hunkMatch) {
            const oldStart = parseInt(hunkMatch[1], 10);
            const oldCount = hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1;
            const newStart = parseInt(hunkMatch[3], 10);
            const newCount = hunkMatch[4] !== undefined ? parseInt(hunkMatch[4], 10) : 1;
            const context = hunkMatch[5]?.trim() || undefined;

            oldLineNum = oldStart - 1;
            newLineNum = newStart - 1;

            items.push({
                type: 'separator',
                header: line,
                oldStart,
                oldCount,
                newStart,
                newCount,
                context,
            });
            continue;
        }

        // Add line
        if (line.startsWith('+')) {
            newLineNum++;
            additions++;
            items.push({
                content: line.slice(1),
                prefix: '+',
                type: 'add',
                oldLineNum: null,
                newLineNum,
            });
        }
        // Remove line
        else if (line.startsWith('-')) {
            oldLineNum++;
            deletions++;
            items.push({
                content: line.slice(1),
                prefix: '-',
                type: 'remove',
                oldLineNum,
                newLineNum: null,
            });
        }
        // Context line
        else {
            oldLineNum++;
            newLineNum++;
            const content = line.startsWith(' ') ? line.slice(1) : line;
            items.push({
                content,
                prefix: ' ',
                type: 'context',
                oldLineNum,
                newLineNum,
            });
        }
    }

    // Compute word-level diffs for paired remove+add sequences
    computeWordDiffsForPairs(items);

    return {
        items,
        stats: {
            additions,
            deletions,
            changes: additions + deletions,
            totalLines: rawLines.length,
        },
        isNewFile,
        isDeletedFile,
    };
}

/**
 * Find consecutive remove+add sequences and compute word-level diffs
 * for paired lines.
 */
function computeWordDiffsForPairs(items: DiffItem[]): void {
    let i = 0;
    while (i < items.length) {
        // Find a run of removes
        const removeStart = i;
        while (i < items.length && isDiffLine(items[i]) && (items[i] as EnhancedDiffLine).type === 'remove') {
            i++;
        }
        const removeEnd = i;
        const removeCount = removeEnd - removeStart;

        // Find following run of adds
        const addStart = i;
        while (i < items.length && isDiffLine(items[i]) && (items[i] as EnhancedDiffLine).type === 'add') {
            i++;
        }
        const addEnd = i;
        const addCount = addEnd - addStart;

        // Pair up removes and adds
        if (removeCount > 0 && addCount > 0) {
            const pairCount = Math.min(removeCount, addCount);
            for (let p = 0; p < pairCount; p++) {
                const removeLine = items[removeStart + p] as EnhancedDiffLine;
                const addLine = items[addStart + p] as EnhancedDiffLine;
                const spans = computeWordDiff(removeLine.content, addLine.content);

                // Split spans into delete-side and insert-side
                removeLine.wordSpans = spans
                    .filter(s => s.type === 'equal' || s.type === 'delete')
                    .map(s => ({ text: s.text, type: s.type === 'delete' ? 'delete' : 'equal' }));
                addLine.wordSpans = spans
                    .filter(s => s.type === 'equal' || s.type === 'insert')
                    .map(s => ({ text: s.text, type: s.type === 'insert' ? 'insert' : 'equal' }));
            }
        }

        // If we didn't move forward, advance
        if (i === removeStart) i++;
    }
}
