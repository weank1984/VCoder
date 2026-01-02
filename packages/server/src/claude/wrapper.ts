/**
 * Claude Code CLI Wrapper
 * Spawns Claude Code CLI and parses JSON stream output
 */

import { spawn, ChildProcess } from 'child_process';
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
} from '@vcoder/shared';

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
        // Use minimal args to let Claude Code CLI use system default configuration
        // (API Key, model, etc. are configured in ~/.claude/settings.json)
        // Note: --verbose is required when using --output-format stream-json with -p
        const claudeArgs = [
            '-p', message,
            '--output-format', 'stream-json',
            '--verbose',
        ];

        // Start Claude Code CLI subprocess
        console.error('[ClaudeCode] Spawning CLI with args:', claudeArgs.join(' '));
        console.error('[ClaudeCode] Working directory:', this.options.workingDirectory);
        const hasAnthropicKeyVar = Object.prototype.hasOwnProperty.call(process.env, 'ANTHROPIC_API_KEY');
        const anthropicKeyLen = process.env.ANTHROPIC_API_KEY?.length ?? 0;
        console.error('[ClaudeCode] ANTHROPIC_API_KEY set:', hasAnthropicKeyVar, 'len:', anthropicKeyLen);

        // Directly spawn claude CLI without shell wrapper
        // Using zsh -c causes stdout buffering issues in VSCode Extension Host
        const claudePath = process.env.CLAUDE_PATH || '/Users/weank/.local/bin/claude';
        console.error('[ClaudeCode] Using claude path:', claudePath);
        console.error('[ClaudeCode] Args:', claudeArgs.join(' '));

        this.process = spawn(claudePath, claudeArgs, {
            cwd: this.options.workingDirectory,
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: true,  // Use shell to ensure proper environment initialization
            env: {
                ...process.env,
                TERM: process.env.TERM || 'xterm-256color',
                HOME: process.env.HOME || '/Users/weank',
                PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin:/Users/weank/.local/bin',
            },
        });

        console.error('[ClaudeCode] Process spawned, PID:', this.process.pid);
        console.error('[ClaudeCode] Process stdin:', !!this.process.stdin);
        console.error('[ClaudeCode] Process stdout:', !!this.process.stdout);
        console.error('[ClaudeCode] Process stderr:', !!this.process.stderr);

        // CRITICAL: Claude CLI in -p mode waits for stdin EOF before processing.
        // We must close stdin immediately to unblock it.
        if (this.process.stdin) {
            this.process.stdin.end();
            console.error('[ClaudeCode] stdin closed (EOF sent)');
        }

        // Immediately listen for process events
        this.process.on('spawn', () => {
            console.error('[ClaudeCode] EVENT: spawn - process started successfully');
        });

        this.process.on('disconnect', () => {
            console.error('[ClaudeCode] EVENT: disconnect');
        });

        // Stream parser: Claude Code's "stream-json" may emit JSON objects without newline delimiters.
        // Parse a sequence of top-level JSON values by tracking bracket depth and string state.
        let buffer = '';
        let scanIndex = 0;
        let jsonStart = -1;
        let depth = 0;
        let inString = false;
        let escaped = false;
        let sawAnyOutput = false;
        let stderrTail = '';

        const logNonJson = (text: string) => {
            const trimmed = text.trim();
            if (trimmed) console.error('[ClaudeCode] Non-JSON output:', trimmed.slice(0, 200));
        };

        const handleJsonText = (jsonText: string) => {
            try {
                const event = JSON.parse(jsonText);
                console.error('[ClaudeCode] Parsed event type:', event.type, 'subtype:', event.subtype);
                this.handleClaudeCodeEvent(sessionId, event);
            } catch (err) {
                console.error('[ClaudeCode] Failed to parse JSON chunk:', jsonText.slice(0, 200));
                console.error('[ClaudeCode] JSON parse error:', err);
            }
        };

        const processBuffer = () => {
            for (; scanIndex < buffer.length; scanIndex++) {
                const ch = buffer[scanIndex];

                if (jsonStart === -1) {
                    // Not currently inside a JSON value; skip until we find a JSON start.
                    if (ch === '{' || ch === '[') {
                        logNonJson(buffer.slice(0, scanIndex));
                        buffer = buffer.slice(scanIndex);
                        // Set to 0 because for loop will increment to 1 after continue
                        scanIndex = 0;
                        jsonStart = 0;
                        depth = 1; // opening brace/bracket counts toward depth
                        inString = false;
                        escaped = false;
                        continue;
                    }

                    if (ch === '\n') {
                        logNonJson(buffer.slice(0, scanIndex));
                        buffer = buffer.slice(scanIndex + 1);
                        scanIndex = -1;
                    }
                    continue;
                }

                // We are scanning a JSON value.
                if (inString) {
                    if (escaped) {
                        escaped = false;
                    } else if (ch === '\\') {
                        escaped = true;
                    } else if (ch === '"') {
                        inString = false;
                    }
                    continue;
                }

                if (ch === '"') {
                    inString = true;
                    continue;
                }

                if (ch === '{' || ch === '[') {
                    depth++;
                } else if (ch === '}' || ch === ']') {
                    depth--;
                    if (depth === 0) {
                        const jsonText = buffer.slice(jsonStart, scanIndex + 1);
                        handleJsonText(jsonText);
                        buffer = buffer.slice(scanIndex + 1);
                        scanIndex = -1;
                        jsonStart = -1;
                    }
                }
            }
        };

        // Handle stdout as raw chunks (not line-delimited).
        console.error('[ClaudeCode] Setting up stdout listener...');
        this.process.stdout?.setEncoding('utf8');
        this.process.stdout?.on('data', (chunk: string) => {
            console.error('[ClaudeCode] STDOUT received:', chunk.length, 'bytes, first 200 chars:', chunk.slice(0, 200));
            sawAnyOutput = true;
            buffer += chunk;
            console.error('[ClaudeCode] Buffer state before parse: length=', buffer.length, 'jsonStart=', jsonStart, 'depth=', depth, 'scanIndex=', scanIndex);
            processBuffer();
            console.error('[ClaudeCode] Buffer state after parse: length=', buffer.length, 'jsonStart=', jsonStart, 'depth=', depth, 'scanIndex=', scanIndex);
        });
        this.process.stdout?.on('error', (err) => {
            console.error('[ClaudeCode] STDOUT error:', err);
        });
        this.process.stdout?.on('end', () => {
            console.error('[ClaudeCode] STDOUT ended');
        });
        console.error('[ClaudeCode] stdout listener registered:', !!this.process.stdout);

        // If the CLI produces nothing for a while, surface a helpful error instead of hanging silently.
        const noOutputTimer = setTimeout(() => {
            if (this.process && !sawAnyOutput) {
                const update: ErrorUpdate = {
                    code: 'CLI_NO_OUTPUT',
                    message:
                        'Claude Code CLI started but produced no output. It may be waiting for first-run setup/login, missing credentials, or stuck accessing the network. Try running `claude -p \"hi\" --output-format stream-json --verbose` in a terminal to see the prompt.',
                };
                this.emit('update', sessionId, update, 'error');
                try {
                    this.process.kill('SIGTERM');
                } catch {
                    // ignore
                }
                setTimeout(() => {
                    try {
                        this.process?.kill('SIGKILL');
                    } catch {
                        // ignore
                    }
                }, 2_000);
            }
        }, 30_000);

        // Handle stderr
        this.process.stderr?.on('data', (data) => {
            const text = data.toString();
            stderrTail = (stderrTail + text).slice(-8_000);
            console.error('[ClaudeCode stderr]', text);
        });

        // Wait for process to complete
        return new Promise((resolve, reject) => {
            this.process!.on('close', (code) => {
                clearTimeout(noOutputTimer);
                if (code === 0) {
                    this.emit('complete', sessionId);
                    resolve();
                } else {
                    const error: ErrorUpdate = {
                        code: 'CLI_EXIT_ERROR',
                        message: `Claude Code process exited with code ${code}${stderrTail.trim() ? `\n\nstderr:\n${stderrTail.trim()}` : ''}`,
                        action: {
                            label: 'Retry',
                            command: 'vcoder.retry',
                        },
                    };
                    this.emit('update', sessionId, error, 'error');
                    reject(new Error(`Claude Code exited with code ${code}`));
                }
                this.process = null;
            });

            this.process!.on('error', (err) => {
                clearTimeout(noOutputTimer);
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
     * CLI output format (stream-json --verbose):
     * - { type: "system", subtype: "init", ... } - session init
     * - { type: "assistant", message: { content: [...] }, ... } - assistant response
     * - { type: "tool", tool: { name, input }, ... } - tool invocation
     * - { type: "tool_result", tool_result: { content }, ... } - tool result
     * - { type: "result", subtype: "success"|"error", result: "...", ... } - final result
     */
    private handleClaudeCodeEvent(sessionId: string, event: Record<string, unknown>): void {
        const type = event.type as string;

        switch (type) {
            case 'system': {
                // Init event, log but don't emit
                console.error('[ClaudeCode] System event:', event.subtype);
                break;
            }

            case 'assistant': {
                // Parse message content
                const message = event.message as Record<string, unknown> | undefined;
                if (!message) break;

                const content = message.content as Array<{ type: string; text?: string; thinking?: string }> | undefined;
                if (!content || !Array.isArray(content)) break;

                for (const block of content) {
                    if (block.type === 'thinking' && block.thinking) {
                        const update: ThoughtUpdate = {
                            content: block.thinking,
                            isComplete: true,
                        };
                        this.emit('update', sessionId, update, 'thought');
                    } else if (block.type === 'text' && block.text) {
                        const update: TextUpdate = {
                            text: block.text,
                        };
                        this.emit('update', sessionId, update, 'text');
                    }
                }
                break;
            }

            case 'tool': {
                // Tool invocation
                const tool = event.tool as { name: string; input: Record<string, unknown>; id?: string } | undefined;
                if (!tool) break;

                const toolName = tool.name || 'unknown';
                const toolId = tool.id || (event.uuid as string) || crypto.randomUUID();

                // Handle specific tool types
                if (toolName === 'Write' || toolName === 'Edit') {
                    // File write event - will be handled when result comes back
                    const update: ToolUseUpdate = {
                        id: toolId,
                        name: toolName,
                        input: tool.input,
                        status: 'running',
                    };
                    this.emit('update', sessionId, update, 'tool_use');
                } else if (toolName === 'Bash') {
                    const update: BashRequestUpdate = {
                        id: toolId,
                        command: (tool.input?.command as string) || '',
                    };
                    this.emit('update', sessionId, update, 'bash_request');
                } else if (toolName === 'TodoWrite') {
                    const tasks = tool.input?.tasks as TaskListUpdate['tasks'] | undefined;
                    if (tasks) {
                        const update: TaskListUpdate = {
                            tasks,
                            currentTaskId: undefined,
                        };
                        this.emit('update', sessionId, update, 'task_list');
                    }
                } else if (toolName.startsWith('mcp__')) {
                    const parts = toolName.split('__');
                    const update: McpCallUpdate = {
                        id: toolId,
                        server: parts[1] || 'unknown',
                        tool: parts.slice(2).join('__') || toolName,
                        input: tool.input,
                        status: 'running',
                    };
                    this.emit('update', sessionId, update, 'mcp_call');
                } else {
                    const update: ToolUseUpdate = {
                        id: toolId,
                        name: toolName,
                        input: tool.input,
                        status: 'running',
                    };
                    this.emit('update', sessionId, update, 'tool_use');
                }
                break;
            }

            case 'tool_result': {
                const toolResult = event.tool_result as { content?: unknown; error?: string; id?: string } | undefined;
                const toolId = toolResult?.id || (event.tool_use_id as string) || '';
                const update: ToolResultUpdate = {
                    id: toolId,
                    result: toolResult?.content,
                    error: toolResult?.error,
                };
                this.emit('update', sessionId, update, 'tool_result');
                break;
            }

            case 'result': {
                // Final result event
                const subtype = event.subtype as string;
                if (subtype === 'error') {
                    const update: ErrorUpdate = {
                        code: 'CLI_ERROR',
                        message: (event.error as string) || 'Unknown error',
                    };
                    this.emit('update', sessionId, update, 'error');
                }
                // success result is handled via process close
                break;
            }

            // Legacy event types (keep for compatibility)
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

            default:
                console.error('[ClaudeCode] Unhandled event type:', type);
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
