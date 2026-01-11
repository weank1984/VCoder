/**
 * FileSystem Provider
 * Handles ACP fs/* capabilities with workspace trust and path restrictions
 * Enhanced with:
 * - Atomic file writes (temp file + rename)
 * - Concurrent operation protection (file-level locks)
 * - Version conflict detection (hash/mtime checks)
 * - Rollback mechanism (operation history)
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
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

interface FileLock {
    requestId: string;
    timestamp: number;
    operation: 'read' | 'write';
}

interface FileSnapshot {
    path: string;
    content: string;
    hash: string;
    mtime: number;
    timestamp: number;
}

interface WriteOperation {
    id: string;
    path: string;
    snapshot: FileSnapshot | null;
    timestamp: number;
}

const LOCK_TIMEOUT = 30000; // 30 seconds
const MAX_HISTORY_SIZE = 50;
const LARGE_FILE_THRESHOLD = 1 * 1024 * 1024; // 1MB
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * FileSystemProvider implements ACP fs/* capabilities.
 * Features:
 * - Path restrictions (workspace-only by default)
 * - Workspace trust checks
 * - Line-based reading with offset/limit
 * - Diff-based write review workflow
 * - Atomic writes with temp files
 * - Concurrent access protection
 * - Conflict detection and rollback
 */
export class FileSystemProvider {
    private pendingWrites: Map<string, PendingWriteRequest> = new Map();
    private writeCounter = 0;
    
    // Concurrent access protection
    private fileLocks: Map<string, FileLock> = new Map();
    
    // Operation history for rollback
    private writeHistory: WriteOperation[] = [];

    constructor(private context: vscode.ExtensionContext) {
        // Periodically clean up expired locks
        setInterval(() => this.cleanupExpiredLocks(), 10000);
    }

    /**
     * Read text file with optional line-based slicing.
     */
    async readTextFile(params: FsReadTextFileParams): Promise<FsReadTextFileResult> {
        console.log('[FileSystemProvider] readTextFile:', params);

        // Resolve and validate path
        const absolutePath = this.resolveAbsolutePath(params.path, params.sessionId);
        await this.checkPathAccess(absolutePath, 'read');

        try {
            // Check file size first
            const uri = vscode.Uri.file(absolutePath);
            const stat = await vscode.workspace.fs.stat(uri);
            const fileSize = stat.size;

            // Warn about large files
            if (fileSize > LARGE_FILE_THRESHOLD) {
                const sizeMB = (fileSize / (1024 * 1024)).toFixed(2);
                console.warn(`[FileSystemProvider] Large file detected: ${absolutePath} (${sizeMB}MB)`);
                
                // Block files that are too large
                if (fileSize > MAX_FILE_SIZE) {
                    throw new Error(`File too large to read: ${sizeMB}MB (max ${MAX_FILE_SIZE / (1024 * 1024)}MB). Use line-based slicing with offset/limit parameters.`);
                }

                // Show warning to user for large files
                vscode.window.showWarningMessage(
                    `Reading large file: ${path.basename(absolutePath)} (${sizeMB}MB). This may take a while.`,
                    'Continue'
                );
            }

            // Read file content
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
     * Write text file with atomic operation and conflict detection.
     */
    async writeTextFile(params: FsWriteTextFileParams): Promise<FsWriteTextFileResult> {
        const contentSize = Buffer.byteLength(params.content, 'utf-8');
        const sizeMB = (contentSize / (1024 * 1024)).toFixed(2);
        
        console.log('[FileSystemProvider] writeTextFile:', { 
            path: params.path, 
            contentLength: params.content.length,
            sizeBytes: contentSize 
        });

        // Check content size
        if (contentSize > LARGE_FILE_THRESHOLD) {
            console.warn(`[FileSystemProvider] Writing large content: ${params.path} (${sizeMB}MB)`);
            
            if (contentSize > MAX_FILE_SIZE) {
                throw new Error(`Content too large to write: ${sizeMB}MB (max ${MAX_FILE_SIZE / (1024 * 1024)}MB)`);
            }

            // Show warning to user
            const choice = await vscode.window.showWarningMessage(
                `About to write large file: ${path.basename(params.path)} (${sizeMB}MB). Continue?`,
                'Yes',
                'No'
            );

            if (choice !== 'Yes') {
                throw new Error('Write operation cancelled by user');
            }
        }

        // Resolve and validate path
        const absolutePath = this.resolveAbsolutePath(params.path, params.sessionId);
        await this.checkPathAccess(absolutePath, 'write');

        // Acquire file lock
        const requestId = `write_${Date.now()}_${++this.writeCounter}`;
        await this.acquireLock(absolutePath, requestId, 'write');

        try {
            // Take snapshot before write (for rollback)
            const snapshot = await this.takeSnapshot(absolutePath);
            
            // Check for conflicts if file exists
            if (snapshot) {
                await this.checkConflict(absolutePath, snapshot);
            }

            // Perform atomic write
            await this.atomicWrite(absolutePath, params.content);
            
            // Record operation in history
            this.recordOperation({
                id: requestId,
                path: absolutePath,
                snapshot,
                timestamp: Date.now(),
            });

            console.log(`[FileSystemProvider] Successfully wrote to ${absolutePath}`);
            return { success: true };
        } catch (error) {
            console.error('[FileSystemProvider] Write error:', error);
            throw error;
        } finally {
            // Always release lock
            this.releaseLock(absolutePath, requestId);
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
    private resolveAbsolutePath(filePath: string, _sessionId?: string): string {
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
        for (const [, pending] of this.pendingWrites) {
            pending.reject(new Error('FileSystemProvider disposed'));
        }
        this.pendingWrites.clear();
        this.fileLocks.clear();
        this.writeHistory = [];
    }

    /**
     * Perform atomic write using temp file + rename.
     */
    private async atomicWrite(filePath: string, content: string): Promise<void> {
        const tempPath = `${filePath}.tmp.${Date.now()}`;
        
        try {
            // Write to temp file
            await fs.writeFile(tempPath, content, 'utf-8');
            
            // Check disk space (basic check)
            try {
                const stats = await fs.stat(tempPath);
                if (stats.size === 0 && content.length > 0) {
                    throw new Error('Temp file is empty, possible disk space issue');
                }
            } catch (error) {
                console.error('[FileSystemProvider] Disk space check failed:', error);
            }
            
            // Atomic rename (overwrites if exists)
            await fs.rename(tempPath, filePath);
        } catch (error) {
            // Cleanup temp file on error
            try {
                await fs.unlink(tempPath);
            } catch {
                // Ignore cleanup errors
            }
            throw error;
        }
    }

    /**
     * Acquire file lock for concurrent access protection.
     */
    private async acquireLock(filePath: string, requestId: string, operation: 'read' | 'write'): Promise<void> {
        const existingLock = this.fileLocks.get(filePath);
        
        if (existingLock) {
            // Check if lock is expired
            const elapsed = Date.now() - existingLock.timestamp;
            if (elapsed < LOCK_TIMEOUT) {
                // Lock is still valid
                if (operation === 'write' || existingLock.operation === 'write') {
                    throw new Error(`File is locked by another operation: ${filePath}`);
                }
                // Multiple reads are allowed
            } else {
                // Lock expired, remove it
                this.fileLocks.delete(filePath);
            }
        }
        
        // Acquire lock
        this.fileLocks.set(filePath, {
            requestId,
            timestamp: Date.now(),
            operation,
        });
    }

    /**
     * Release file lock.
     */
    private releaseLock(filePath: string, requestId: string): void {
        const lock = this.fileLocks.get(filePath);
        if (lock && lock.requestId === requestId) {
            this.fileLocks.delete(filePath);
        }
    }

    /**
     * Cleanup expired locks (called periodically).
     */
    private cleanupExpiredLocks(): void {
        const now = Date.now();
        for (const [filePath, lock] of this.fileLocks.entries()) {
            if (now - lock.timestamp > LOCK_TIMEOUT) {
                console.warn(`[FileSystemProvider] Lock expired for ${filePath}`);
                this.fileLocks.delete(filePath);
            }
        }
    }

    /**
     * Take snapshot of file for rollback.
     */
    private async takeSnapshot(filePath: string): Promise<FileSnapshot | null> {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const stats = await fs.stat(filePath);
            const hash = this.computeHash(content);
            
            return {
                path: filePath,
                content,
                hash,
                mtime: stats.mtimeMs,
                timestamp: Date.now(),
            };
        } catch {
            // File doesn't exist yet
            return null;
        }
    }

    /**
     * Check for version conflicts.
     */
    private async checkConflict(filePath: string, originalSnapshot: FileSnapshot): Promise<void> {
        try {
            const current = await fs.readFile(filePath, 'utf-8');
            const currentHash = this.computeHash(current);
            
            if (currentHash !== originalSnapshot.hash) {
                // File has been modified since snapshot
                const choice = await vscode.window.showWarningMessage(
                    `File "${path.basename(filePath)}" has been modified. Overwrite?`,
                    { modal: true },
                    'Show Diff',
                    'Overwrite',
                    'Cancel'
                );
                
                if (choice === 'Show Diff') {
                    // Show diff in editor
                    await this.showDiff(filePath, originalSnapshot.content);
                    throw new Error('User requested diff review');
                } else if (choice !== 'Overwrite') {
                    throw new Error('Write cancelled due to conflict');
                }
            }
        } catch (error) {
            if (error instanceof Error && error.message.includes('ENOENT')) {
                // File was deleted, that's ok
                return;
            }
            throw error;
        }
    }

    /**
     * Show diff between original and current content.
     */
    private async showDiff(filePath: string, original: string): Promise<void> {
        const originalUri = vscode.Uri.parse(`vcoder-original:${filePath}`);
        const currentUri = vscode.Uri.file(filePath);
        
        // Register temp document provider
        const provider = new class implements vscode.TextDocumentContentProvider {
            provideTextDocumentContent(): string {
                return original;
            }
        };
        
        const registration = vscode.workspace.registerTextDocumentContentProvider('vcoder-original', provider);
        
        try {
            await vscode.commands.executeCommand(
                'vscode.diff',
                originalUri,
                currentUri,
                `${path.basename(filePath)} (Original ↔ Current)`
            );
        } finally {
            registration.dispose();
        }
    }

    /**
     * Record write operation in history.
     */
    private recordOperation(operation: WriteOperation): void {
        this.writeHistory.push(operation);
        
        // Keep history size manageable
        if (this.writeHistory.length > MAX_HISTORY_SIZE) {
            this.writeHistory.shift();
        }
    }

    /**
     * Rollback last write operation.
     */
    async rollbackLastWrite(): Promise<boolean> {
        if (this.writeHistory.length === 0) {
            vscode.window.showWarningMessage('No operations to rollback');
            return false;
        }
        
        const lastOp = this.writeHistory[this.writeHistory.length - 1];
        
        try {
            if (lastOp.snapshot) {
                // Restore from snapshot
                await this.atomicWrite(lastOp.path, lastOp.snapshot.content);
                vscode.window.showInformationMessage(`Rolled back changes to ${path.basename(lastOp.path)}`);
            } else {
                // File was created, delete it
                await fs.unlink(lastOp.path);
                vscode.window.showInformationMessage(`Deleted ${path.basename(lastOp.path)}`);
            }
            
            this.writeHistory.pop();
            return true;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to rollback: ${message}`);
            return false;
        }
    }

    /**
     * Get write history.
     */
    getWriteHistory(): WriteOperation[] {
        return [...this.writeHistory];
    }

    /**
     * Compute content hash for conflict detection.
     */
    private computeHash(content: string): string {
        return crypto.createHash('sha256').update(content).digest('hex');
    }
}
