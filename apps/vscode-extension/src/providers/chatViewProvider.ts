/**
 * Chat View Provider
 * Provides the Webview for the chat interface
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { EventEmitter } from 'events';
import { ACPClient } from '@vcoder/shared/acpClient';
import { UpdateNotificationParams, McpServerConfig, AgentProfile, PermissionRule, FileChangeUpdate } from '@vcoder/shared';
import { SessionStore } from '../services/sessionStore';
import { AuditLogger } from '../services/auditLogger';
import { BuiltinMcpServer } from '../services/builtinMcpServer';
import { MessageQueue, getMessagePriority } from '../utils/messageQueue';
import { AgentRegistry } from '../services/agentRegistry';
import { DiffManager } from '../services/diffManager';
import { InlineDiffProvider } from '../services/inlineDiffProvider';
import { VCoderFileDecorationProvider } from './fileDecorationProvider';

export class ChatViewProvider extends EventEmitter implements vscode.WebviewViewProvider {
    private webviewView?: vscode.WebviewView;
    private readonly distRoot: vscode.Uri;
    private readonly debugThinking = process.env.VCODER_DEBUG_THINKING === '1';

    // Message queue for batched communication
    private messageQueue: MessageQueue;

    private diffManager?: DiffManager;
    private fileDecorator?: VCoderFileDecorationProvider;
    private inlineDiffProvider?: InlineDiffProvider;
    private updateReviewStatusBar?: () => void;

    // Temporary highlight decoration for recently changed lines (方案3)
    private readonly changeHighlightDecoration = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(73, 199, 130, 0.12)',
        isWholeLine: true,
        overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.addedForeground'),
        overviewRulerLane: vscode.OverviewRulerLane.Left,
    });
    private changeHighlightTimer?: ReturnType<typeof setTimeout>;

    // Cache diff data from proposed=true events for use when proposed=false arrives
    private pendingDiffCache = new Map<string, string>();

    // Terminal output ring buffer for @terminal feature
    private terminalOutputBuffer: string[] = [];
    private readonly TERMINAL_BUFFER_MAX_LINES = 200;

    // Allowlist for commands that the webview is permitted to invoke via the
    // 'executeCommand' message. Any command not matching one of these entries is
    // rejected to prevent arbitrary VS Code command execution in case of XSS or
    // supply-chain compromise in webview code.
    private static readonly ALLOWED_COMMAND_PREFIXES = ['vcoder.'];
    private static readonly ALLOWED_COMMANDS = new Set([
        'workbench.action.openSettings',
        'workbench.view.extension.vcoder',
    ]);

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

            // Intercept file_change events for Diff review flow
            if (params.type === 'file_change') {
                const change = params.content as FileChangeUpdate;
                this.handleFileChange(params.sessionId, change);
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
            if (this.fileDecorator) {
                this.fileDecorator.clear();
            }
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

        // Capture terminal shell execution output for @terminal feature
        if (vscode.window.onDidEndTerminalShellExecution) {
            this.context.subscriptions.push(
                vscode.window.onDidEndTerminalShellExecution(async (e) => {
                    try {
                        const stream = e.execution.read();
                        const lines: string[] = [];
                        for await (const data of stream) {
                            lines.push(data);
                        }
                        // Truncate long lines before buffering
                        const truncatedLines = lines.map(line => line.length > 2000 ? line.slice(0, 2000) + '...[truncated]' : line);
                        // Append to ring buffer
                        this.terminalOutputBuffer.push(...truncatedLines);
                        if (this.terminalOutputBuffer.length > this.TERMINAL_BUFFER_MAX_LINES) {
                            this.terminalOutputBuffer = this.terminalOutputBuffer.slice(-this.TERMINAL_BUFFER_MAX_LINES);
                        }
                    } catch {
                        // Shell integration may not be available
                    }
                }),
            );
        }

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
                            // Audit log session start (auto-created)
                            if (this.auditLogger) {
                                void this.auditLogger.log({
                                    sessionId: session.id,
                                    eventType: 'session_start',
                                    data: { source: 'auto', title: session.title },
                                });
                            }
                        }
                        if (session && this.auditLogger) {
                            void this.auditLogger.logUserPrompt(session.id, message.content);
                        }

                        // Auto-inject editor context into prompt
                        const editor = vscode.window.activeTextEditor;
                        let contextPrefix = '';
                        if (editor) {
                            const activeFile = vscode.workspace.asRelativePath(editor.document.uri);
                            const cursorLine = editor.selection.active.line + 1;
                            contextPrefix += `[Active file: ${activeFile}, cursor at line ${cursorLine}]\n`;

                            // Collect LSP diagnostics (errors + warnings, max 10)
                            const diagnostics = vscode.languages.getDiagnostics(editor.document.uri)
                                .filter(d => d.severity <= vscode.DiagnosticSeverity.Warning)
                                .slice(0, 10)
                                .map(d => `L${d.range.start.line + 1}: [${d.severity === 0 ? 'Error' : 'Warning'}] ${d.message}`);
                            if (diagnostics.length > 0) {
                                contextPrefix += `[Diagnostics:\n${diagnostics.join('\n')}]\n`;
                            }
                        }

                        const fullContent = contextPrefix ? contextPrefix + '\n' + message.content : message.content;
                        await this.acpClient.prompt(fullContent, message.attachments);
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
                        // Audit log session start
                        if (this.auditLogger) {
                            void this.auditLogger.log({
                                sessionId: session.id,
                                eventType: 'session_start',
                                data: { source: 'user', title: session.title },
                            });
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
                    {
                        const previousSessionId = this.acpClient.getCurrentSession()?.id;
                        await this.acpClient.switchSession(message.sessionId);
                        // Send currentSession message first to trigger UI state cleanup
                        this.postMessage({ type: 'currentSession', data: { sessionId: message.sessionId } }, true);
                        // Refresh session list to ensure UI is up to date
                        this.postMessage({ type: 'sessions', data: await this.acpClient.listSessions() }, true);
                        if (this.sessionStore) {
                            await this.sessionStore.saveCurrentSessionId(message.sessionId);
                        }
                        // Audit log session switch
                        if (this.auditLogger) {
                            void this.auditLogger.log({
                                sessionId: message.sessionId,
                                eventType: 'session_start',
                                data: { source: 'switch', previousSessionId },
                            });
                        }
                    }
                    break;
                case 'deleteSession':
                    await this.acpClient.deleteSession(message.sessionId);
                    // Clear pending diff changes for the deleted session
                    if (this.diffManager) {
                        this.diffManager.clearSession(message.sessionId);
                    }
                    // Clear file decorations
                    if (this.fileDecorator) {
                        this.fileDecorator.clear();
                    }
                    this.postMessage({ type: 'sessions', data: await this.acpClient.listSessions() }, true);
                    // Audit log session deletion
                    if (this.auditLogger) {
                        void this.auditLogger.log({
                            sessionId: message.sessionId,
                            eventType: 'session_end',
                            data: { reason: 'deleted' },
                        });
                    }
                    break;
                case 'acceptChange':
                    {
                        const currentSession = this.acpClient.getCurrentSession();
                        const sid = message.sessionId ?? currentSession?.id;
                        if (this.diffManager && sid) {
                            await this.diffManager.acceptChange(sid, message.path);
                        } else {
                            await this.acpClient.acceptFileChange(message.path);
                        }
                    }
                    break;
                case 'rejectChange':
                    {
                        const currentSession = this.acpClient.getCurrentSession();
                        const sid = message.sessionId ?? currentSession?.id;
                        if (this.diffManager && sid) {
                            await this.diffManager.rejectChange(sid, message.path);
                        } else {
                            await this.acpClient.rejectFileChange(message.path);
                        }
                    }
                    break;
                case 'acceptAllChanges':
                    {
                        const currentSession = this.acpClient.getCurrentSession();
                        const sid = message.sessionId ?? currentSession?.id;
                        if (this.diffManager && sid) {
                            await this.diffManager.acceptAll(sid);
                        }
                    }
                    break;
                case 'rejectAllChanges':
                    {
                        const currentSession = this.acpClient.getCurrentSession();
                        const sid = message.sessionId ?? currentSession?.id;
                        if (this.diffManager && sid) {
                            await this.diffManager.rejectAll(sid);
                        }
                    }
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
                case 'confirmTool':
                    {
                        const { toolCallId, confirmed, options } = message;
                        await this.acpClient.confirmTool(toolCallId, confirmed, options);
                    }
                    break;
                case 'answerQuestion': {
                    const { toolCallId, answer } = message;
                    await this.acpClient.answerQuestion(toolCallId, answer);
                    break;
                }
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
                case 'readFile':
                    {
                        const filePath = message.path as string;
                        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                        if (!workspaceFolder || !filePath) break;
                        try {
                            const workspaceRoot = workspaceFolder.uri.fsPath;
                            const resolvedPath = path.resolve(workspaceRoot, filePath);
                            const rel = path.relative(workspaceRoot, resolvedPath);
                            if (rel.startsWith('..' + path.sep) || rel === '..' || path.isAbsolute(rel)) {
                                console.warn('[VCoder] readFile: path escapes workspace:', filePath);
                                break;
                            }
                            const uri = vscode.Uri.file(resolvedPath);
                            const stat = await vscode.workspace.fs.stat(uri);
                            // Skip files > 1MB — only attach path
                            if (stat.size > 1 * 1024 * 1024) {
                                this.postMessage({
                                    type: 'fileContent',
                                    data: { path: filePath, content: null, tooLarge: true },
                                });
                                break;
                            }
                            const content = await vscode.workspace.fs.readFile(uri);
                            const text = new TextDecoder().decode(content);
                            this.postMessage({
                                type: 'fileContent',
                                data: { path: filePath, content: text },
                            });
                        } catch (err) {
                            console.error('[VCoder] Failed to read file:', filePath, err);
                            this.postMessage({
                                type: 'fileContent',
                                data: { path: filePath, content: null, error: true },
                            });
                        }
                    }
                    break;
                case 'getSelection':
                    {
                        const editor = vscode.window.activeTextEditor;
                        if (!editor || editor.selection.isEmpty) {
                            this.postMessage({ type: 'selectionContent', data: null });
                            break;
                        }
                        const selection = editor.selection;
                        const content = editor.document.getText(selection);
                        this.postMessage({
                            type: 'selectionContent',
                            data: {
                                path: vscode.workspace.asRelativePath(editor.document.uri),
                                content: content || null,
                                lineRange: [selection.start.line + 1, selection.end.line + 1] as [number, number],
                            },
                        });
                    }
                    break;
                case 'getTerminalOutput':
                    {
                        const output = this.terminalOutputBuffer.join('\n');
                        this.postMessage({
                            type: 'terminalOutput',
                            data: { content: output || null },
                        });
                    }
                    break;
                case 'executeCommand':
                    if (message.command) {
                        const cmd: string = message.command;
                        const allowed =
                            ChatViewProvider.ALLOWED_COMMANDS.has(cmd) ||
                            ChatViewProvider.ALLOWED_COMMAND_PREFIXES.some((prefix) => cmd.startsWith(prefix));
                        if (!allowed) {
                            console.warn('[VCoder] Blocked disallowed executeCommand from webview:', cmd);
                            break;
                        }
                        try {
                            await vscode.commands.executeCommand(cmd);
                        } catch (err) {
                            console.error('[VCoder] Failed to execute command:', cmd, err);
                        }
                    }
                    break;
                case 'listHistory':
                    {
                        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
                        try {
                            const { query, toolName } = message as { type: string; query?: string; toolName?: string };
                            const search = (query || toolName) ? { query, toolName } : undefined;
                            const sessions = await this.acpClient.listHistory(root, search);
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
                            const result = await this.acpClient.loadHistory(message.sessionId, root);
                            this.postMessage({
                                type: 'historyMessages',
                                data: result.messages,
                                sessionId: message.sessionId,
                                teamMessages: result.teamMessages,
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
                            // Audit log session resume
                            if (this.auditLogger) {
                                void this.auditLogger.log({
                                    sessionId: session.id,
                                    eventType: 'session_start',
                                    data: { source: 'resume', originalSessionId: message.sessionId, title: session.title },
                                });
                            }
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
                case 'showEcosystem':
                case 'getEcosystemData':
                    {
                        if (message.type === 'showEcosystem') {
                            this.postMessage({ type: 'showEcosystem' });
                        }
                        const ecosystemData = await this.gatherEcosystemData();
                        this.postMessage({ type: 'ecosystemData', data: ecosystemData });
                    }
                    break;
                case 'addMcpServer':
                    {
                        const config = vscode.workspace.getConfiguration('vcoder');
                        const servers = config.get<McpServerConfig[]>('mcpServers', []);
                        const { server } = message as { type: string; server: McpServerConfig };
                        await config.update('mcpServers', [...servers, server], vscode.ConfigurationTarget.Global);
                        const ecosystemData = await this.gatherEcosystemData();
                        this.postMessage({ type: 'ecosystemData', data: ecosystemData });
                    }
                    break;
                case 'removeMcpServer':
                    {
                        const config = vscode.workspace.getConfiguration('vcoder');
                        const servers = config.get<McpServerConfig[]>('mcpServers', []);
                        const { id } = message as { type: string; id: string };
                        const updated = servers.filter((s, i) => `${i}:${s.name ?? ''}` !== id);
                        await config.update('mcpServers', updated, vscode.ConfigurationTarget.Global);
                        const ecosystemData = await this.gatherEcosystemData();
                        this.postMessage({ type: 'ecosystemData', data: ecosystemData });
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
                            const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                            let absolutePath: string;
                            if (path.isAbsolute(filePath)) {
                                absolutePath = path.resolve(filePath);
                            } else if (root) {
                                absolutePath = path.resolve(root, filePath);
                            } else {
                                absolutePath = filePath;
                            }

                            // Validate path stays within workspace
                            if (root) {
                                const rel = path.relative(root, absolutePath);
                                if (rel.startsWith('..' + path.sep) || rel === '..' || path.isAbsolute(rel)) {
                                    console.warn('[VCoder] openFile: path escapes workspace:', filePath);
                                    vscode.window.showWarningMessage(`无法打开工作区以外的文件: ${filePath}`);
                                    break;
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
                case 'openDiff':
                    {
                        const filePath = message.path;
                        if (!filePath) break;

                        try {
                            let absolutePath = filePath;
                            if (!path.isAbsolute(filePath)) {
                                const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                                if (root) {
                                    absolutePath = path.join(root, filePath);
                                }
                            }

                            const fileUri = vscode.Uri.file(absolutePath);
                            const basename = path.basename(absolutePath);

                            // 尝试用 Git 扩展获取 HEAD 版本作为 original
                            const gitExtension = vscode.extensions.getExtension('vscode.git');
                            if (gitExtension?.isActive) {
                                const git = gitExtension.exports.getAPI(1);
                                const repo = git?.repositories?.[0];
                                if (repo) {
                                    // git show HEAD:relative/path
                                    const relativePath = path.relative(repo.rootUri.fsPath, absolutePath);
                                    const gitUri = vscode.Uri.parse(
                                        `git:/${relativePath}?${JSON.stringify({ path: relativePath, ref: '~' })}`
                                    );
                                    await vscode.commands.executeCommand(
                                        'vscode.diff',
                                        gitUri,
                                        fileUri,
                                        `${basename} (HEAD ↔ Working)`
                                    );
                                    break;
                                }
                            }

                            // Fallback：直接打开文件
                            const doc = await vscode.workspace.openTextDocument(fileUri);
                            await vscode.window.showTextDocument(doc, { preview: false });
                        } catch (err) {
                            console.error('[VCoder] openDiff failed:', filePath, err);
                            // Fallback：尝试直接打开文件
                            try {
                                let absolutePath = filePath;
                                if (!path.isAbsolute(filePath)) {
                                    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                                    if (root) absolutePath = path.join(root, filePath);
                                }
                                const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(absolutePath));
                                await vscode.window.showTextDocument(doc, { preview: false });
                            } catch {
                                vscode.window.showErrorMessage(`无法打开 diff: ${filePath}`);
                            }
                        }
                    }
                    break;
                case 'getAuditStats':
                    {
                        if (this.auditLogger) {
                            const stats = await this.auditLogger.getStats();
                            this.postMessage({
                                type: 'auditStats',
                                data: {
                                    totalEvents: stats.totalEvents,
                                    sessionCount: stats.sessionCount,
                                    errorCount: stats.errorCount,
                                    fileSize: stats.fileSize,
                                },
                            });
                        }
                    }
                    break;
                case 'exportAuditLog':
                    {
                        if (this.auditLogger) {
                            await this.auditLogger.exportToFile();
                        }
                    }
                    break;
            }
        });
    }

    /**
     * Set the DiffManager instance for file change review flow.
     */
    setDiffManager(diffManager: DiffManager): void {
        this.diffManager = diffManager;

        // Listen for diff decisions to update webview
        diffManager.on('decision', (data: { sessionId: string; filePath: string; decision: 'accepted' | 'rejected' }) => {
            // Notify webview that a file change was decided
            const updateContent: FileChangeUpdate = {
                type: 'modified',
                path: data.filePath,
                proposed: false,
                sessionId: data.sessionId,
            };
            this.postMessage({
                type: 'update',
                data: {
                    sessionId: data.sessionId,
                    type: 'file_change',
                    content: updateContent,
                },
            }, true);

            // Audit log the diff review decision
            if (this.auditLogger) {
                void this.auditLogger.logFileOperation(
                    data.sessionId, data.filePath, 'write', undefined, undefined, undefined, data.decision
                );
            }

            // Update file decorator — clear decoration on both accept and reject
            if (this.fileDecorator) {
                this.fileDecorator.removeFile(data.filePath);
            }

            // Reveal accepted file in editor with highlight (方案1+3)
            if (data.decision === 'accepted') {
                const cachedDiff = this.pendingDiffCache.get(data.filePath);
                this.pendingDiffCache.delete(data.filePath);
                void this.revealFileChange(data.filePath, cachedDiff);
            } else {
                this.pendingDiffCache.delete(data.filePath);
            }
        });

        // Listen for conflict detection events
        diffManager.on('conflict', (data: { sessionId: string; filePath: string }) => {
            console.warn(`[VCoder] Conflict detected: ${data.filePath} modified during review`);
            this.postMessage({
                type: 'update',
                data: {
                    sessionId: data.sessionId,
                    type: 'file_change',
                    content: {
                        type: 'modified',
                        path: data.filePath,
                        proposed: true,
                        conflict: true,
                        sessionId: data.sessionId,
                    },
                },
            });
        });

        // Listen for review stats updates
        diffManager.on('statsUpdate', (data: { sessionId: string; stats: { pending: number; accepted: number; rejected: number; total: number } }) => {
            this.postMessage({
                type: 'reviewStats',
                data: {
                    sessionId: data.sessionId,
                    stats: data.stats,
                },
            });
        });
    }

    /**
     * Set the FileDecorationProvider instance.
     */
    setFileDecorator(fileDecorator: VCoderFileDecorationProvider): void {
        this.fileDecorator = fileDecorator;
    }

    /**
     * Set the InlineDiffProvider instance for in-editor decorations.
     */
    setInlineDiffProvider(provider: InlineDiffProvider, updateStatusBar: () => void): void {
        this.inlineDiffProvider = provider;
        this.updateReviewStatusBar = updateStatusBar;
    }

    /**
     * Handle file_change events from the agent.
     * When proposed=true, triggers Diff review flow + caches diff.
     * When proposed=false, reveals the file in editor with highlight.
     */
    private handleFileChange(sessionId: string, change: FileChangeUpdate): void {
        // Update file decorator
        if (this.fileDecorator) {
            this.fileDecorator.updateFile(change);
        }

        if (!change.proposed) {
            // proposed=false is the "clear pending" signal after accept/reject.
            // The file is already on disk — reveal it with cached diff (方案1+3).
            if (change.type !== 'deleted') {
                const cachedDiff = this.pendingDiffCache.get(change.path);
                this.pendingDiffCache.delete(change.path);
                void this.revealFileChange(change.path, cachedDiff);
            } else {
                this.pendingDiffCache.delete(change.path);
            }
            return;
        }

        // Cache diff for later use when proposed=false arrives
        if (change.diff) {
            this.pendingDiffCache.set(change.path, change.diff);
        }

        // Check permission mode - bypassPermissions auto-accepts without diff review
        const config = vscode.workspace.getConfiguration('vcoder');
        const permissionMode = config.get<string>('permissionMode', 'default');
        if (permissionMode === 'bypassPermissions') {
            console.log('[VCoder] bypassPermissions mode: auto-accepting', change.path);
            void this.acpClient.acceptFileChange(change.path, sessionId);
            // CLI already wrote the file — reveal it in editor (方案1+3)
            if (change.type !== 'deleted') {
                // Small delay to ensure the CLI has finished writing
                setTimeout(() => {
                    void this.revealFileChange(change.path, change.diff);
                    this.pendingDiffCache.delete(change.path);
                }, 500);
            }
            return;
        }

        // Show inline diff decorations in the editor
        if (this.inlineDiffProvider) {
            this.inlineDiffProvider.showInlineDiff(sessionId, change);
            this.updateReviewStatusBar?.();
        }

        // Trigger Diff review in VSCode
        if (this.diffManager) {
            void this.diffManager.previewChange(sessionId, change);
        }
    }

    /**
     * 方案1+3：自动打开被修改的文件，滚动到变更位置，临时高亮变更行
     */
    private async revealFileChange(filePath: string, diff?: string): Promise<void> {
        try {
            let absolutePath = filePath;
            if (!path.isAbsolute(filePath)) {
                const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                if (root) {
                    absolutePath = path.join(root, filePath);
                }
            }

            const uri = vscode.Uri.file(absolutePath);
            const doc = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(doc, {
                preview: true,
                preserveFocus: true, // 不抢走焦点，用户可能还在 WebView 中操作
            });

            // 解析 diff 获取变更行范围
            const changedLines = this.parseChangedLines(diff);
            if (changedLines.length === 0) return;

            // 方案1：滚动到首个变更行
            const firstLine = changedLines[0];
            const revealPos = new vscode.Position(Math.max(0, firstLine - 1), 0);
            editor.revealRange(
                new vscode.Range(revealPos, revealPos),
                vscode.TextEditorRevealType.InCenter
            );

            // 方案3：临时高亮变更行
            const decorations: vscode.DecorationOptions[] = changedLines
                .filter(line => line > 0 && line <= doc.lineCount)
                .map(line => ({
                    range: new vscode.Range(line - 1, 0, line - 1, doc.lineAt(line - 1).text.length),
                }));

            // 清除上一次的高亮
            if (this.changeHighlightTimer) {
                clearTimeout(this.changeHighlightTimer);
            }
            editor.setDecorations(this.changeHighlightDecoration, decorations);

            // 3 秒后淡出
            this.changeHighlightTimer = setTimeout(() => {
                editor.setDecorations(this.changeHighlightDecoration, []);
                this.changeHighlightTimer = undefined;
            }, 3000);
        } catch (err) {
            // 静默失败——不影响主流程
            console.warn('[VCoder] revealFileChange failed:', filePath, err);
        }
    }

    /**
     * 从 unified diff 中提取新增/修改的行号（新文件侧）
     */
    private parseChangedLines(diff?: string): number[] {
        if (!diff) return [];

        const lines = diff.split('\n');
        const changedLines: number[] = [];
        let newLineNum = 0;

        for (const line of lines) {
            const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
            if (hunkMatch) {
                newLineNum = parseInt(hunkMatch[1], 10) - 1;
                continue;
            }

            if (line.startsWith('+') && !line.startsWith('+++')) {
                newLineNum++;
                changedLines.push(newLineNum);
            } else if (line.startsWith('-') && !line.startsWith('---')) {
                // 删除行不递增 newLineNum
            } else if (!line.startsWith('diff ') && !line.startsWith('index ') &&
                       !line.startsWith('---') && !line.startsWith('+++') &&
                       !line.startsWith('new file') && !line.startsWith('deleted file') &&
                       !line.startsWith('\\')) {
                newLineNum++;
            }
        }

        return changedLines;
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
     * Gather all CLI ecosystem data: MCP servers, skills, hooks, plugins.
     */
    private async gatherEcosystemData() {
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        const homeDir = os.homedir();
        const claudeDir = path.join(homeDir, '.claude');

        // MCP servers
        const mcpServers = this.getMcpServerConfig();
        const mcp = mcpServers.map((s, i) => ({
            id: `${i}:${s.name ?? ''}`,
            type: s.type,
            name: s.name,
            command: s.command,
            url: s.url,
            args: s.args,
            readonly: !!(this.builtinMcpServer && s.url && (() => {
                try { return this.builtinMcpServer?.getServerConfig().url === s.url; } catch { return false; }
            })()),
        }));

        // Skills: ~/.claude/skills/ and <workspace>/.claude/skills/
        const skills: { name: string; description?: string; source: 'global' | 'workspace'; path: string }[] = [];
        for (const [skillsDir, source] of [
            [path.join(claudeDir, 'skills'), 'global'],
            [path.join(workspacePath, '.claude', 'skills'), 'workspace'],
        ] as [string, 'global' | 'workspace'][]) {
            try {
                const entries = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'));
                for (const entry of entries) {
                    const fullPath = path.join(skillsDir, entry);
                    const name = entry.replace(/\.md$/, '');
                    let description: string | undefined;
                    try {
                        const content = fs.readFileSync(fullPath, 'utf-8');
                        const match = content.match(/^#\s+(.+)|description:\s*['""]?(.+?)['""]?\s*$/mi);
                        description = match ? (match[1] || match[2])?.trim() : undefined;
                    } catch { /* ignore */ }
                    skills.push({ name, description, source, path: fullPath });
                }
            } catch { /* dir doesn't exist */ }
        }

        // Hooks: ~/.claude/settings.json
        const hooks: { event: string; command: string; matcher?: string }[] = [];
        try {
            const settingsPath = path.join(claudeDir, 'settings.json');
            const raw = fs.readFileSync(settingsPath, 'utf-8');
            const settings = JSON.parse(raw);
            if (Array.isArray(settings.hooks)) {
                for (const hook of settings.hooks) {
                    if (typeof hook.event === 'string' && typeof hook.command === 'string') {
                        hooks.push({ event: hook.event, command: hook.command, matcher: hook.matcher });
                    }
                }
            }
        } catch { /* no settings or not parseable */ }

        // Plugins: ~/.claude/plugins/ and <workspace>/.claude/plugins/
        const plugins: { name: string; version?: string; path: string; source: 'global' | 'workspace' }[] = [];
        for (const [pluginsDir, source] of [
            [path.join(claudeDir, 'plugins'), 'global'],
            [path.join(workspacePath, '.claude', 'plugins'), 'workspace'],
        ] as [string, 'global' | 'workspace'][]) {
            try {
                const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
                for (const entry of entries) {
                    if (!entry.isDirectory()) continue;
                    const fullPath = path.join(pluginsDir, entry.name);
                    let version: string | undefined;
                    try {
                        const pkg = JSON.parse(fs.readFileSync(path.join(fullPath, 'package.json'), 'utf-8'));
                        version = pkg.version;
                    } catch { /* no package.json */ }
                    plugins.push({ name: entry.name, version, path: fullPath, source });
                }
            } catch { /* dir doesn't exist */ }
        }

        return { mcp, skills, hooks, plugins };
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
