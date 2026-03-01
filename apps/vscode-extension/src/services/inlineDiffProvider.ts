/**
 * InlineDiffProvider
 *
 * Shows inline diff decorations (deleted lines highlighted, added lines as ghost text)
 * and CodeLens actions (Accept / Reject / View Full Diff) on files with pending proposed changes.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { FileChangeUpdate } from '@vcoder/shared';

/** A single hunk parsed from a unified diff. */
interface ParsedHunk {
    /** 1-based start line in the original file. */
    originalStart: number;
    originalCount: number;
    newStart: number;
    newCount: number;
    deletedLines: string[];
    addedLines: string[];
}

/** Pending inline diff for a single file. */
interface InlineDiffEntry {
    sessionId: string;
    filePath: string;
    resolvedPath: string;
    hunks: ParsedHunk[];
    change: FileChangeUpdate;
}

export class InlineDiffProvider implements vscode.CodeLensProvider {
    private readonly onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
    readonly onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;

    private deleteDecorationType: vscode.TextEditorDecorationType;
    private addDecorationType: vscode.TextEditorDecorationType;

    /** filePath → InlineDiffEntry */
    private pendingDiffs = new Map<string, InlineDiffEntry>();

    private codeLensDisposable: vscode.Disposable | undefined;
    private editorChangeDisposable: vscode.Disposable | undefined;

    constructor() {
        this.deleteDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('diffEditor.removedLineBackground'),
            isWholeLine: true,
            overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.deletedForeground'),
            overviewRulerLane: vscode.OverviewRulerLane.Left,
        });
        this.addDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
            isWholeLine: true,
            overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.addedForeground'),
            overviewRulerLane: vscode.OverviewRulerLane.Right,
        });
    }

    register(context: vscode.ExtensionContext): void {
        this.codeLensDisposable = vscode.languages.registerCodeLensProvider({ scheme: 'file' }, this);
        context.subscriptions.push(this.codeLensDisposable);

        // Re-apply decorations when the active editor changes
        this.editorChangeDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                this.applyDecorationsToEditor(editor);
            }
        });
        context.subscriptions.push(this.editorChangeDisposable);

        // Register commands for CodeLens actions
        context.subscriptions.push(
            vscode.commands.registerCommand('vcoder.inlineDiff.accept', (filePath: string) => {
                this.emit('accept', filePath);
            }),
            vscode.commands.registerCommand('vcoder.inlineDiff.reject', (filePath: string) => {
                this.emit('reject', filePath);
            }),
            vscode.commands.registerCommand('vcoder.inlineDiff.viewFull', (sessionId: string, filePath: string) => {
                this.emit('viewFull', filePath, sessionId);
            }),
        );
    }

    // Simple event emitter for accept/reject/viewFull
    private listeners = new Map<string, Array<(...args: string[]) => void>>();
    on(event: string, cb: (...args: string[]) => void): void {
        const list = this.listeners.get(event) || [];
        list.push(cb);
        this.listeners.set(event, list);
    }
    private emit(event: string, ...args: string[]): void {
        for (const cb of this.listeners.get(event) || []) {
            cb(...args);
        }
    }

    /**
     * Show inline diff decorations for a proposed file change.
     */
    showInlineDiff(sessionId: string, change: FileChangeUpdate): void {
        const resolvedPath = this.resolvePath(change.path);

        // Parse diff content into hunks
        let hunks: ParsedHunk[] = [];
        if (change.diff) {
            hunks = this.parseUnifiedDiff(change.diff);
        }

        this.pendingDiffs.set(change.path, {
            sessionId,
            filePath: change.path,
            resolvedPath,
            hunks,
            change,
        });

        // Apply to current editor if it matches
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.uri.fsPath === resolvedPath) {
            this.applyDecorationsToEditor(editor);
        }

        this.onDidChangeCodeLensesEmitter.fire();
    }

    /**
     * Clear inline diff decorations for a specific file.
     */
    clearInlineDiff(filePath: string): void {
        this.pendingDiffs.delete(filePath);

        // Clear decorations on matching editors
        for (const editor of vscode.window.visibleTextEditors) {
            const resolvedPath = this.resolvePath(filePath);
            if (editor.document.uri.fsPath === resolvedPath) {
                editor.setDecorations(this.deleteDecorationType, []);
                editor.setDecorations(this.addDecorationType, []);
            }
        }

        this.onDidChangeCodeLensesEmitter.fire();
    }

    /**
     * Clear all inline diff decorations.
     */
    clearAll(): void {
        this.pendingDiffs.clear();
        for (const editor of vscode.window.visibleTextEditors) {
            editor.setDecorations(this.deleteDecorationType, []);
            editor.setDecorations(this.addDecorationType, []);
        }
        this.onDidChangeCodeLensesEmitter.fire();
    }

    /** Get count of files with pending inline diffs. */
    get pendingCount(): number {
        return this.pendingDiffs.size;
    }

    /** Get pending diff entry for a specific file. */
    getEntry(filePath: string): InlineDiffEntry | undefined {
        return this.pendingDiffs.get(filePath);
    }

    /** Get the next pending file path for review navigation. */
    getNextPendingFile(): string | undefined {
        const entries = Array.from(this.pendingDiffs.values());
        return entries[0]?.filePath;
    }

    // ─── CodeLensProvider ────────────────────────────────────────────

    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        // Find matching entry by resolved path
        for (const [, entry] of this.pendingDiffs) {
            if (document.uri.fsPath === entry.resolvedPath) {
                return this.createCodeLensesForEntry(entry, document);
            }
        }
        return [];
    }

    private createCodeLensesForEntry(entry: InlineDiffEntry, _document: vscode.TextDocument): vscode.CodeLens[] {
        const lenses: vscode.CodeLens[] = [];

        if (entry.hunks.length === 0) {
            // No hunks (e.g. full file replacement) — put CodeLens at line 0
            const range = new vscode.Range(0, 0, 0, 0);
            lenses.push(
                new vscode.CodeLens(range, {
                    title: '\u2713 Accept',
                    command: 'vcoder.inlineDiff.accept',
                    arguments: [entry.filePath],
                }),
                new vscode.CodeLens(range, {
                    title: '\u2717 Reject',
                    command: 'vcoder.inlineDiff.reject',
                    arguments: [entry.filePath],
                }),
                new vscode.CodeLens(range, {
                    title: 'View Full Diff',
                    command: 'vcoder.inlineDiff.viewFull',
                    arguments: [entry.sessionId, entry.filePath],
                }),
            );
            return lenses;
        }

        // Place CodeLens at the first hunk
        const firstHunk = entry.hunks[0];
        const line = Math.max(0, firstHunk.originalStart - 1);
        const range = new vscode.Range(line, 0, line, 0);

        lenses.push(
            new vscode.CodeLens(range, {
                title: `\u2713 Accept (${entry.hunks.length} change${entry.hunks.length > 1 ? 's' : ''})`,
                command: 'vcoder.inlineDiff.accept',
                arguments: [entry.filePath],
            }),
            new vscode.CodeLens(range, {
                title: '\u2717 Reject',
                command: 'vcoder.inlineDiff.reject',
                arguments: [entry.filePath],
            }),
            new vscode.CodeLens(range, {
                title: 'View Full Diff',
                command: 'vcoder.inlineDiff.viewFull',
                arguments: [entry.sessionId, entry.filePath],
            }),
        );

        return lenses;
    }

    // ─── Decorations ─────────────────────────────────────────────────

    private applyDecorationsToEditor(editor: vscode.TextEditor): void {
        // Find matching entry
        let matchingEntry: InlineDiffEntry | undefined;
        for (const [, entry] of this.pendingDiffs) {
            if (editor.document.uri.fsPath === entry.resolvedPath) {
                matchingEntry = entry;
                break;
            }
        }

        if (!matchingEntry) {
            editor.setDecorations(this.deleteDecorationType, []);
            editor.setDecorations(this.addDecorationType, []);
            return;
        }

        const deleteRanges: vscode.DecorationOptions[] = [];
        const addRanges: vscode.DecorationOptions[] = [];

        for (const hunk of matchingEntry.hunks) {
            // Highlight deleted lines (lines that will be removed)
            for (let i = 0; i < hunk.deletedLines.length; i++) {
                const lineNum = hunk.originalStart - 1 + i;
                if (lineNum >= 0 && lineNum < editor.document.lineCount) {
                    deleteRanges.push({
                        range: new vscode.Range(lineNum, 0, lineNum, editor.document.lineAt(lineNum).text.length),
                        hoverMessage: new vscode.MarkdownString(`**Deleted:** \`${hunk.deletedLines[i]}\``),
                    });
                }
            }

            // Show added lines as decorations after the hunk's deleted range
            // Position them after the last deleted line (or at originalStart if no deletions)
            const insertLine = hunk.originalStart - 1 + hunk.deletedLines.length;
            if (hunk.addedLines.length > 0 && insertLine >= 0 && insertLine <= editor.document.lineCount) {
                const targetLine = Math.min(insertLine, editor.document.lineCount - 1);
                addRanges.push({
                    range: new vscode.Range(targetLine, 0, targetLine, 0),
                    hoverMessage: new vscode.MarkdownString(
                        `**Added ${hunk.addedLines.length} line(s):**\n\`\`\`\n${hunk.addedLines.join('\n')}\n\`\`\``
                    ),
                    renderOptions: {
                        after: {
                            contentText: ` +${hunk.addedLines.length} line(s)`,
                            color: new vscode.ThemeColor('editorGutter.addedBackground'),
                            fontStyle: 'italic',
                        },
                    },
                });
            }
        }

        editor.setDecorations(this.deleteDecorationType, deleteRanges);
        editor.setDecorations(this.addDecorationType, addRanges);
    }

    // ─── Diff Parsing ────────────────────────────────────────────────

    private parseUnifiedDiff(diff: string): ParsedHunk[] {
        const hunks: ParsedHunk[] = [];
        const lines = diff.split('\n');

        let currentHunk: ParsedHunk | null = null;

        for (const line of lines) {
            const hunkHeader = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/.exec(line);
            if (hunkHeader) {
                if (currentHunk) hunks.push(currentHunk);
                currentHunk = {
                    originalStart: parseInt(hunkHeader[1], 10),
                    originalCount: parseInt(hunkHeader[2] ?? '1', 10),
                    newStart: parseInt(hunkHeader[3], 10),
                    newCount: parseInt(hunkHeader[4] ?? '1', 10),
                    deletedLines: [],
                    addedLines: [],
                };
                continue;
            }

            if (!currentHunk) continue;

            if (line.startsWith('-') && !line.startsWith('---')) {
                currentHunk.deletedLines.push(line.slice(1));
            } else if (line.startsWith('+') && !line.startsWith('+++')) {
                currentHunk.addedLines.push(line.slice(1));
            }
        }

        if (currentHunk) hunks.push(currentHunk);
        return hunks;
    }

    // ─── Helpers ─────────────────────────────────────────────────────

    private resolvePath(filePath: string): string {
        if (path.isAbsolute(filePath)) return filePath;
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        return root ? path.join(root, filePath) : path.join(process.cwd(), filePath);
    }

    dispose(): void {
        this.deleteDecorationType.dispose();
        this.addDecorationType.dispose();
        this.onDidChangeCodeLensesEmitter.dispose();
        this.codeLensDisposable?.dispose();
        this.editorChangeDisposable?.dispose();
        this.pendingDiffs.clear();
        this.listeners.clear();
    }
}
