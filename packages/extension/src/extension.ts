/**
 * VCoder VSCode Extension
 * Entry point
 */

import * as vscode from 'vscode';
import { ServerManager } from './services/serverManager';
import { PermissionProvider } from './services/permissionProvider';
import { TerminalProvider } from './services/terminalProvider';
import { FileSystemProvider } from './services/fileSystemProvider';
import { ACPClient } from './acp/client';
import { ChatViewProvider } from './providers/chatViewProvider';
import { DiffManager } from './services/diffManager';
import { VCoderFileDecorationProvider } from './providers/fileDecorationProvider';
import { FileChangeUpdate, UpdateNotificationParams, InitializeParams, ACPMethods, McpServerConfig } from '@vcoder/shared';

let serverManager: ServerManager;
let acpClient: ACPClient;
let permissionProvider: PermissionProvider;
let terminalProvider: TerminalProvider;
let fileSystemProvider: FileSystemProvider;
let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;
let clientInitParams: InitializeParams;

export async function activate(context: vscode.ExtensionContext) {
    console.log('[VCoder] Activating extension...');

    // 1. Start bundled VCoder server (implements VCoder ACP methods like session/* and history/*)
    serverManager = new ServerManager(context);
    
    // Status Bar initialization
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'vcoder.showServerStatus';
    context.subscriptions.push(statusBarItem);

    // Output Channel for logs
    outputChannel = vscode.window.createOutputChannel('VCoder');
    context.subscriptions.push(outputChannel);
    outputChannel.appendLine('[VCoder] Extension activated');
    
    serverManager.onStatusChange((status) => {
        updateStatusBar(status);
        outputChannel.appendLine(`[VCoder] Server status: ${status}`);
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
        outputChannel.appendLine('[VCoder] Server started');
    } catch (err) {
        vscode.window.showErrorMessage('VCoder: Failed to start server. Check logs for details.');
        console.error('[VCoder] Server start error:', err);
        // Don't return, let the user try to restart via status bar
    }

    // 2. Initialize ACP Client over the server stdio (or a safe stub if server isn't running yet)
    if (serverManager.getStatus() === 'running') {
        const { stdin, stdout } = serverManager.getStdio();
        acpClient = new ACPClient({ stdin, stdout });
    } else {
        acpClient = new ACPClient({ stdin: process.stdin, stdout: process.stdout });
        acpClient.setWriteCallback(() => {
            throw new Error('VCoder server is not running');
        });
    }

    // 3. Initialize Terminal Provider (M2)
    terminalProvider = new TerminalProvider(context);
    context.subscriptions.push({
        dispose: () => terminalProvider.dispose()
    });

    // 4. Initialize FileSystem Provider (M3)
    fileSystemProvider = new FileSystemProvider(context);
    context.subscriptions.push({
        dispose: () => fileSystemProvider.dispose()
    });

    clientInitParams = {
        protocolVersion: 1, // V0.2 uses protocol version 1
        clientInfo: {
            name: 'vcoder-vscode',
            version: '0.2.0',
        },
        clientCapabilities: {
            // M2: Terminal capability enabled
            terminal: true,
            // M3: File capabilities enabled
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
    };
    if (serverManager.getStatus() === 'running') {
        await acpClient.initialize(clientInitParams);
    } else {
        outputChannel.appendLine('[VCoder] Server not running; will initialize when it restarts');
    }

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
            // Ensure params has expected structure
            if (!params?.type || !params?.sessionId) {
                console.warn('[VCoder] Invalid session/update params:', params);
                return;
            }

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

    // 3.1 Initialize Permission Provider and register handler
    permissionProvider = new PermissionProvider(chatProvider);
    acpClient.registerRequestHandler(
        ACPMethods.SESSION_REQUEST_PERMISSION,
        (params: unknown) => permissionProvider.handlePermissionRequest(params as any)
    );

    // 3.2 Register Terminal handlers (M2)
    acpClient.registerRequestHandler(
        'terminal/create',
        (params: unknown) => terminalProvider.createTerminal(params as any)
    );
    acpClient.registerRequestHandler(
        'terminal/output',
        (params: unknown) => terminalProvider.getTerminalOutput(params as any)
    );
    acpClient.registerRequestHandler(
        'terminal/wait_for_exit',
        (params: unknown) => terminalProvider.waitForExit(params as any)
    );
    acpClient.registerRequestHandler(
        'terminal/kill',
        (params: unknown) => terminalProvider.killTerminal(params as any)
    );
    acpClient.registerRequestHandler(
        'terminal/release',
        (params: unknown) => terminalProvider.releaseTerminal(params as any)
    );

    // 3.3 Register FileSystem handlers (M3)
    acpClient.registerRequestHandler(
        'fs/readTextFile',
        (params: unknown) => fileSystemProvider.readTextFile(params as any)
    );
    acpClient.registerRequestHandler(
        'fs/writeTextFile',
        (params: unknown) => fileSystemProvider.writeTextFile(params as any)
    );

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
            // Get MCP server configuration
            const mcpServers = getMcpServerConfig();
            const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            
            await acpClient.newSession(undefined, { cwd, mcpServers });
            chatProvider.refresh();
        }),

        vscode.commands.registerCommand('vcoder.showHistory', async () => {
            // Send message to webview to show history panel
            chatProvider.postMessage({ type: 'showHistory' });
        }),

        vscode.commands.registerCommand('vcoder.openSettings', async () => {
            const selection = await vscode.window.showQuickPick(
                [
                    { label: 'Open VS Code Settings', description: 'Open V-Coder settings in VS Code', value: 'vscodeSettings' },
                    { label: 'UI Language', description: 'Switch webview language', value: 'uiLanguage' },
                ],
                { placeHolder: 'V-Coder Settings' }
            );
            if (!selection) return;

            if (selection.value === 'vscodeSettings') {
                await vscode.commands.executeCommand('workbench.action.openSettings', 'vcoder');
                return;
            }

            if (selection.value === 'uiLanguage') {
                const config = vscode.workspace.getConfiguration('vcoder');
                const current = config.get<string>('uiLanguage', 'auto');
                const picked = await vscode.window.showQuickPick(
                    [
                        { label: 'Auto', description: 'Follow VS Code display language', value: 'auto' },
                        { label: 'English', value: 'en-US' },
                        { label: '简体中文', value: 'zh-CN' },
                    ],
                    { placeHolder: `UI Language: ${current}` }
                );
                if (!picked) return;
                try {
                    await config.update('uiLanguage', picked.value, vscode.ConfigurationTarget.Global);
                } catch (err) {
                    console.warn('[VCoder] Failed to update uiLanguage setting:', err);
                }
                chatProvider.postMessage({ type: 'uiLanguage', data: { uiLanguage: picked.value } });
            }
        }),

        vscode.commands.registerCommand('vcoder.setUiLanguage', async () => {
            const config = vscode.workspace.getConfiguration('vcoder');
            const current = config.get<string>('uiLanguage', 'auto');
            const picked = await vscode.window.showQuickPick(
                [
                    { label: 'Auto', description: 'Follow VS Code display language', value: 'auto' },
                    { label: 'English', value: 'en-US' },
                    { label: '简体中文', value: 'zh-CN' },
                ],
                { placeHolder: `UI Language: ${current}` }
            );
            if (!picked) return;
            try {
                await config.update('uiLanguage', picked.value, vscode.ConfigurationTarget.Global);
            } catch (err) {
                console.warn('[VCoder] Failed to update uiLanguage setting:', err);
            }
            chatProvider.postMessage({ type: 'uiLanguage', data: { uiLanguage: picked.value } });
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
                     { label: 'View Logs', description: 'Open output channel' }
                 ], 
                 { placeHolder: `Server Status: ${status}` }
             );
             
             if (selection?.label === 'Restart Server') {
                 vscode.commands.executeCommand('vcoder.restart');
             } else if (selection?.label === 'View Logs') {
                 outputChannel.show();
             }
        }),

        vscode.commands.registerCommand('vcoder.showLogs', () => {
            outputChannel.show();
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

/**
 * Get MCP server configuration from VSCode settings.
 */
function getMcpServerConfig(): McpServerConfig[] {
    const config = vscode.workspace.getConfiguration('vcoder');
    const servers = config.get<McpServerConfig[]>('mcpServers', []);
    
    console.log('[VCoder] Loaded MCP server config:', servers);
    return servers;
}

export async function deactivate() {
    console.log('[VCoder] Deactivating extension...');
    await fileSystemProvider?.dispose();
    await terminalProvider?.dispose();
    await acpClient?.shutdown();
    await serverManager?.stop();
}
