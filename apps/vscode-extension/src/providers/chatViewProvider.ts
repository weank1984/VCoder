/**
 * Chat View Provider
 * Provides the Webview for the chat interface
 */

import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { ACPClient } from '@vcoder/shared/acpClient';
import { UpdateNotificationParams, FileChangeUpdate } from '@vcoder/shared';
import { SessionStore } from '../services/sessionStore';
import { AuditLogger } from '../services/auditLogger';
import { BuiltinMcpServer } from '../services/builtinMcpServer';
import { MessageQueue, getMessagePriority } from '../utils/messageQueue';
import { AgentRegistry } from '../services/agentRegistry';
import { DiffManager } from '../services/diffManager';
import { InlineDiffProvider } from '../services/inlineDiffProvider';
import { VCoderFileDecorationProvider } from './fileDecorationProvider';
import { EcosystemService } from '../services/ecosystemService';
import { TerminalBufferService } from '../services/terminalBufferService';
import { FileChangeOrchestrator } from '../services/fileChangeOrchestrator';
import { WebviewMessageRouter } from '../services/webviewMessageRouter';

export class ChatViewProvider extends EventEmitter implements vscode.WebviewViewProvider {
    private webviewView?: vscode.WebviewView;
    private readonly distRoot: vscode.Uri;
    private readonly debugThinking = process.env.VCODER_DEBUG_THINKING === '1';

    // Message queue for batched communication
    private messageQueue: MessageQueue;

    // Extracted services
    private readonly ecosystemService: EcosystemService;
    private readonly terminalBuffer: TerminalBufferService;
    private readonly fileChangeOrchestrator: FileChangeOrchestrator;
    private readonly messageRouter: WebviewMessageRouter;

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

        // Initialize extracted services
        this.ecosystemService = new EcosystemService(context, builtinMcpServer);
        this.terminalBuffer = new TerminalBufferService();
        this.fileChangeOrchestrator = new FileChangeOrchestrator(acpClient, (msg, immediate) => this.postMessage(msg, immediate), auditLogger);
        this.messageRouter = new WebviewMessageRouter({
            context,
            acpClient,
            sessionStore,
            auditLogger,
            agentRegistry,
            postMessage: (msg, immediate) => this.postMessage(msg, immediate),
            terminalBuffer: this.terminalBuffer,
            ecosystemService: this.ecosystemService,
            fileChangeOrchestrator: this.fileChangeOrchestrator,
        });

        // Listen to ACP updates and forward to Webview
        this.acpClient.on('session/update', (params: UpdateNotificationParams) => {
            // Validate params structure
            if (!params?.type || !params?.sessionId) {
                console.warn('[VCoder] Invalid session/update params, skipping:', params);
                return;
            }

            // Intercept file_change events for Diff review flow
            if (params.type === 'file_change') {
                const change = params.content as FileChangeUpdate;
                this.fileChangeOrchestrator.handleFileChange(params.sessionId, change);
                // Audit log file change
                if (this.auditLogger) {
                    const op = change.type === 'deleted' ? 'delete' as const : 'write' as const;
                    const size = change.content ? Buffer.byteLength(change.content, 'utf-8') : undefined;
                    void this.auditLogger.logFileOperation(
                        params.sessionId, change.path, op, size, undefined, undefined
                    );
                }
            }

            // Audit log tool_use events
            if (params.type === 'tool_use' && this.auditLogger) {
                const tc = params.content as { id?: string; name?: string; input?: Record<string, unknown> };
                if (tc.name && tc.input) {
                    void this.auditLogger.logToolCall(
                        params.sessionId, tc.name, tc.input, undefined, undefined, undefined, tc.id
                    );
                }
            }

            // Audit log tool_result events
            if (params.type === 'tool_result' && this.auditLogger) {
                const tr = params.content as { id?: string; result?: unknown; error?: string };
                if (tr.id) {
                    void this.auditLogger.logToolCall(
                        params.sessionId, `tool_result:${tr.id}`, {}, tr.result, tr.error, undefined, tr.id
                    );
                }
            }

            // Audit log error events
            if (params.type === 'error' && this.auditLogger) {
                const err = params.content as { message?: string; type?: string; recoverable?: boolean };
                void this.auditLogger.logError(
                    params.sessionId,
                    err.type ?? 'agent_error',
                    err.message ?? 'Unknown error',
                );
            }

            // Intercept settings_changed and forward as dedicated message
            if (params.type === 'settings_changed') {
                const content = params.content as { model?: string; permissionMode?: string };
                this.postMessage({ type: 'settingsChanged', data: content }, true);
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
            // Clear file decorations on session complete
            this.fileChangeOrchestrator.clearDecorations();
            // Audit log session end
            if (this.auditLogger) {
                const p = params as { sessionId?: string; reason?: string; durationMs?: number; tokenUsage?: unknown } | undefined;
                const sessionId = p?.sessionId ?? this.acpClient.getCurrentSession()?.id ?? 'unknown';
                void this.auditLogger.log({
                    sessionId,
                    eventType: 'session_end',
                    data: {
                        reason: p?.reason,
                        durationMs: p?.durationMs,
                        tokenUsage: p?.tokenUsage,
                    },
                });
            }
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

        // Register terminal buffer listener
        this.terminalBuffer.register(this.context);

        // Push editor context to WebView when active editor changes
        this.context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor((editor) => {
                if (editor) {
                    this.postMessage({
                        type: 'editorContext',
                        data: {
                            activeFile: vscode.workspace.asRelativePath(editor.document.uri),
                            languageId: editor.document.languageId,
                        },
                    });
                }
            }),
        );
        // Send initial editor context
        const initialEditor = vscode.window.activeTextEditor;
        if (initialEditor) {
            this.postMessage({
                type: 'editorContext',
                data: {
                    activeFile: vscode.workspace.asRelativePath(initialEditor.document.uri),
                    languageId: initialEditor.document.languageId,
                },
            });
        }

        const assetsOk = await this.ensureWebviewAssets();
        if (!assetsOk) {
            webviewView.webview.html = this.getMissingAssetsHtml(webviewView.webview);
            return;
        }

        webviewView.webview.html = this.getHtmlContent(webviewView.webview);

        // Handle messages from Webview — delegate to message router
        webviewView.webview.onDidReceiveMessage(async (message) => {
            await this.messageRouter.handleMessage(message);
        });
    }

    /**
     * Set the DiffManager instance for file change review flow.
     */
    setDiffManager(diffManager: DiffManager): void {
        this.fileChangeOrchestrator.setDiffManager(diffManager);
    }

    /**
     * Set the FileDecorationProvider instance.
     */
    setFileDecorator(fileDecorator: VCoderFileDecorationProvider): void {
        this.fileChangeOrchestrator.setFileDecorator(fileDecorator);
    }

    /**
     * Set the InlineDiffProvider instance for in-editor decorations.
     */
    setInlineDiffProvider(provider: InlineDiffProvider, updateStatusBar: () => void): void {
        this.fileChangeOrchestrator.setInlineDiffProvider(provider, updateStatusBar);
    }

    refresh(): void {
        if (this.webviewView) {
            this.webviewView.webview.html = this.getHtmlContent(this.webviewView.webview);
        }
    }

    /**
     * Send message to webview with batching optimization.
     * Messages are queued and sent in batches to reduce IPC overhead.
     */
    public postMessage(message: unknown, immediate = false): void {
        if (!this.webviewView) {
            return;
        }

        if (immediate) {
            this.messageQueue.sendImmediate(message);
            return;
        }

        const priority = getMessagePriority(message);
        this.messageQueue.enqueue(message, priority);
    }

    /**
     * Send batch of messages to webview.
     * Called by MessageQueue when flushing.
     */
    private sendBatchToWebview(messages: unknown[]): void {
        if (!this.webviewView) {
            return;
        }

        if (messages.length === 1) {
            this.webviewView.webview.postMessage(messages[0]);
        } else {
            this.webviewView.webview.postMessage({
                type: 'batch',
                messages,
            });
        }
    }

    /**
     * Get batch performance metrics.
     */
    public getBatchMetrics() {
        return this.messageQueue.getMetrics();
    }

    /**
     * Flush any pending messages immediately.
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
    <li><code>apps/vscode-extension/webview/dist/index.js</code></li>
    <li><code>apps/vscode-extension/webview/dist/index.css</code></li>
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
}
