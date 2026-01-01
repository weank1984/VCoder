/**
 * VCoder VSCode Extension
 * Entry point
 */

import * as vscode from 'vscode';
import { ServerManager } from './services/serverManager';
import { ACPClient } from './acp/client';
import { ChatViewProvider } from './providers/chatViewProvider';

let serverManager: ServerManager;
let acpClient: ACPClient;

export async function activate(context: vscode.ExtensionContext) {
    console.log('[VCoder] Activating extension...');

    // 1. Start Agent Server
    serverManager = new ServerManager(context);

    try {
        await serverManager.start();
        console.log('[VCoder] Server started');
    } catch (err) {
        vscode.window.showErrorMessage('VCoder: Failed to start server. Check if dependencies are installed.');
        console.error('[VCoder] Server start error:', err);
        return;
    }

    // 2. Initialize ACP Client
    acpClient = new ACPClient(serverManager.getStdio());
    await acpClient.initialize({
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
    });

    // 3. Register Webview Provider
    const chatProvider = new ChatViewProvider(context, acpClient);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('vcoder.chatView', chatProvider)
    );

    // 4. Register Status Bar
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.text = '$(zap) VCoder: Connected';
    statusBar.tooltip = 'VCoder is running';
    statusBar.command = 'vcoder.restart';
    statusBar.show();
    context.subscriptions.push(statusBar);

    // 5. Register Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('vcoder.newChat', async () => {
            await acpClient.newSession();
            chatProvider.refresh();
        }),

        vscode.commands.registerCommand('vcoder.setApiKey', async () => {
            const apiKey = await vscode.window.showInputBox({
                prompt: 'Enter your Anthropic API Key',
                password: true,
                placeHolder: 'sk-ant-...',
            });
            if (apiKey) {
                await context.secrets.store('anthropic-api-key', apiKey);
                vscode.window.showInformationMessage('VCoder: API Key saved');
            }
        }),

        vscode.commands.registerCommand('vcoder.restart', async () => {
            statusBar.text = '$(sync~spin) VCoder: Restarting...';
            await serverManager.stop();
            await serverManager.start();
            statusBar.text = '$(zap) VCoder: Connected';
            vscode.window.showInformationMessage('VCoder: Server restarted');
        })
    );

    // 6. Check API Key on startup
    const apiKey = await context.secrets.get('anthropic-api-key');
    if (!apiKey) {
        const choice = await vscode.window.showWarningMessage(
            'VCoder: API Key not configured',
            'Set API Key',
            'Later'
        );
        if (choice === 'Set API Key') {
            vscode.commands.executeCommand('vcoder.setApiKey');
        }
    }

    console.log('[VCoder] Extension activated');
}

export async function deactivate() {
    console.log('[VCoder] Deactivating extension...');
    await acpClient?.shutdown();
    await serverManager?.stop();
}
