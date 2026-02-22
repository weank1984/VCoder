/**
 * VCoder VSCode Extension
 * Entry point and main extension logic
 */

import * as vscode from 'vscode';
import { ACPClient } from '@vcoder/shared/acpClient';
import { ChatViewProvider } from './providers/chatViewProvider';
import { ServerManager } from './services/serverManager';
import { CapabilityOrchestrator, createCapabilityOrchestrator } from './services/capabilityOrchestrator';
import { FileSystemProvider } from './services/fileSystemProvider';
import { TerminalProvider } from './services/terminalProvider';
import { DiffManager } from './services/diffManager';
import { VCoderFileDecorationProvider } from './providers/fileDecorationProvider';
import { ACPMethods, type UpdateNotificationParams, type PermissionRulesListParams, type PermissionRuleAddParams, type PermissionRuleUpdateParams, type PermissionRuleDeleteParams, type PermissionRule, type TerminalCreateParams, type TerminalWaitForExitParams } from '@vcoder/shared';
import { AgentRegistry } from './services/agentRegistry';

// Declare output channel at top level
const outputChannel = vscode.window.createOutputChannel('VCoder', 'VCoder');

// Global extension state
let serverManager: ServerManager | undefined;
let acpClient: ACPClient | undefined;
let terminalProvider: TerminalProvider | undefined;
let fileSystemProvider: FileSystemProvider | undefined;
let chatViewProvider: ChatViewProvider | undefined;
let statusBarItem: vscode.StatusBarItem;
let capabilityOrchestrator: CapabilityOrchestrator | null = null;
let agentRegistry: AgentRegistry | undefined;

/**
 * Extension activation entry point
 */
export async function activate(context: vscode.ExtensionContext) {
    console.log('[VCoder] Activating extension...');
    
    // Initialize Capability Orchestrator (unified component management)
    try {
        capabilityOrchestrator = await createCapabilityOrchestrator(context);
        
        
        
        context.subscriptions.push({
            dispose: async () => {
                await capabilityOrchestrator?.shutdown();
            }
        });
    } catch (err) {
        console.error('[VCoder] Failed to initialize capability orchestrator:', err);
        outputChannel.appendLine(`[VCoder] Warning: Capability orchestrator failed to initialize: ${err}`);
    }
    
    // Initialize ServerManager
    serverManager = new ServerManager(context);
    
    // Register disposables (capability instances are managed by orchestrator)
    context.subscriptions.push(
        { dispose: async () => await serverManager?.stop() },
        { dispose: async () => await fileSystemProvider?.dispose() },
        { dispose: async () => await terminalProvider?.dispose() },
    );
    
    // Initialize status bar
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'vcoder.newChat';
    statusBarItem.tooltip = 'New Chat';
    context.subscriptions.push(statusBarItem);
    statusBarItem.show();
    
    try {
        // Initialize ACP client and start server
        await serverManager.start();

        // Initialize Agent Registry (manages built-in + external agents)
        agentRegistry = new AgentRegistry(context, serverManager);
        await agentRegistry.loadProfiles();
        context.subscriptions.push({ dispose: async () => await agentRegistry?.dispose() });

        if (serverManager.getStatus() === 'running') {
            const stdio = agentRegistry.getActiveStdio();
            acpClient = new ACPClient({
                stdin: stdio.stdin,
                stdout: stdio.stdout
            });

            // Initialize ACP client
            await acpClient.initialize({
                protocolVersion: 1,
                clientInfo: {
                    name: 'vcoder-vscode',
                    version: '0.2.0',
                },
                clientCapabilities: {
                    terminal: true,
                    fs: {
                        readTextFile: true,
                        writeTextFile: true,
                    },
                },
                capabilities: {
                    streaming: true,
                    diffPreview: true,
                    thought: true,
                    toolCallList: true,
                    taskList: true,
                    multiSession: true,
                },
                workspaceFolders: vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath) || [],
            });

            // Register LSP request handlers
            const lspService = capabilityOrchestrator?.getLspService();
            if (lspService) {
                acpClient.registerRequestHandler(ACPMethods.LSP_GO_TO_DEFINITION, async (params) => {
                    return lspService.goToDefinition(params as any);
                });
                acpClient.registerRequestHandler(ACPMethods.LSP_FIND_REFERENCES, async (params) => {
                    return lspService.findReferences(params as any);
                });
                acpClient.registerRequestHandler(ACPMethods.LSP_HOVER, async (params) => {
                    return lspService.hover(params as any);
                });
                acpClient.registerRequestHandler(ACPMethods.LSP_GET_DIAGNOSTICS, async (params) => {
                    return lspService.getDiagnostics(params as any);
                });
            }

            // Initialize capability providers
            fileSystemProvider = new FileSystemProvider(context);
            terminalProvider = new TerminalProvider(context);

            // Register FS request handlers
            acpClient.registerRequestHandler(ACPMethods.FS_READ_TEXT_FILE, async (params) => {
                return fileSystemProvider!.readTextFile(params as any);
            });
            acpClient.registerRequestHandler(ACPMethods.FS_WRITE_TEXT_FILE, async (params) => {
                return fileSystemProvider!.writeTextFile(params as any);
            });

            // Register Terminal request handlers (with audit logging)
            const terminalStartTimes = new Map<string, { startMs: number; command: string; cwd: string }>();

            acpClient.registerRequestHandler(ACPMethods.TERMINAL_CREATE, async (params) => {
                const p = params as TerminalCreateParams;
                const result = await terminalProvider!.createTerminal(p);
                // Record start time for duration calculation on exit
                terminalStartTimes.set(result.terminalId, {
                    startMs: Date.now(),
                    command: `${p.command} ${(p.args || []).join(' ')}`.trim(),
                    cwd: p.cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
                });
                // Audit log the terminal creation
                const sessionId = acpClient!.getCurrentSession()?.id ?? 'unknown';
                if (auditLogger) {
                    void auditLogger.logTerminalCommand(
                        sessionId,
                        `${p.command} ${(p.args || []).join(' ')}`.trim(),
                        p.cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
                    );
                }
                return result;
            });
            acpClient.registerRequestHandler(ACPMethods.TERMINAL_OUTPUT, async (params) => {
                return terminalProvider!.getTerminalOutput(params as any);
            });
            acpClient.registerRequestHandler(ACPMethods.TERMINAL_WAIT_FOR_EXIT, async (params) => {
                const p = params as TerminalWaitForExitParams;
                const result = await terminalProvider!.waitForExit(p);
                // Audit log the terminal exit with duration
                const startInfo = terminalStartTimes.get(p.terminalId);
                if (auditLogger && startInfo) {
                    const sessionId = acpClient!.getCurrentSession()?.id ?? 'unknown';
                    const durationMs = Date.now() - startInfo.startMs;
                    void auditLogger.logTerminalCommand(
                        sessionId,
                        startInfo.command,
                        startInfo.cwd,
                        result.exitCode,
                        undefined,
                        durationMs,
                    );
                    terminalStartTimes.delete(p.terminalId);
                }
                return result;
            });
            acpClient.registerRequestHandler(ACPMethods.TERMINAL_KILL, async (params) => {
                return terminalProvider!.killTerminal(params as any);
            });
            acpClient.registerRequestHandler(ACPMethods.TERMINAL_RELEASE, async (params) => {
                const p = params as any;
                // Clean up start time tracking on release
                terminalStartTimes.delete(p.terminalId);
                return terminalProvider!.releaseTerminal(p);
            });

            // Set up notification handling
            acpClient.on('session/update', (params: UpdateNotificationParams) => {
                // Notifications will be handled by ChatViewProvider
                console.log('[VCoder] Session update:', params.type);
            });
        }

        if (!acpClient) {
            throw new Error('ACP client not initialized (server is not running)');
        }

        // Register Chat webview view provider (required for "vcoder.chatView" to render)
        const sessionStore = capabilityOrchestrator?.getSessionStore();
        const auditLogger = capabilityOrchestrator?.getAuditLogger();
        const builtinMcpServer = capabilityOrchestrator?.getBuiltinMcpServer();
        chatViewProvider = new ChatViewProvider(context, acpClient, sessionStore, auditLogger, builtinMcpServer, agentRegistry);
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider('vcoder.chatView', chatViewProvider, {
                webviewOptions: { retainContextWhenHidden: true },
            }),
        );

        // Permission: Chain B only (confirmation_request -> Webview inline UI -> tool/confirm).
        // Chain A (session/requestPermission) has been removed.
        // See docs/learned/permission-unified-design.md for details.

        // Register permission rules RPC handlers (Server -> Client -> SessionStore)
        if (sessionStore) {
            acpClient.registerRequestHandler(ACPMethods.PERMISSION_RULES_LIST, async (params) => {
                const p = params as PermissionRulesListParams;
                let rules = await sessionStore.getPermissionRules();
                if (p.toolName) {
                    rules = rules.filter(r => !r.toolName || r.toolName === p.toolName);
                }
                return { rules };
            });

            acpClient.registerRequestHandler(ACPMethods.PERMISSION_RULE_ADD, async (params) => {
                const p = params as PermissionRuleAddParams;
                const now = new Date().toISOString();
                const rule: PermissionRule = {
                    ...p.rule,
                    id: `rule_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                    createdAt: now,
                    updatedAt: now,
                };
                await sessionStore.addPermissionRule(rule);
                const rules = await sessionStore.getPermissionRules();
                chatViewProvider?.postMessage({ type: 'permissionRules', data: rules });
                return { rules };
            });

            acpClient.registerRequestHandler(ACPMethods.PERMISSION_RULE_UPDATE, async (params) => {
                const p = params as PermissionRuleUpdateParams;
                const rules = await sessionStore.getPermissionRules();
                const existing = rules.find(r => r.id === p.ruleId);
                if (!existing) {
                    throw new Error(`Permission rule not found: ${p.ruleId}`);
                }
                const now = new Date().toISOString();
                const updated: PermissionRule = {
                    ...existing,
                    ...p.updates,
                    id: existing.id,
                    createdAt: existing.createdAt,
                    updatedAt: now,
                };
                await sessionStore.addPermissionRule(updated);
                const allRules = await sessionStore.getPermissionRules();
                chatViewProvider?.postMessage({ type: 'permissionRules', data: allRules });
                return { rules: allRules };
            });

            acpClient.registerRequestHandler(ACPMethods.PERMISSION_RULE_DELETE, async (params) => {
                const p = params as PermissionRuleDeleteParams;
                await sessionStore.deletePermissionRule(p.ruleId);
                const rules = await sessionStore.getPermissionRules();
                chatViewProvider?.postMessage({ type: 'permissionRules', data: rules });
                return { rules };
            });
        }

        // Commands used by view title buttons / status bar
        context.subscriptions.push(
            vscode.commands.registerCommand('vcoder.openChat', async () => {
                // Ensure the view container is visible, then focus the chat view.
                await vscode.commands.executeCommand('workbench.view.extension.vcoder');
                await vscode.commands.executeCommand('vcoder.chatView.focus');
            }),
            vscode.commands.registerCommand('vcoder.newChat', async () => {
                await vscode.commands.executeCommand('vcoder.chatView.focus');
                const mcpServers = vscode.workspace.getConfiguration('vcoder').get('mcpServers', []);
                const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                const session = await acpClient!.newSession(undefined, { cwd, mcpServers });
                chatViewProvider?.postMessage({ type: 'currentSession', data: { sessionId: session.id } }, true);
                chatViewProvider?.postMessage({ type: 'sessions', data: await acpClient!.listSessions() }, true);
                // Audit log session start from command
                if (auditLogger) {
                    void auditLogger.log({
                        sessionId: session.id,
                        eventType: 'session_start',
                        data: { source: 'command', title: session.title },
                    });
                }
            }),
            vscode.commands.registerCommand('vcoder.showHistory', async () => {
                await vscode.commands.executeCommand('vcoder.chatView.focus');
                chatViewProvider?.postMessage({ type: 'showHistory' }, true);
            }),
            vscode.commands.registerCommand('vcoder.openSettings', async () => {
                await vscode.commands.executeCommand('workbench.action.openSettings', 'vcoder');
            }),
            vscode.commands.registerCommand('vcoder.setUiLanguage', async () => {
                const pick = await vscode.window.showQuickPick(
                    [
                        { label: 'Auto', value: 'auto' as const, description: 'Follow VS Code display language' },
                        { label: 'English', value: 'en-US' as const },
                        { label: '简体中文', value: 'zh-CN' as const },
                    ],
                    { placeHolder: 'Select VCoder UI language' },
                );
                if (!pick) return;
                const config = vscode.workspace.getConfiguration('vcoder');
                await config.update('uiLanguage', pick.value, vscode.ConfigurationTarget.Global);
                chatViewProvider?.postMessage({ type: 'uiLanguage', data: { uiLanguage: pick.value } }, true);
            }),
        );
        
        // Register audit log export command
        if (auditLogger) {
            context.subscriptions.push(
                vscode.commands.registerCommand('vcoder.exportAuditLogs', async () => {
                    await auditLogger!.exportToFile();
                }),
            );
            // Check for unclosed sessions from previous runs
            void auditLogger.checkUncleanShutdown();
        }

        // Initialize diff manager and file decoration provider
        const fileDecorator = new VCoderFileDecorationProvider();
        context.subscriptions.push(
            vscode.window.registerFileDecorationProvider(fileDecorator)
        );

        if (acpClient) {
            const diffManager = new DiffManager(acpClient);
            context.subscriptions.push(diffManager.register());

            // Wire DiffManager and FileDecorationProvider into ChatViewProvider
            // so file_change events automatically trigger Diff review flow
            if (chatViewProvider) {
                chatViewProvider.setDiffManager(diffManager);
                chatViewProvider.setFileDecorator(fileDecorator);
            }
        }
        
        // Reload agent profiles when configuration changes
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(async (e) => {
                if (e.affectsConfiguration('vcoder.agentProfiles') && agentRegistry) {
                    await agentRegistry.loadProfiles();
                    chatViewProvider?.postMessage({
                        type: 'agents',
                        data: agentRegistry.getAgentStatuses(),
                    }, true);
                }
            }),
        );

        console.log('[VCoder] Extension initialized successfully');
        
    } catch (err) {
        console.error('[VCoder] Failed to initialize extension:', err);
        outputChannel.appendLine(`[VCoder] Failed to initialize extension: ${String(err)}`);
    }
}

/**
 * Extension deactivation
 */
export async function deactivate() {
    console.log('[VCoder] Deactivating extension...');
    
    if (capabilityOrchestrator) {
        await capabilityOrchestrator.shutdown();
    }
    
    await agentRegistry?.dispose();
    await serverManager?.stop();
    await fileSystemProvider?.dispose();
    await terminalProvider?.dispose();
}
