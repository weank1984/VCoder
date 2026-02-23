/**
 * Server Manager
 * Manages Agent Server process lifecycle
 */

import { spawn, execFile, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as vscode from 'vscode';
import { Readable, Writable } from 'stream';

/**
 * Resolve the user's login shell environment.
 * When VSCode is launched from Dock/Spotlight on macOS, `process.env` lacks
 * shell-profile variables (PATH, ANTHROPIC_*, nvm/pyenv paths, etc.).
 * This function spawns the user's login shell to capture the full environment.
 *
 * Cached after first call so subsequent starts don't re-spawn.
 */
let _shellEnvCache: NodeJS.ProcessEnv | null = null;

async function resolveShellEnv(): Promise<NodeJS.ProcessEnv> {
    // Only needed on macOS/Linux; Windows doesn't use login shells
    if (process.platform === 'win32') return process.env;
    // Cache: only resolve once per extension host lifetime
    if (_shellEnvCache) return _shellEnvCache;

    const shell = vscode.env.shell || process.env.SHELL || '/bin/zsh';

    try {
        const envStr = await new Promise<string>((resolve, reject) => {
            // Run a login-interactive shell that prints env in null-delimited format
            // -ilc: interactive + login + command (ensures .zshrc / .bash_profile are sourced)
            execFile(shell, ['-ilc', 'env -0'], {
                encoding: 'utf-8',
                timeout: 10_000,
                env: { ...process.env }, // seed with current env so HOME is available
            }, (err, stdout) => {
                if (err) reject(err);
                else resolve(stdout);
            });
        });

        const env: NodeJS.ProcessEnv = {};
        // env -0 outputs KEY=VALUE\0 pairs
        for (const entry of envStr.split('\0')) {
            const idx = entry.indexOf('=');
            if (idx > 0) {
                env[entry.slice(0, idx)] = entry.slice(idx + 1);
            }
        }

        // Sanity check: must at least have PATH
        if (env.PATH) {
            _shellEnvCache = env;
            console.log('[ServerManager] Shell environment resolved successfully');
            return env;
        }
    } catch (err) {
        console.warn('[ServerManager] Failed to resolve shell environment, falling back to process.env:', err);
    }

    // Fallback: try loading env from .claude/settings*.json directly
    const fallbackEnv: NodeJS.ProcessEnv = { ...process.env };
    const home = process.env.HOME || os.homedir();
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    const settingsFiles = [
        path.join(home, '.claude', 'settings.json'),
        path.join(cwd, '.claude', 'settings.json'),
        path.join(cwd, '.claude', 'settings.local.json'),
    ];
    for (const filePath of settingsFiles) {
        try {
            const raw = fs.readFileSync(filePath, 'utf-8');
            const parsed = JSON.parse(raw);
            if (parsed.env && typeof parsed.env === 'object') {
                Object.assign(fallbackEnv, parsed.env);
            }
        } catch {
            // skip
        }
    }
    return fallbackEnv;
}

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

            // Resolve full shell environment (fixes Dock/Spotlight launch missing PATH/env vars)
            const shellEnv = await resolveShellEnv();
            const env: NodeJS.ProcessEnv = { ...shellEnv };
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

            // Forward server stderr (already prefixed with [ACPServer]/[ClaudeCode])
            this.process.stderr?.on('data', (data) => {
                const text = data.toString().trim();
                if (text) console.log(text);
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
        // Path: apps/vscode-extension/../../packages/server/dist/index.js
        const devPath = path.resolve(this.context.extensionPath, '..', '..', 'packages', 'server', 'dist', 'index.js');

        if (this.context.extensionMode === vscode.ExtensionMode.Development && fs.existsSync(devPath)) {
            return devPath;
        }

        if (fs.existsSync(bundledPath)) {
            return bundledPath;
        }

        return devPath;
    }
}
