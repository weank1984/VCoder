/**
 * ACP Server Implementation
 * JSON-RPC 2.0 over stdio
 */

import { Readable, Writable } from 'stream';
import { createInterface } from 'readline';
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
} from '@vcoder/shared';
import { listHistorySessions, loadHistorySession, deleteHistorySession } from '../history/transcriptStore';
import { ClaudeCodeWrapper } from '../claude/wrapper';

export class ACPServer {
    private sessions: Map<string, Session> = new Map();
    private currentSessionId: string | null = null;

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
                const request = JSON.parse(line) as JsonRpcRequest;
                console.error('[ACPServer] Handling method:', request.method);
                const response = await this.handleRequest(request);
                this.sendResponse(response);
            } catch (err) {
                console.error('[ACPServer] Error parsing message:', err);
            }
        });
    }

    async shutdown(): Promise<void> {
        // Cleanup
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
                    'claude-sonnet-4-20250514',
                    'claude-3-5-sonnet-20241022',
                    'claude-3-5-haiku-20241022',
                    'claude-3-opus-20240229',
                ],
                mcp: true,
                planMode: true,
            },
        };
    }

    private async handleNewSession(params: NewSessionParams): Promise<NewSessionResult> {
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

    private async handleListSessions(): Promise<ListSessionsResult> {
        return { sessions: Array.from(this.sessions.values()) };
    }

    private async handleSwitchSession(params: SwitchSessionParams): Promise<void> {
        if (!this.sessions.has(params.sessionId)) {
            throw new Error(`Session not found: ${params.sessionId}`);
        }
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
}
