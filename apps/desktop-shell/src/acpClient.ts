import { EventEmitter } from 'node:events';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import {
  ACPMethods,
  type HistoryDeleteResult,
  type HistoryListResult,
  type HistoryLoadResult,
  type HistorySession,
  type HistoryChatMessage,
  type InitializeParams,
  type InitializeResult,
  type JsonRpcError,
  type JsonRpcNotification,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type ListSessionsResult,
  type McpServerConfig,
  type ModelId,
  type PermissionMode,
  type PromptParams,
  type ResumeSessionParams,
  type Session,
  type SessionCompleteParams,
  type SettingsChangeParams,
  type UpdateNotificationParams,
} from '@vcoder/shared';

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

const REQUEST_TIMEOUT_MS = 30000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isJsonRpcId = (value: unknown): value is number | string =>
  typeof value === 'number' || typeof value === 'string';

const isJsonRpcRequest = (value: unknown): value is JsonRpcRequest =>
  isRecord(value) &&
  value.jsonrpc === '2.0' &&
  isJsonRpcId(value.id) &&
  typeof value.method === 'string';

const isJsonRpcResponse = (value: unknown): value is JsonRpcResponse =>
  isRecord(value) &&
  value.jsonrpc === '2.0' &&
  (value.id === null || isJsonRpcId(value.id)) &&
  (Object.prototype.hasOwnProperty.call(value, 'result') ||
    Object.prototype.hasOwnProperty.call(value, 'error'));

const isJsonRpcNotification = (value: unknown): value is JsonRpcNotification =>
  isRecord(value) &&
  value.jsonrpc === '2.0' &&
  typeof value.method === 'string' &&
  !Object.prototype.hasOwnProperty.call(value, 'id');

const isSession = (value: unknown): value is Session =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.title === 'string' &&
  typeof value.createdAt === 'string' &&
  typeof value.updatedAt === 'string';

export class AcpClient extends EventEmitter {
  private requestId = 0;
  private readonly pendingRequests = new Map<number | string, PendingRequest>();
  private readonly requestHandlers = new Map<string, (params: unknown) => Promise<unknown>>();
  private currentSession: Session | null = null;
  private desiredSettings: Partial<
    Pick<
    SettingsChangeParams,
    'model' | 'planMode' | 'permissionMode' | 'maxThinkingTokens'
    >
  > = {};
  private readlineInterface: ReturnType<typeof createInterface> | null = null;

  constructor(private readonly stdio: { stdin: Writable; stdout: Readable }) {
    super();
    this.setupMessageHandler();
  }

  private setupMessageHandler(): void {
    this.cleanupReadline();
    const rl = createInterface({ input: this.stdio.stdout });
    this.readlineInterface = rl;

    rl.on('line', (line) => {
      this.handleMessage(line);
    });
  }

  private cleanupReadline(): void {
    if (!this.readlineInterface) {
      return;
    }
    this.readlineInterface.removeAllListeners();
    this.readlineInterface.close();
    this.readlineInterface = null;
  }

  private write(payload: unknown): void {
    const data = `${JSON.stringify(payload)}\n`;
    this.stdio.stdin.write(data, 'utf-8');
  }

  handleMessage(line: string): void {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch (error) {
      console.error('[Desktop ACPClient] Failed to parse message:', error);
      return;
    }

    if (!isRecord(message)) {
      return;
    }

    if (isJsonRpcRequest(message)) {
      void this.handleAgentRequest(message);
      return;
    }

    if (isJsonRpcResponse(message)) {
      this.handleResponse(message);
      return;
    }

    if (isJsonRpcNotification(message)) {
      this.handleNotification(message);
    }
  }

  private handleResponse(response: JsonRpcResponse): void {
    if (response.id === null || response.id === undefined) {
      return;
    }

    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      return;
    }

    this.pendingRequests.delete(response.id);
    clearTimeout(pending.timeout);

    if (response.error) {
      pending.reject(new Error(response.error.message));
      return;
    }

    pending.resolve(response.result);
  }

  private handleNotification(notification: JsonRpcNotification): void {
    if (notification.method === ACPMethods.SESSION_UPDATE) {
      this.emit('session/update', notification.params as UpdateNotificationParams);
      return;
    }
    if (notification.method === ACPMethods.SESSION_COMPLETE) {
      this.emit('session/complete', notification.params as SessionCompleteParams);
    }
  }

  private async handleAgentRequest(request: JsonRpcRequest): Promise<void> {
    const handler = this.requestHandlers.get(request.method);
    if (!handler) {
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
      this.sendError(request.id, {
        code: -32603,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private sendResponse(id: number | string, result: unknown): void {
    this.write({
      jsonrpc: '2.0',
      id,
      result,
    });
  }

  private sendError(id: number | string, error: JsonRpcError): void {
    this.write({
      jsonrpc: '2.0',
      id,
      error,
    });
  }

  private async sendRequest<T>(method: string, params?: unknown): Promise<T> {
    const id = ++this.requestId;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout after ${REQUEST_TIMEOUT_MS}ms: ${method}`));
      }, REQUEST_TIMEOUT_MS);

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      });

      this.write(request);
    });
  }

  registerRequestHandler(method: string, handler: (params: unknown) => Promise<unknown>): void {
    this.requestHandlers.set(method, handler);
  }

  async initialize(params: InitializeParams): Promise<InitializeResult> {
    return this.sendRequest<InitializeResult>(ACPMethods.INITIALIZE, params);
  }

  async newSession(title?: string, params?: { cwd?: string; mcpServers?: McpServerConfig[] }): Promise<Session> {
    const result = await this.sendRequest<unknown>(ACPMethods.SESSION_NEW, {
      title,
      ...(params?.cwd ? { cwd: params.cwd } : {}),
      ...(params?.mcpServers ? { mcpServers: params.mcpServers } : {}),
    });

    let session: Session;
    if (isRecord(result) && 'session' in result && isSession(result.session)) {
      session = result.session;
    } else if (isRecord(result) && typeof result.sessionId === 'string') {
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
    params?: { title?: string; cwd?: string; mcpServers?: McpServerConfig[] },
  ): Promise<Session> {
    const payload: ResumeSessionParams = {
      claudeSessionId,
      ...(params?.title ? { title: params.title } : {}),
      ...(params?.cwd ? { cwd: params.cwd } : {}),
      ...(params?.mcpServers ? { mcpServers: params.mcpServers } : {}),
    };
    const result = await this.sendRequest<unknown>(ACPMethods.SESSION_RESUME, payload);

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
    } else {
      await this.syncDesiredSettings();
    }
    await this.sendRequest(ACPMethods.SESSION_PROMPT, {
      sessionId: this.currentSession!.id,
      content,
      attachments,
    });
  }

  async promptPersistent(content: string, attachments?: PromptParams['attachments']): Promise<void> {
    if (!this.currentSession) {
      await this.newSession();
    } else {
      await this.syncDesiredSettings();
    }
    await this.sendRequest(ACPMethods.SESSION_PROMPT_PERSISTENT, {
      sessionId: this.currentSession!.id,
      content,
      attachments,
    });
  }

  async changeSettings(settings: {
    model?: ModelId;
    planMode?: boolean;
    permissionMode?: PermissionMode;
    maxThinkingTokens?: number;
  }): Promise<void> {
    this.desiredSettings = { ...this.desiredSettings, ...settings };
    if (!this.currentSession) {
      return;
    }

    await this.sendRequest(ACPMethods.SETTINGS_CHANGE, {
      sessionId: this.currentSession.id,
      ...settings,
    });
  }

  async getModeStatus(): Promise<{
    isPersistent: boolean;
    running: boolean;
    cliSessionId: string | null;
    state: string;
    messageCount: number;
    totalUsage: { inputTokens: number; outputTokens: number };
  }> {
    if (!this.currentSession) {
      return {
        isPersistent: false,
        running: false,
        cliSessionId: null,
        state: 'idle',
        messageCount: 0,
        totalUsage: { inputTokens: 0, outputTokens: 0 },
      };
    }
    return this.sendRequest(ACPMethods.SESSION_MODE_STATUS, {
      sessionId: this.currentSession.id,
    });
  }

  async cancelSession(): Promise<void> {
    if (!this.currentSession) {
      return;
    }
    await this.sendRequest(ACPMethods.SESSION_CANCEL, {
      sessionId: this.currentSession.id,
    });
  }

  async confirmTool(
    toolCallId: string,
    confirmed: boolean,
    options?: { trustAlways?: boolean; editedContent?: string },
  ): Promise<void> {
    if (!this.currentSession) {
      return;
    }
    await this.sendRequest(ACPMethods.TOOL_CONFIRM, {
      sessionId: this.currentSession.id,
      toolCallId,
      confirmed,
      options,
    });
  }

  async acceptFileChange(path: string, sessionId?: string): Promise<void> {
    const sid = sessionId ?? this.currentSession?.id;
    if (!sid) {
      return;
    }
    await this.sendRequest(ACPMethods.FILE_ACCEPT, { sessionId: sid, path });
  }

  async rejectFileChange(path: string, sessionId?: string): Promise<void> {
    const sid = sessionId ?? this.currentSession?.id;
    if (!sid) {
      return;
    }
    await this.sendRequest(ACPMethods.FILE_REJECT, { sessionId: sid, path });
  }

  async listHistory(workspacePath: string): Promise<HistorySession[]> {
    const result = await this.sendRequest<HistoryListResult>(ACPMethods.HISTORY_LIST, { workspacePath });
    return result.sessions;
  }

  async loadHistory(sessionId: string, workspacePath: string): Promise<HistoryChatMessage[]> {
    const result = await this.sendRequest<HistoryLoadResult>(ACPMethods.HISTORY_LOAD, {
      sessionId,
      workspacePath,
    });
    return result.messages;
  }

  async deleteHistory(sessionId: string, workspacePath: string): Promise<boolean> {
    const result = await this.sendRequest<HistoryDeleteResult>(ACPMethods.HISTORY_DELETE, {
      sessionId,
      workspacePath,
    });
    return Boolean(result.deleted);
  }

  getCurrentSession(): Session | null {
    return this.currentSession;
  }

  private async syncDesiredSettings(): Promise<void> {
    if (!this.currentSession) {
      return;
    }
    if (
      this.desiredSettings.model === undefined &&
      this.desiredSettings.planMode === undefined &&
      this.desiredSettings.permissionMode === undefined &&
      this.desiredSettings.maxThinkingTokens === undefined
    ) {
      return;
    }

    await this.sendRequest<void>(ACPMethods.SETTINGS_CHANGE, {
      sessionId: this.currentSession.id,
      ...this.desiredSettings,
    });
  }

  async shutdown(): Promise<void> {
    this.cleanupReadline();
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('ACP client shutdown'));
    }
    this.pendingRequests.clear();
    this.requestHandlers.clear();
    this.currentSession = null;
    this.removeAllListeners();
  }
}
