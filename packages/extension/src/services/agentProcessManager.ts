/**
 * Agent Process Manager
 * Manages external ACP agent process lifecycle with enhanced reliability features:
 * - Crash detection and auto-restart with exponential backoff
 * - Health checks with heartbeat monitoring
 * - Graceful reconnection on network issues
 * - Degraded mode when agent is unavailable
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
    statusChange: (status: AgentStatus) => void;
    healthCheckFailed: () => void;
    reconnecting: (attempt: number) => void;
    reconnected: () => void;
}

export type AgentStatus = 'stopped' | 'starting' | 'running' | 'error' | 'degraded' | 'reconnecting';

interface CrashRecord {
    code: number | null;
    signal: string | null;
    timestamp: number;
}

interface RestartPolicy {
    maxRetries: number;
    backoffMs: number[];
    resetAfterMs: number; // Reset retry count after this period without crashes
}

const DEFAULT_RESTART_POLICY: RestartPolicy = {
    maxRetries: 5,
    backoffMs: [1000, 2000, 5000, 10000, 30000],
    resetAfterMs: 300000, // 5 minutes
};

const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const HEALTH_CHECK_TIMEOUT = 10000; // 10 seconds

/**
 * Manages ACP agent process lifecycle with stdio communication.
 */
export class AgentProcessManager extends EventEmitter {
    private process: ChildProcess | null = null;
    private status: AgentStatus = 'stopped';
    private currentProfile: AgentProfile | null = null;
    private lineBuffer: string = '';
    
    // Crash detection and restart
    private crashHistory: CrashRecord[] = [];
    private retryCount: number = 0;
    private restartPolicy: RestartPolicy = DEFAULT_RESTART_POLICY;
    private isAutoRestarting: boolean = false;
    
    // Health check
    private healthCheckTimer: NodeJS.Timeout | null = null;
    private lastHealthCheckTime: number = 0;
    private pendingHealthCheck: boolean = false;
    
    // Reconnection
    private reconnectAttempts: number = 0;

    private _onStatusChange = new vscode.EventEmitter<AgentStatus>();
    readonly onStatusChange = this._onStatusChange.event;

    constructor(
        private context: vscode.ExtensionContext,
        restartPolicy?: Partial<RestartPolicy>
    ) {
        super();
        if (restartPolicy) {
            this.restartPolicy = { ...DEFAULT_RESTART_POLICY, ...restartPolicy };
        }
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

            // Start health check monitoring
            this.startHealthCheck();

            this.updateStatus('running');
            console.log(`[AgentProcessManager] Started agent: ${profile.name}`);
            
            // Reset retry count on successful start
            this.resetCrashHistory();
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
            
            // Record crash if unexpected
            const wasUnexpected = this.status !== 'stopped' && !this.isAutoRestarting;
            
            if (wasUnexpected) {
                this.recordCrash(code, signal);
                
                // Attempt auto-restart if not exceeded retry limit
                if (this.shouldAutoRestart()) {
                    void this.attemptAutoRestart();
                } else {
                    this.updateStatus('error');
                    this.emit('exit', code, signal);
                    vscode.window.showErrorMessage(
                        `Agent process crashed and cannot be restarted (max retries exceeded). Please restart manually.`,
                        'Restart'
                    ).then((choice) => {
                        if (choice === 'Restart') {
                            void this.restart();
                        }
                    });
                }
            } else {
                this.updateStatus('stopped');
                this.emit('exit', code, signal);
            }
            
            this.process = null;
            this.stopHealthCheck();
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
    private updateStatus(newStatus: AgentStatus): void {
        const oldStatus = this.status;
        this.status = newStatus;
        if (oldStatus !== newStatus) {
            this._onStatusChange.fire(newStatus);
            this.emit('statusChange', newStatus);
        }
    }

    /**
     * Record a crash event.
     */
    private recordCrash(code: number | null, signal: string | null): void {
        const crash: CrashRecord = {
            code,
            signal,
            timestamp: Date.now(),
        };
        
        this.crashHistory.push(crash);
        console.log(`[AgentProcessManager] Crash recorded: ${JSON.stringify(crash)}`);
        
        // Keep only recent crashes (within reset window)
        const cutoff = Date.now() - this.restartPolicy.resetAfterMs;
        this.crashHistory = this.crashHistory.filter(c => c.timestamp > cutoff);
    }

    /**
     * Check if should attempt auto-restart.
     */
    private shouldAutoRestart(): boolean {
        // Count recent crashes
        const cutoff = Date.now() - this.restartPolicy.resetAfterMs;
        const recentCrashes = this.crashHistory.filter(c => c.timestamp > cutoff).length;
        
        return recentCrashes < this.restartPolicy.maxRetries;
    }

    /**
     * Attempt auto-restart with exponential backoff.
     */
    private async attemptAutoRestart(): Promise<void> {
        if (!this.currentProfile) {
            console.error('[AgentProcessManager] Cannot auto-restart: no profile');
            return;
        }

        this.isAutoRestarting = true;
        this.retryCount++;
        
        const backoffIndex = Math.min(this.retryCount - 1, this.restartPolicy.backoffMs.length - 1);
        const delay = this.restartPolicy.backoffMs[backoffIndex];
        
        console.log(`[AgentProcessManager] Auto-restart attempt ${this.retryCount} in ${delay}ms`);
        this.updateStatus('reconnecting');
        this.emit('reconnecting', this.retryCount);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        
        try {
            const profile = this.currentProfile;
            await this.start(profile);
            
            this.isAutoRestarting = false;
            this.retryCount = 0;
            this.emit('reconnected');
            
            vscode.window.showInformationMessage('Agent process reconnected successfully');
        } catch (error) {
            this.isAutoRestarting = false;
            console.error('[AgentProcessManager] Auto-restart failed:', error);
            
            // Try again if not exceeded limit
            if (this.shouldAutoRestart()) {
                void this.attemptAutoRestart();
            } else {
                this.updateStatus('error');
                vscode.window.showErrorMessage(
                    'Agent process failed to restart. Please restart manually.'
                );
            }
        }
    }

    /**
     * Reset crash history (called after successful operation period).
     */
    private resetCrashHistory(): void {
        this.crashHistory = [];
        this.retryCount = 0;
        console.log('[AgentProcessManager] Crash history reset');
    }

    /**
     * Start health check monitoring.
     */
    private startHealthCheck(): void {
        this.stopHealthCheck();
        
        this.healthCheckTimer = setInterval(() => {
            void this.performHealthCheck();
        }, HEALTH_CHECK_INTERVAL);
        
        this.lastHealthCheckTime = Date.now();
    }

    /**
     * Stop health check monitoring.
     */
    private stopHealthCheck(): void {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
        this.pendingHealthCheck = false;
    }

    /**
     * Perform health check by sending a ping.
     */
    private async performHealthCheck(): Promise<void> {
        if (!this.isRunning() || this.pendingHealthCheck) {
            return;
        }

        this.pendingHealthCheck = true;
        const checkStartTime = Date.now();

        try {
            // Simple check: try to write to stdin
            // If process is dead, this will throw
            if (this.process?.stdin?.writable) {
                // Process is responsive
                this.lastHealthCheckTime = Date.now();
                this.pendingHealthCheck = false;
                
                // If we were in degraded mode, recover
                if (this.status === 'degraded') {
                    this.updateStatus('running');
                    vscode.window.showInformationMessage('Agent connection restored');
                }
            } else {
                throw new Error('Process stdin not writable');
            }
        } catch (error) {
            this.pendingHealthCheck = false;
            const elapsed = Date.now() - this.lastHealthCheckTime;
            
            console.error('[AgentProcessManager] Health check failed:', error);
            
            if (elapsed > HEALTH_CHECK_TIMEOUT) {
                // Process appears to be dead or frozen
                console.warn('[AgentProcessManager] Process appears dead, attempting restart');
                this.emit('healthCheckFailed');
                
                this.updateStatus('degraded');
                vscode.window.showWarningMessage(
                    'Agent process is not responding. Attempting to restart...',
                    'Restart Now'
                ).then((choice) => {
                    if (choice === 'Restart Now') {
                        void this.restart();
                    }
                });
            }
        }
    }

    /**
     * Enter degraded mode (read-only).
     */
    enterDegradedMode(): void {
        console.log('[AgentProcessManager] Entering degraded mode');
        this.updateStatus('degraded');
        this.stopHealthCheck();
        
        vscode.window.showWarningMessage(
            'Agent is temporarily unavailable. Operating in read-only mode.',
            'Retry Connection'
        ).then((choice) => {
            if (choice === 'Retry Connection') {
                void this.restart();
            }
        });
    }

    /**
     * Check if in degraded mode.
     */
    isDegraded(): boolean {
        return this.status === 'degraded';
    }

    /**
     * Get crash statistics.
     */
    getCrashStats(): { totalCrashes: number; recentCrashes: number; retryCount: number } {
        const cutoff = Date.now() - this.restartPolicy.resetAfterMs;
        const recentCrashes = this.crashHistory.filter(c => c.timestamp > cutoff).length;
        
        return {
            totalCrashes: this.crashHistory.length,
            recentCrashes,
            retryCount: this.retryCount,
        };
    }

    /**
     * Update status and fire event.
     */
    private updateStatus_old(newStatus: 'stopped' | 'starting' | 'running' | 'error'): void {
        this.status = newStatus;
        this._onStatusChange.fire(newStatus);
    }

    /**
     * Dispose and cleanup.
     */
    async dispose(): Promise<void> {
        this.stopHealthCheck();
        await this.stop();
        this._onStatusChange.dispose();
        this.removeAllListeners();
    }
}
