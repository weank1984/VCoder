/**
 * VCoder VSCode Extension
 * Entry point and main extension logic
 */

import * as vscode from 'vscode';
import { ACPClient } from './acp/client';
import { ChatViewProvider } from './providers/chatViewProvider';
import { ServerManager } from './services/serverManager';
import { CapabilityOrchestrator, createCapabilityOrchestrator } from './services/capabilityOrchestrator';
import { FileSystemProvider } from './services/fileSystemProvider';
import { TerminalProvider } from './services/terminalProvider';
import { DiffManager } from './services/diffManager';
import { VCoderFileDecorationProvider } from './providers/fileDecorationProvider';
import type { UpdateNotificationParams } from '@vcoder/shared';

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
        
        if (serverManager.getStatus() === 'running') {
            const stdio = serverManager.getStdio();
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
        chatViewProvider = new ChatViewProvider(context, acpClient);
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider('vcoder.chatView', chatViewProvider, {
                webviewOptions: { retainContextWhenHidden: true },
            }),
        );

        // Commands used by view title buttons / status bar
        context.subscriptions.push(
            vscode.commands.registerCommand('vcoder.newChat', async () => {
                await vscode.commands.executeCommand('vcoder.chatView.focus');
                const mcpServers = vscode.workspace.getConfiguration('vcoder').get('mcpServers', []);
                const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                const session = await acpClient!.newSession(undefined, { cwd, mcpServers });
                chatViewProvider?.postMessage({ type: 'currentSession', data: { sessionId: session.id } }, true);
                chatViewProvider?.postMessage({ type: 'sessions', data: await acpClient!.listSessions() }, true);
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
        
        // Initialize diff manager and file decoration provider
        if (acpClient) {
            const diffManager = new DiffManager(acpClient);
            context.subscriptions.push(diffManager.register());
        }
        
        const fileDecorator = new VCoderFileDecorationProvider();
        context.subscriptions.push(
            vscode.window.registerFileDecorationProvider(fileDecorator)
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
    
    await serverManager?.stop();
    await fileSystemProvider?.dispose();
    await terminalProvider?.dispose();
}
