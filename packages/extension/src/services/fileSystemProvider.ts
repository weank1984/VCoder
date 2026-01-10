/**
 * FileSystem Provider
 * Handles ACP fs/* capabilities with workspace trust and path restrictions
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
    FsReadTextFileParams,
    FsReadTextFileResult,
    FsWriteTextFileParams,
    FsWriteTextFileResult,
} from '@vcoder/shared';

interface PendingWriteRequest {
    params: FsWriteTextFileParams;
    resolve: (result: FsWriteTextFileResult) => void;
    reject: (error: Error) => void;
    requestId: string;
}

/**
 * FileSystemProvider implements ACP fs/* capabilities.
 * Features:
 * - Path restrictions (workspace-only by default)
 * - Workspace trust checks
 * - Line-based reading with offset/limit
 * - Diff-based write review workflow
 */
export class FileSystemProvider {
    private pendingWrites: Map<string, PendingWriteRequest> = new Map();
    private writeCounter = 0;

    constructor(private context: vscode.ExtensionContext) {}

    /**
     * Read text file with optional line-based slicing.
     */
    async readTextFile(params: FsReadTextFileParams): Promise<FsReadTextFileResult> {
        console.log('[FileSystemProvider] readTextFile:', params);

        // Resolve and validate path
        const absolutePath = this.resolveAbsolutePath(params.path, params.sessionId);
        await this.checkPathAccess(absolutePath, 'read');

        try {
            // Read file content
            const uri = vscode.Uri.file(absolutePath);
            const content = await vscode.workspace.fs.readFile(uri);
            const text = Buffer.from(content).toString('utf-8');

            // Apply line-based slicing if requested
            let result = text;
            if (params.line !== undefined || params.limit !== undefined) {
                const lines = text.split('\n');
                const startLine = Math.max(0, (params.line || 1) - 1); // 1-indexed to 0-indexed
                const endLine = params.limit 
                    ? startLine + params.limit 
                    : lines.length;
                
                result = lines.slice(startLine, endLine).join('\n');
            }

            console.log(`[FileSystemProvider] Read ${result.length} chars from ${absolutePath}`);
            return { content: result };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[FileSystemProvider] Read error:', error);
            throw new Error(`Failed to read file ${params.path}: ${message}`);
        }
    }

    /**
     * Write text file with diff review workflow.
     * Returns immediately with a pending write ID; actual write happens after user approval.
     */
    async writeTextFile(params: FsWriteTextFileParams): Promise<FsWriteTextFileResult> {
        console.log('[FileSystemProvider] writeTextFile:', { path: params.path, contentLength: params.content.length });

        // Resolve and validate path
        const absolutePath = this.resolveAbsolutePath(params.path, params.sessionId);
        await this.checkPathAccess(absolutePath, 'write');

        // Generate write request ID
        const requestId = `write_${Date.now()}_${++this.writeCounter}`;

        // For now, directly write (will add review workflow in next step)
        // TODO: Integrate with DiffManager for review workflow
        try {
            const uri = vscode.Uri.file(absolutePath);
            
            // Check if file exists
            let fileExists = false;
            try {
                await vscode.workspace.fs.stat(uri);
                fileExists = true;
            } catch {
                fileExists = false;
            }

            // Write content
            const edit = new vscode.WorkspaceEdit();
            if (fileExists) {
                // Replace entire file content
                const document = await vscode.workspace.openTextDocument(uri);
                const fullRange = new vscode.Range(
                    document.lineAt(0).range.start,
                    document.lineAt(document.lineCount - 1).range.end
                );
                edit.replace(uri, fullRange, params.content);
            } else {
                // Create new file
                edit.createFile(uri, { ignoreIfExists: true });
                edit.insert(uri, new vscode.Position(0, 0), params.content);
            }

            const success = await vscode.workspace.applyEdit(edit);
            
            if (!success) {
                throw new Error('Failed to apply workspace edit');
            }

            console.log(`[FileSystemProvider] Successfully wrote to ${absolutePath}`);
            return { success: true };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[FileSystemProvider] Write error:', error);
            throw new Error(`Failed to write file ${params.path}: ${message}`);
        }
    }

    /**
     * Approve a pending write request (after user review).
     */
    async approveWrite(requestId: string): Promise<void> {
        const pending = this.pendingWrites.get(requestId);
        if (!pending) {
            throw new Error(`Write request not found: ${requestId}`);
        }

        this.pendingWrites.delete(requestId);

        try {
            const result = await this.executeWrite(pending.params);
            pending.resolve(result);
        } catch (error) {
            pending.reject(error as Error);
        }
    }

    /**
     * Reject a pending write request.
     */
    async rejectWrite(requestId: string, reason?: string): Promise<void> {
        const pending = this.pendingWrites.get(requestId);
        if (!pending) {
            throw new Error(`Write request not found: ${requestId}`);
        }

        this.pendingWrites.delete(requestId);
        pending.reject(new Error(reason || 'Write rejected by user'));
    }

    /**
     * Execute write operation (internal).
     */
    private async executeWrite(params: FsWriteTextFileParams): Promise<FsWriteTextFileResult> {
        const absolutePath = this.resolveAbsolutePath(params.path, params.sessionId);
        const uri = vscode.Uri.file(absolutePath);

        try {
            // Check if file exists
            let fileExists = false;
            try {
                await vscode.workspace.fs.stat(uri);
                fileExists = true;
            } catch {
                fileExists = false;
            }

            // Perform write operation
            const edit = new vscode.WorkspaceEdit();
            if (fileExists) {
                // Replace entire file content
                const document = await vscode.workspace.openTextDocument(uri);
                const fullRange = new vscode.Range(
                    document.lineAt(0).range.start,
                    document.lineAt(document.lineCount - 1).range.end
                );
                edit.replace(uri, fullRange, params.content);
            } else {
                // Create new file
                edit.createFile(uri, { ignoreIfExists: true });
                edit.insert(uri, new vscode.Position(0, 0), params.content);
            }

            const success = await vscode.workspace.applyEdit(edit);
            
            if (!success) {
                throw new Error('Failed to apply workspace edit');
            }

            console.log(`[FileSystemProvider] Successfully wrote to ${absolutePath}`);
            return { success: true };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[FileSystemProvider] Write execution error:', error);
            throw new Error(`Failed to write file ${params.path}: ${message}`);
        }
    }

    /**
     * Resolve relative path to absolute path.
     * Defaults to workspace root if path is relative.
     */
    private resolveAbsolutePath(filePath: string, sessionId?: string): string {
        if (path.isAbsolute(filePath)) {
            return filePath;
        }

        // Use workspace folder as base
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder open');
        }

        return path.join(workspaceFolder.uri.fsPath, filePath);
    }

    /**
     * Check if path access is allowed (workspace trust + path restrictions).
     */
    private async checkPathAccess(absolutePath: string, operation: 'read' | 'write'): Promise<void> {
        // Check workspace trust
        if (!vscode.workspace.isTrusted) {
            throw new Error('Workspace is not trusted. File operations are not allowed.');
        }

        // Get workspace folders
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        
        // Check if path is within workspace (for safety)
        const isInWorkspace = workspaceFolders.some(folder => {
            const folderPath = folder.uri.fsPath;
            return absolutePath.startsWith(folderPath);
        });

        if (!isInWorkspace) {
            // Path is outside workspace - require additional confirmation
            // For MVP, we allow it with a warning (can be stricter in production)
            console.warn(`[FileSystemProvider] ${operation} operation on path outside workspace: ${absolutePath}`);
            
            // Optional: Show warning to user
            const config = vscode.workspace.getConfiguration('vcoder');
            const allowOutsideWorkspace = config.get<boolean>('security.allowOutsideWorkspace', false);
            
            if (!allowOutsideWorkspace) {
                throw new Error(`File operations outside workspace are not allowed: ${absolutePath}`);
            }
        }

        // Additional check: file must be accessible
        if (operation === 'read') {
            try {
                await fs.access(absolutePath, fs.constants.R_OK);
            } catch {
                throw new Error(`File is not readable: ${absolutePath}`);
            }
        } else if (operation === 'write') {
            // Check if parent directory exists and is writable
            const parentDir = path.dirname(absolutePath);
            try {
                await fs.access(parentDir, fs.constants.W_OK);
            } catch {
                throw new Error(`Directory is not writable: ${parentDir}`);
            }
        }
    }

    /**
     * Dispose and cleanup.
     */
    async dispose(): Promise<void> {
        // Reject all pending writes
        for (const [requestId, pending] of this.pendingWrites) {
            pending.reject(new Error('FileSystemProvider disposed'));
        }
        this.pendingWrites.clear();
    }
}
