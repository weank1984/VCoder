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
    ACPMethods,
    InitializeParams,
    InitializeResult,
    NewSessionParams,
    NewSessionResult,
    ListSessionsResult,
    PromptParams,
    SettingsChangeParams,
    UpdateNotificationParams,
    SessionCompleteParams,
    Session,
    ModelId,
} from '@vcoder/shared';

export class ACPClient extends EventEmitter {
    private requestId = 0;
    private pendingRequests: Map<number | string, {
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
    }> = new Map();

    private currentSession: Session | null = null;

    constructor(private stdio: { stdin: Writable; stdout: Readable }) {
        super();
        this.setupMessageHandler();
    }

    private setupMessageHandler(): void {
        const rl = createInterface({ input: this.stdio.stdout });

        rl.on('line', (line) => {
            try {
                const message = JSON.parse(line);

                if ('id' in message && message.id !== null) {
                    // Response
                    this.handleResponse(message as JsonRpcResponse);
                } else if ('method' in message) {
                    // Notification
                    this.handleNotification(message as JsonRpcNotification);
                }
            } catch (err) {
                console.error('[ACPClient] Error parsing message:', err);
            }
        });
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
                this.emit('session/update', notification.params as UpdateNotificationParams);
                break;
            case ACPMethods.SESSION_COMPLETE:
                this.emit('session/complete', notification.params as SessionCompleteParams);
                break;
        }
    }

    private async sendRequest<T>(method: string, params?: unknown): Promise<T> {
        const id = ++this.requestId;
        const request: JsonRpcRequest = {
            jsonrpc: '2.0',
            id,
            method,
            params,
        };

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve: resolve as (v: unknown) => void, reject });
            this.stdio.stdin.write(JSON.stringify(request) + '\n');
        });
    }

    // Public API

    async initialize(params: InitializeParams): Promise<InitializeResult> {
        return this.sendRequest<InitializeResult>(ACPMethods.INITIALIZE, params);
    }

    async newSession(title?: string): Promise<Session> {
        const result = await this.sendRequest<NewSessionResult>(ACPMethods.SESSION_NEW, { title });
        this.currentSession = result.session;
        return result.session;
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
        if (!this.currentSession) {
            await this.newSession();
        }
        await this.sendRequest(ACPMethods.SESSION_PROMPT, {
            sessionId: this.currentSession!.id,
            content,
            attachments,
        });
    }

    async changeSettings(settings: { model?: ModelId; planMode?: boolean }): Promise<void> {
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

    getCurrentSession(): Session | null {
        return this.currentSession;
    }

    async shutdown(): Promise<void> {
        // Cleanup
    }
}
