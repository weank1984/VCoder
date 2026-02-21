import * as vscode from 'vscode';
import * as path from 'path';
import { TextDecoder } from 'util';
import { EventEmitter } from 'events';
import { ACPClient } from '@vcoder/shared/acpClient';
import { FileChangeUpdate } from '@vcoder/shared';

type DiffSide = 'original' | 'proposed';

const LARGE_DIFF_THRESHOLD = 1 * 1024 * 1024; // 1MB
const VERY_LARGE_DIFF_THRESHOLD = 10 * 1024 * 1024; // 10MB

export type DiffDecision = 'accepted' | 'rejected';
export type PendingStatus = 'pending' | 'accepted' | 'rejected';

export interface ReviewStats {
    pending: number;
    accepted: number;
    rejected: number;
    total: number;
}

interface PendingFileChange {
    sessionId: string;
    originalPath: string;
    resolvedPath: string;
    change: FileChangeUpdate;
    status: PendingStatus;
    createdAt: number;
    originalMtime?: number;
}

const BINARY_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg', '.webp',
    '.woff', '.woff2', '.ttf', '.eot', '.otf',
    '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
    '.exe', '.dll', '.so', '.dylib', '.bin',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx',
    '.mp3', '.mp4', '.avi', '.mov', '.wav',
    '.class', '.pyc', '.pyo', '.o', '.obj',
    '.wasm',
]);

function isBinaryPath(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return BINARY_EXTENSIONS.has(ext);
}

export class DiffManager extends EventEmitter implements vscode.TextDocumentContentProvider {
    private readonly decoder = new TextDecoder('utf-8');
    private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    private pending: Map<string, PendingFileChange> = new Map();
    private previewQueue: Promise<void> = Promise.resolve();
    private conflictWatcher: vscode.Disposable | null = null;

    constructor(
        private readonly acpClient: ACPClient
    ) {
        super();
    }

    register(): vscode.Disposable {
        const providerDisposable = vscode.workspace.registerTextDocumentContentProvider('vcoder-diff', this);

        // Set up conflict detection: monitor file changes while diffs are pending
        this.conflictWatcher = vscode.workspace.onDidChangeTextDocument((e) => {
            this.handleExternalFileChange(e);
        });

        return vscode.Disposable.from(
            providerDisposable,
            this.conflictWatcher,
            { dispose: () => this.dispose() },
        );
    }

    private dispose(): void {
        this.onDidChangeEmitter.dispose();
        this.pending.clear();
        this.previewQueue = Promise.resolve();
        this.conflictWatcher?.dispose();
        this.conflictWatcher = null;
        this.removeAllListeners();
    }

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        const params = new URLSearchParams(uri.query);
        const sessionId = params.get('sessionId') ?? '';
        const filePath = params.get('path') ?? '';
        const side = (params.get('side') ?? 'original') as DiffSide;

        const key = this.getKey(sessionId, filePath);
        const entry = this.pending.get(key);

        if (side === 'proposed') {
            if (!entry) return '';
            if (entry.change.type === 'deleted') return '';
            return entry.change.content ?? entry.change.diff ?? '';
        }

        // original
        if (!entry) {
            // If the entry was already cleared, still try to read the current file as "original"
            const resolved = this.resolvePath(filePath);
            return this.readFileIfExists(resolved);
        }

        if (entry.change.type === 'created') return '';
        return this.readFileIfExists(entry.resolvedPath);
    }

    async previewChange(sessionId: string, change: FileChangeUpdate): Promise<void> {
        this.previewQueue = this.previewQueue
            .then(() => this.previewChangeInternal(sessionId, change))
            .catch((err) => {
                console.error('[DiffManager] Preview error:', err);
            });
        return this.previewQueue;
    }

    private async previewChangeInternal(sessionId: string, change: FileChangeUpdate): Promise<void> {
        const resolvedPath = this.resolvePath(change.path);
        const key = this.getKey(sessionId, change.path);

        // Record original file mtime for conflict detection
        let originalMtime: number | undefined;
        try {
            const stat = await vscode.workspace.fs.stat(vscode.Uri.file(resolvedPath));
            originalMtime = stat.mtime;
        } catch {
            // File doesn't exist yet (new file)
        }

        const entry: PendingFileChange = {
            sessionId,
            originalPath: change.path,
            resolvedPath,
            change,
            status: 'pending',
            createdAt: Date.now(),
            originalMtime,
        };
        this.pending.set(key, entry);

        // Binary file handling - skip diff view
        if (isBinaryPath(change.path)) {
            console.log(`[DiffManager] Binary file detected: ${change.path}`);
            const picked = await vscode.window.showInformationMessage(
                `VCoder: Binary file change: ${path.basename(change.path)} (${change.type})`,
                'Accept',
                'Reject'
            );
            if (picked === 'Accept') {
                await this.applyChange(entry);
                await this.acpClient.acceptFileChange(change.path, sessionId);
                entry.status = 'accepted';
                this.cleanupEntry(key, sessionId, change.path);
                this.emit('decision', { sessionId, filePath: change.path, decision: 'accepted' as DiffDecision });
            } else {
                await this.acpClient.rejectFileChange(change.path, sessionId);
                entry.status = 'rejected';
                this.cleanupEntry(key, sessionId, change.path);
                this.emit('decision', { sessionId, filePath: change.path, decision: 'rejected' as DiffDecision });
            }
            this.emitStatsUpdate(sessionId);
            return;
        }

        // Check file size for large file handling
        const contentSize = change.content ? Buffer.byteLength(change.content, 'utf-8') : 0;

        if (contentSize > VERY_LARGE_DIFF_THRESHOLD) {
            // >10MB: summary only, no diff view
            const sizeMB = (contentSize / (1024 * 1024)).toFixed(2);
            const lines = change.content?.split('\n').length || 0;
            console.warn(`[DiffManager] Very large file: ${change.path} (${sizeMB}MB)`);

            const choice = await vscode.window.showWarningMessage(
                `File too large for diff: ${path.basename(change.path)} (${sizeMB}MB, ~${lines} lines, ${change.type})`,
                'Accept',
                'Reject',
                'Force View Diff'
            );

            if (choice === 'Accept') {
                await this.applyChange(entry);
                await this.acpClient.acceptFileChange(change.path, sessionId);
                entry.status = 'accepted';
                this.cleanupEntry(key, sessionId, change.path);
                this.emit('decision', { sessionId, filePath: change.path, decision: 'accepted' as DiffDecision });
                this.emitStatsUpdate(sessionId);
                return;
            } else if (choice === 'Reject') {
                await this.acpClient.rejectFileChange(change.path, sessionId);
                entry.status = 'rejected';
                this.cleanupEntry(key, sessionId, change.path);
                this.emit('decision', { sessionId, filePath: change.path, decision: 'rejected' as DiffDecision });
                this.emitStatsUpdate(sessionId);
                return;
            } else if (choice !== 'Force View Diff') {
                // User cancelled - leave as pending
                this.emitStatsUpdate(sessionId);
                return;
            }
            // Fall through to show diff if "Force View Diff"
        } else if (contentSize > LARGE_DIFF_THRESHOLD) {
            // 1MB-10MB: warn but allow
            const sizeMB = (contentSize / (1024 * 1024)).toFixed(2);
            console.warn(`[DiffManager] Large file change detected: ${change.path} (${sizeMB}MB)`);

            const choice = await vscode.window.showWarningMessage(
                `Large file: ${path.basename(change.path)} (${sizeMB}MB). Open diff view?`,
                'Open Diff',
                'Accept Without Review',
                'Cancel'
            );

            if (choice === 'Accept Without Review') {
                await this.applyChange(entry);
                await this.acpClient.acceptFileChange(change.path, sessionId);
                entry.status = 'accepted';
                this.cleanupEntry(key, sessionId, change.path);
                this.emit('decision', { sessionId, filePath: change.path, decision: 'accepted' as DiffDecision });
                this.emitStatsUpdate(sessionId);
                return;
            } else if (choice !== 'Open Diff') {
                // Cancel - leave as pending
                this.emitStatsUpdate(sessionId);
                return;
            }
            // Fall through to show diff
        }

        const originalUri = this.createVirtualUri(sessionId, change.path, 'original');
        const proposedUri = this.createVirtualUri(sessionId, change.path, 'proposed');

        this.onDidChangeEmitter.fire(originalUri);
        this.onDidChangeEmitter.fire(proposedUri);

        await vscode.commands.executeCommand(
            'vscode.diff',
            originalUri,
            proposedUri,
            `VCoder: Preview ${path.basename(resolvedPath)}`
        );

        const canApply =
            this.isWithinWorkspace(resolvedPath) &&
            (change.type === 'deleted' || typeof change.content === 'string');
        const message = canApply
            ? `VCoder: Apply proposed change to ${change.path}?`
            : `VCoder: Showing proposed change for ${change.path} (not applicable automatically).`;

        const actions = canApply ? ['Accept', 'Reject'] as const : ['Reject'] as const;
        const picked = await vscode.window.showInformationMessage(message, ...actions);

        if (picked === 'Accept') {
            // Conflict check before applying
            const hasConflict = await this.checkConflict(entry);
            if (hasConflict) {
                const overwrite = await vscode.window.showWarningMessage(
                    `File ${change.path} was modified during review. Overwrite with proposed changes?`,
                    'Overwrite',
                    'Cancel'
                );
                if (overwrite !== 'Overwrite') {
                    this.emitStatsUpdate(sessionId);
                    return;
                }
            }

            await this.applyChange(entry);
            await this.acpClient.acceptFileChange(change.path, entry.sessionId);
            entry.status = 'accepted';
        } else if (picked === 'Reject') {
            await this.acpClient.rejectFileChange(change.path, entry.sessionId);
            entry.status = 'rejected';
        }

        this.pending.delete(key);
        this.onDidChangeEmitter.fire(originalUri);
        this.onDidChangeEmitter.fire(proposedUri);
        this.emitStatsUpdate(sessionId);
    }

    /**
     * Accept a pending file change from webview.
     * Writes content to disk and notifies server.
     */
    async acceptChange(sessionId: string, filePath: string): Promise<void> {
        const key = this.getKey(sessionId, filePath);
        const entry = this.pending.get(key);
        if (!entry) {
            console.warn(`[DiffManager] No pending change for: ${key}`);
            return;
        }

        // Conflict check
        const hasConflict = await this.checkConflict(entry);
        if (hasConflict) {
            const overwrite = await vscode.window.showWarningMessage(
                `File ${filePath} was modified during review. Overwrite?`,
                'Overwrite',
                'Cancel'
            );
            if (overwrite !== 'Overwrite') {
                return;
            }
        }

        try {
            await this.applyChange(entry);
            await this.acpClient.acceptFileChange(filePath, sessionId);
            entry.status = 'accepted';
            this.cleanupEntry(key, sessionId, filePath);
            this.emit('decision', { sessionId, filePath, decision: 'accepted' as DiffDecision });
        } catch (err) {
            console.error('[DiffManager] Accept failed:', err);
            const retry = await vscode.window.showErrorMessage(
                `Failed to apply change to ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
                'Retry',
                'Skip Diff & Write Directly',
                'Cancel'
            );
            if (retry === 'Retry') {
                await this.acceptChange(sessionId, filePath);
            } else if (retry === 'Skip Diff & Write Directly') {
                const confirm = await vscode.window.showWarningMessage(
                    `Write proposed content to ${filePath} without diff review?`,
                    'Yes',
                    'No'
                );
                if (confirm === 'Yes') {
                    await this.applyChange(entry);
                    await this.acpClient.acceptFileChange(filePath, sessionId);
                    entry.status = 'accepted';
                    this.cleanupEntry(key, sessionId, filePath);
                    this.emit('decision', { sessionId, filePath, decision: 'accepted' as DiffDecision });
                }
            }
        }
        this.emitStatsUpdate(sessionId);
    }

    /**
     * Reject a pending file change from webview.
     * Discards the proposed change and notifies server.
     */
    async rejectChange(sessionId: string, filePath: string): Promise<void> {
        const key = this.getKey(sessionId, filePath);
        const entry = this.pending.get(key);
        if (!entry) {
            console.warn(`[DiffManager] No pending change for: ${key}`);
            return;
        }

        await this.acpClient.rejectFileChange(filePath, sessionId);
        entry.status = 'rejected';
        this.cleanupEntry(key, sessionId, filePath);
        this.emit('decision', { sessionId, filePath, decision: 'rejected' as DiffDecision });
        this.emitStatsUpdate(sessionId);
    }

    /**
     * Accept all pending file changes for a session.
     */
    async acceptAll(sessionId: string): Promise<void> {
        const entries = this.getPendingForSession(sessionId);
        for (const entry of entries) {
            await this.acceptChange(sessionId, entry.originalPath);
        }
    }

    /**
     * Reject all pending file changes for a session.
     */
    async rejectAll(sessionId: string): Promise<void> {
        const entries = this.getPendingForSession(sessionId);
        for (const entry of entries) {
            await this.rejectChange(sessionId, entry.originalPath);
        }
    }

    /**
     * Get all pending file changes for a session.
     */
    getPendingChanges(sessionId?: string): PendingFileChange[] {
        if (!sessionId) {
            return Array.from(this.pending.values());
        }
        return this.getPendingForSession(sessionId);
    }

    /**
     * Clear all pending file changes for a session (e.g., on session delete).
     */
    clearSession(sessionId: string): void {
        const keysToDelete: string[] = [];
        for (const [key, entry] of this.pending) {
            if (entry.sessionId === sessionId) {
                keysToDelete.push(key);
                // Fire URI change events to clean up any open diff tabs
                const originalUri = this.createVirtualUri(sessionId, entry.originalPath, 'original');
                const proposedUri = this.createVirtualUri(sessionId, entry.originalPath, 'proposed');
                this.onDidChangeEmitter.fire(originalUri);
                this.onDidChangeEmitter.fire(proposedUri);
            }
        }
        for (const key of keysToDelete) {
            this.pending.delete(key);
        }
        if (keysToDelete.length > 0) {
            this.emitStatsUpdate(sessionId);
        }
    }

    /**
     * Get review statistics for a session.
     */
    getReviewStats(sessionId: string): ReviewStats {
        const entries = this.getPendingForSession(sessionId);
        const stats: ReviewStats = { pending: 0, accepted: 0, rejected: 0, total: entries.length };
        for (const entry of entries) {
            stats[entry.status]++;
        }
        return stats;
    }

    /**
     * Check if a file was modified externally during review.
     */
    private async checkConflict(entry: PendingFileChange): Promise<boolean> {
        if (entry.originalMtime === undefined) {
            return false; // New file, no conflict possible
        }
        try {
            const stat = await vscode.workspace.fs.stat(vscode.Uri.file(entry.resolvedPath));
            return stat.mtime !== entry.originalMtime;
        } catch {
            return false;
        }
    }

    /**
     * Handle external file change events for conflict detection.
     */
    private handleExternalFileChange(e: vscode.TextDocumentChangeEvent): void {
        if (e.contentChanges.length === 0) return;

        const filePath = e.document.uri.fsPath;
        for (const [key, entry] of this.pending) {
            if (entry.resolvedPath === filePath && entry.status === 'pending') {
                console.warn(`[DiffManager] File modified during review: ${filePath}`);
                this.emit('conflict', {
                    sessionId: entry.sessionId,
                    filePath: entry.originalPath,
                });
                break;
            }
        }
    }

    private getPendingForSession(sessionId: string): PendingFileChange[] {
        return Array.from(this.pending.values()).filter(e => e.sessionId === sessionId);
    }

    private cleanupEntry(key: string, sessionId: string, filePath: string): void {
        this.pending.delete(key);
        const originalUri = this.createVirtualUri(sessionId, filePath, 'original');
        const proposedUri = this.createVirtualUri(sessionId, filePath, 'proposed');
        this.onDidChangeEmitter.fire(originalUri);
        this.onDidChangeEmitter.fire(proposedUri);
    }

    private emitStatsUpdate(sessionId: string): void {
        this.emit('statsUpdate', { sessionId, stats: this.getReviewStats(sessionId) });
    }

    private async applyChange(entry: PendingFileChange): Promise<void> {
        if (!this.isWithinWorkspace(entry.resolvedPath)) {
            throw new Error(`Refusing to modify file outside workspace: ${entry.originalPath}`);
        }

        const targetUri = vscode.Uri.file(entry.resolvedPath);

        if (entry.change.type === 'deleted') {
            try {
                await vscode.workspace.fs.delete(targetUri, { recursive: false, useTrash: true });
            } catch {
                // ignore
            }
            return;
        }

        if (typeof entry.change.content !== 'string') {
            throw new Error('Missing proposed file content');
        }

        await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(entry.resolvedPath)));
        await vscode.workspace.fs.writeFile(targetUri, Buffer.from(entry.change.content, 'utf-8'));
    }

    private createVirtualUri(sessionId: string, filePath: string, side: DiffSide): vscode.Uri {
        const query = new URLSearchParams({
            sessionId,
            path: filePath,
            side,
        });
        // Keep a stable path for nicer tab titles.
        return vscode.Uri.parse(`vcoder-diff:/${filePath}?${query.toString()}`);
    }

    private getKey(sessionId: string, filePath: string): string {
        return `${sessionId}:${filePath}`;
    }

    private resolvePath(filePath: string): string {
        if (path.isAbsolute(filePath)) return filePath;
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        return root ? path.join(root, filePath) : path.join(process.cwd(), filePath);
    }

    private isWithinWorkspace(filePath: string): boolean {
        const roots = vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ?? [];
        if (roots.length === 0) return true;
        return roots.some((root) => {
            const rel = path.relative(root, filePath);
            return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
        });
    }

    private async readFileIfExists(filePath: string): Promise<string> {
        try {
            const data = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
            return this.decoder.decode(data);
        } catch {
            return '';
        }
    }
}
