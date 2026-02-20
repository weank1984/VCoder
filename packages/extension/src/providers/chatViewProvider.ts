/**
 * Chat View Provider
 * Provides the Webview for the chat interface
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { EventEmitter } from 'events';
import { ACPClient } from '../acp/client';
import { UpdateNotificationParams, McpServerConfig, AgentProfile, PermissionRule } from '@vcoder/shared';
import { SessionStore } from '../services/sessionStore';
import { AuditLogger } from '../services/auditLogger';
import { BuiltinMcpServer } from '../services/builtinMcpServer';
import { MessageQueue, getMessagePriority } from '../utils/messageQueue';
import { AgentRegistry } from '../services/agentRegistry';

export class ChatViewProvider extends EventEmitter implements vscode.WebviewViewProvider {
    private webviewView?: vscode.WebviewView;
    private readonly distRoot: vscode.Uri;
    private readonly debugThinking = process.env.VCODER_DEBUG_THINKING === '1';

    // Message queue for batched communication
    private messageQueue: MessageQueue;

    constructor(
        private context: vscode.ExtensionContext,
        private acpClient: ACPClient,
        private sessionStore?: SessionStore,
        private auditLogger?: AuditLogger,
        private builtinMcpServer?: BuiltinMcpServer,
        private agentRegistry?: AgentRegistry,
    ) {
        super();
        this.distRoot = vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'dist');

        // Initialize message queue with optimized batching
        this.messageQueue = new MessageQueue({
            maxBatchSize: 50,
            minFlushInterval: 16, // ~60fps
            maxQueueSize: 200,
            onSend: (messages) => this.sendBatchToWebview(messages),
        });

        // Listen to ACP updates and forward to Webview
        this.acpClient.on('session/update', (params: UpdateNotificationParams) => {
            // Validate params structure
            if (!params?.type || !params?.sessionId) {
                console.warn('[VCoder] Invalid session/update params, skipping:', params);
                return;
            }

            if (this.debugThinking) {
                if (params.type === 'thought') {
                    const thought = params.content as { content?: string; isComplete?: boolean };
                    const length = typeof thought.content === 'string' ? thought.content.length : 0;
                    console.log('[VCoder][thinking] update', {
                        sessionId: params.sessionId,
                        isComplete: thought.isComplete,
                        length,
                    });
                } else if (params.type === 'text') {
                    const text = params.content as { text?: string };
                    const length = typeof text.text === 'string' ? text.text.length : 0;
                    console.log('[VCoder][stream] text update', {
                        sessionId: params.sessionId,
                        length,
                    });
                }
            }
            this.postMessage({ type: 'update', data: params });
        });

        this.acpClient.on('session/complete', (params: unknown) => {
            this.postMessage({ type: 'complete', data: params }, true);
        });

        // Forward agent status changes to webview
        if (this.agentRegistry) {
            this.agentRegistry.on('agentStatusChange', () => {
                this.postMessage({
                    type: 'agents',
                    data: this.agentRegistry!.getAgentStatuses(),
                }, true);
            });
        }
    }

    async resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): Promise<void> {
        console.log('[VCoder] Resolving webview...');
        this.webviewView = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this.distRoot,
                vscode.Uri.joinPath(this.distRoot, 'assets'),
            ],
        };

        const assetsOk = await this.ensureWebviewAssets();
        if (!assetsOk) {
            webviewView.webview.html = this.getMissingAssetsHtml(webviewView.webview);
            return;
        }

        webviewView.webview.html = this.getHtmlContent(webviewView.webview);

        // Handle messages from Webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'send':
                    {
                        let session = this.acpClient.getCurrentSession();
                        if (!session) {
                            const mcpServers = this.getMcpServerConfig();
                            const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                            session = await this.acpClient.newSession(undefined, { cwd, mcpServers });
                            this.postMessage({ type: 'currentSession', data: { sessionId: session.id } }, true);
                            this.postMessage({ type: 'sessions', data: await this.acpClient.listSessions() }, true);
                            if (this.sessionStore) {
                                await this.sessionStore.saveCurrentSessionId(session.id);
                            }
                        }
                        if (session && this.auditLogger) {
                            void this.auditLogger.logUserPrompt(session.id, message.content);
                        }
                        await this.acpClient.prompt(message.content, message.attachments);
                    }
                    break;
                case 'newSession':
                    {
                        const mcpServers = this.getMcpServerConfig();
                        const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                        const session = await this.acpClient.newSession(message.title, { cwd, mcpServers });
                        this.postMessage({ type: 'currentSession', data: { sessionId: session.id } });
                        this.postMessage({ type: 'sessions', data: await this.acpClient.listSessions() });
                        if (this.sessionStore) {
                            await this.sessionStore.saveCurrentSessionId(session.id);
                        }
                        break;
                    }
                case 'listSessions':
                    {
                        const sessions = await this.acpClient.listSessions();
                        this.postMessage({ type: 'sessions', data: sessions });
                        break;
                    }
                case 'switchSession':
                    await this.acpClient.switchSession(message.sessionId);
                    // Send currentSession message first to trigger UI state cleanup
                    this.postMessage({ type: 'currentSession', data: { sessionId: message.sessionId } }, true);
                    // Refresh session list to ensure UI is up to date
                    this.postMessage({ type: 'sessions', data: await this.acpClient.listSessions() }, true);
                    if (this.sessionStore) {
                        await this.sessionStore.saveCurrentSessionId(message.sessionId);
                    }
                    break;
                case 'deleteSession':
                    await this.acpClient.deleteSession(message.sessionId);
                    this.postMessage({ type: 'sessions', data: await this.acpClient.listSessions() }, true);
                    break;
                case 'acceptChange':
                    await this.acpClient.acceptFileChange(message.path);
                    break;
                case 'rejectChange':
                    await this.acpClient.rejectFileChange(message.path);
                    break;
                case 'setModel':
                    await this.acpClient.changeSettings({ model: message.model });
                    break;
                case 'setPlanMode':
                    await this.acpClient.changeSettings({ planMode: message.enabled });
                    break;
                case 'setPermissionMode':
                    await this.acpClient.changeSettings({ permissionMode: message.mode });
                    break;
                case 'setThinking':
                    await this.acpClient.changeSettings({
                        maxThinkingTokens: message.enabled ? (message.maxThinkingTokens ?? 16000) : 0,
                    });
                    break;
                case 'setUiLanguage':
                    {
                        const config = vscode.workspace.getConfiguration('vcoder');
                        const uiLanguage = typeof message.uiLanguage === 'string' ? message.uiLanguage : 'auto';
                        try {
                            await config.update('uiLanguage', uiLanguage, vscode.ConfigurationTarget.Global);
                        } catch (err) {
                            console.warn('[VCoder] Failed to update uiLanguage setting:', err);
                        }
                        this.postMessage({ type: 'uiLanguage', data: { uiLanguage } }, true);
                    }
                    break;
                case 'confirmBash':
                    await this.acpClient.confirmBash(message.commandId);
                    break;
                case 'skipBash':
                    await this.acpClient.skipBash(message.commandId);
                    break;
                case 'confirmPlan':
                    await this.acpClient.confirmPlan();
                    break;
                case 'confirmTool':
                    {
                        const { toolCallId, confirmed, options } = message;
                        await this.acpClient.confirmTool(toolCallId, confirmed, options);
                    }
                    break;
                case 'cancel':
                    await this.acpClient.cancelSession();
                    this.postMessage({ type: 'complete' }, true);
                    break;
                case 'getWorkspaceFiles':
                    {
                        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                        const files = await vscode.workspace.findFiles('**/*', '**/node_modules/**');
                        const rel = (p: string) => p.replace(/\\/g, '/');
                        this.postMessage({
                            type: 'workspaceFiles',
                            data: files
                                .map((f) => {
                                    if (!root) return f.fsPath;
                                    const relative = path.relative(root, f.fsPath);
                                    return relative ? rel(relative) : rel(f.fsPath);
                                })
                                .filter((p) => typeof p === 'string' && p.length > 0),
                        });
                    }
                    break;
                case 'executeCommand':
                    if (message.command) {
                        try {
                            await vscode.commands.executeCommand(message.command);
                        } catch (err) {
                            console.error('[VCoder] Failed to execute command:', message.command, err);
                        }
                    }
                    break;
                case 'listHistory':
                    {
                        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
                        try {
                            const sessions = await this.acpClient.listHistory(root);
                            this.postMessage({ type: 'historySessions', data: sessions });
                        } catch (err) {
                            console.error('[VCoder] Failed to list history:', err);
                            this.postMessage({ type: 'historySessions', data: [] });
                        }
                    }
                    break;
                case 'loadHistory':
                    {
                        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
                        try {
                            const messages = await this.acpClient.loadHistory(message.sessionId, root);
                            this.postMessage({ 
                                type: 'historyMessages', 
                                data: messages,
                                sessionId: message.sessionId 
                            });
                        } catch (err) {
                            console.error('[VCoder] Failed to load history:', err);
                        }
                    }
                    break;
                case 'resumeHistory':
                    {
                        const mcpServers = this.getMcpServerConfig();
                        const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                        try {
                            const session = await this.acpClient.resumeSession(message.sessionId, {
                                title: message.title,
                                cwd,
                                mcpServers,
                            });
this.postMessage({ type: 'currentSession', data: { sessionId: session.id } }, true);
                        this.postMessage({ type: 'sessions', data: await this.acpClient.listSessions() }, true);
                        } catch (err) {
                            console.error('[VCoder] Failed to resume history:', err);
                        }
                    }
                    break;
                case 'refreshAgents':
                    {
                        const agents = this.agentRegistry
                            ? this.agentRegistry.getAgentStatuses()
                            : this.getAgentProfiles();
                        this.postMessage({ type: 'agents', data: agents }, true);
                        const currentAgentId = this.agentRegistry
                            ? this.agentRegistry.getActiveAgentId()
                            : (agents.length > 0 ? agents[0].profile.id : null);
                        this.postMessage({ type: 'currentAgent', data: { agentId: currentAgentId } }, true);
                    }
                    break;
                case 'selectAgent':
                    {
                        if (!this.agentRegistry) {
                            console.log('[VCoder] Agent selected (no registry):', message.agentId);
                            this.postMessage({ type: 'currentAgent', data: { agentId: message.agentId } }, true);
                            break;
                        }
                        try {
                            const stdio = await this.agentRegistry.switchAgent(message.agentId);
                            this.acpClient.updateTransport(stdio.stdout, stdio.stdin);
                            // Re-initialize with new agent process
                            await this.acpClient.initialize({
                                protocolVersion: 1,
                                clientInfo: { name: 'vcoder-vscode', version: '0.2.0' },
                                clientCapabilities: { terminal: true, fs: { readTextFile: true, writeTextFile: true } },
                                capabilities: { streaming: true, diffPreview: true, thought: true, toolCallList: true, taskList: true, multiSession: true },
                                workspaceFolders: vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath) || [],
                            });
                            // Create new session on the new agent
                            const mcpServers = this.getMcpServerConfig();
                            const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                            const session = await this.acpClient.newSession(undefined, { cwd, mcpServers });
                            this.postMessage({ type: 'currentAgent', data: { agentId: message.agentId } }, true);
                            this.postMessage({ type: 'currentSession', data: { sessionId: session.id } }, true);
                            this.postMessage({ type: 'sessions', data: await this.acpClient.listSessions() }, true);
                            this.postMessage({ type: 'agents', data: this.agentRegistry.getAgentStatuses() }, true);
                        } catch (err) {
                            console.error('[VCoder] Agent switch failed:', err);
                            vscode.window.showErrorMessage(`Agent 切换失败: ${err instanceof Error ? err.message : String(err)}`);
                        }
                    }
                    break;
                case 'openSettings':
                    {
                        const setting = message.setting || 'vcoder';
                        await vscode.commands.executeCommand('workbench.action.openSettings', setting);
                    }
                    break;
                case 'getPermissionRules':
                    {
                        const rules = this.sessionStore ? await this.sessionStore.getPermissionRules() : [];
                        this.postMessage({ type: 'permissionRules', data: rules });
                    }
                    break;
                case 'addPermissionRule':
                    {
                        if (this.sessionStore && message.rule) {
                            await this.sessionStore.addPermissionRule(message.rule as PermissionRule);
                        }
                        const rules = this.sessionStore ? await this.sessionStore.getPermissionRules() : [];
                        this.postMessage({ type: 'permissionRules', data: rules });
                    }
                    break;
                case 'updatePermissionRule':
                    {
                        if (this.sessionStore && message.ruleId) {
                            const rules = await this.sessionStore.getPermissionRules();
                            const existing = rules.find((rule) => rule.id === message.ruleId);
                            const updates = (message.updates || {}) as Partial<PermissionRule>;
                            const now = new Date().toISOString();
                            const nextRule: PermissionRule = {
                                id: message.ruleId,
                                action: updates.action ?? existing?.action ?? 'allow',
                                createdAt: existing?.createdAt ?? now,
                                updatedAt: now,
                                toolName: updates.toolName ?? existing?.toolName,
                                pattern: updates.pattern ?? existing?.pattern,
                                description: updates.description ?? existing?.description,
                                expiresAt: updates.expiresAt ?? existing?.expiresAt,
                            };
                            await this.sessionStore.addPermissionRule(nextRule);
                        }
                        const rules = this.sessionStore ? await this.sessionStore.getPermissionRules() : [];
                        this.postMessage({ type: 'permissionRules', data: rules });
                    }
                    break;
                case 'deletePermissionRule':
                    {
                        if (this.sessionStore && message.ruleId) {
                            await this.sessionStore.deletePermissionRule(message.ruleId);
                        }
                        const rules = this.sessionStore ? await this.sessionStore.getPermissionRules() : [];
                        this.postMessage({ type: 'permissionRules', data: rules });
                    }
                    break;
                case 'clearPermissionRules':
                    {
                        if (this.sessionStore) {
                            await this.sessionStore.clearPermissionRules();
                        }
                        this.postMessage({ type: 'permissionRules', data: [] });
                    }
                    break;
                case 'deleteHistory':
                    {
                        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
                        try {
                            await this.acpClient.deleteHistory(message.sessionId, root);
                        } catch (err) {
                            console.error('[VCoder] Failed to delete history:', err);
                        }
                        try {
                            const sessions = await this.acpClient.listHistory(root);
                            this.postMessage({ type: 'historySessions', data: sessions });
                        } catch (err) {
                            console.error('[VCoder] Failed to refresh history after delete:', err);
                            this.postMessage({ type: 'historySessions', data: [] });
                        }
                    }
                    break;
                case 'insertText':
                    {
                        const editor = vscode.window.activeTextEditor;
                        if (editor) {
                            await editor.edit((editBuilder) => {
                                editBuilder.insert(editor.selection.active, message.text);
                            });
                        } else {
                            vscode.window.showWarningMessage('请先打开一个文件再插入代码');
                        }
                    }
                    break;
                case 'openFile':
                    {
                        const filePath = message.path;
                        const lineRange = message.lineRange as [number, number] | undefined;
                        
                        if (!filePath) {
                            console.warn('[VCoder] openFile: no path provided');
                            break;
                        }
                        
                        try {
                            // Resolve absolute path
                            let absolutePath = filePath;
                            if (!path.isAbsolute(filePath)) {
                                const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                                if (root) {
                                    absolutePath = path.join(root, filePath);
                                }
                            }
                            
                            // Open file in editor
                            const uri = vscode.Uri.file(absolutePath);
                            const doc = await vscode.workspace.openTextDocument(uri);
                            const editor = await vscode.window.showTextDocument(doc, {
                                preview: false,
                                preserveFocus: false,
                            });
                            
                            // Jump to line if specified
                            if (lineRange && lineRange.length === 2) {
                                const [startLine, endLine] = lineRange;
                                const start = new vscode.Position(Math.max(0, startLine - 1), 0);
                                const end = new vscode.Position(Math.max(0, endLine - 1), 0);
                                editor.selection = new vscode.Selection(start, end);
                                editor.revealRange(
                                    new vscode.Range(start, end),
                                    vscode.TextEditorRevealType.InCenter
                                );
                            }
                        } catch (err) {
                            console.error('[VCoder] Failed to open file:', filePath, err);
                            vscode.window.showErrorMessage(`无法打开文件: ${filePath}`);
                        }
                    }
                    break;
                case 'permissionResponse':
                    {
                        // Forward to PermissionProvider via event
                        this.emit('permissionResponse', {
                            requestId: message.requestId,
                            outcome: message.outcome,
                            trustAlways: message.trustAlways,
                        });
                    }
                    break;
            }
        });
    }

    refresh(): void {
        if (this.webviewView) {
            this.webviewView.webview.html = this.getHtmlContent(this.webviewView.webview);
        }
    }

    /**
     * Send message to webview with batching optimization.
     * Messages are queued and sent in batches to reduce IPC overhead.
     *
     * @param message - Message to send
     * @param immediate - If true, bypasses queue and sends immediately
     */
    public postMessage(message: unknown, immediate = false): void {
        if (!this.webviewView) {
            return;
        }

        // For critical messages, send immediately
        if (immediate) {
            this.messageQueue.sendImmediate(message);
            return;
        }

        // Determine priority and enqueue
        const priority = getMessagePriority(message);
        this.messageQueue.enqueue(message, priority);
    }

    /**
     * Send batch of messages to webview
     * Called by MessageQueue when flushing
     */
    private sendBatchToWebview(messages: unknown[]): void {
        if (!this.webviewView) {
            return;
        }

        if (messages.length === 1) {
            // Single message - send directly
            this.webviewView.webview.postMessage(messages[0]);
        } else {
            // Multiple messages - send as batch
            this.webviewView.webview.postMessage({
                type: 'batch',
                messages,
            });
        }
    }

    /**
     * Get batch performance metrics
     */
    public getBatchMetrics() {
        return this.messageQueue.getMetrics();
    }

    /**
     * Flush any pending messages immediately
     */
    public flush(): void {
        this.messageQueue.flush();
    }

    private getHtmlContent(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.distRoot, 'index.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.distRoot, 'index.css')
        );

        const nonce = this.getNonce();
        const config = vscode.workspace.getConfiguration('vcoder');
        const uiLanguage = config.get<string>('uiLanguage', 'auto');
        const vscodeLanguage = vscode.env.language;
        const debugThinking = process.env.VCODER_DEBUG_THINKING === '1';

        console.log('[VCoder] Webview styleUri:', styleUri.toString());
        console.log('[VCoder] Webview scriptUri:', scriptUri.toString());

        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}'; connect-src ${webview.cspSource};">
  <link rel="stylesheet" href="${styleUri}">
  <title>VCoder</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">window.__vscodeLanguage=${JSON.stringify(vscodeLanguage)};window.__vcoderUiLanguage=${JSON.stringify(uiLanguage)};window.__vcoderDebugThinking=${JSON.stringify(debugThinking)};</script>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    private async ensureWebviewAssets(): Promise<boolean> {
        try {
            await vscode.workspace.fs.stat(vscode.Uri.joinPath(this.distRoot, 'index.js'));
            await vscode.workspace.fs.stat(vscode.Uri.joinPath(this.distRoot, 'index.css'));
            return true;
        } catch (err) {
            console.error('[VCoder] Webview assets missing:', err);
            return false;
        }
    }

    private getMissingAssetsHtml(webview: vscode.Webview): string {
        const nonce = this.getNonce();
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}';">
  <title>VCoder</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 16px; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace; }
  </style>
</head>
<body>
  <h3>VCoder webview build output not found</h3>
  <p>Expected files:</p>
  <ul>
    <li><code>packages/extension/webview/dist/index.js</code></li>
    <li><code>packages/extension/webview/dist/index.css</code></li>
  </ul>
  <p>Rebuild the webview, then reload the Extension Host window.</p>
</body>
</html>`;
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    /**
     * Get Agent profiles from configuration.
     */
    private getAgentProfiles(): Array<{
        profile: AgentProfile;
        status: 'online' | 'offline' | 'error' | 'starting' | 'reconnecting';
        isActive: boolean;
    }> {
        const config = vscode.workspace.getConfiguration('vcoder');
        const profiles = config.get<AgentProfile[]>('agentProfiles', []);
        
        // For now, mark all agents as offline since we don't have AgentProcessManager integration yet
        // In a full implementation, this would query AgentProcessManager for real status
        return profiles.map((profile, index) => ({
            profile,
            status: 'offline' as const,
            isActive: index === 0, // First agent is active by default
        }));
    }

    /**
     * Get MCP server configuration from VSCode settings.
     */
    private getMcpServerConfig(): McpServerConfig[] {
        const config = vscode.workspace.getConfiguration('vcoder');
        const servers = config.get<McpServerConfig[]>('mcpServers', []);

        if (this.builtinMcpServer) {
            try {
                const builtinConfig = this.builtinMcpServer.getServerConfig();
                const exists = servers.some((server) => server.url && builtinConfig.url && server.url === builtinConfig.url);
                if (!exists) {
                    return [builtinConfig, ...servers];
                }
            } catch (err) {
                console.warn('[VCoder] Builtin MCP server not ready:', err);
            }
        }

        return servers;
    }
}
