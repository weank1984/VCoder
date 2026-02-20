import * as vscode from 'vscode';
import * as path from 'path';
import { TextDecoder } from 'util';
import { ACPClient } from '../acp/client';
import { FileChangeUpdate } from '@vcoder/shared';

type DiffSide = 'original' | 'proposed';

const LARGE_DIFF_THRESHOLD = 1 * 1024 * 1024; // 1MB

interface PendingFileChange {
    sessionId: string;
    originalPath: string;
    resolvedPath: string;
    change: FileChangeUpdate;
    createdAt: number;
}

export class DiffManager implements vscode.TextDocumentContentProvider {
    private readonly decoder = new TextDecoder('utf-8');
    private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    private pending: Map<string, PendingFileChange> = new Map();
    private previewQueue: Promise<void> = Promise.resolve();

    constructor(
        private readonly acpClient: ACPClient
    ) { }

    register(): vscode.Disposable {
        const providerDisposable = vscode.workspace.registerTextDocumentContentProvider('vcoder-diff', this);
        return vscode.Disposable.from(providerDisposable, { dispose: () => this.dispose() });
    }

    private dispose(): void {
        this.onDidChangeEmitter.dispose();
        this.pending.clear();
        this.previewQueue = Promise.resolve();
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

        const entry: PendingFileChange = {
            sessionId,
            originalPath: change.path,
            resolvedPath,
            change,
            createdAt: Date.now(),
        };
        this.pending.set(key, entry);

        // Check file size for large file handling
        const contentSize = change.content ? Buffer.byteLength(change.content, 'utf-8') : 0;
        const isLargeFile = contentSize > LARGE_DIFF_THRESHOLD;

        if (isLargeFile) {
            const sizeMB = (contentSize / (1024 * 1024)).toFixed(2);
            console.warn(`[DiffManager] Large file change detected: ${change.path} (${sizeMB}MB)`);

            // For large files, skip diff view and go directly to file
            const choice = await vscode.window.showWarningMessage(
                `File is too large for diff preview: ${path.basename(change.path)} (${sizeMB}MB). Open file directly?`,
                'Open File',
                'Show Summary',
                'Cancel'
            );

            if (choice === 'Open File') {
                // Open the file directly instead of showing diff
                const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(resolvedPath));
                await vscode.window.showTextDocument(doc);
                return;
            } else if (choice === 'Show Summary') {
                // Show a summary in an information message
                const lines = change.content?.split('\n').length || 0;
                vscode.window.showInformationMessage(
                    `File: ${change.path}\nSize: ${sizeMB}MB\nLines: ~${lines}\nType: ${change.type}`
                );
                return;
            } else {
                // User cancelled
                return;
            }
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
            await this.applyChange(entry);
            await this.acpClient.acceptFileChange(change.path, entry.sessionId);
        } else if (picked === 'Reject') {
            await this.acpClient.rejectFileChange(change.path, entry.sessionId);
        }

        this.pending.delete(key);
        this.onDidChangeEmitter.fire(originalUri);
        this.onDidChangeEmitter.fire(proposedUri);
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
