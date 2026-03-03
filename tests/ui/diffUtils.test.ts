import { describe, it, expect } from 'vitest';
import {
    parseDiffEnhanced,
    isDiffLine,
    isHunkSeparator,
    parseDiffStats,
    type EnhancedDiffLine,
    type HunkSeparator,
} from '../../packages/ui/src/components/StepProgress/diffUtils';

const SAMPLE_DIFF = `diff --git a/src/main.ts b/src/main.ts
index abc1234..def5678 100644
--- a/src/main.ts
+++ b/src/main.ts
@@ -1,5 +1,6 @@
 import { app } from './app';

-const port = 3000;
+const port = 8080;
+const host = 'localhost';

 app.listen(port, () => {
@@ -10,3 +11,4 @@
   console.log('Server started');
+  console.log(\`Port: \${port}\`);
 });
`;

const NEW_FILE_DIFF = `diff --git a/src/utils.ts b/src/utils.ts
new file mode 100644
--- /dev/null
+++ b/src/utils.ts
@@ -0,0 +1,3 @@
+export function add(a: number, b: number): number {
+  return a + b;
+}
`;

const DELETED_FILE_DIFF = `diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
--- a/src/old.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-export function old() {
-  return 'old';
-}
`;

describe('parseDiffEnhanced', () => {
    it('should parse hunk separators', () => {
        const result = parseDiffEnhanced(SAMPLE_DIFF);
        const separators = result.items.filter(isHunkSeparator);
        expect(separators.length).toBe(2);

        const first = separators[0] as HunkSeparator;
        expect(first.type).toBe('separator');
        expect(first.oldStart).toBe(1);
        expect(first.oldCount).toBe(5);
        expect(first.newStart).toBe(1);
        expect(first.newCount).toBe(6);
    });

    it('should compute line numbers for add lines', () => {
        const result = parseDiffEnhanced(SAMPLE_DIFF);
        const addLines = result.items.filter(
            (item): item is EnhancedDiffLine => isDiffLine(item) && item.type === 'add'
        );
        expect(addLines.length).toBe(3); // port=8080, host, console.log

        // First hunk: +const port = 8080; should be new line 3
        expect(addLines[0].newLineNum).toBe(3);
        expect(addLines[0].oldLineNum).toBeNull();
        expect(addLines[0].content).toBe('const port = 8080;');
    });

    it('should compute line numbers for remove lines', () => {
        const result = parseDiffEnhanced(SAMPLE_DIFF);
        const removeLines = result.items.filter(
            (item): item is EnhancedDiffLine => isDiffLine(item) && item.type === 'remove'
        );
        expect(removeLines.length).toBe(1); // const port = 3000;

        expect(removeLines[0].oldLineNum).toBe(3);
        expect(removeLines[0].newLineNum).toBeNull();
        expect(removeLines[0].content).toBe('const port = 3000;');
    });

    it('should compute line numbers for context lines', () => {
        const result = parseDiffEnhanced(SAMPLE_DIFF);
        const contextLines = result.items.filter(
            (item): item is EnhancedDiffLine => isDiffLine(item) && item.type === 'context'
        );

        // First context line: "import { app } from './app';"
        expect(contextLines[0].oldLineNum).toBe(1);
        expect(contextLines[0].newLineNum).toBe(1);
    });

    it('should compute word-level diffs for paired remove+add', () => {
        const result = parseDiffEnhanced(SAMPLE_DIFF);
        const diffLines = result.items.filter(isDiffLine) as EnhancedDiffLine[];

        // The remove line "const port = 3000;" and add line "const port = 8080;" are paired
        const removeLine = diffLines.find(l => l.type === 'remove' && l.content.includes('3000'));
        const addLine = diffLines.find(l => l.type === 'add' && l.content.includes('8080'));

        expect(removeLine?.wordSpans).toBeDefined();
        expect(addLine?.wordSpans).toBeDefined();

        // The word spans should contain the differing part
        if (removeLine?.wordSpans) {
            expect(removeLine.wordSpans.some(s => s.type === 'delete')).toBe(true);
        }
        if (addLine?.wordSpans) {
            expect(addLine.wordSpans.some(s => s.type === 'insert')).toBe(true);
        }
    });

    it('should detect new file', () => {
        const result = parseDiffEnhanced(NEW_FILE_DIFF);
        expect(result.isNewFile).toBe(true);
        expect(result.isDeletedFile).toBe(false);
        expect(result.stats.additions).toBe(3);
        expect(result.stats.deletions).toBe(0);
    });

    it('should detect deleted file', () => {
        const result = parseDiffEnhanced(DELETED_FILE_DIFF);
        expect(result.isDeletedFile).toBe(true);
        expect(result.isNewFile).toBe(false);
        expect(result.stats.additions).toBe(0);
        expect(result.stats.deletions).toBe(3);
    });

    it('should handle empty diff', () => {
        const result = parseDiffEnhanced('');
        expect(result.items).toEqual([]);
        expect(result.stats.additions).toBe(0);
        expect(result.stats.deletions).toBe(0);
    });

    it('should compute correct stats', () => {
        const result = parseDiffEnhanced(SAMPLE_DIFF);
        expect(result.stats.additions).toBe(3);
        expect(result.stats.deletions).toBe(1);
        expect(result.stats.changes).toBe(4);
    });

    it('should match parseDiffStats for additions/deletions', () => {
        const enhanced = parseDiffEnhanced(SAMPLE_DIFF);
        const legacy = parseDiffStats(SAMPLE_DIFF);

        expect(enhanced.stats.additions).toBe(legacy.additions);
        expect(enhanced.stats.deletions).toBe(legacy.deletions);
    });

    it('should strip \\r from lines', () => {
        const diffWithCR = "@@ -1,2 +1,2 @@\r\n-old line\r\n+new line\r\n";
        const result = parseDiffEnhanced(diffWithCR);
        const addLine = result.items.find(
            (item): item is EnhancedDiffLine => isDiffLine(item) && item.type === 'add'
        );
        expect(addLine?.content).toBe('new line');
    });

    it('should handle hunk with function context', () => {
        const diff = `@@ -10,3 +11,4 @@ function main() {
   console.log('hello');
+  console.log('world');
 }
`;
        const result = parseDiffEnhanced(diff);
        const separator = result.items.find(isHunkSeparator) as HunkSeparator | undefined;
        expect(separator?.context).toBe('function main() {');
    });
});

describe('isDiffLine / isHunkSeparator', () => {
    it('isDiffLine returns true for add/remove/context', () => {
        const line: EnhancedDiffLine = {
            content: 'test',
            prefix: '+',
            type: 'add',
            oldLineNum: null,
            newLineNum: 1,
        };
        expect(isDiffLine(line)).toBe(true);
    });

    it('isHunkSeparator returns true for separator', () => {
        const sep: HunkSeparator = {
            type: 'separator',
            header: '@@ -1,3 +1,4 @@',
            oldStart: 1,
            oldCount: 3,
            newStart: 1,
            newCount: 4,
        };
        expect(isHunkSeparator(sep)).toBe(true);
    });
});
