/**
 * Terminal Provider
 * Manages pseudo-terminals using node-pty for ACP terminal/* capabilities
 */

import * as vscode from 'vscode';
import * as pty from 'node-pty';
import * as os from 'os';
import {
    TerminalCreateParams,
    TerminalCreateResult,
    TerminalOutputParams,
    TerminalOutputResult,
    TerminalWaitForExitParams,
    TerminalWaitForExitResult,
    TerminalKillParams,
    TerminalReleaseParams,
} from '@vcoder/shared';

interface TerminalHandle {
    id: string;
    pty: pty.IPty;
    outputBuffer: string;
    lastReadOffset: number;
    exitCode: number | null;
    signal: string | null;
    isComplete: boolean;
    cwd: string;
    command: string;
    vscodeTerminal?: vscode.Terminal;
}

/**
 * TerminalProvider provides ACP terminal capabilities using node-pty.
 * Supports incremental output streaming and kill operations.
 */
export class TerminalProvider {
    private terminals: Map<string, TerminalHandle> = new Map();
    private terminalCounter = 0;

    constructor(private context: vscode.ExtensionContext) {}

    /**
     * Create a new pseudo-terminal and start executing the command.
     */
    async createTerminal(params: TerminalCreateParams): Promise<TerminalCreateResult> {
        console.log('[TerminalProvider] Creating terminal:', params);

        // Check workspace trust
        if (!vscode.workspace.isTrusted) {
            throw new Error('Workspace is not trusted. Terminal execution is not allowed.');
        }

        // Generate unique terminal ID
        const terminalId = `term_${Date.now()}_${++this.terminalCounter}`;

        // Determine shell and working directory
        const shell = this.getDefaultShell();
        const cwd = params.cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();

        // Prepare environment variables
        const env: NodeJS.ProcessEnv = { ...process.env };
        if (params.env) {
            Object.assign(env, params.env);
        }

        try {
            // Create pty
            const ptyProcess = pty.spawn(params.command, params.args || [], {
                name: 'xterm-color',
                cols: 120,
                rows: 30,
                cwd,
                env: env as { [key: string]: string },
                encoding: 'utf8',
            });

            // Create terminal handle
            const handle: TerminalHandle = {
                id: terminalId,
                pty: ptyProcess,
                outputBuffer: '',
                lastReadOffset: 0,
                exitCode: null,
                signal: null,
                isComplete: false,
                cwd,
                command: `${params.command} ${(params.args || []).join(' ')}`.trim(),
            };

            // Setup event handlers
            ptyProcess.onData((data: string) => {
                handle.outputBuffer += data;
            });

            ptyProcess.onExit((event: { exitCode: number; signal?: number }) => {
                handle.exitCode = event.exitCode;
                handle.signal = event.signal ? String(event.signal) : null;
                handle.isComplete = true;
                console.log(`[TerminalProvider] Terminal ${terminalId} exited:`, event);
            });

            // Optionally mirror to VSCode terminal for visibility
            await this.mirrorToVSCodeTerminal(handle);

            this.terminals.set(terminalId, handle);

            console.log(`[TerminalProvider] Terminal ${terminalId} created successfully`);
            return { terminalId };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[TerminalProvider] Failed to create terminal:', error);
            throw new Error(`Failed to create terminal: ${message}`);
        }
    }

    /**
     * Get incremental output from terminal since last call.
     */
    async getTerminalOutput(params: TerminalOutputParams): Promise<TerminalOutputResult> {
        const handle = this.terminals.get(params.terminalId);
        if (!handle) {
            throw new Error(`Terminal not found: ${params.terminalId}`);
        }

        // Calculate incremental output
        const newOutput = handle.outputBuffer.substring(handle.lastReadOffset);
        handle.lastReadOffset = handle.outputBuffer.length;

        // Apply output byte limit if specified
        const limit = params.outputByteLimit || Number.MAX_SAFE_INTEGER;
        let output = newOutput;
        let truncated = false;

        if (Buffer.byteLength(output, 'utf8') > limit) {
            // Truncate to byte limit
            const buffer = Buffer.from(output, 'utf8');
            output = buffer.subarray(0, limit).toString('utf8');
            truncated = true;
        }

        const result: TerminalOutputResult = {
            output,
            truncated,
        };

        // Include exit status if complete
        if (handle.isComplete) {
            if (handle.exitCode !== null) {
                result.exitCode = handle.exitCode;
            }
            if (handle.signal) {
                result.signal = handle.signal;
            }
        }

        return result;
    }

    /**
     * Wait for terminal to exit (blocking until exit).
     */
    async waitForExit(params: TerminalWaitForExitParams): Promise<TerminalWaitForExitResult> {
        const handle = this.terminals.get(params.terminalId);
        if (!handle) {
            throw new Error(`Terminal not found: ${params.terminalId}`);
        }

        // If already complete, return immediately
        if (handle.isComplete) {
            return {
                exitCode: handle.exitCode ?? -1,
                signal: handle.signal ?? undefined,
            };
        }

        // Wait for exit event
        return new Promise<TerminalWaitForExitResult>((resolve) => {
            const checkInterval = setInterval(() => {
                if (handle.isComplete) {
                    clearInterval(checkInterval);
                    resolve({
                        exitCode: handle.exitCode ?? -1,
                        signal: handle.signal ?? undefined,
                    });
                }
            }, 100);
        });
    }

    /**
     * Kill a running terminal process.
     */
    async killTerminal(params: TerminalKillParams): Promise<void> {
        const handle = this.terminals.get(params.terminalId);
        if (!handle) {
            throw new Error(`Terminal not found: ${params.terminalId}`);
        }

        if (handle.isComplete) {
            console.log(`[TerminalProvider] Terminal ${params.terminalId} already completed`);
            return;
        }

        try {
            const signal = params.signal || 'SIGTERM';
            console.log(`[TerminalProvider] Killing terminal ${params.terminalId} with ${signal}`);
            
            // Kill the pty process
            if (signal === 'SIGTERM') {
                handle.pty.kill();
            } else if (signal === 'SIGKILL') {
                handle.pty.kill('SIGKILL');
            } else {
                handle.pty.kill(signal);
            }

            handle.isComplete = true;
            handle.signal = signal;
        } catch (error) {
            console.error('[TerminalProvider] Failed to kill terminal:', error);
            throw error;
        }
    }

    /**
     * Release terminal resources (cleanup).
     */
    async releaseTerminal(params: TerminalReleaseParams): Promise<void> {
        const handle = this.terminals.get(params.terminalId);
        if (!handle) {
            console.warn(`[TerminalProvider] Terminal not found for release: ${params.terminalId}`);
            return;
        }

        console.log(`[TerminalProvider] Releasing terminal ${params.terminalId}`);

        // Kill if still running
        if (!handle.isComplete) {
            try {
                handle.pty.kill();
            } catch (err) {
                console.warn('[TerminalProvider] Error killing pty during release:', err);
            }
        }

        // Dispose VSCode terminal if exists
        if (handle.vscodeTerminal) {
            handle.vscodeTerminal.dispose();
        }

        // Remove from map
        this.terminals.delete(params.terminalId);
    }

    /**
     * Mirror pty output to a VSCode terminal for user visibility.
     */
    private async mirrorToVSCodeTerminal(handle: TerminalHandle): Promise<void> {
        try {
            const pty = handle.pty;
            
            // Create a VSCode pseudo-terminal
            const vscodeTerminal = vscode.window.createTerminal({
                name: `VCoder: ${handle.command}`,
                pty: {
                    onDidWrite: new vscode.EventEmitter<string>().event,
                    onDidClose: new vscode.EventEmitter<number | void>().event,
                    open: () => {},
                    close: () => {},
                    handleInput: (data: string) => {
                        // Forward input to pty
                        pty.write(data);
                    },
                },
            });

            // Forward pty output to VSCode terminal
            const writeEmitter = new vscode.EventEmitter<string>();
            const closeEmitter = new vscode.EventEmitter<number | void>();

            pty.onData((data: string) => {
                writeEmitter.fire(data);
            });

            pty.onExit((event) => {
                closeEmitter.fire(event.exitCode);
            });

            // Update VSCode terminal pty
            const updatedTerminal = vscode.window.createTerminal({
                name: `VCoder: ${handle.command}`,
                pty: {
                    onDidWrite: writeEmitter.event,
                    onDidClose: closeEmitter.event,
                    open: () => {},
                    close: () => {
                        pty.kill();
                    },
                    handleInput: (data: string) => {
                        pty.write(data);
                    },
                },
            });

            handle.vscodeTerminal = updatedTerminal;
            updatedTerminal.show(true); // Show but preserve focus
        } catch (error) {
            console.warn('[TerminalProvider] Failed to mirror to VSCode terminal:', error);
            // Non-critical error, continue without mirroring
        }
    }

    /**
     * Get default shell for the current platform.
     */
    private getDefaultShell(): string {
        const platform = os.platform();
        if (platform === 'win32') {
            return process.env.COMSPEC || 'cmd.exe';
        } else {
            return process.env.SHELL || '/bin/bash';
        }
    }

    /**
     * Dispose all terminals and cleanup.
     */
    async dispose(): Promise<void> {
        console.log('[TerminalProvider] Disposing all terminals');
        for (const [terminalId] of this.terminals) {
            await this.releaseTerminal({ terminalId });
        }
        this.terminals.clear();
    }
}
