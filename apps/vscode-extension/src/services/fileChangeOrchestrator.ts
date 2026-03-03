/**
 * FileChangeOrchestrator
 * Handles file_change events from the agent: diff review, inline highlights,
 * file decorations, and post-accept reveal.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { ACPClient } from '@vcoder/shared/acpClient';
import { FileChangeUpdate } from '@vcoder/shared';
import { DiffManager } from './diffManager';
import { InlineDiffProvider } from './inlineDiffProvider';
import { VCoderFileDecorationProvider } from '../providers/fileDecorationProvider';
import { AuditLogger } from './auditLogger';

export class FileChangeOrchestrator {
    private diffManager?: DiffManager;
    private fileDecorator?: VCoderFileDecorationProvider;
    private inlineDiffProvider?: InlineDiffProvider;
    private updateReviewStatusBar?: () => void;

    // Cache diff data from proposed=true events for use when proposed=false arrives
    private pendingDiffCache = new Map<string, string>();

    // Temporary highlight decoration for recently changed lines
    private readonly changeHighlightDecoration = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(73, 199, 130, 0.12)',
        isWholeLine: true,
        overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.addedForeground'),
        overviewRulerLane: vscode.OverviewRulerLane.Left,
    });
    private changeHighlightTimer?: ReturnType<typeof setTimeout>;

    constructor(
        private acpClient: ACPClient,
        private postMessage: (msg: unknown, immediate?: boolean) => void,
        private auditLogger?: AuditLogger,
    ) {}

    /**
     * Set the DiffManager instance for file change review flow.
     */
    setDiffManager(diffManager: DiffManager): void {
        this.diffManager = diffManager;

        // Listen for diff decisions to update webview
        diffManager.on('decision', (data: { sessionId: string; filePath: string; decision: 'accepted' | 'rejected' }) => {
            // Notify webview that a file change was decided
            const updateContent: FileChangeUpdate = {
                type: 'modified',
                path: data.filePath,
                proposed: false,
                sessionId: data.sessionId,
            };
            this.postMessage({
                type: 'update',
                data: {
                    sessionId: data.sessionId,
                    type: 'file_change',
                    content: updateContent,
                },
            }, true);

            // Audit log the diff review decision
            if (this.auditLogger) {
                void this.auditLogger.logFileOperation(
                    data.sessionId, data.filePath, 'write', undefined, undefined, undefined, data.decision
                );
            }

            // Update file decorator -- clear decoration on both accept and reject
            if (this.fileDecorator) {
                this.fileDecorator.removeFile(data.filePath);
            }

            // Reveal accepted file in editor with highlight
            if (data.decision === 'accepted') {
                const cachedDiff = this.pendingDiffCache.get(data.filePath);
                this.pendingDiffCache.delete(data.filePath);
                void this.revealFileChange(data.filePath, cachedDiff);
            } else {
                this.pendingDiffCache.delete(data.filePath);
            }
        });

        // Listen for conflict detection events
        diffManager.on('conflict', (data: { sessionId: string; filePath: string }) => {
            console.warn(`[VCoder] Conflict detected: ${data.filePath} modified during review`);
            this.postMessage({
                type: 'update',
                data: {
                    sessionId: data.sessionId,
                    type: 'file_change',
                    content: {
                        type: 'modified',
                        path: data.filePath,
                        proposed: true,
                        conflict: true,
                        sessionId: data.sessionId,
                    },
                },
            });
        });

        // Listen for review stats updates
        diffManager.on('statsUpdate', (data: { sessionId: string; stats: { pending: number; accepted: number; rejected: number; total: number } }) => {
            this.postMessage({
                type: 'reviewStats',
                data: {
                    sessionId: data.sessionId,
                    stats: data.stats,
                },
            });
        });
    }

    /**
     * Set the FileDecorationProvider instance.
     */
    setFileDecorator(fileDecorator: VCoderFileDecorationProvider): void {
        this.fileDecorator = fileDecorator;
    }

    /**
     * Set the InlineDiffProvider instance for in-editor decorations.
     */
    setInlineDiffProvider(provider: InlineDiffProvider, updateStatusBar: () => void): void {
        this.inlineDiffProvider = provider;
        this.updateReviewStatusBar = updateStatusBar;
    }

    /**
     * Handle file_change events from the agent.
     * When proposed=true, triggers Diff review flow + caches diff.
     * When proposed=false, reveals the file in editor with highlight.
     */
    handleFileChange(sessionId: string, change: FileChangeUpdate): void {
        // Update file decorator
        if (this.fileDecorator) {
            this.fileDecorator.updateFile(change);
        }

        if (!change.proposed) {
            // proposed=false is the "clear pending" signal after accept/reject.
            // The file is already on disk -- reveal it with cached diff.
            if (change.type !== 'deleted') {
                const cachedDiff = this.pendingDiffCache.get(change.path);
                this.pendingDiffCache.delete(change.path);
                void this.revealFileChange(change.path, cachedDiff);
            } else {
                this.pendingDiffCache.delete(change.path);
            }
            return;
        }

        // Cache diff for later use when proposed=false arrives
        if (change.diff) {
            this.pendingDiffCache.set(change.path, change.diff);
        }

        // Check permission mode - bypassPermissions auto-accepts without diff review
        const config = vscode.workspace.getConfiguration('vcoder');
        const permissionMode = config.get<string>('permissionMode', 'default');
        if (permissionMode === 'bypassPermissions') {
            console.log('[VCoder] bypassPermissions mode: auto-accepting', change.path);
            void this.acpClient.acceptFileChange(change.path, sessionId);
            // CLI already wrote the file -- reveal it in editor
            if (change.type !== 'deleted') {
                // Small delay to ensure the CLI has finished writing
                setTimeout(() => {
                    void this.revealFileChange(change.path, change.diff);
                    this.pendingDiffCache.delete(change.path);
                }, 500);
            }
            return;
        }

        // Show inline diff decorations in the editor
        if (this.inlineDiffProvider) {
            this.inlineDiffProvider.showInlineDiff(sessionId, change);
            this.updateReviewStatusBar?.();
        }

        // Trigger Diff review in VSCode
        if (this.diffManager) {
            void this.diffManager.previewChange(sessionId, change);
        }
    }

    /**
     * Get the DiffManager instance (if set).
     */
    getDiffManager(): DiffManager | undefined {
        return this.diffManager;
    }

    /**
     * Clear session-specific state from the DiffManager.
     */
    clearSession(sessionId: string): void {
        if (this.diffManager) {
            this.diffManager.clearSession(sessionId);
        }
    }

    /**
     * Clear file decorations (called on session complete).
     */
    clearDecorations(): void {
        if (this.fileDecorator) {
            this.fileDecorator.clear();
        }
    }

    /**
     * Auto-open the modified file, scroll to change location, temporarily highlight changed lines.
     */
    private async revealFileChange(filePath: string, diff?: string): Promise<void> {
        try {
            let absolutePath = filePath;
            if (!path.isAbsolute(filePath)) {
                const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                if (root) {
                    absolutePath = path.join(root, filePath);
                }
            }

            const uri = vscode.Uri.file(absolutePath);
            const doc = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(doc, {
                preview: true,
                preserveFocus: true,
            });

            const changedLines = this.parseChangedLines(diff);
            if (changedLines.length === 0) return;

            // Scroll to first changed line
            const firstLine = changedLines[0];
            const revealPos = new vscode.Position(Math.max(0, firstLine - 1), 0);
            editor.revealRange(
                new vscode.Range(revealPos, revealPos),
                vscode.TextEditorRevealType.InCenter
            );

            // Temporarily highlight changed lines
            const decorations: vscode.DecorationOptions[] = changedLines
                .filter(line => line > 0 && line <= doc.lineCount)
                .map(line => ({
                    range: new vscode.Range(line - 1, 0, line - 1, doc.lineAt(line - 1).text.length),
                }));

            if (this.changeHighlightTimer) {
                clearTimeout(this.changeHighlightTimer);
            }
            editor.setDecorations(this.changeHighlightDecoration, decorations);

            // Fade out after 3 seconds
            this.changeHighlightTimer = setTimeout(() => {
                editor.setDecorations(this.changeHighlightDecoration, []);
                this.changeHighlightTimer = undefined;
            }, 3000);
        } catch (err) {
            console.warn('[VCoder] revealFileChange failed:', filePath, err);
        }
    }

    /**
     * Parse added/modified line numbers from unified diff (new file side).
     */
    private parseChangedLines(diff?: string): number[] {
        if (!diff) return [];

        const lines = diff.split('\n');
        const changedLines: number[] = [];
        let newLineNum = 0;

        for (const line of lines) {
            const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
            if (hunkMatch) {
                newLineNum = parseInt(hunkMatch[1], 10) - 1;
                continue;
            }

            if (line.startsWith('+') && !line.startsWith('+++')) {
                newLineNum++;
                changedLines.push(newLineNum);
            } else if (line.startsWith('-') && !line.startsWith('---')) {
                // Deleted lines don't increment newLineNum
            } else if (!line.startsWith('diff ') && !line.startsWith('index ') &&
                       !line.startsWith('---') && !line.startsWith('+++') &&
                       !line.startsWith('new file') && !line.startsWith('deleted file') &&
                       !line.startsWith('\\')) {
                newLineNum++;
            }
        }

        return changedLines;
    }

    dispose(): void {
        this.changeHighlightDecoration.dispose();
        if (this.changeHighlightTimer) {
            clearTimeout(this.changeHighlightTimer);
        }
    }
}
