/**
 * Claude Code CLI Wrapper
 * Spawns Claude Code CLI and parses JSON stream output
 */

import { spawn, ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import { EventEmitter } from 'events';
import {
    Attachment,
    ModelId,
    ThoughtUpdate,
    TextUpdate,
    ToolUseUpdate,
    ToolResultUpdate,
    FileChangeUpdate,
    McpCallUpdate,
    TaskListUpdate,
    BashRequestUpdate,
    PlanReadyUpdate,
    ErrorUpdate,
    UpdateType,
} from '@z-code/shared';

export interface ClaudeCodeOptions {
    workingDirectory: string;
}

export interface ClaudeCodeSettings {
    model?: ModelId;
    planMode?: boolean;
}

export class ClaudeCodeWrapper extends EventEmitter {
    private process: ChildProcess | null = null;
    private settings: ClaudeCodeSettings = {
        model: 'claude-sonnet-4-20250514',
        planMode: false,
    };
    private pendingBashCommands: Map<string, (confirmed: boolean) => void> = new Map();

    constructor(private options: ClaudeCodeOptions) {
        super();
    }

    updateSettings(settings: ClaudeCodeSettings): void {
        if (settings.model !== undefined) {
            this.settings.model = settings.model;
        }
        if (settings.planMode !== undefined) {
            this.settings.planMode = settings.planMode;
        }
    }

    /**
     * Send a prompt to Claude Code CLI
     */
    async prompt(sessionId: string, message: string, attachments?: Attachment[]): Promise<void> {
        const args = [
            '-p', message,
            '--output-format', 'stream-json',
            '--model', this.settings.model || 'claude-sonnet-4-20250514',
        ];

        // Add plan mode flag if enabled
        // Note: Check Claude Code CLI docs for exact flag
        // if (this.settings.planMode) {
        //   args.push('--plan');
        // }

        // Start Claude Code CLI subprocess
        this.process = spawn('claude', args, {
            cwd: this.options.workingDirectory,
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        // Read JSON output line by line
        const rl = createInterface({ input: this.process.stdout! });

        rl.on('line', (line) => {
            try {
                const event = JSON.parse(line);
                this.handleClaudeCodeEvent(sessionId, event);
            } catch {
                // Non-JSON line, might be log output
                console.error('[ClaudeCode]', line);
            }
        });

        // Handle stderr
        this.process.stderr?.on('data', (data) => {
            console.error('[ClaudeCode stderr]', data.toString());
        });

        // Wait for process to complete
        return new Promise((resolve, reject) => {
            this.process!.on('close', (code) => {
                if (code === 0) {
                    this.emit('complete', sessionId);
                    resolve();
                } else {
                    const error: ErrorUpdate = {
                        code: 'CLI_EXIT_ERROR',
                        message: `Claude Code exited with code ${code}`,
                        action: {
                            label: 'Retry',
                            command: 'vcoder.retry',
                        },
                    };
                    this.emit('update', sessionId, error, 'error');
                    reject(new Error(`Claude Code exited with code ${code}`));
                }
            });

            this.process!.on('error', (err) => {
                const error: ErrorUpdate = {
                    code: 'CLI_NOT_FOUND',
                    message: 'Claude Code CLI not found. Please install it first.',
                    action: {
                        label: 'Install Guide',
                        command: 'vcoder.openInstallGuide',
                    },
                };
                this.emit('update', sessionId, error, 'error');
                reject(err);
            });
        });
    }

    /**
     * Parse Claude Code event and convert to ACP message
     */
    private handleClaudeCodeEvent(sessionId: string, event: Record<string, unknown>): void {
        const type = event.type as string;

        switch (type) {
            case 'thinking': {
                const update: ThoughtUpdate = {
                    content: event.content as string,
                    isComplete: (event.is_complete as boolean) || false,
                };
                this.emit('update', sessionId, update, 'thought');
                break;
            }

            case 'text': {
                const update: TextUpdate = {
                    text: event.text as string,
                };
                this.emit('update', sessionId, update, 'text');
                break;
            }

            case 'tool_use': {
                const update: ToolUseUpdate = {
                    id: event.id as string,
                    name: event.name as string,
                    input: event.input as Record<string, unknown>,
                    status: 'running',
                };
                this.emit('update', sessionId, update, 'tool_use');
                break;
            }

            case 'tool_result': {
                const update: ToolResultUpdate = {
                    id: event.id as string,
                    result: event.result,
                    error: event.error as string | undefined,
                };
                this.emit('update', sessionId, update, 'tool_result');
                break;
            }

            case 'file_write': {
                const update: FileChangeUpdate = {
                    type: 'modified',
                    path: event.path as string,
                    diff: event.diff as string,
                    proposed: true,
                };
                this.emit('update', sessionId, update, 'file_change');
                break;
            }

            case 'mcp_tool_use': {
                const update: McpCallUpdate = {
                    id: event.id as string,
                    server: event.server as string,
                    tool: event.tool as string,
                    input: event.input as Record<string, unknown>,
                    status: 'running',
                };
                this.emit('update', sessionId, update, 'mcp_call');
                break;
            }

            case 'TodoWrite':
            case 'todo_list': {
                const update: TaskListUpdate = {
                    tasks: event.tasks as TaskListUpdate['tasks'],
                    currentTaskId: event.current_task_id as string | undefined,
                };
                this.emit('update', sessionId, update, 'task_list');
                break;
            }

            case 'bash_request': {
                const update: BashRequestUpdate = {
                    id: event.id as string,
                    command: event.command as string,
                };
                this.emit('update', sessionId, update, 'bash_request');
                break;
            }

            default:
                console.error('[ClaudeCode] Unknown event type:', type);
        }
    }

    async acceptFileChange(path: string): Promise<void> {
        // Send confirmation to Claude Code CLI stdin if needed
        if (this.process?.stdin) {
            this.process.stdin.write(JSON.stringify({ action: 'accept', path }) + '\n');
        }
    }

    async rejectFileChange(path: string): Promise<void> {
        if (this.process?.stdin) {
            this.process.stdin.write(JSON.stringify({ action: 'reject', path }) + '\n');
        }
    }

    async confirmBash(commandId: string): Promise<void> {
        if (this.process?.stdin) {
            this.process.stdin.write(JSON.stringify({ action: 'confirm_bash', id: commandId }) + '\n');
        }
    }

    async skipBash(commandId: string): Promise<void> {
        if (this.process?.stdin) {
            this.process.stdin.write(JSON.stringify({ action: 'skip_bash', id: commandId }) + '\n');
        }
    }

    async confirmPlan(sessionId: string): Promise<void> {
        if (this.process?.stdin) {
            this.process.stdin.write(JSON.stringify({ action: 'confirm_plan' }) + '\n');
        }
    }

    async shutdown(): Promise<void> {
        if (this.process) {
            this.process.kill('SIGTERM');
            this.process = null;
        }
    }
}
