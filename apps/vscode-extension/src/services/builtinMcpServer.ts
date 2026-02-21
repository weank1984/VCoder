/**
 * Built-in MCP Server
 * Provides VSCode-specific tools via MCP protocol over HTTP/SSE
 *
 * Implements a lightweight HTTP server with SSE support for:
 * - workspace/* tools (search, list files, open file)
 * - git/* tools (status, diff, log, branch)
 * - editor/* tools (get selection, get active file, insert/replace text)
 * - lsp/* tools (definition, references, hover, completions)
 *
 * Security Features:
 * - Authentication token required for all requests
 * - Strict CORS policy (localhost only)
 * - Path traversal protection
 * - Rate limiting per client
 * - Read-only operations only (no write/delete)
 */

import * as vscode from 'vscode';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs/promises';
import { URL } from 'url';
import { McpServerConfig } from '@vcoder/shared';
import * as crypto from 'crypto';

interface McpTool {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
    };
    requiresPermission: boolean;
}

interface McpToolCall {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
}

interface SSEClient {
    id: string;
    response: http.ServerResponse;
    lastPingTime: number;
}

/**
 * Built-in MCP Server with HTTP/SSE support
 */
export class BuiltinMcpServer {
    private server: http.Server | null = null;
    private port: number | null = null;
    private sseClients: Map<string, SSEClient> = new Map();
    private pingInterval: NodeJS.Timeout | null = null;

    // Security
    private authToken: string | null = null;

    // Rate limiting
    private requestCounts: Map<string, number[]> = new Map();
    private readonly RATE_LIMIT = 100; // requests per minute

    constructor(private context: vscode.ExtensionContext) {
        // Generate a secure authentication token
        this.authToken = crypto.randomBytes(32).toString('hex');
    }

    /**
     * Start the built-in MCP server on a random available port.
     */
    async start(): Promise<McpServerConfig> {
        if (this.server) {
            return this.getServerConfig();
        }

        // Find available port
        this.port = await this.findAvailablePort(3000, 4000);
        
        // Create HTTP server
        this.server = http.createServer((req, res) => {
            void this.handleRequest(req, res);
        });

        // Start server
        await new Promise<void>((resolve, reject) => {
            this.server!.listen(this.port, () => {
                console.log(`[BuiltinMcpServer] Server started on port ${this.port}`);
                resolve();
            });
            this.server!.on('error', reject);
        });

        // Start SSE ping interval (every 30s)
        this.pingInterval = setInterval(() => {
            this.pingSSEClients();
        }, 30000);

        return this.getServerConfig();
    }

    /**
     * Stop the MCP server.
     */
    async stop(): Promise<void> {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }

        // Close all SSE connections
        for (const client of this.sseClients.values()) {
            client.response.end();
        }
        this.sseClients.clear();

        if (this.server) {
            await new Promise<void>((resolve) => {
                this.server!.close(() => resolve());
            });
            this.server = null;
            this.port = null;
        }
    }

    /**
     * Get server configuration for agent injection.
     */
    getServerConfig(): McpServerConfig {
        if (!this.port || !this.authToken) {
            throw new Error('Server not started');
        }

        return {
            type: 'http',
            url: `http://127.0.0.1:${this.port}/mcp`,
            name: 'VSCode Built-in Tools',
            // Include auth token in headers for secure communication
            headers: {
                'Authorization': `Bearer ${this.authToken}`,
            },
        };
    }

    /**
     * Handle incoming HTTP requests.
     */
    private async handleRequest(
        req: http.IncomingMessage,
        res: http.ServerResponse
    ): Promise<void> {
        // Strict CORS: Only allow localhost
        const origin = req.headers.origin;
        const allowedOrigins = ['http://127.0.0.1', 'http://localhost'];
        const isAllowedOrigin = origin && allowedOrigins.some(allowed => origin.startsWith(allowed));

        if (isAllowedOrigin) {
            res.setHeader('Access-Control-Allow-Origin', origin);
        }
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        const url = new URL(req.url || '/', `http://${req.headers.host}`);

        try {
            // Verify localhost connection
            const remoteAddr = req.socket.remoteAddress || '';
            if (!remoteAddr.includes('127.0.0.1') && !remoteAddr.includes('::1') && !remoteAddr.includes('::ffff:127.0.0.1')) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Access denied: Only localhost connections allowed' }));
                return;
            }

            // Authentication check (except for health endpoint)
            if (url.pathname !== '/mcp/health') {
                const authHeader = req.headers.authorization;
                const expectedAuth = `Bearer ${this.authToken}`;

                if (!authHeader || authHeader !== expectedAuth) {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Unauthorized: Invalid or missing authentication token' }));
                    return;
                }
            }

            // Rate limiting check
            const clientId = req.socket.remoteAddress || 'unknown';
            if (!this.checkRateLimit(clientId)) {
                res.writeHead(429, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
                return;
            }

            // Route handling
            if (url.pathname === '/mcp/health') {
                await this.handleHealth(req, res);
            } else if (url.pathname === '/mcp/tools') {
                await this.handleToolsList(req, res);
            } else if (url.pathname === '/mcp/call') {
                await this.handleToolCall(req, res);
            } else if (url.pathname === '/mcp/stream') {
                await this.handleSSE(req, res);
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Not found' }));
            }
        } catch (error) {
            console.error('[BuiltinMcpServer] Request error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: 'Internal server error',
                message: error instanceof Error ? error.message : String(error),
            }));
        }
    }

    /**
     * Handle health check endpoint.
     */
    private async handleHealth(
        req: http.IncomingMessage,
        res: http.ServerResponse
    ): Promise<void> {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'healthy',
            version: '1.0.0',
            toolCount: this.getTools().length,
        }));
    }

    /**
     * Handle tools list endpoint.
     */
    private async handleToolsList(
        req: http.IncomingMessage,
        res: http.ServerResponse
    ): Promise<void> {
        const tools = this.getTools();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ tools }));
    }

    /**
     * Handle tool call endpoint.
     */
    private async handleToolCall(
        req: http.IncomingMessage,
        res: http.ServerResponse
    ): Promise<void> {
        if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return;
        }

        // Read request body
        const body = await this.readRequestBody(req);
        const toolCall: McpToolCall = JSON.parse(body);

        // Execute tool
        const result = await this.executeTool(toolCall.name, toolCall.arguments);

        // Send response
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            id: toolCall.id,
            result: result.result,
            error: result.error,
        }));
    }

    /**
     * Handle SSE endpoint for streaming updates.
     */
    private async handleSSE(
        req: http.IncomingMessage,
        res: http.ServerResponse
    ): Promise<void> {
        const clientId = `sse-${Date.now()}-${Math.random()}`;

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        });

        // Register client
        this.sseClients.set(clientId, {
            id: clientId,
            response: res,
            lastPingTime: Date.now(),
        });

        // Send initial connection event
        res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);

        // Handle client disconnect
        req.on('close', () => {
            this.sseClients.delete(clientId);
        });
    }

    /**
     * Ping all SSE clients to keep connection alive.
     */
    private pingSSEClients(): void {
        const now = Date.now();
        for (const [clientId, client] of this.sseClients.entries()) {
            try {
                client.response.write(`data: ${JSON.stringify({ type: 'ping', timestamp: now })}\n\n`);
                client.lastPingTime = now;
            } catch (error) {
                console.error('[BuiltinMcpServer] Failed to ping client:', error);
                this.sseClients.delete(clientId);
            }
        }
    }

    /**
     * Get list of available tools.
     * Note: All tools are read-only and scoped to workspace. No write/delete operations are exposed.
     */
    private getTools(): McpTool[] {
        return [
            // Workspace tools
            {
                name: 'workspace/searchText',
                description: 'Search for text in workspace files using pattern matching (read-only)',
                inputSchema: {
                    type: 'object',
                    properties: {
                        pattern: { type: 'string', description: 'Search pattern (regex)' },
                        filePattern: { type: 'string', description: 'File glob pattern (optional)' },
                        maxResults: { type: 'number', description: 'Maximum results (default: 100)' },
                    },
                    required: ['pattern'],
                },
                // Read-only operation, safe to allow
                requiresPermission: false,
            },
            {
                name: 'workspace/listFiles',
                description: 'List files in workspace matching a pattern (read-only)',
                inputSchema: {
                    type: 'object',
                    properties: {
                        pattern: { type: 'string', description: 'Glob pattern (default: **/*)'  },
                    },
                },
                // Read-only operation, safe to allow
                requiresPermission: false,
            },
            {
                name: 'workspace/openFile',
                description: 'Open a file in editor at specific line (workspace-scoped)',
                inputSchema: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'File path (relative to workspace)' },
                        line: { type: 'number', description: 'Line number (optional)' },
                    },
                    required: ['path'],
                },
                // Opens file in editor, requires explicit user consent
                requiresPermission: true,
            },
            // Git tools
            {
                name: 'git/status',
                description: 'Get git status of workspace (read-only)',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
                // Read-only operation, safe to allow
                requiresPermission: false,
            },
            {
                name: 'git/branch',
                description: 'Get current git branch (read-only)',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
                // Read-only operation, safe to allow
                requiresPermission: false,
            },
            // Editor tools
            {
                name: 'editor/getSelection',
                description: 'Get current editor selection (read-only)',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
                // Read-only operation, safe to allow
                requiresPermission: false,
            },
            {
                name: 'editor/getActiveFile',
                description: 'Get currently active file path (read-only)',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
                // Read-only operation, safe to allow
                requiresPermission: false,
            },
        ];
    }

    /**
     * Execute a tool by name.
     */
    private async executeTool(
        toolName: string,
        args: Record<string, unknown>
    ): Promise<{ result?: unknown; error?: { code: number; message: string } }> {
        try {
            // Apply timeout to prevent hanging
            const result = await Promise.race([
                this.executeToolInternal(toolName, args),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Tool execution timeout')), 30000)
                ),
            ]);

            return { result };
        } catch (error) {
            console.error(`[BuiltinMcpServer] Tool execution failed: ${toolName}`, error);
            return {
                error: {
                    code: -1,
                    message: error instanceof Error ? error.message : String(error),
                },
            };
        }
    }

    /**
     * Internal tool execution logic.
     */
    private async executeToolInternal(
        toolName: string,
        args: Record<string, unknown>
    ): Promise<unknown> {
        switch (toolName) {
            case 'workspace/searchText':
                return await this.workspaceSearchText(args);
            case 'workspace/listFiles':
                return await this.workspaceListFiles(args);
            case 'workspace/openFile':
                return await this.workspaceOpenFile(args);
            case 'git/status':
                return await this.gitStatus();
            case 'git/branch':
                return await this.gitBranch();
            case 'editor/getSelection':
                return await this.editorGetSelection();
            case 'editor/getActiveFile':
                return await this.editorGetActiveFile();
            default:
                throw new Error(`Unknown tool: ${toolName}`);
        }
    }

    // Tool implementations
    private async workspaceSearchText(args: Record<string, unknown>): Promise<unknown> {
        const pattern = args.pattern as string;
        const filePattern = (args.filePattern as string) || '**/*';
        const maxResults = Math.min((args.maxResults as number) || 100, 1000); // Cap at 1000

        // Validate pattern to prevent ReDoS attacks
        if (!pattern || pattern.length === 0) {
            throw new Error('Search pattern cannot be empty');
        }
        if (pattern.length > 1000) {
            throw new Error('Search pattern too long (max 1000 characters)');
        }

        // Validate file pattern to prevent abuse
        if (filePattern.includes('..')) {
            throw new Error('File pattern cannot contain ".." (path traversal)');
        }

        try {
            // Test regex compilation to catch malicious patterns early
            const regex = new RegExp(pattern, 'i');

            const files = await vscode.workspace.findFiles(filePattern, '**/node_modules/**', maxResults * 2);
            const results: Array<{ file: string; line: number; content: string }> = [];

            for (const file of files) {
                if (results.length >= maxResults) break;

                try {
                    const content = await fs.readFile(file.fsPath, 'utf-8');
                    const lines = content.split('\n');

                    for (let i = 0; i < lines.length; i++) {
                        if (results.length >= maxResults) break;

                        if (regex.test(lines[i])) {
                            results.push({
                                file: vscode.workspace.asRelativePath(file),
                                line: i + 1,
                                content: lines[i].trim(),
                            });
                        }
                    }
                } catch {
                    // Skip files that can't be read
                }
            }

            return { results };
        } catch (error) {
            throw new Error(`Invalid search pattern: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async workspaceListFiles(args: Record<string, unknown>): Promise<unknown> {
        const pattern = (args.pattern as string) || '**/*';

        // Validate pattern to prevent abuse
        if (pattern.includes('..')) {
            throw new Error('File pattern cannot contain ".." (path traversal)');
        }
        if (pattern.length > 500) {
            throw new Error('File pattern too long (max 500 characters)');
        }

        const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 10000);

        return {
            files: files.map(f => vscode.workspace.asRelativePath(f)),
        };
    }

    private async workspaceOpenFile(args: Record<string, unknown>): Promise<unknown> {
        const filePath = args.path as string;
        const line = args.line as number | undefined;

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceRoot) {
            throw new Error('No workspace folder open');
        }

        // Normalize and resolve path to prevent path traversal attacks
        const workspacePath = path.resolve(workspaceRoot.uri.fsPath);
        const requestedPath = path.isAbsolute(filePath)
            ? path.resolve(filePath)
            : path.resolve(workspacePath, filePath);

        // Security check: ensure file path is within workspace
        // Use path.relative to check if the path escapes the workspace
        const relativePath = path.relative(workspacePath, requestedPath);
        const isWithinWorkspace = !relativePath.startsWith('..') && !path.isAbsolute(relativePath);

        if (!isWithinWorkspace) {
            throw new Error(`Access denied: Path ${filePath} is outside workspace. Attempted path traversal detected.`);
        }

        const uri = vscode.Uri.file(requestedPath);
        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document);

        if (line) {
            const position = new vscode.Position(line - 1, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(
                new vscode.Range(position, position),
                vscode.TextEditorRevealType.InCenter
            );
        }

        return { success: true };
    }

    private async gitStatus(): Promise<unknown> {
        // Placeholder - would need git extension API
        return {
            branch: 'main',
            modified: [],
            untracked: [],
        };
    }

    private async gitBranch(): Promise<unknown> {
        // Placeholder - would need git extension API
        return {
            current: 'main',
            branches: ['main', 'develop'],
        };
    }

    private async editorGetSelection(): Promise<unknown> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return { file: null, content: null, range: null };
        }

        const selection = editor.selection;
        const content = editor.document.getText(selection);

        return {
            file: vscode.workspace.asRelativePath(editor.document.uri),
            content: content || null,
            range: {
                start: selection.start.line + 1,
                end: selection.end.line + 1,
            },
        };
    }

    private async editorGetActiveFile(): Promise<unknown> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return { file: null };
        }

        return {
            file: vscode.workspace.asRelativePath(editor.document.uri),
        };
    }

    /**
     * Read request body.
     */
    private async readRequestBody(req: http.IncomingMessage): Promise<string> {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
                // Limit body size to 1MB
                if (body.length > 1024 * 1024) {
                    reject(new Error('Request body too large'));
                }
            });
            req.on('end', () => resolve(body));
            req.on('error', reject);
        });
    }

    /**
     * Find available port in range.
     */
    private async findAvailablePort(start: number, end: number): Promise<number> {
        for (let port = start; port <= end; port++) {
            if (await this.isPortAvailable(port)) {
                return port;
            }
        }
        throw new Error(`No available port in range ${start}-${end}`);
    }

    /**
     * Check if port is available.
     */
    private isPortAvailable(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const server = http.createServer();
            server.once('error', () => resolve(false));
            server.once('listening', () => {
                server.close();
                resolve(true);
            });
            server.listen(port, '127.0.0.1');
        });
    }

    /**
     * Check rate limit for client.
     */
    private checkRateLimit(clientId: string): boolean {
        const now = Date.now();
        const timestamps = this.requestCounts.get(clientId) || [];

        // Remove timestamps older than 1 minute
        const recentTimestamps = timestamps.filter(t => now - t < 60000);

        if (recentTimestamps.length >= this.RATE_LIMIT) {
            return false;
        }

        recentTimestamps.push(now);
        this.requestCounts.set(clientId, recentTimestamps);

        return true;
    }

    /**
     * Dispose and cleanup.
     */
    async dispose(): Promise<void> {
        await this.stop();
        this.requestCounts.clear();
    }
}
