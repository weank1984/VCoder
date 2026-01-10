/**
 * Built-in MCP Server
 * Provides VSCode-specific tools via MCP protocol
 * 
 * For MVP, we implement a minimal set of safe, read-only tools.
 * This can be extended in future versions.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { McpServerConfig } from '@vcoder/shared';

/**
 * BuiltinMcpServer provides VSCode-specific tools.
 * 
 * Note: For V0.2 MVP, we keep this minimal and focus on external MCP server support.
 * A full MCP server implementation would require:
 * - HTTP/SSE server setup
 * - MCP protocol implementation
 * - Tool registration and execution
 * 
 * For now, we provide a configuration that can be injected as an external MCP server.
 */
export class BuiltinMcpServer {
    private isRunning = false;
    private serverUrl: string | null = null;

    constructor(private context: vscode.ExtensionContext) {}

    /**
     * Get built-in MCP server configuration to inject into agent sessions.
     * 
     * For MVP, we return an empty array since implementing a full MCP server
     * requires significant HTTP/SSE infrastructure.
     * 
     * Users can configure external MCP servers via settings instead.
     */
    getServerConfig(): McpServerConfig[] {
        // TODO: Implement HTTP/SSE server for built-in tools
        // For now, return empty array
        return [];
    }

    /**
     * Start the built-in MCP server (stub for future implementation).
     */
    async start(): Promise<void> {
        console.log('[BuiltinMcpServer] Built-in MCP server not implemented in V0.2 MVP');
        console.log('[BuiltinMcpServer] Please configure external MCP servers via settings');
        // TODO: Implement HTTP/SSE server
    }

    /**
     * Stop the built-in MCP server.
     */
    async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        console.log('[BuiltinMcpServer] Stopping server...');
        this.isRunning = false;
        this.serverUrl = null;
    }

    /**
     * Get server URL if running.
     */
    getServerUrl(): string | null {
        return this.serverUrl;
    }

    /**
     * Check if server is running.
     */
    isServerRunning(): boolean {
        return this.isRunning;
    }

    /**
     * Dispose and cleanup.
     */
    async dispose(): Promise<void> {
        await this.stop();
    }
}

/**
 * Tool implementations that would be provided by the built-in MCP server.
 * These are reference implementations for future development.
 */
class BuiltinTools {
    /**
     * Search workspace files using ripgrep pattern.
     */
    static async workspaceSearch(params: {
        pattern: string;
        filePattern?: string;
        maxResults?: number;
    }): Promise<{ results: Array<{ file: string; line: number; content: string }> }> {
        const results: Array<{ file: string; line: number; content: string }> = [];
        
        // Use VSCode's built-in search
        const files = await vscode.workspace.findFiles(
            params.filePattern || '**/*',
            '**/node_modules/**'
        );

        const maxResults = params.maxResults || 100;
        let resultCount = 0;

        for (const file of files) {
            if (resultCount >= maxResults) break;

            try {
                const document = await vscode.workspace.openTextDocument(file);
                const text = document.getText();
                const lines = text.split('\n');

                for (let i = 0; i < lines.length; i++) {
                    if (resultCount >= maxResults) break;
                    
                    const line = lines[i];
                    if (new RegExp(params.pattern, 'i').test(line)) {
                        results.push({
                            file: vscode.workspace.asRelativePath(file),
                            line: i + 1,
                            content: line.trim(),
                        });
                        resultCount++;
                    }
                }
            } catch (error) {
                console.warn(`[BuiltinTools] Failed to search file ${file.fsPath}:`, error);
            }
        }

        return { results };
    }

    /**
     * Get git status for workspace.
     */
    static async gitStatus(): Promise<{
        branch: string;
        modified: string[];
        untracked: string[];
    }> {
        // This would require git integration
        // For MVP, return placeholder
        return {
            branch: 'main',
            modified: [],
            untracked: [],
        };
    }

    /**
     * List workspace files.
     */
    static async listWorkspaceFiles(params: {
        pattern?: string;
    }): Promise<{ files: string[] }> {
        const files = await vscode.workspace.findFiles(
            params.pattern || '**/*',
            '**/node_modules/**'
        );

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0];
        const relativePaths = files.map(file => {
            if (workspaceRoot) {
                return path.relative(workspaceRoot.uri.fsPath, file.fsPath);
            }
            return file.fsPath;
        });

        return { files: relativePaths };
    }

    /**
     * Open file in editor.
     */
    static async openFile(params: {
        path: string;
        line?: number;
    }): Promise<{ success: boolean }> {
        try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0];
            let absolutePath = params.path;

            if (workspaceRoot && !path.isAbsolute(params.path)) {
                absolutePath = path.join(workspaceRoot.uri.fsPath, params.path);
            }

            const uri = vscode.Uri.file(absolutePath);
            const document = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(document);

            if (params.line) {
                const position = new vscode.Position(params.line - 1, 0);
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(
                    new vscode.Range(position, position),
                    vscode.TextEditorRevealType.InCenter
                );
            }

            return { success: true };
        } catch (error) {
            console.error('[BuiltinTools] Failed to open file:', error);
            return { success: false };
        }
    }

    /**
     * Get current editor selection.
     */
    static async getSelection(): Promise<{
        file: string | null;
        content: string | null;
        range: { start: number; end: number } | null;
    }> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return { file: null, content: null, range: null };
        }

        const selection = editor.selection;
        const content = editor.document.getText(selection);
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0];

        let relativePath = editor.document.uri.fsPath;
        if (workspaceRoot) {
            relativePath = path.relative(workspaceRoot.uri.fsPath, editor.document.uri.fsPath);
        }

        return {
            file: relativePath,
            content: content || null,
            range: {
                start: selection.start.line + 1,
                end: selection.end.line + 1,
            },
        };
    }
}
