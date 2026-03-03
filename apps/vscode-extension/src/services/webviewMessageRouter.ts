/**
 * WebviewMessageRouter
 * Handles all messages from the webview's onDidReceiveMessage switch statement.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { ACPClient } from '@vcoder/shared/acpClient';
import { McpServerConfig, AgentProfile, PermissionRule } from '@vcoder/shared';
import { SessionStore } from './sessionStore';
import { AuditLogger } from './auditLogger';
import { AgentRegistry } from './agentRegistry';
import { DiffManager } from './diffManager';
import { EcosystemService } from './ecosystemService';
import { TerminalBufferService } from './terminalBufferService';
import { FileChangeOrchestrator } from './fileChangeOrchestrator';

export interface MessageRouterDeps {
    context: vscode.ExtensionContext;
    acpClient: ACPClient;
    sessionStore?: SessionStore;
    auditLogger?: AuditLogger;
    agentRegistry?: AgentRegistry;
    postMessage: (msg: unknown, immediate?: boolean) => void;
    terminalBuffer: TerminalBufferService;
    ecosystemService: EcosystemService;
    fileChangeOrchestrator: FileChangeOrchestrator;
}

// Allowlist for commands that the webview is permitted to invoke
const ALLOWED_COMMAND_PREFIXES = ['vcoder.'];
const ALLOWED_COMMANDS = new Set([
    'workbench.action.openSettings',
    'workbench.view.extension.vcoder',
]);

export class WebviewMessageRouter {
    constructor(private deps: MessageRouterDeps) {}

    async handleMessage(message: Record<string, unknown>): Promise<void> {
        const { acpClient, sessionStore, auditLogger, agentRegistry, postMessage, terminalBuffer, ecosystemService, fileChangeOrchestrator } = this.deps;

        switch (message.type) {
            case 'send':
                {
                    let session = acpClient.getCurrentSession();
                    if (!session) {
                        const mcpServers = ecosystemService.getMcpServerConfig();
                        const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                        session = await acpClient.newSession(undefined, { cwd, mcpServers });
                        postMessage({ type: 'currentSession', data: { sessionId: session.id } }, true);
                        postMessage({ type: 'sessions', data: await acpClient.listSessions() }, true);
                        if (sessionStore) {
                            await sessionStore.saveCurrentSessionId(session.id);
                        }
                        if (auditLogger) {
                            void auditLogger.log({
                                sessionId: session.id,
                                eventType: 'session_start',
                                data: { source: 'auto', title: session.title },
                            });
                        }
                    }
                    if (session && auditLogger) {
                        void auditLogger.logUserPrompt(session.id, message.content as string);
                    }

                    // Auto-inject editor context into prompt
                    const editor = vscode.window.activeTextEditor;
                    let contextPrefix = '';
                    if (editor) {
                        const activeFile = vscode.workspace.asRelativePath(editor.document.uri);
                        const cursorLine = editor.selection.active.line + 1;
                        contextPrefix += `[Active file: ${activeFile}, cursor at line ${cursorLine}]\n`;

                        const diagnostics = vscode.languages.getDiagnostics(editor.document.uri)
                            .filter(d => d.severity <= vscode.DiagnosticSeverity.Warning)
                            .slice(0, 10)
                            .map(d => `L${d.range.start.line + 1}: [${d.severity === 0 ? 'Error' : 'Warning'}] ${d.message}`);
                        if (diagnostics.length > 0) {
                            contextPrefix += `[Diagnostics:\n${diagnostics.join('\n')}]\n`;
                        }
                    }

                    const fullContent = contextPrefix ? contextPrefix + '\n' + (message.content as string) : (message.content as string);
                    await acpClient.prompt(fullContent, message.attachments as unknown[]);
                }
                break;
            case 'newSession':
                {
                    const mcpServers = ecosystemService.getMcpServerConfig();
                    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                    const session = await acpClient.newSession(message.title as string | undefined, { cwd, mcpServers });
                    postMessage({ type: 'currentSession', data: { sessionId: session.id } });
                    postMessage({ type: 'sessions', data: await acpClient.listSessions() });
                    if (sessionStore) {
                        await sessionStore.saveCurrentSessionId(session.id);
                    }
                    if (auditLogger) {
                        void auditLogger.log({
                            sessionId: session.id,
                            eventType: 'session_start',
                            data: { source: 'user', title: session.title },
                        });
                    }
                    break;
                }
            case 'listSessions':
                {
                    const sessions = await acpClient.listSessions();
                    postMessage({ type: 'sessions', data: sessions });
                    break;
                }
            case 'switchSession':
                {
                    const previousSessionId = acpClient.getCurrentSession()?.id;
                    await acpClient.switchSession(message.sessionId as string);
                    postMessage({ type: 'currentSession', data: { sessionId: message.sessionId } }, true);
                    postMessage({ type: 'sessions', data: await acpClient.listSessions() }, true);
                    if (sessionStore) {
                        await sessionStore.saveCurrentSessionId(message.sessionId as string);
                    }
                    if (auditLogger) {
                        void auditLogger.log({
                            sessionId: message.sessionId as string,
                            eventType: 'session_start',
                            data: { source: 'switch', previousSessionId },
                        });
                    }
                }
                break;
            case 'deleteSession':
                await acpClient.deleteSession(message.sessionId as string);
                // Clear pending diff changes for the deleted session
                fileChangeOrchestrator.clearSession(message.sessionId as string);
                fileChangeOrchestrator.clearDecorations();
                postMessage({ type: 'sessions', data: await acpClient.listSessions() }, true);
                if (auditLogger) {
                    void auditLogger.log({
                        sessionId: message.sessionId as string,
                        eventType: 'session_end',
                        data: { reason: 'deleted' },
                    });
                }
                break;
            case 'acceptChange':
                {
                    const currentSession = acpClient.getCurrentSession();
                    const sid = (message.sessionId as string | undefined) ?? currentSession?.id;
                    const diffMgr = this.getDiffManager();
                    if (diffMgr && sid) {
                        await diffMgr.acceptChange(sid, message.path as string);
                    } else {
                        await acpClient.acceptFileChange(message.path as string);
                    }
                }
                break;
            case 'rejectChange':
                {
                    const currentSession = acpClient.getCurrentSession();
                    const sid = (message.sessionId as string | undefined) ?? currentSession?.id;
                    const diffMgr = this.getDiffManager();
                    if (diffMgr && sid) {
                        await diffMgr.rejectChange(sid, message.path as string);
                    } else {
                        await acpClient.rejectFileChange(message.path as string);
                    }
                }
                break;
            case 'acceptAllChanges':
                {
                    const currentSession = acpClient.getCurrentSession();
                    const sid = (message.sessionId as string | undefined) ?? currentSession?.id;
                    const diffMgr = this.getDiffManager();
                    if (diffMgr && sid) {
                        await diffMgr.acceptAll(sid);
                    }
                }
                break;
            case 'rejectAllChanges':
                {
                    const currentSession = acpClient.getCurrentSession();
                    const sid = (message.sessionId as string | undefined) ?? currentSession?.id;
                    const diffMgr = this.getDiffManager();
                    if (diffMgr && sid) {
                        await diffMgr.rejectAll(sid);
                    }
                }
                break;
            case 'setModel':
                await acpClient.changeSettings({ model: message.model as string });
                break;
            case 'setPlanMode':
                await acpClient.changeSettings({ planMode: message.enabled as boolean });
                break;
            case 'setPermissionMode':
                await acpClient.changeSettings({ permissionMode: message.mode as string });
                break;
            case 'setThinking':
                await acpClient.changeSettings({
                    maxThinkingTokens: (message.enabled as boolean) ? ((message.maxThinkingTokens as number | undefined) ?? 16000) : 0,
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
                    postMessage({ type: 'uiLanguage', data: { uiLanguage } }, true);
                }
                break;
            case 'confirmTool':
                {
                    const { toolCallId, confirmed, options } = message;
                    await acpClient.confirmTool(toolCallId as string, confirmed as boolean, options as Record<string, unknown> | undefined);
                }
                break;
            case 'answerQuestion': {
                const { toolCallId, answer } = message;
                await acpClient.answerQuestion(toolCallId as string, answer as string);
                break;
            }
            case 'cancel':
                await acpClient.cancelSession();
                postMessage({ type: 'complete' }, true);
                break;
            case 'getWorkspaceFiles':
                {
                    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                    const files = await vscode.workspace.findFiles('**/*', '**/node_modules/**');
                    const rel = (p: string) => p.replace(/\\/g, '/');
                    postMessage({
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
                        const relative = path.relative(workspaceRoot, resolvedPath);
                        if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) {
                            console.warn('[VCoder] readFile: path escapes workspace:', filePath);
                            break;
                        }
                        const uri = vscode.Uri.file(resolvedPath);
                        const stat = await vscode.workspace.fs.stat(uri);
                        // Skip files > 1MB -- only attach path
                        if (stat.size > 1 * 1024 * 1024) {
                            postMessage({
                                type: 'fileContent',
                                data: { path: filePath, content: null, tooLarge: true },
                            });
                            break;
                        }
                        const content = await vscode.workspace.fs.readFile(uri);
                        const text = new TextDecoder().decode(content);
                        postMessage({
                            type: 'fileContent',
                            data: { path: filePath, content: text },
                        });
                    } catch (err) {
                        console.error('[VCoder] Failed to read file:', filePath, err);
                        postMessage({
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
                        postMessage({ type: 'selectionContent', data: null });
                        break;
                    }
                    const selection = editor.selection;
                    const content = editor.document.getText(selection);
                    postMessage({
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
                    const output = terminalBuffer.getOutput();
                    postMessage({
                        type: 'terminalOutput',
                        data: { content: output || null },
                    });
                }
                break;
            case 'executeCommand':
                if (message.command) {
                    const cmd = message.command as string;
                    const allowed =
                        ALLOWED_COMMANDS.has(cmd) ||
                        ALLOWED_COMMAND_PREFIXES.some((prefix) => cmd.startsWith(prefix));
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
                        const sessions = await acpClient.listHistory(root, search);
                        postMessage({ type: 'historySessions', data: sessions });
                    } catch (err) {
                        console.error('[VCoder] Failed to list history:', err);
                        postMessage({ type: 'historySessions', data: [] });
                    }
                }
                break;
            case 'loadHistory':
                {
                    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
                    try {
                        const result = await acpClient.loadHistory(message.sessionId as string, root);
                        postMessage({
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
                    const mcpServers = ecosystemService.getMcpServerConfig();
                    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                    try {
                        const session = await acpClient.resumeSession(message.sessionId as string, {
                            title: message.title as string | undefined,
                            cwd,
                            mcpServers,
                        });
                        postMessage({ type: 'currentSession', data: { sessionId: session.id } }, true);
                        postMessage({ type: 'sessions', data: await acpClient.listSessions() }, true);
                        if (auditLogger) {
                            void auditLogger.log({
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
                    const agents = agentRegistry
                        ? agentRegistry.getAgentStatuses()
                        : this.getAgentProfiles();
                    postMessage({ type: 'agents', data: agents }, true);
                    const currentAgentId = agentRegistry
                        ? agentRegistry.getActiveAgentId()
                        : (agents.length > 0 ? agents[0].profile.id : null);
                    postMessage({ type: 'currentAgent', data: { agentId: currentAgentId } }, true);
                }
                break;
            case 'selectAgent':
                {
                    if (!agentRegistry) {
                        console.log('[VCoder] Agent selected (no registry):', message.agentId);
                        postMessage({ type: 'currentAgent', data: { agentId: message.agentId } }, true);
                        break;
                    }
                    try {
                        const stdio = await agentRegistry.switchAgent(message.agentId as string);
                        acpClient.updateTransport(stdio.stdout, stdio.stdin);
                        await acpClient.initialize({
                            protocolVersion: 1,
                            clientInfo: { name: 'vcoder-vscode', version: '0.2.0' },
                            clientCapabilities: { terminal: true, fs: { readTextFile: true, writeTextFile: true } },
                            capabilities: { streaming: true, diffPreview: true, thought: true, toolCallList: true, taskList: true, multiSession: true },
                            workspaceFolders: vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath) || [],
                        });
                        const mcpServers = ecosystemService.getMcpServerConfig();
                        const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                        const session = await acpClient.newSession(undefined, { cwd, mcpServers });
                        postMessage({ type: 'currentAgent', data: { agentId: message.agentId } }, true);
                        postMessage({ type: 'currentSession', data: { sessionId: session.id } }, true);
                        postMessage({ type: 'sessions', data: await acpClient.listSessions() }, true);
                        postMessage({ type: 'agents', data: agentRegistry.getAgentStatuses() }, true);
                    } catch (err) {
                        console.error('[VCoder] Agent switch failed:', err);
                        vscode.window.showErrorMessage(`Agent 切换失败: ${err instanceof Error ? err.message : String(err)}`);
                    }
                }
                break;
            case 'openSettings':
                {
                    const setting = (message.setting as string) || 'vcoder';
                    await vscode.commands.executeCommand('workbench.action.openSettings', setting);
                }
                break;
            case 'getPermissionRules':
                {
                    const rules = sessionStore ? await sessionStore.getPermissionRules() : [];
                    postMessage({ type: 'permissionRules', data: rules });
                }
                break;
            case 'addPermissionRule':
                {
                    if (sessionStore && message.rule) {
                        await sessionStore.addPermissionRule(message.rule as PermissionRule);
                    }
                    const rules = sessionStore ? await sessionStore.getPermissionRules() : [];
                    postMessage({ type: 'permissionRules', data: rules });
                }
                break;
            case 'updatePermissionRule':
                {
                    if (sessionStore && message.ruleId) {
                        const rules = await sessionStore.getPermissionRules();
                        const existing = rules.find((rule) => rule.id === message.ruleId);
                        const updates = (message.updates || {}) as Partial<PermissionRule>;
                        const now = new Date().toISOString();
                        const nextRule: PermissionRule = {
                            id: message.ruleId as string,
                            action: updates.action ?? existing?.action ?? 'allow',
                            createdAt: existing?.createdAt ?? now,
                            updatedAt: now,
                            toolName: updates.toolName ?? existing?.toolName,
                            pattern: updates.pattern ?? existing?.pattern,
                            description: updates.description ?? existing?.description,
                            expiresAt: updates.expiresAt ?? existing?.expiresAt,
                        };
                        await sessionStore.addPermissionRule(nextRule);
                    }
                    const rules = sessionStore ? await sessionStore.getPermissionRules() : [];
                    postMessage({ type: 'permissionRules', data: rules });
                }
                break;
            case 'deletePermissionRule':
                {
                    if (sessionStore && message.ruleId) {
                        await sessionStore.deletePermissionRule(message.ruleId as string);
                    }
                    const rules = sessionStore ? await sessionStore.getPermissionRules() : [];
                    postMessage({ type: 'permissionRules', data: rules });
                }
                break;
            case 'clearPermissionRules':
                {
                    if (sessionStore) {
                        await sessionStore.clearPermissionRules();
                    }
                    postMessage({ type: 'permissionRules', data: [] });
                }
                break;
            case 'showEcosystem':
            case 'getEcosystemData':
                {
                    if (message.type === 'showEcosystem') {
                        postMessage({ type: 'showEcosystem' });
                    }
                    const ecosystemData = await ecosystemService.gatherEcosystemData();
                    postMessage({ type: 'ecosystemData', data: ecosystemData });
                }
                break;
            case 'addMcpServer':
                {
                    const config = vscode.workspace.getConfiguration('vcoder');
                    const servers = config.get<McpServerConfig[]>('mcpServers', []);
                    const { server } = message as { type: string; server: McpServerConfig };
                    await config.update('mcpServers', [...servers, server], vscode.ConfigurationTarget.Global);
                    const ecosystemData = await ecosystemService.gatherEcosystemData();
                    postMessage({ type: 'ecosystemData', data: ecosystemData });
                }
                break;
            case 'removeMcpServer':
                {
                    const config = vscode.workspace.getConfiguration('vcoder');
                    const servers = config.get<McpServerConfig[]>('mcpServers', []);
                    const { id } = message as { type: string; id: string };
                    const updated = servers.filter((s, i) => `${i}:${s.name ?? ''}` !== id);
                    await config.update('mcpServers', updated, vscode.ConfigurationTarget.Global);
                    const ecosystemData = await ecosystemService.gatherEcosystemData();
                    postMessage({ type: 'ecosystemData', data: ecosystemData });
                }
                break;
            case 'deleteHistory':
                {
                    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
                    try {
                        await acpClient.deleteHistory(message.sessionId as string, root);
                    } catch (err) {
                        console.error('[VCoder] Failed to delete history:', err);
                    }
                    try {
                        const sessions = await acpClient.listHistory(root);
                        postMessage({ type: 'historySessions', data: sessions });
                    } catch (err) {
                        console.error('[VCoder] Failed to refresh history after delete:', err);
                        postMessage({ type: 'historySessions', data: [] });
                    }
                }
                break;
            case 'insertText':
                {
                    const editor = vscode.window.activeTextEditor;
                    if (editor) {
                        await editor.edit((editBuilder) => {
                            editBuilder.insert(editor.selection.active, message.text as string);
                        });
                    } else {
                        vscode.window.showWarningMessage('请先打开一个文件再插入代码');
                    }
                }
                break;
            case 'openFile':
                {
                    const filePath = message.path as string;
                    const lineRange = message.lineRange as [number, number] | undefined;

                    if (!filePath) {
                        console.warn('[VCoder] openFile: no path provided');
                        break;
                    }

                    try {
                        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                        let absolutePath: string;
                        if (path.isAbsolute(filePath)) {
                            absolutePath = path.resolve(filePath);
                        } else if (root) {
                            absolutePath = path.resolve(root, filePath);
                        } else {
                            absolutePath = filePath;
                        }

                        if (root) {
                            const relative = path.relative(root, absolutePath);
                            if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) {
                                console.warn('[VCoder] openFile: path escapes workspace:', filePath);
                                vscode.window.showWarningMessage(`无法打开工作区以外的文件: ${filePath}`);
                                break;
                            }
                        }

                        const uri = vscode.Uri.file(absolutePath);
                        const doc = await vscode.workspace.openTextDocument(uri);
                        const editor = await vscode.window.showTextDocument(doc, {
                            preview: false,
                            preserveFocus: false,
                        });

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
                    const filePath = message.path as string;
                    if (!filePath) break;

                    try {
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
                                console.warn('[VCoder] openDiff: path escapes workspace:', filePath);
                                vscode.window.showWarningMessage(`无法打开工作区以外的文件: ${filePath}`);
                                break;
                            }
                        }

                        const fileUri = vscode.Uri.file(absolutePath);
                        const basename = path.basename(absolutePath);

                        const gitExtension = vscode.extensions.getExtension('vscode.git');
                        if (gitExtension?.isActive) {
                            const git = gitExtension.exports.getAPI(1);
                            const repo = git?.repositories?.[0];
                            if (repo) {
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

                        const doc = await vscode.workspace.openTextDocument(fileUri);
                        await vscode.window.showTextDocument(doc, { preview: false });
                    } catch (err) {
                        console.error('[VCoder] openDiff failed:', filePath, err);
                        try {
                            const fallbackRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                            const fallbackPath = path.isAbsolute(filePath)
                                ? path.resolve(filePath)
                                : fallbackRoot ? path.resolve(fallbackRoot, filePath) : filePath;
                            if (fallbackRoot) {
                                const rel = path.relative(fallbackRoot, fallbackPath);
                                if (rel.startsWith('..' + path.sep) || rel === '..' || path.isAbsolute(rel)) {
                                    throw new Error('Path escapes workspace');
                                }
                            }
                            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fallbackPath));
                            await vscode.window.showTextDocument(doc, { preview: false });
                        } catch {
                            vscode.window.showErrorMessage(`无法打开 diff: ${filePath}`);
                        }
                    }
                }
                break;
            case 'getAuditStats':
                {
                    if (auditLogger) {
                        const stats = await auditLogger.getStats();
                        postMessage({
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
                    if (auditLogger) {
                        await auditLogger.exportToFile();
                    }
                }
                break;
        }
    }

    /**
     * Get Agent profiles from configuration (fallback when no AgentRegistry).
     */
    private getAgentProfiles(): Array<{
        profile: AgentProfile;
        status: 'online' | 'offline' | 'error' | 'starting' | 'reconnecting';
        isActive: boolean;
    }> {
        const config = vscode.workspace.getConfiguration('vcoder');
        const profiles = config.get<AgentProfile[]>('agentProfiles', []);
        return profiles.map((profile, index) => ({
            profile,
            status: 'offline' as const,
            isActive: index === 0,
        }));
    }

    /**
     * Get the DiffManager from the FileChangeOrchestrator.
     */
    private getDiffManager(): DiffManager | undefined {
        return this.deps.fileChangeOrchestrator.getDiffManager();
    }
}
