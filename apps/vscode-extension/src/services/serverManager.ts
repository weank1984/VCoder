/**
 * Server Manager
 * Manages Agent Server process lifecycle
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { Readable, Writable } from 'stream';

export class ServerManager {
    private process: ChildProcess | null = null;
    private status: 'stopped' | 'starting' | 'running' | 'error' = 'stopped';

    private _onStatusChange = new vscode.EventEmitter<string>();
    readonly onStatusChange = this._onStatusChange.event;

    constructor(private context: vscode.ExtensionContext) { }

    async start(): Promise<void> {
        if (this.status === 'running') {
            return;
        }

        this.updateStatus('starting');

        try {
            // Find server binary location
            const serverPath = this.getServerPath();

            // Get API Key
            const apiKey = await this.context.secrets.get('anthropic-api-key');

            const env: NodeJS.ProcessEnv = { ...process.env };
            // Only pass through the API key when it's actually set; don't override CLI defaults with an empty string.
            if (apiKey && apiKey.trim().length > 0) {
                env.ANTHROPIC_API_KEY = apiKey;
            } else {
                delete env.ANTHROPIC_API_KEY;
            }

            this.process = spawn('node', [serverPath], {
                cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd(),
                stdio: ['pipe', 'pipe', 'pipe'],
                env,
            });

            this.process.on('error', (err) => {
                this.updateStatus('error');
                console.error('[ServerManager] Error:', err);
                vscode.window.showErrorMessage(`VCoder Server Error: ${err.message}`);
            });

            this.process.on('exit', (code) => {
                if (this.status !== 'stopped') { // Unexpected exit
                    this.updateStatus('error');
                    console.error('[ServerManager] Exited unexpectedly with code:', code);
                    vscode.window.showWarningMessage('VCoder Server exited unexpectedly');
                } else {
                    this.updateStatus('stopped');
                }
                this.process = null;
            });

            // Log stderr
            this.process.stderr?.on('data', (data) => {
                console.log('[Server]', data.toString().trim());
            });

            this.updateStatus('running');
        } catch (error) {
            this.updateStatus('error');
            console.error('[ServerManager] Failed to start:', error);
            throw error;
        }
    }

    getStdio(): { stdin: Writable; stdout: Readable } {
        if (!this.process || !this.process.stdin || !this.process.stdout) {
            throw new Error('Server not running');
        }
        return {
            stdin: this.process.stdin,
            stdout: this.process.stdout,
        };
    }

    async stop(): Promise<void> {
        if (this.process) {
            this.updateStatus('stopped'); // Set status first to avoid 'unexpected exit' logic
            this.process.kill('SIGTERM');
            this.process = null;
        } else {
            this.updateStatus('stopped');
        }
    }

    async restart(): Promise<void> {
        await this.stop();
        // Wait a brief moment to ensure cleanup
        await new Promise(resolve => setTimeout(resolve, 500));
        await this.start();
    }

    getStatus(): string {
        return this.status;
    }

    private updateStatus(newStatus: 'stopped' | 'starting' | 'running' | 'error') {
        this.status = newStatus;
        this._onStatusChange.fire(newStatus);
    }

    private getServerPath(): string {
        // Production: Server is bundled in 'server/index.js' at extension root
        const bundledPath = path.join(this.context.extensionPath, 'server', 'index.js');
        // Development: prefer monorepo build output to avoid running stale bundled copies.
        // Note: In strict production (VSIX), this path won't exist or be accessible.
        const devPath = path.resolve(this.context.extensionPath, '..', 'server', 'dist', 'index.js');

        if (this.context.extensionMode === vscode.ExtensionMode.Development && fs.existsSync(devPath)) {
            return devPath;
        }

        if (fs.existsSync(bundledPath)) {
            return bundledPath;
        }

        return devPath;
    }
}
