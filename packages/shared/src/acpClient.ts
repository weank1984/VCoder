/**
 * ACP Client
 * JSON-RPC 2.0 client over stdio
 */

import { type Readable, type Writable } from 'node:stream';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';
import {
    type JsonRpcRequest,
    type JsonRpcResponse,
    type JsonRpcNotification,
    type JsonRpcError,
    ACPMethods,
    type InitializeParams,
    type InitializeResult,
    type ListSessionsResult,
    type PromptParams,
    type SettingsChangeParams,
    type UpdateNotificationParams,
    type SessionCompleteParams,
    type Session,
    type ModelId,
    type PermissionMode,
    type McpServerConfig,
    type ResumeSessionParams,
    type HistorySession,
    type HistoryChatMessage,
    type HistoryListResult,
    type HistoryLoadResult,
    type HistoryDeleteResult,
} from './protocol';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const isSession = (value: unknown): value is Session =>
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string';

export class ACPClient extends EventEmitter {
    private requestId = 0;
    // Session-isolated pending requests: Map<sessionId, Map<requestId, Promise>>
    // Note: requests without sessionId use 'global' key for backward compatibility
    private pendingRequests: Map<string, Map<number | string, {
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
        timeout?: NodeJS.Timeout;
    }>> = new Map();

    // Handler for agent->client requests
    private requestHandlers: Map<string, (params: unknown) => Promise<unknown>> = new Map();

    private currentSession: Session | null = null;
    private desiredSettings: Pick<SettingsChangeParams, 'model' | 'planMode' | 'permissionMode' | 'maxThinkingTokens'> = {};
    private writeCallback: ((line: string) => void) | null = null;
    private readlineInterface: ReturnType<typeof createInterface> | null = null;

    // Request timeout in milliseconds (default: 30 seconds)
    private readonly REQUEST_TIMEOUT = 30000;

    constructor(private stdio: { stdin: Writable; stdout: Readable }) {
        super();
        this.setupMessageHandler();
    }

    private cleanupReadline(): void {
        if (!this.readlineInterface) return;
        const rl = this.readlineInterface;
        this.readlineInterface = null;

        try {
            rl.removeAllListeners();
            rl.close();
        } catch (error) {
            console.error('[ACPClient] Error during readline cleanup:', error);
        }

        const input = (rl as unknown as { input?: Readable }).input;
        if (input) {
            input.removeAllListeners('data');
        }
    }

    updateTransport(stdout: Readable, stdin: Writable) {
        // 1. Clean up old readline interface
        this.cleanupReadline();

        // 2. Reject all pending requests (old process won't respond)
        for (const [, requests] of this.pendingRequests) {
            for (const [, pending] of requests) {
                if (pending.timeout) clearTimeout(pending.timeout);
                pending.reject(new Error('Transport switched'));
            }
        }
        this.pendingRequests.clear();

        // 3. Reset state for new process
        this.requestId = 0;
        this.currentSession = null;
        this.desiredSettings = {};

        // 4. Update stdio streams and set up handler
        this.stdio = { stdout, stdin };
        this.setupMessageHandler();
    }

    private setupMessageHandler(): void {
        const rl = createInterface({ input: this.stdio.stdout });
        this.readlineInterface = rl;

        rl.on('line', (line) => {
            this.handleMessage(line);
        });
    }

    /**
     * Handle incoming message line from agent.
     * Can be called externally when bridging with AgentProcessManager.
     */
    handleMessage(line: string): void {
        try {
            const message = JSON.parse(line);
            console.log('[ACPClient] Received:', JSON.stringify(message).slice(0, 200));

            if ('id' in message && message.id !== null) {
                if ('method' in message) {
                    // This is a request from agent to client
                    void this.handleAgentRequest(message as JsonRpcRequest);
                } else {
                    // This is a response to our request
                    this.handleResponse(message as JsonRpcResponse);
                }
            } else if ('method' in message) {
                // Notification
                this.handleNotification(message as JsonRpcNotification);
            }
        } catch (err) {
            console.error('[ACPClient] Error parsing message:', err);
        }
    }

    private handleResponse(response: JsonRpcResponse): void {
        // Find the pending request across all sessions
        let found = false;
        for (const [sessionKey, sessionRequests] of this.pendingRequests.entries()) {
            const pending = sessionRequests.get(response.id!);
            if (pending) {
                sessionRequests.delete(response.id!);
                // Clean up empty session map
                if (sessionRequests.size === 0) {
                    this.pendingRequests.delete(sessionKey);
                }
                // Clear timeout if exists
                if (pending.timeout) {
                    clearTimeout(pending.timeout);
                }
                // Resolve or reject the promise
                if (response.error) {
                    pending.reject(new Error(response.error.message));
                } else {
                    pending.resolve(response.result);
                }
                found = true;
                break;
            }
        }
        if (!found) {
            console.warn('[ACPClient] Received response for unknown request:', response.id);
        }
    }

    private handleNotification(notification: JsonRpcNotification): void {
        switch (notification.method) {
            case ACPMethods.SESSION_UPDATE:
                {
                    const params: unknown = notification.params;
                    // Handle legacy update format with 'update' field instead of 'type'
                    if (isRecord(params) && 'update' in params) {
                        console.log('[ACPClient] Ignoring legacy update format');
                        return;
                    }
                    // Standard format: { sessionId, type, content }
                    this.emit('session/update', params as UpdateNotificationParams);
                }
                break;
            case ACPMethods.SESSION_COMPLETE:
                this.emit('session/complete', notification.params as SessionCompleteParams);
                break;
        }
    }

    /**
     * Handle request from agent to client (bidirectional JSON-RPC).
     */
    private async handleAgentRequest(request: JsonRpcRequest): Promise<void> {
        const handler = this.requestHandlers.get(request.method);

        if (!handler) {
            console.warn(`[ACPClient] No handler registered for agent request: ${request.method}`);
            this.sendError(request.id, {
                code: -32601,
                message: `Method not found: ${request.method}`,
            });
            return;
        }

        try {
            const result = await handler(request.params);
            this.sendResponse(request.id, result);
        } catch (error) {
            console.error(`[ACPClient] Error handling agent request ${request.method}:`, error);
            this.sendError(request.id, {
                code: -32603,
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }

    /**
     * Send response to agent request.
     */
    private sendResponse(id: number | string, result: unknown): void {
        const response: JsonRpcResponse = {
            jsonrpc: '2.0',
            id,
            result,
        };
        this.write(JSON.stringify(response));
    }

    /**
     * Send error response to agent request.
     */
    private sendError(id: number | string, error: JsonRpcError): void {
        const response: JsonRpcResponse = {
            jsonrpc: '2.0',
            id,
            error,
        };
        this.write(JSON.stringify(response));
    }

    /**
     * Write a message to the agent.
     */
    private write(line: string): void {
        const data = line.endsWith('\n') ? line : line + '\n';

        if (this.writeCallback) {
            this.writeCallback(data);
        } else {
            this.stdio.stdin.write(data, 'utf-8');
        }
    }

    private async sendRequest<T>(method: string, params?: unknown, sessionId?: string): Promise<T> {
        if (typeof method !== 'string' || method.trim().length === 0) {
            throw new Error(`Invalid JSON-RPC method: ${String(method)}`);
        }
        const id = ++this.requestId;
        const request: JsonRpcRequest = {
            jsonrpc: '2.0',
            id,
            method,
            params,
        };

        return new Promise((resolve, reject) => {
            // Use sessionId if provided, otherwise use 'global' for session management requests
            const sessionKey = sessionId || this.currentSession?.id || 'global';

            // Get or create session-specific pending requests map
            let sessionRequests = this.pendingRequests.get(sessionKey);
            if (!sessionRequests) {
                sessionRequests = new Map();
                this.pendingRequests.set(sessionKey, sessionRequests);
            }

            // Set up timeout to prevent hanging requests
            const timeout = setTimeout(() => {
                sessionRequests!.delete(id);
                if (sessionRequests!.size === 0) {
                    this.pendingRequests.delete(sessionKey);
                }
                reject(new Error(`Request timeout after ${this.REQUEST_TIMEOUT}ms: ${method}`));
            }, this.REQUEST_TIMEOUT);

            // Store the pending request with timeout handle
            sessionRequests.set(id, {
                resolve: resolve as (v: unknown) => void,
                reject,
                timeout
            });

            const requestStr = JSON.stringify(request);
            console.log('[ACPClient] Sending:', requestStr.slice(0, 200));
            this.write(requestStr);
        });
    }

    // Public API

    /**
     * Register a handler for agent->client requests.
     */
    registerRequestHandler(method: string, handler: (params: unknown) => Promise<unknown>): void {
        console.log(`[ACPClient] Registering request handler for: ${method}`);
        this.requestHandlers.set(method, handler);
    }

    /**
     * Set callback for writing to agent (used when bridging with AgentProcessManager).
     */
    setWriteCallback(callback: (line: string) => void): void {
        this.writeCallback = callback;
    }

    async initialize(params: InitializeParams): Promise<InitializeResult> {
        return this.sendRequest<InitializeResult>(ACPMethods.INITIALIZE, params);
    }

    async newSession(title?: string, params?: { cwd?: string; mcpServers?: McpServerConfig[] }): Promise<Session> {
        const sessionParams = {
            title,
            ...(params?.cwd && { cwd: params.cwd }),
            ...(params?.mcpServers && { mcpServers: params.mcpServers }),
        };
        const result = await this.sendRequest<unknown>(ACPMethods.SESSION_NEW, sessionParams);

        // Handle both response formats:
        // - New format: { sessionId, models, ... }
        // - Old format: { session: { id, title, ... } }
        let session: Session;

        if (isRecord(result) && 'session' in result && isSession(result.session)) {
            // Old format
            session = result.session;
        } else if (isRecord(result) && typeof result.sessionId === 'string') {
            // New format
            session = {
                id: result.sessionId,
                title: title || 'New Session',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
        } else {
            throw new Error('Invalid session/new response format');
        }

        this.currentSession = session;
        await this.syncDesiredSettings();
        return session;
    }

    async resumeSession(
        claudeSessionId: string,
        params?: { title?: string; cwd?: string; mcpServers?: McpServerConfig[] }
    ): Promise<Session> {
        const sessionParams: ResumeSessionParams = {
            claudeSessionId,
            ...(params?.title && { title: params.title }),
            ...(params?.cwd && { cwd: params.cwd }),
            ...(params?.mcpServers && { mcpServers: params.mcpServers }),
        };

        const result = await this.sendRequest<unknown>(ACPMethods.SESSION_RESUME, sessionParams);

        let session: Session;
        if (isRecord(result) && 'session' in result && isSession(result.session)) {
            session = result.session;
        } else if (isRecord(result) && typeof result.sessionId === 'string') {
            session = {
                id: result.sessionId,
                title: params?.title || 'Resumed Session',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
        } else {
            throw new Error('Invalid session/resume response format');
        }

        this.currentSession = session;
        await this.syncDesiredSettings();
        return session;
    }

    async listSessions(): Promise<Session[]> {
        const result = await this.sendRequest<ListSessionsResult>(ACPMethods.SESSION_LIST);
        return result.sessions;
    }

    async switchSession(sessionId: string): Promise<void> {
        // Clean up pending requests for the previous session
        const oldSessionId = this.currentSession?.id;
        if (oldSessionId) {
            const oldRequests = this.pendingRequests.get(oldSessionId);
            if (oldRequests) {
                // Reject all pending requests with a clear error message
                for (const [, pending] of oldRequests) {
                    if (pending.timeout) {
                        clearTimeout(pending.timeout);
                    }
                    pending.reject(new Error(`Session switched from ${oldSessionId} to ${sessionId}`));
                }
                this.pendingRequests.delete(oldSessionId);
                console.log(`[ACPClient] Cleaned up ${oldRequests.size} pending requests for session ${oldSessionId}`);
            }
        }

        await this.sendRequest(ACPMethods.SESSION_SWITCH, { sessionId });
        // Server doesn't return the full session object; keep minimal info for routing future prompts.
        this.currentSession = {
            id: sessionId,
            title: 'Switched Session',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
    }

    async deleteSession(sessionId: string): Promise<void> {
        // Clean up pending requests for this session
        const sessionRequests = this.pendingRequests.get(sessionId);
        if (sessionRequests) {
            // Reject all pending requests with a clear error message
            for (const [, pending] of sessionRequests) {
                if (pending.timeout) {
                    clearTimeout(pending.timeout);
                }
                pending.reject(new Error(`Session ${sessionId} deleted`));
            }
            this.pendingRequests.delete(sessionId);
            console.log(`[ACPClient] Cleaned up ${sessionRequests.size} pending requests for deleted session ${sessionId}`);
        }

        await this.sendRequest(ACPMethods.SESSION_DELETE, { sessionId });
        if (this.currentSession?.id === sessionId) {
            this.currentSession = null;
        }
    }

    async prompt(content: string, attachments?: PromptParams['attachments']): Promise<void> {
        const hadSession = Boolean(this.currentSession);
        if (!this.currentSession) {
            // newSession() already syncs desired settings.
            await this.newSession();
        } else if (hadSession) {
            await this.syncDesiredSettings();
        }
        // Capture sessionId before sending to avoid race conditions if session changes
        const sessionId = this.currentSession!.id;
        await this.sendRequest(ACPMethods.SESSION_PROMPT, {
            sessionId,
            content,
            attachments,
        }, sessionId);
    }

    async changeSettings(settings: { model?: ModelId; planMode?: boolean; permissionMode?: PermissionMode; maxThinkingTokens?: number }): Promise<void> {
        this.desiredSettings = { ...this.desiredSettings, ...settings };
        if (!this.currentSession) return;
        await this.sendRequest(ACPMethods.SETTINGS_CHANGE, {
            sessionId: this.currentSession.id,
            ...settings,
        });
    }

    async acceptFileChange(path: string, sessionId?: string): Promise<void> {
        const sid = sessionId ?? this.currentSession?.id;
        if (!sid) return;
        await this.sendRequest(ACPMethods.FILE_ACCEPT, {
            sessionId: sid,
            path,
        });
    }

    async rejectFileChange(path: string, sessionId?: string): Promise<void> {
        const sid = sessionId ?? this.currentSession?.id;
        if (!sid) return;
        await this.sendRequest(ACPMethods.FILE_REJECT, {
            sessionId: sid,
            path,
        });
    }

    /**
     * Confirm or reject a tool operation that requires user approval.
     * This is the unified method for all tool confirmations.
     */
    async confirmTool(
        toolCallId: string,
        confirmed: boolean,
        options?: { trustAlways?: boolean; editedContent?: string }
    ): Promise<void> {
        if (!this.currentSession) return;
        await this.sendRequest(ACPMethods.TOOL_CONFIRM, {
            sessionId: this.currentSession.id,
            toolCallId,
            confirmed,
            options,
        });
    }

    /**
     * Send a prompt using persistent session mode (bidirectional streaming).
     * Streaming events are identical to prompt() but the CLI process stays alive.
     */
    async promptPersistent(content: string, attachments?: PromptParams['attachments']): Promise<void> {
        if (!this.currentSession) {
            await this.newSession();
        } else {
            await this.syncDesiredSettings();
        }
        const sessionId = this.currentSession!.id;
        await this.sendRequest(ACPMethods.SESSION_PROMPT_PERSISTENT, {
            sessionId,
            content,
            attachments,
        }, sessionId);
    }

    /**
     * Query whether a session is using persistent mode and its running state.
     */
    async getModeStatus(): Promise<{
        isPersistent: boolean;
        running: boolean;
        cliSessionId: string | null;
        state: string;
        messageCount: number;
        totalUsage: { inputTokens: number; outputTokens: number };
    }> {
        if (!this.currentSession) {
            return { isPersistent: false, running: false, cliSessionId: null, state: 'idle', messageCount: 0, totalUsage: { inputTokens: 0, outputTokens: 0 } };
        }
        return this.sendRequest(ACPMethods.SESSION_MODE_STATUS, {
            sessionId: this.currentSession.id,
        });
    }

    /**
     * Stop a persistent session, returning it to one-shot mode.
     */
    async stopPersistent(): Promise<void> {
        if (!this.currentSession) return;
        await this.sendRequest(ACPMethods.SESSION_STOP_PERSISTENT, {
            sessionId: this.currentSession.id,
        });
    }

    async cancelSession(): Promise<void> {
        if (!this.currentSession) return;
        await this.sendRequest(ACPMethods.SESSION_CANCEL, {
            sessionId: this.currentSession.id,
        });
    }

    getCurrentSession(): Session | null {
        return this.currentSession;
    }

    async listHistory(workspacePath: string, search?: { query?: string; toolName?: string; filePath?: string; dateFrom?: string; dateTo?: string }): Promise<HistorySession[]> {
        const result = await this.sendRequest<HistoryListResult>(ACPMethods.HISTORY_LIST, { workspacePath, ...search });
        return result.sessions;
    }

    async loadHistory(sessionId: string, workspacePath: string): Promise<HistoryChatMessage[]> {
        const result = await this.sendRequest<HistoryLoadResult>(ACPMethods.HISTORY_LOAD, { sessionId, workspacePath });
        return result.messages;
    }

    async deleteHistory(sessionId: string, workspacePath: string): Promise<boolean> {
        const result = await this.sendRequest<HistoryDeleteResult>(ACPMethods.HISTORY_DELETE, { sessionId, workspacePath });
        return Boolean(result.deleted);
    }

    private async syncDesiredSettings(): Promise<void> {
        if (!this.currentSession) return;
        if (
            this.desiredSettings.model === undefined &&
            this.desiredSettings.planMode === undefined &&
            this.desiredSettings.permissionMode === undefined &&
            this.desiredSettings.maxThinkingTokens === undefined
        ) return;

        await this.sendRequest<void>(ACPMethods.SETTINGS_CHANGE, {
            sessionId: this.currentSession.id,
            ...this.desiredSettings,
        } satisfies SettingsChangeParams);

        // Clear after successful sync to prevent redundant re-sends on subsequent sessions
        this.desiredSettings = {};
    }

    /**
     * Core cleanup logic shared by shutdown() and destroy().
     */
    private cleanup(errorMessage: string): void {
        this.cleanupReadline();

        for (const [, sessionRequests] of this.pendingRequests) {
            for (const [, pending] of sessionRequests) {
                if (pending.timeout) {
                    clearTimeout(pending.timeout);
                }
                pending.reject(new Error(errorMessage));
            }
        }
        this.pendingRequests.clear();

        this.requestHandlers.clear();
        this.removeAllListeners();

        this.currentSession = null;
        this.desiredSettings = {};
        this.writeCallback = null;
    }

    async shutdown(): Promise<void> {
        this.cleanup('ACPClient shutdown');
    }

    /**
     * Destroy method for complete cleanup (swallows errors for robustness).
     */
    destroy(): void {
        try {
            this.cleanup('ACPClient destroyed');
        } catch (error) {
            console.error('[ACPClient] Error during destroy:', error);
        }
    }
}
