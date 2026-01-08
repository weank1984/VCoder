/**
 * Persistent Session
 * Manages a long-lived Claude CLI process with bidirectional streaming
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    Attachment,
    ModelId,
    PermissionMode,
    ThoughtUpdate,
    TextUpdate,
    ToolUseUpdate,
    ToolResultUpdate,
    FileChangeUpdate,
    McpCallUpdate,
    TaskListUpdate,
    SubagentRunUpdate,
    ErrorUpdate,
} from '@vcoder/shared';

export interface PersistentSessionOptions {
    workingDirectory: string;
}

export interface PersistentSessionSettings {
    model?: ModelId;
    permissionMode?: PermissionMode;
    fallbackModel?: ModelId;
    appendSystemPrompt?: string;
    mcpConfigPath?: string;
    allowedTools?: string[];
    disallowedTools?: string[];
    additionalDirs?: string[];
    maxThinkingTokens?: number;
}

type UpdateType = 'thought' | 'text' | 'tool_use' | 'tool_result' | 'file_change' | 'mcp_call' | 'task_list' | 'subagent_run' | 'error';

/**
 * PersistentSession manages a single long-lived Claude CLI process
 * using bidirectional stream-json communication.
 */
export class PersistentSession extends EventEmitter {
    private process: ChildProcess | null = null;
    private claudeSessionId: string | null = null;
    private toolNameById: Map<string, string> = new Map();
    private taskList: TaskListUpdate | null = null;
    private subagentRunMetaById: Map<string, { title: string; subagentType?: string; parentTaskId?: string; input?: Record<string, unknown> }> = new Map();
    private thinkingContent = '';
    private buffer = '';
    private scanIndex = 0;
    private jsonStart = -1;
    private depth = 0;
    private inString = false;
    private escaped = false;
    private isRunning = false;
    
    constructor(
        private sessionId: string,
        private options: PersistentSessionOptions,
        private settings: PersistentSessionSettings = {}
    ) {
        super();
    }

    get running(): boolean {
        return this.isRunning;
    }

    get cliSessionId(): string | null {
        return this.claudeSessionId;
    }

    /**
     * Start the persistent CLI process
     */
    async start(): Promise<void> {
        if (this.process) {
            throw new Error(`Session ${this.sessionId} already started`);
        }

        const args: string[] = [
            '-p', '', // Empty prompt, we'll send messages via stdin
            '--output-format', 'stream-json',
            '--input-format', 'stream-json',
            '--verbose',
            '--include-partial-messages',
            '--replay-user-messages',
        ];

        if (this.settings.model) {
            args.push('--model', this.settings.model);
        }

        const permissionMode = this.settings.permissionMode || 'default';
        if (permissionMode && permissionMode !== 'default') {
            args.push('--permission-mode', permissionMode);
        }

        if (this.settings.fallbackModel) {
            args.push('--fallback-model', this.settings.fallbackModel);
        }

        if (this.settings.appendSystemPrompt) {
            args.push('--append-system-prompt', this.settings.appendSystemPrompt);
        }

        if (this.settings.mcpConfigPath) {
            args.push('--mcp-config', this.settings.mcpConfigPath);
        }

        if (this.settings.allowedTools && this.settings.allowedTools.length > 0) {
            args.push('--allowedTools', this.settings.allowedTools.join(' '));
        }

        const disallowedTools = this.settings.disallowedTools || ['AskUserQuestion'];
        if (disallowedTools.length > 0) {
            args.push('--disallowed-tools', disallowedTools.join(' '));
        }

        if (this.settings.additionalDirs && this.settings.additionalDirs.length > 0) {
            for (const dir of this.settings.additionalDirs) {
                args.push('--add-dir', dir);
            }
        }

        const claudePath = this.resolveClaudePath();
        console.error(`[PersistentSession] Starting session ${this.sessionId} with args:`, args.join(' '));

        this.process = spawn(claudePath, args, {
            cwd: this.options.workingDirectory,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                ...process.env,
                TERM: 'xterm-256color',
                HOME: process.env.HOME || os.homedir(),
                ...(this.settings.maxThinkingTokens ? { MAX_THINKING_TOKENS: String(this.settings.maxThinkingTokens) } : {}),
            },
        });

        // Do NOT close stdin - we need it for ongoing communication
        this.isRunning = true;
        this.setupListeners();

        // Wait for init event
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Timeout waiting for session init'));
            }, 30000);

            const onInit = () => {
                clearTimeout(timeout);
                resolve();
            };

            this.once('init', onInit);
            
            this.process!.on('error', (err) => {
                clearTimeout(timeout);
                this.isRunning = false;
                reject(err);
            });

            this.process!.on('close', (code) => {
                this.isRunning = false;
                this.emit('close', code);
            });
        });
    }

    /**
     * Send a user message to the CLI
     */
    sendMessage(content: string, attachments?: Attachment[]): void {
        if (!this.process || !this.process.stdin) {
            throw new Error('Session not started');
        }

        const fullContent = attachments
            ? `${content}\n\nAttachments:\n${attachments.map((a) => `${a.name}: ${a.content}`).join('\n')}`
            : content;

        const message = JSON.stringify({
            type: 'user',
            message: {
                role: 'user',
                content: fullContent,
            },
        }) + '\n';

        console.error(`[PersistentSession] Sending message:`, message.slice(0, 100));
        this.process.stdin.write(message);
    }

    /**
     * Stop the session
     */
    async stop(): Promise<void> {
        if (!this.process) return;

        return new Promise((resolve) => {
            this.process!.on('close', () => {
                this.process = null;
                this.isRunning = false;
                resolve();
            });

            // Try graceful shutdown first
            this.process!.stdin?.end();
            
            // Force kill after timeout
            setTimeout(() => {
                if (this.process) {
                    this.process.kill('SIGTERM');
                }
            }, 2000);
        });
    }

    /**
     * Force kill the session
     */
    kill(): void {
        if (this.process) {
            this.process.kill('SIGKILL');
            this.process = null;
            this.isRunning = false;
        }
    }

    private resolveClaudePath(): string {
        const home = process.env.HOME || '';
        const candidates = [
            process.env.CLAUDE_PATH,
            home ? path.join(home, '.local', 'bin', 'claude') : undefined,
            '/usr/local/bin/claude',
            '/opt/homebrew/bin/claude',
            'claude',
        ].filter((p): p is string => typeof p === 'string' && p.length > 0);

        for (const candidate of candidates) {
            try {
                if (candidate === 'claude') return candidate;
                if (fs.existsSync(candidate)) return candidate;
            } catch {
                // ignore
            }
        }

        return 'claude';
    }

    private setupListeners(): void {
        if (!this.process) return;

        let stderrTail = '';

        this.process.stdout?.setEncoding('utf8');
        this.process.stdout?.on('data', (chunk: string) => {
            this.buffer += chunk;
            this.processBuffer();
        });

        this.process.stderr?.on('data', (data) => {
            const text = data.toString();
            stderrTail = (stderrTail + text).slice(-8000);
            console.error(`[PersistentSession stderr]`, text);

            if (text.includes('Please run `claude login`')) {
                this.emit('update', {
                    code: 'AUTH_REQUIRED',
                    message: 'Authentication required. Please set your API Key or run `claude login`.',
                    action: { label: 'Set API Key', command: 'vcoder.setApiKey' },
                } as ErrorUpdate, 'error');
            }

            if (text.includes('command not found')) {
                this.emit('update', {
                    code: 'CLI_NOT_FOUND',
                    message: 'Claude Code CLI not found.',
                    action: { label: 'Install', command: 'vcoder.openInstallGuide' },
                } as ErrorUpdate, 'error');
            }
        });
    }

    private processBuffer(): void {
        for (; this.scanIndex < this.buffer.length; this.scanIndex++) {
            const ch = this.buffer[this.scanIndex];
            if (this.jsonStart === -1) {
                if (ch === '{' || ch === '[') {
                    this.buffer = this.buffer.slice(this.scanIndex);
                    this.scanIndex = 0;
                    this.jsonStart = 0;
                    this.depth = 1;
                    this.inString = false;
                    this.escaped = false;
                    continue;
                }
                if (ch === '\n') {
                    this.buffer = this.buffer.slice(this.scanIndex + 1);
                    this.scanIndex = -1;
                }
                continue;
            }
            if (this.inString) {
                if (this.escaped) this.escaped = false;
                else if (ch === '\\') this.escaped = true;
                else if (ch === '"') this.inString = false;
                continue;
            }
            if (ch === '"') { this.inString = true; continue; }
            if (ch === '{' || ch === '[') this.depth++;
            else if (ch === '}' || ch === ']') {
                this.depth--;
                if (this.depth === 0) {
                    this.handleJsonText(this.buffer.slice(this.jsonStart, this.scanIndex + 1));
                    this.buffer = this.buffer.slice(this.scanIndex + 1);
                    this.scanIndex = -1;
                    this.jsonStart = -1;
                }
            }
        }
    }

    private handleJsonText(jsonText: string): void {
        try {
            const event = JSON.parse(jsonText);
            this.handleEvent(event);
        } catch (err) {
            console.error('[PersistentSession] JSON parse error:', err);
        }
    }

    private handleEvent(event: Record<string, unknown>): void {
        // Capture session ID
        const maybeSessionId = 
            (event.session_id as string) ||
            (event.sessionId as string) ||
            ((event.session as { id?: string })?.id);

        if (maybeSessionId && typeof maybeSessionId === 'string') {
            this.claudeSessionId = maybeSessionId;
        }

        const type = event.type as string;

        switch (type) {
            case 'system': {
                if (event.subtype === 'init') {
                    console.error('[PersistentSession] Session initialized:', this.claudeSessionId);
                    this.emit('init');
                }
                break;
            }

            case 'user': {
                // User message echo (with --replay-user-messages)
                console.error('[PersistentSession] User message echoed');
                break;
            }

            case 'assistant': {
                const message = event.message as Record<string, unknown> | undefined;
                if (!message) break;

                const content = message.content as Array<Record<string, unknown>> | undefined;
                if (!content || !Array.isArray(content)) break;

                for (const block of content) {
                    if (block.type === 'thinking' && typeof block.thinking === 'string' && block.thinking) {
                        const update: ThoughtUpdate = {
                            content: block.thinking,
                            isComplete: true,
                        };
                        this.emit('update', update, 'thought');
                    } else if (block.type === 'text' && typeof block.text === 'string' && block.text) {
                        const update: TextUpdate = {
                            text: block.text,
                        };
                        this.emit('update', update, 'text');
                    } else if (block.type === 'tool_use') {
                        const toolName = block.name as string | undefined;
                        const toolId = block.id as string | undefined;
                        const toolInput = block.input as Record<string, unknown> | undefined;
                        if (!toolName || !toolId || !toolInput) continue;
                        this.emitToolUse(toolName, toolInput, toolId);
                    }
                }
                break;
            }

            case 'result': {
                const subtype = event.subtype as string;
                if (subtype === 'error') {
                    const update: ErrorUpdate = {
                        code: 'CLI_ERROR',
                        message: (event.error as string) || 'Unknown error',
                    };
                    this.emit('update', update, 'error');
                }
                this.emit('complete');
                break;
            }

            case 'content_block_start': {
                const contentBlock = event.content_block as Record<string, unknown> | undefined;
                if (contentBlock?.type === 'thinking') {
                    this.thinkingContent = '';
                }
                break;
            }

            case 'content_block_delta': {
                const delta = event.delta as Record<string, unknown> | undefined;
                if (delta?.type === 'thinking_delta' && typeof delta.thinking === 'string') {
                    this.thinkingContent += delta.thinking;
                    const update: ThoughtUpdate = {
                        content: delta.thinking,
                        isComplete: false,
                    };
                    this.emit('update', update, 'thought');
                } else if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
                    // Streaming text content - emit incremental updates for typewriter effect
                    const update: TextUpdate = {
                        text: delta.text,
                    };
                    this.emit('update', update, 'text');
                }
                break;
            }

            case 'content_block_stop': {
                if (this.thinkingContent.length > 0) {
                    const update: ThoughtUpdate = {
                        content: this.thinkingContent,
                        isComplete: true,
                    };
                    this.emit('update', update, 'thought');
                    this.thinkingContent = '';
                }
                break;
            }

            default:
                console.error('[PersistentSession] Unhandled event type:', type);
        }
    }

    private emitToolUse(toolName: string, toolInput: Record<string, unknown>, toolId: string): void {
        this.toolNameById.set(toolId, toolName);

        // File write detection
        if (toolName === 'Write' || toolName === 'Edit') {
            const update: ToolUseUpdate = {
                id: toolId,
                name: toolName,
                input: toolInput,
                status: 'running',
            };
            this.emit('update', update, 'tool_use');

            if (toolName === 'Write' && toolInput?.path && typeof toolInput.content === 'string') {
                const fileUpdate: FileChangeUpdate = {
                    path: toolInput.path as string,
                    type: 'modified',
                    content: toolInput.content,
                    proposed: true,
                };
                this.emit('update', fileUpdate, 'file_change');
            }
            return;
        }

        // MCP tool detection
        if (toolName.startsWith('mcp__')) {
            const parts = toolName.split('__');
            const update: McpCallUpdate = {
                id: toolId,
                server: parts[1] || 'unknown',
                tool: parts.slice(2).join('__') || toolName,
                input: toolInput,
                status: 'running',
            };
            this.emit('update', update, 'mcp_call');
            return;
        }

        // Default tool use
        const update: ToolUseUpdate = {
            id: toolId,
            name: toolName,
            input: toolInput,
            status: 'running',
        };
        this.emit('update', update, 'tool_use');
    }
}
