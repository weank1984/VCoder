/**
 * ACP Server Implementation
 * JSON-RPC 2.0 over stdio
 */

import { Readable, Writable } from 'stream';
import { createInterface } from 'readline';
import * as os from 'os';
import * as fs from 'fs/promises';
import {
    JsonRpcRequest,
    JsonRpcResponse,
    JsonRpcNotification,
    ACPMethods,
    InitializeParams,
    InitializeResult,
    NewSessionParams,
    NewSessionResult,
    ResumeSessionParams,
    ResumeSessionResult,
    ListSessionsResult,
    SwitchSessionParams,
    DeleteSessionParams,
    CancelSessionParams,
    PromptParams,
    SettingsChangeParams,
    FileAcceptParams,
    FileRejectParams,
    BashConfirmParams,
    BashSkipParams,
    PlanConfirmParams,
    UpdateNotificationParams,
    SessionCompleteParams,
    Session,
    HistoryListParams,
    HistoryListResult,
    HistoryLoadParams,
    HistoryLoadResult,
    HistoryDeleteParams,
    HistoryDeleteResult,
    ConfirmToolParams,
    McpServerConfig,
    LspGoToDefinitionParams,
    LspGoToDefinitionResult,
    LspFindReferencesParams,
    LspFindReferencesResult,
    LspHoverParams,
    LspHoverResult,
    LspDiagnosticsParams,
    LspDiagnosticsResult,
} from '@vcoder/shared';
import { listHistorySessions, loadHistorySession, deleteHistorySession } from '../history/transcriptStore';
import { ClaudeCodeWrapper } from '../claude/wrapper';

export class ACPServer {
    private sessions: Map<string, Session> = new Map();
    private currentSessionId: string | null = null;
    private mcpConfigPath: string | null = null;
    private requestId = 0;
    private pendingRequests: Map<number | string, {
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
    }> = new Map();

    constructor(
        private stdin: Readable,
        private stdout: Writable,
        private claudeCode: ClaudeCodeWrapper
    ) {
        // Forward CLI events to ACP notifications
        this.claudeCode.on('update', (sessionId: string, update: UpdateNotificationParams['content'], type: UpdateNotificationParams['type']) => {
            this.sendNotification(ACPMethods.SESSION_UPDATE, {
                sessionId,
                type,
                content: update,
            });
        });

        this.claudeCode.on('complete', (sessionId: string, usage?: SessionCompleteParams['usage']) => {
            this.sendNotification(ACPMethods.SESSION_COMPLETE, {
                sessionId,
                usage,
            });
        });
    }

    async start(): Promise<void> {
        const rl = createInterface({ input: this.stdin });

        rl.on('line', async (line) => {
            console.error('[ACPServer] Received:', line.slice(0, 200));
            try {
                const message = JSON.parse(line);

                // Check if this is a response to our request
                if ('id' in message && message.id !== null && !('method' in message)) {
                    this.handleClientResponse(message as JsonRpcResponse);
                    return;
                }

                // Otherwise, it's a request from the client
                const request = message as JsonRpcRequest;
                console.error('[ACPServer] Handling method:', request.method);
                const response = await this.handleRequest(request);
                this.sendResponse(response);
            } catch (err) {
                console.error('[ACPServer] Error parsing message:', err);
            }
        });
    }

    /**
     * Handle response from client to our request
     */
    private handleClientResponse(response: JsonRpcResponse): void {
        const pending = this.pendingRequests.get(response.id!);
        if (pending) {
            this.pendingRequests.delete(response.id!);
            if (response.error) {
                pending.reject(new Error(response.error.message));
            } else {
                pending.resolve(response.result);
            }
        } else {
            console.warn('[ACPServer] Received response for unknown request:', response.id);
        }
    }

    async shutdown(): Promise<void> {
        if (this.mcpConfigPath) {
            const pathToDelete = this.mcpConfigPath;
            this.mcpConfigPath = null;
            try {
                await fs.unlink(pathToDelete);
            } catch {
                // ignore
            }
        }
    }

    private async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
        const { id, method, params } = request;

        try {
            let result: unknown;

            switch (method) {
                case ACPMethods.INITIALIZE:
                    result = await this.handleInitialize(params as InitializeParams);
                    break;
                case ACPMethods.SESSION_NEW:
                    result = await this.handleNewSession(params as NewSessionParams);
                    break;
                // Accept literal string to avoid runtime mismatch when @vcoder/shared dist is stale in dev.
                case 'session/resume':
                case ACPMethods.SESSION_RESUME:
                    result = await this.handleResumeSession(params as ResumeSessionParams);
                    break;
                case ACPMethods.SESSION_LIST:
                    result = await this.handleListSessions();
                    break;
                case ACPMethods.SESSION_SWITCH:
                    result = await this.handleSwitchSession(params as SwitchSessionParams);
                    break;
                case ACPMethods.SESSION_DELETE:
                    result = await this.handleDeleteSession(params as DeleteSessionParams);
                    break;
                case ACPMethods.SESSION_PROMPT:
                    result = await this.handlePrompt(params as PromptParams);
                    break;
                case ACPMethods.SETTINGS_CHANGE:
                    result = await this.handleSettingsChange(params as SettingsChangeParams);
                    break;
                case ACPMethods.FILE_ACCEPT:
                    result = await this.handleFileAccept(params as FileAcceptParams);
                    break;
                case ACPMethods.FILE_REJECT:
                    result = await this.handleFileReject(params as FileRejectParams);
                    break;
                case ACPMethods.BASH_CONFIRM:
                    result = await this.handleBashConfirm(params as BashConfirmParams);
                    break;
                case ACPMethods.BASH_SKIP:
                    result = await this.handleBashSkip(params as BashSkipParams);
                    break;
                case ACPMethods.PLAN_CONFIRM:
                    result = await this.handlePlanConfirm(params as PlanConfirmParams);
                    break;
                case ACPMethods.SESSION_CANCEL:
                    result = await this.handleSessionCancel(params as CancelSessionParams);
                    break;
                case ACPMethods.HISTORY_LIST:
                    result = await this.handleListHistory(params as HistoryListParams);
                    break;
                case ACPMethods.HISTORY_LOAD:
                    result = await this.handleLoadHistory(params as HistoryLoadParams);
                    break;
                case ACPMethods.HISTORY_DELETE:
                    result = await this.handleDeleteHistory(params as HistoryDeleteParams);
                    break;
                // Persistent Session Mode (Bidirectional Streaming)
                case ACPMethods.SESSION_PROMPT_PERSISTENT:
                    result = await this.handlePromptPersistent(params as PromptParams);
                    break;
                case ACPMethods.SESSION_MODE_STATUS:
                    result = await this.handleModeStatus(params as { sessionId: string });
                    break;
                case ACPMethods.SESSION_STOP_PERSISTENT:
                    result = await this.handleStopPersistent(params as { sessionId: string });
                    break;
                case ACPMethods.TOOL_CONFIRM:
                    result = await this.handleToolConfirm(params as ConfirmToolParams);
                    break;
                // LSP operations
                case ACPMethods.LSP_GO_TO_DEFINITION:
                    result = await this.handleLspGoToDefinition(params as LspGoToDefinitionParams);
                    break;
                case ACPMethods.LSP_FIND_REFERENCES:
                    result = await this.handleLspFindReferences(params as LspFindReferencesParams);
                    break;
                case ACPMethods.LSP_HOVER:
                    result = await this.handleLspHover(params as LspHoverParams);
                    break;
                case ACPMethods.LSP_GET_DIAGNOSTICS:
                    result = await this.handleLspGetDiagnostics(params as LspDiagnosticsParams);
                    break;
                default:
                    return {
                        jsonrpc: '2.0',
                        id,
                        error: { code: -32601, message: `Method not found: ${method}` },
                    };
            }

            // JSON-RPC success responses should include a `result` key; use `null` for void methods.
            return { jsonrpc: '2.0', id, result: result === undefined ? null : result };
        } catch (err) {
            return {
                jsonrpc: '2.0',
                id,
                error: {
                    code: -32000,
                    message: err instanceof Error ? err.message : 'Unknown error',
                },
            };
        }
    }

    // Handler implementations

    private async handleInitialize(params: InitializeParams): Promise<InitializeResult> {
        console.error('[ACPServer] Initialize:', params.clientInfo);
        return {
            serverInfo: {
                name: 'vcoder-server',
                version: '0.1.0',
            },
            capabilities: {
                models: [
                    'claude-haiku-4-5-20251001',
                    'claude-sonnet-4-5-20250929',
                    'glm-4.6',
                ],
                mcp: true,
                planMode: true,
            },
        };
    }

    private async handleNewSession(params: NewSessionParams): Promise<NewSessionResult> {
        if (params.mcpServers && params.mcpServers.length > 0) {
            const mcpConfigPath = await this.writeMcpConfig(params.mcpServers);
            this.mcpConfigPath = mcpConfigPath;
            this.claudeCode.updateSettings({ mcpConfigPath });
        }

        const session: Session = {
            id: crypto.randomUUID(),
            title: params.title || 'New Chat',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        this.sessions.set(session.id, session);
        this.currentSessionId = session.id;
        return { session };
    }

    private async handleResumeSession(params: ResumeSessionParams): Promise<ResumeSessionResult> {
        if (params.mcpServers && params.mcpServers.length > 0) {
            const mcpConfigPath = await this.writeMcpConfig(params.mcpServers);
            this.mcpConfigPath = mcpConfigPath;
            this.claudeCode.updateSettings({ mcpConfigPath });
        }

        const session: Session = {
            id: crypto.randomUUID(),
            title: params.title || 'Resumed Chat',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        this.sessions.set(session.id, session);
        this.currentSessionId = session.id;
        this.claudeCode.bindClaudeSessionId(session.id, params.claudeSessionId);
        return { session };
    }

    private async writeMcpConfig(mcpServers: McpServerConfig[]): Promise<string> {
        const servers: Record<string, Record<string, unknown>> = {};

        for (let i = 0; i < mcpServers.length; i++) {
            const server = mcpServers[i];
            const name = (server.name && server.name.trim()) ? server.name.trim() : `server_${i + 1}`;

            if (server.type === 'stdio') {
                servers[name] = {
                    command: server.command,
                    args: server.args ?? [],
                    env: server.env ?? {},
                };
            } else if (server.type === 'http') {
                // HTTP type MCP server requires 'type' and 'url' fields
                servers[name] = { 
                    type: 'http',
                    url: server.url 
                };
            } else if (server.type === 'sse') {
                // SSE type MCP server requires 'type' and 'url' fields
                servers[name] = { 
                    type: 'sse',
                    url: server.url 
                };
            }
        }

        const payload = { mcpServers: servers };
        const filePath = `${os.tmpdir()}/vcoder-mcp-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
        await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
        return filePath;
    }

    private async handleListSessions(): Promise<ListSessionsResult> {
        return { sessions: Array.from(this.sessions.values()) };
    }

    private async handleSwitchSession(params: SwitchSessionParams): Promise<void> {
        if (!this.sessions.has(params.sessionId)) {
            throw new Error(`Session not found: ${params.sessionId}`);
        }
        
        // Notify webview of session switch
        this.sendNotification(ACPMethods.SESSION_UPDATE, {
            sessionId: params.sessionId,
            type: 'session_switch',
            content: { previousSessionId: this.currentSessionId, newSessionId: params.sessionId }
        });
        
        this.currentSessionId = params.sessionId;
    }

    private async handleDeleteSession(params: DeleteSessionParams): Promise<void> {
        this.sessions.delete(params.sessionId);
        if (this.currentSessionId === params.sessionId) {
            this.currentSessionId = null;
        }
    }

    private async handlePrompt(params: PromptParams): Promise<void> {
        // Update session title from first user message if still default
        const session = this.sessions.get(params.sessionId);
        if (session && session.title === 'New Chat' && params.content) {
            // Use first 50 characters of user message as title
            const cleanContent = params.content.trim();
            if (cleanContent) {
                session.title = cleanContent.slice(0, 50) + (cleanContent.length > 50 ? '...' : '');
                session.updatedAt = new Date().toISOString();
            }
        }

        // Don't block the JSON-RPC response on the full model run; streaming happens via notifications.
        void this.claudeCode
            .prompt(params.sessionId, params.content, params.attachments)
            .catch((err) => {
                console.error('[ACPServer] Prompt error:', err);
                this.sendNotification(ACPMethods.SESSION_UPDATE, {
                    sessionId: params.sessionId,
                    type: 'error',
                    content: {
                        code: 'CLI_ERROR',
                        message: err instanceof Error ? err.message : String(err),
                    },
                } satisfies UpdateNotificationParams);
                this.sendNotification(ACPMethods.SESSION_COMPLETE, {
                    sessionId: params.sessionId,
                    reason: 'error',
                } satisfies SessionCompleteParams);
            });
    }

    private async handleSettingsChange(params: SettingsChangeParams): Promise<void> {
        this.claudeCode.updateSettings({
            model: params.model,
            planMode: params.planMode,
            permissionMode: params.permissionMode,
            fallbackModel: params.fallbackModel,
            appendSystemPrompt: params.appendSystemPrompt,
            maxThinkingTokens: params.maxThinkingTokens,
        });
    }

    private async handleFileAccept(params: FileAcceptParams): Promise<void> {
        await this.claudeCode.acceptFileChange(params.sessionId, params.path);
    }

    private async handleFileReject(params: FileRejectParams): Promise<void> {
        await this.claudeCode.rejectFileChange(params.sessionId, params.path);
    }

    private async handleBashConfirm(params: BashConfirmParams): Promise<void> {
        await this.claudeCode.confirmBash(params.sessionId, params.commandId);
    }

    private async handleBashSkip(params: BashSkipParams): Promise<void> {
        await this.claudeCode.skipBash(params.sessionId, params.commandId);
    }

    private async handlePlanConfirm(params: PlanConfirmParams): Promise<void> {
        await this.claudeCode.confirmPlan(params.sessionId);
    }

    private async handleToolConfirm(params: ConfirmToolParams): Promise<void> {
        await this.claudeCode.confirmTool(
            params.sessionId,
            params.toolCallId,
            params.confirmed,
            params.options
        );
    }

    private async handleSessionCancel(params: CancelSessionParams): Promise<void> {
        await this.claudeCode.cancel(params.sessionId);
    }

    private async handleListHistory(params: HistoryListParams): Promise<HistoryListResult> {
        const sessions = await listHistorySessions(params.workspacePath);
        return { sessions };
    }

    private async handleLoadHistory(params: HistoryLoadParams): Promise<HistoryLoadResult> {
        const messages = await loadHistorySession(params.sessionId, params.workspacePath);
        return { messages };
    }

    private async handleDeleteHistory(params: HistoryDeleteParams): Promise<HistoryDeleteResult> {
        const deleted = await deleteHistorySession(params.sessionId, params.workspacePath);
        return { deleted };
    }

    // =========================================================================
    // Persistent Session Mode Handlers
    // =========================================================================

    private async handlePromptPersistent(params: PromptParams): Promise<void> {
        // Update session title from first user message if still default
        const session = this.sessions.get(params.sessionId);
        if (session && session.title === 'New Chat' && params.content) {
            const cleanContent = params.content.trim();
            if (cleanContent) {
                session.title = cleanContent.slice(0, 50) + (cleanContent.length > 50 ? '...' : '');
                session.updatedAt = new Date().toISOString();
            }
        }

        // Use persistent session mode
        void this.claudeCode
            .promptPersistent(params.sessionId, params.content, params.attachments)
            .catch((err) => {
                console.error('[ACPServer] Persistent prompt error:', err);
                this.sendNotification(ACPMethods.SESSION_UPDATE, {
                    sessionId: params.sessionId,
                    type: 'error',
                    content: {
                        code: 'CLI_ERROR',
                        message: err instanceof Error ? err.message : String(err),
                    },
                } satisfies UpdateNotificationParams);
                this.sendNotification(ACPMethods.SESSION_COMPLETE, {
                    sessionId: params.sessionId,
                    reason: 'error',
                } satisfies SessionCompleteParams);
            });
    }

    private async handleModeStatus(params: { sessionId: string }): Promise<{ isPersistent: boolean; running: boolean; cliSessionId: string | null }> {
        const status = this.claudeCode.getPersistentSessionStatus(params.sessionId);
        if (status) {
            return {
                isPersistent: true,
                running: status.running,
                cliSessionId: status.cliSessionId,
            };
        }
        return {
            isPersistent: false,
            running: false,
            cliSessionId: null,
        };
    }

    private async handleStopPersistent(params: { sessionId: string }): Promise<void> {
        await this.claudeCode.stopPersistentSession(params.sessionId);
    }

    // =========================================================================
    // LSP Handlers (Forward to Extension via Bidirectional RPC)
    // =========================================================================

    private async handleLspGoToDefinition(params: LspGoToDefinitionParams): Promise<LspGoToDefinitionResult> {
        return this.sendRequestToClient<LspGoToDefinitionResult>(ACPMethods.LSP_GO_TO_DEFINITION, params);
    }

    private async handleLspFindReferences(params: LspFindReferencesParams): Promise<LspFindReferencesResult> {
        return this.sendRequestToClient<LspFindReferencesResult>(ACPMethods.LSP_FIND_REFERENCES, params);
    }

    private async handleLspHover(params: LspHoverParams): Promise<LspHoverResult> {
        return this.sendRequestToClient<LspHoverResult>(ACPMethods.LSP_HOVER, params);
    }

    private async handleLspGetDiagnostics(params: LspDiagnosticsParams): Promise<LspDiagnosticsResult> {
        return this.sendRequestToClient<LspDiagnosticsResult>(ACPMethods.LSP_GET_DIAGNOSTICS, params);
    }


    // Communication helpers

    private sendResponse(response: JsonRpcResponse): void {
        const respStr = JSON.stringify(response);
        console.error('[ACPServer] Sending response:', respStr.slice(0, 200));
        this.stdout.write(respStr + '\n');
    }

    private sendNotification<T>(method: string, params: T): void {
        const notification: JsonRpcNotification<T> = {
            jsonrpc: '2.0',
            method,
            params,
        };
        const notifStr = JSON.stringify(notification);
        console.error('[ACPServer] Sending notification:', method, notifStr.slice(0, 150));
        this.stdout.write(notifStr + '\n');
    }

    /**
     * Send request to client (bidirectional RPC)
     */
    private async sendRequestToClient<T>(method: string, params?: unknown): Promise<T> {
        const id = ++this.requestId;
        const request: JsonRpcRequest = {
            jsonrpc: '2.0',
            id,
            method,
            params,
        };

        return new Promise<T>((resolve, reject) => {
            this.pendingRequests.set(id, { resolve: resolve as (value: unknown) => void, reject });

            const reqStr = JSON.stringify(request);
            console.error('[ACPServer] Sending request to client:', method, reqStr.slice(0, 200));
            this.stdout.write(reqStr + '\n');

            // Set timeout for request
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`Request timeout: ${method}`));
                }
            }, 30000); // 30 second timeout
        });
    }
}
