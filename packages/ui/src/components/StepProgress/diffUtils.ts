/**
 * Shared diff parsing utilities
 */

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
