/**
 * Agent Process Manager
 * Manages external ACP agent process lifecycle (e.g., @zed-industries/claude-code-acp)
 */

import { spawn, ChildProcess } from 'child_process';
import * as vscode from 'vscode';
import { Readable, Writable } from 'stream';
import { AgentProfile } from '@vcoder/shared';
import { EventEmitter } from 'events';

export interface AgentProcessEvents {
    data: (line: string) => void;
    exit: (code: number | null, signal: string | null) => void;
    error: (error: Error) => void;
}

/**
 * Manages ACP agent process lifecycle with stdio communication.
 */
export class AgentProcessManager extends EventEmitter {
    private process: ChildProcess | null = null;
    private status: 'stopped' | 'starting' | 'running' | 'error' = 'stopped';
    private currentProfile: AgentProfile | null = null;
    private lineBuffer: string = '';

    private _onStatusChange = new vscode.EventEmitter<string>();
    readonly onStatusChange = this._onStatusChange.event;

    constructor(private context: vscode.ExtensionContext) {
        super();
    }

    /**
     * Start agent process with given profile.
     */
    async start(profile: AgentProfile): Promise<void> {
        if (this.status === 'running') {
            if (this.currentProfile?.id === profile.id) {
                return; // Already running same agent
            }
            // Different agent, stop current first
            await this.stop();
        }

        this.updateStatus('starting');
        this.currentProfile = profile;

        try {
            // Prepare environment variables
            const env: NodeJS.ProcessEnv = { ...process.env };
            
            // Merge profile env with process env
            if (profile.env) {
                for (const [key, value] of Object.entries(profile.env)) {
                    // Support ${env:VAR_NAME} syntax for referencing existing env vars
                    if (value.startsWith('${env:') && value.endsWith('}')) {
                        const envVarName = value.slice(6, -1);
                        env[key] = process.env[envVarName] || '';
                    } else {
                        env[key] = value;
                    }
                }
            }

            // For claude-code-acp, try to get API key from secrets if not in env
            if (profile.command.includes('claude-code-acp') && !env.ANTHROPIC_API_KEY) {
                const apiKey = await this.context.secrets.get('anthropic-api-key');
                if (apiKey && apiKey.trim().length > 0) {
                    env.ANTHROPIC_API_KEY = apiKey;
                }
            }

            // Get workspace folder
            const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();

            // Spawn agent process
            this.process = spawn(profile.command, profile.args || [], {
                cwd,
                stdio: ['pipe', 'pipe', 'pipe'],
                env,
                shell: false,
            });

            // Setup event handlers
            this.setupProcessHandlers();

            this.updateStatus('running');
            console.log(`[AgentProcessManager] Started agent: ${profile.name}`);
        } catch (error) {
            this.updateStatus('error');
            const message = error instanceof Error ? error.message : String(error);
            console.error('[AgentProcessManager] Failed to start:', error);
            vscode.window.showErrorMessage(`Failed to start agent: ${message}`);
            throw error;
        }
    }

    /**
     * Setup process event handlers.
     */
    private setupProcessHandlers(): void {
        if (!this.process) return;

        // Handle stdout - parse NDJSON lines
        this.process.stdout?.on('data', (data: Buffer) => {
            this.handleStdoutData(data);
        });

        // Handle stderr - log for debugging
        this.process.stderr?.on('data', (data: Buffer) => {
            const text = data.toString('utf-8').trim();
            if (text) {
                console.log('[Agent stderr]', text);
            }
        });

        // Handle process errors
        this.process.on('error', (err: Error) => {
            this.updateStatus('error');
            console.error('[AgentProcessManager] Process error:', err);
            this.emit('error', err);
            vscode.window.showErrorMessage(`Agent process error: ${err.message}`);
        });

        // Handle process exit
        this.process.on('exit', (code: number | null, signal: string | null) => {
            console.log(`[AgentProcessManager] Process exited with code ${code}, signal ${signal}`);
            
            if (this.status !== 'stopped') {
                // Unexpected exit
                this.updateStatus('error');
                this.emit('exit', code, signal);
                vscode.window.showWarningMessage(
                    `Agent process exited unexpectedly (code: ${code}, signal: ${signal})`
                );
            } else {
                this.updateStatus('stopped');
                this.emit('exit', code, signal);
            }
            
            this.process = null;
            this.currentProfile = null;
        });
    }

    /**
     * Handle stdout data - parse NDJSON lines.
     */
    private handleStdoutData(data: Buffer): void {
        const text = data.toString('utf-8');
        this.lineBuffer += text;

        // Split by newlines and process complete lines
        const lines = this.lineBuffer.split('\n');
        // Keep the last incomplete line in buffer
        this.lineBuffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
                this.emit('data', trimmed);
            }
        }
    }

    /**
     * Write NDJSON line to agent stdin.
     */
    write(line: string): void {
        if (!this.process || !this.process.stdin) {
            throw new Error('Agent process not running');
        }

        const data = line.endsWith('\n') ? line : line + '\n';
        this.process.stdin.write(data, 'utf-8');
    }

    /**
     * Get stdio streams (for backward compatibility).
     */
    getStdio(): { stdin: Writable; stdout: Readable } {
        if (!this.process || !this.process.stdin || !this.process.stdout) {
            throw new Error('Agent process not running');
        }
        return {
            stdin: this.process.stdin,
            stdout: this.process.stdout,
        };
    }

    /**
     * Stop agent process gracefully.
     */
    async stop(): Promise<void> {
        if (!this.process) {
            this.updateStatus('stopped');
            return;
        }

        console.log('[AgentProcessManager] Stopping agent...');
        this.updateStatus('stopped'); // Set status first to avoid 'unexpected exit' logic

        // Try graceful shutdown first
        this.process.kill('SIGTERM');

        // Wait a bit for graceful shutdown
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Force kill if still running
        if (this.process && !this.process.killed) {
            console.log('[AgentProcessManager] Force killing agent');
            this.process.kill('SIGKILL');
        }

        this.process = null;
        this.currentProfile = null;
        this.lineBuffer = '';
    }

    /**
     * Restart agent process.
     */
    async restart(): Promise<void> {
        if (!this.currentProfile) {
            throw new Error('No agent profile to restart');
        }

        const profile = this.currentProfile;
        await this.stop();
        
        // Wait briefly to ensure cleanup
        await new Promise(resolve => setTimeout(resolve, 500));
        
        await this.start(profile);
    }

    /**
     * Get current status.
     */
    getStatus(): string {
        return this.status;
    }

    /**
     * Get current agent profile.
     */
    getCurrentProfile(): AgentProfile | null {
        return this.currentProfile;
    }

    /**
     * Check if process is running.
     */
    isRunning(): boolean {
        return this.status === 'running' && this.process !== null;
    }

    /**
     * Update status and fire event.
     */
    private updateStatus(newStatus: 'stopped' | 'starting' | 'running' | 'error'): void {
        this.status = newStatus;
        this._onStatusChange.fire(newStatus);
    }

    /**
     * Dispose and cleanup.
     */
    async dispose(): Promise<void> {
        await this.stop();
        this._onStatusChange.dispose();
        this.removeAllListeners();
    }
}
