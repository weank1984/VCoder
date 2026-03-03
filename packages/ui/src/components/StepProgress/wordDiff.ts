/**
 * Lightweight word-level diff algorithm using LCS
 */

export interface DiffSpan {
    text: string;
    type: 'equal' | 'insert' | 'delete';
}

/** Split text into words at word boundaries (keeps whitespace attached) */
function tokenize(text: string): string[] {
    return text.match(/\S+|\s+/g) || [];
}

/** Compute LCS table */
function lcsTable(a: string[], b: string[]): number[][] {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1] + 1
                : Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
    }

    return dp;
}

/** Backtrack LCS table to produce diff spans */
function backtrack(dp: number[][], a: string[], b: string[]): DiffSpan[] {
    const spans: DiffSpan[] = [];
    let i = a.length;
    let j = b.length;

    // Collect in reverse order
    const reversed: DiffSpan[] = [];

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
            reversed.push({ text: a[i - 1], type: 'equal' });
            i--;
            j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            reversed.push({ text: b[j - 1], type: 'insert' });
            j--;
        } else {
            reversed.push({ text: a[i - 1], type: 'delete' });
            i--;
        }
    }

    // Reverse and merge adjacent spans of same type
    for (let k = reversed.length - 1; k >= 0; k--) {
        const span = reversed[k];
        const last = spans[spans.length - 1];
        if (last && last.type === span.type) {
            last.text += span.text;
        } else {
            spans.push({ ...span });
        }
    }

    return spans;
}

/**
 * Compute word-level diff between two lines.
 * Returns spans marking equal/insert/delete segments.
 */
export function computeWordDiff(oldLine: string, newLine: string): DiffSpan[] {
    if (oldLine === newLine) {
        return [{ text: newLine, type: 'equal' }];
    }

    const oldTokens = tokenize(oldLine);
    const newTokens = tokenize(newLine);

    const dp = lcsTable(oldTokens, newTokens);
    return backtrack(dp, oldTokens, newTokens);
}
