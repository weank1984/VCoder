/**
 * VCoder VSCode Extension
 * Entry point
 */

import * as vscode from 'vscode';
import { ServerManager } from './services/serverManager';
import { ACPClient } from './acp/client';
import { ChatViewProvider } from './providers/chatViewProvider';
import { DiffManager } from './services/diffManager';
import { VCoderFileDecorationProvider } from './providers/fileDecorationProvider';
import { FileChangeUpdate, UpdateNotificationParams, InitializeParams } from '@vcoder/shared';

let serverManager: ServerManager;
let acpClient: ACPClient;
let statusBarItem: vscode.StatusBarItem;
let clientInitParams: InitializeParams;

export async function activate(context: vscode.ExtensionContext) {
    console.log('[VCoder] Activating extension...');

    // 1. Start Agent Server
    serverManager = new ServerManager(context);
    
    // Status Bar initialization
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'vcoder.showServerStatus';
    context.subscriptions.push(statusBarItem);
    
    serverManager.onStatusChange((status) => {
        updateStatusBar(status);
        // Re-initialize client if server restarted to running state
        if (status === 'running' && acpClient && clientInitParams) {
             const { stdin, stdout } = serverManager.getStdio();
             acpClient.updateTransport(stdout, stdin);
             acpClient.initialize(clientInitParams).catch(err => console.error('Failed to re-init client:', err));
        }
    });

    try {
        await serverManager.start();
        console.log('[VCoder] Server started');
    } catch (err) {
        vscode.window.showErrorMessage('VCoder: Failed to start server. Check if dependencies are installed.');
        console.error('[VCoder] Server start error:', err);
        // Don't return, let the user try to restart via status bar
    }

    // 2. Initialize ACP Client
    acpClient = new ACPClient(serverManager.getStdio());
    clientInitParams = {
        clientInfo: {
            name: 'vcoder-vscode',
            version: '0.1.0',
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
    };
    await acpClient.initialize(clientInitParams);

    // 2.1 Register diff preview provider & confirmation flows
    const diffManager = new DiffManager(acpClient);
    context.subscriptions.push(diffManager.register());

    // 2.2 Register file decoration provider
    const fileDecorator = new VCoderFileDecorationProvider();
    context.subscriptions.push(
        vscode.window.registerFileDecorationProvider(fileDecorator)
    );

    const promptedBash = new Set<string>();
    acpClient.on('session/update', (params: UpdateNotificationParams) => {
        // Fire-and-forget async handlers
        void (async () => {
            if (params.type === 'file_change') {
                const change = params.content as FileChangeUpdate;
                fileDecorator.updateFile(change);
                await diffManager.previewChange(params.sessionId, change);
                return;
            }

            if (params.type === 'bash_request') {
                const { id, command } = params.content as { id: string; command: string };
                if (promptedBash.has(id)) return;
                promptedBash.add(id);

                const trustMode = vscode.workspace.getConfiguration('vcoder').get<boolean>('trustMode', false);
                if (trustMode) {
                    await acpClient.confirmBash(id);
                    return;
                }

                const picked = await vscode.window.showWarningMessage(
                    `VCoder: Allow running bash command?\n${command}`,
                    { modal: true },
                    'Confirm',
                    'Skip'
                );

                if (picked === 'Confirm') {
                    await acpClient.confirmBash(id);
                } else {
                    await acpClient.skipBash(id);
                }
            }

            if (params.type === 'plan_ready') {
                const { summary } = params.content as { summary: string };
                const picked = await vscode.window.showInformationMessage(
                    `VCoder: Plan ready\n${summary}`,
                    { modal: true },
                    'Run Plan',
                    'Cancel'
                );
                if (picked === 'Run Plan') {
                    await acpClient.confirmPlan();
                }
            }
        })();
    });

    // 3. Register Webview Provider
    const chatProvider = new ChatViewProvider(context, acpClient);
    console.log('[VCoder] Registering webview view provider: vcoder.chatView');
    try {
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider('vcoder.chatView', chatProvider)
        );
        console.log('[VCoder] Webview view provider registered');
    } catch (err) {
        console.error('[VCoder] Failed to register webview view provider:', err);
    }

    // Best-effort: open the view container so the view can resolve.
    void vscode.commands
        .executeCommand('workbench.view.extension.vcoder')
        .then(
            () => console.log('[VCoder] Opened V-Coder view container'),
            (err) => console.warn('[VCoder] Failed to open V-Coder view container:', err)
        );

    // 4. Register Status Bar (Handled by ServerManager status change)
    // Initial update
    updateStatusBar(serverManager.getStatus());

    // 5. Register Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('vcoder.newChat', async () => {
            await acpClient.newSession();
            chatProvider.refresh();
        }),

        vscode.commands.registerCommand('vcoder.showHistory', async () => {
            // Send message to webview to show history panel
            chatProvider.postMessage({ type: 'showHistory' });
        }),

        vscode.commands.registerCommand('vcoder.openSettings', async () => {
            // Open VSCode settings for vcoder
            await vscode.commands.executeCommand('workbench.action.openSettings', 'vcoder');
        }),

        vscode.commands.registerCommand('vcoder.setApiKey', async () => {
            const apiKey = await vscode.window.showInputBox({
                prompt: 'Enter your Anthropic API Key',
                password: true,
                placeHolder: 'sk-ant-...',
            });
            if (apiKey) {
                await context.secrets.store('anthropic-api-key', apiKey);
                const picked = await vscode.window.showInformationMessage(
                    'VCoder: API Key saved',
                    'Restart Server',
                    'Later'
                );
                if (picked === 'Restart Server') {
                    await vscode.commands.executeCommand('vcoder.restart');
                }
            }
        }),

        vscode.commands.registerCommand('vcoder.restart', async () => {
            await serverManager.restart();
            vscode.window.showInformationMessage('VCoder: Server restarted');
        }),

        vscode.commands.registerCommand('vcoder.showServerStatus', async () => {
             const status = serverManager.getStatus();
             const selection = await vscode.window.showQuickPick(
                 [
                     { label: 'Restart Server', description: 'Restarts the backend process' },
                     { label: 'View Logs', description: 'Open hidden output channel (TODO)' }
                 ], 
                 { placeHolder: `Server Status: ${status}` }
             );
             
             if (selection?.label === 'Restart Server') {
                 vscode.commands.executeCommand('vcoder.restart');
             }
        })
    );

    // 6. Check API Key on startup
    void (async () => {
        try {
            const apiKey = await context.secrets.get('anthropic-api-key');
            if (!apiKey) {
                statusBarItem.text = '$(key) VCoder: Set API Key';
                statusBarItem.tooltip = 'VCoder needs an Anthropic API Key';
                statusBarItem.command = 'vcoder.setApiKey';
                statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                statusBarItem.show();

                const choice = await vscode.window.showWarningMessage(
                    'VCoder: API Key not configured',
                    'Set API Key',
                    'Later'
                );
                if (choice === 'Set API Key') {
                    void vscode.commands.executeCommand('vcoder.setApiKey');
                }
            }
        } catch (err) {
            console.warn('[VCoder] Failed to check API key:', err);
        }
    })();

    console.log('[VCoder] Extension activated');
}

function updateStatusBar(status: string) {
    if (!statusBarItem) return;
    
    switch (status) {
        case 'starting':
            statusBarItem.text = '$(sync~spin) VCoder: Connecting...';
            statusBarItem.backgroundColor = undefined;
            break;
        case 'running':
            statusBarItem.text = '$(check) VCoder: Connected';
            statusBarItem.backgroundColor = undefined;
            break;
        case 'error':
            statusBarItem.text = '$(error) VCoder: Error';
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            break;
        case 'stopped':
            statusBarItem.text = '$(circle-slash) VCoder: Disconnected';
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            break;
    }
    statusBarItem.show();
}

export async function deactivate() {
    console.log('[VCoder] Deactivating extension...');
    await acpClient?.shutdown();
    await serverManager?.stop();
}
