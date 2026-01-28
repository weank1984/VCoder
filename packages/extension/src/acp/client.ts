/**
 * ACP Client
 * JSON-RPC 2.0 client over stdio
 */

import { Readable, Writable } from 'stream';
import { createInterface } from 'readline';
import { EventEmitter } from 'events';
import {
    JsonRpcRequest,
    JsonRpcResponse,
    JsonRpcNotification,
    JsonRpcError,
    ACPMethods,
    InitializeParams,
    InitializeResult,
    ListSessionsResult,
    PromptParams,
    SettingsChangeParams,
    UpdateNotificationParams,
    SessionCompleteParams,
    Session,
    ModelId,
    PermissionMode,
    McpServerConfig,
    ResumeSessionParams,
    HistorySession,
    HistoryChatMessage,
    HistoryListResult,
    HistoryLoadResult,
    HistoryDeleteResult,
} from '@vcoder/shared';

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
    private pendingRequests: Map<number | string, {
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
    }> = new Map();
    
    // Handler for agent->client requests
    private requestHandlers: Map<string, (params: unknown) => Promise<unknown>> = new Map();
    
    private currentSession: Session | null = null;
    private desiredSettings: Pick<SettingsChangeParams, 'model' | 'planMode' | 'permissionMode' | 'maxThinkingTokens'> = {};
    private writeCallback: ((line: string) => void) | null = null;
    private readlineInterface: ReturnType<typeof createInterface> | null = null;

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
        // 1. Clean up old readline interface if exists
        this.cleanupReadline();
        
        // 2. Update stdio streams
        this.stdio = { stdout, stdin };
        
        // 3. Set up new message handler for new stdout
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
        const pending = this.pendingRequests.get(response.id!);
        if (pending) {
            this.pendingRequests.delete(response.id!);
            if (response.error) {
                pending.reject(new Error(response.error.message));
            } else {
                pending.resolve(response.result);
            }
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

    private async sendRequest<T>(method: string, params?: unknown): Promise<T> {
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
            this.pendingRequests.set(id, { resolve: resolve as (v: unknown) => void, reject });
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

        // Use string literal to avoid runtime mismatch when @vcoder/shared dist is stale in dev.
        const result = await this.sendRequest<unknown>('session/resume', sessionParams);

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
        await this.sendRequest(ACPMethods.SESSION_PROMPT, {
            sessionId: this.currentSession!.id,
            content,
            attachments,
        });
    }

    async changeSettings(settings: { model?: ModelId; planMode?: boolean; permissionMode?: PermissionMode; maxThinkingTokens?: number }): Promise<void> {
        this.desiredSettings = { ...this.desiredSettings, ...settings };
        if (!this.currentSession) return;
        await this.sendRequest(ACPMethods.SETTINGS_CHANGE, {
            sessionId: this.currentSession.id,
            ...settings,
        });
    }

    async acceptFileChange(path: string): Promise<void> {
        if (!this.currentSession) return;
        await this.sendRequest(ACPMethods.FILE_ACCEPT, {
            sessionId: this.currentSession.id,
            path,
        });
    }

    async rejectFileChange(path: string): Promise<void> {
        if (!this.currentSession) return;
        await this.sendRequest(ACPMethods.FILE_REJECT, {
            sessionId: this.currentSession.id,
            path,
        });
    }

    async confirmBash(commandId: string): Promise<void> {
        if (!this.currentSession) return;
        await this.sendRequest(ACPMethods.BASH_CONFIRM, {
            sessionId: this.currentSession.id,
            commandId,
        });
    }

    async skipBash(commandId: string): Promise<void> {
        if (!this.currentSession) return;
        await this.sendRequest(ACPMethods.BASH_SKIP, {
            sessionId: this.currentSession.id,
            commandId,
        });
    }

    async confirmPlan(): Promise<void> {
        if (!this.currentSession) return;
        await this.sendRequest(ACPMethods.PLAN_CONFIRM, {
            sessionId: this.currentSession.id,
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

    async cancelSession(): Promise<void> {
        if (!this.currentSession) return;
        await this.sendRequest(ACPMethods.SESSION_CANCEL, {
            sessionId: this.currentSession.id,
        });
    }

    getCurrentSession(): Session | null {
        return this.currentSession;
    }

    async listHistory(workspacePath: string): Promise<HistorySession[]> {
        const result = await this.sendRequest<HistoryListResult>(ACPMethods.HISTORY_LIST, { workspacePath });
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
    }

    async shutdown(): Promise<void> {
        // Clean up readline interface
        this.cleanupReadline();
        
        // Clear pending requests
        const pendingRequests = Array.from(this.pendingRequests.values());
        pendingRequests.forEach(pending => {
            pending.reject(new Error('ACPClient shutdown'));
        });
        this.pendingRequests.clear();
        
        // Clear handlers
        this.requestHandlers.clear();
        
        // Remove all listeners
        this.removeAllListeners();
        
        // Clear session state
        this.currentSession = null;
        this.desiredSettings = {};
        this.writeCallback = null;
    }
    
    /**
     * Destroy method for complete cleanup
     */
    destroy(): void {
        // 同步清理，避免异步问题
        this.cleanupReadline();
        
        // Clear pending requests synchronously
        const pendingRequests = Array.from(this.pendingRequests.values());
        pendingRequests.forEach(pending => {
            try {
                pending.reject(new Error('ACPClient destroyed'));
            } catch (error) {
                console.error('[ACPClient] Error rejecting pending request:', error);
            }
        });
        this.pendingRequests.clear();
        
        // Clear handlers
        this.requestHandlers.clear();
        
        // Remove all event listeners
        try {
            this.removeAllListeners();
        } catch (error) {
            console.error('[ACPClient] Error removing listeners:', error);
        }
        
        // Clear state
        this.currentSession = null;
        this.desiredSettings = {};
        this.writeCallback = null;
    }
}
