/**
 * Server Manager
 * Manages Agent Server process lifecycle
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import { Readable, Writable } from 'stream';

export class ServerManager {
    private process: ChildProcess | null = null;
    private status: 'stopped' | 'starting' | 'running' | 'error' = 'stopped';

    constructor(private context: vscode.ExtensionContext) { }

    async start(): Promise<void> {
        if (this.status === 'running') {
            return;
        }

        this.status = 'starting';

        // Find server binary location
        const serverPath = this.getServerPath();

        // Get API Key
        const apiKey = await this.context.secrets.get('anthropic-api-key');

        this.process = spawn('node', [serverPath], {
            cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd(),
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                ...process.env,
                ANTHROPIC_API_KEY: apiKey || '',
            },
        });

        this.process.on('error', (err) => {
            this.status = 'error';
            console.error('[ServerManager] Error:', err);
            vscode.window.showErrorMessage(`Z-Code Server Error: ${err.message}`);
        });

        this.process.on('exit', (code) => {
            this.status = 'stopped';
            if (code !== 0) {
                console.error('[ServerManager] Exited with code:', code);
                vscode.window.showWarningMessage('Z-Code Server exited unexpectedly');
            }
        });

        // Log stderr
        this.process.stderr?.on('data', (data) => {
            console.log('[Server]', data.toString().trim());
        });

        this.status = 'running';
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
            this.process.kill('SIGTERM');
            this.process = null;
        }
        this.status = 'stopped';
    }

    getStatus(): string {
        return this.status;
    }

    private getServerPath(): string {
        // In development, use the built server in packages/server/dist
        // In production, it would be bundled with the extension
        return this.context.asAbsolutePath(
            path.join('..', 'server', 'dist', 'index.js')
        );
    }
}
