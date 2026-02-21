/**
 * Persistent Session
 * Manages a long-lived Claude CLI process with bidirectional streaming
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as os from 'os';
import {
    Attachment,
    ModelId,
    PermissionMode,
    ThoughtUpdate,
    TextUpdate,
    ToolUseUpdate,
    FileChangeUpdate,
    McpCallUpdate,
    TaskListUpdate,
    ErrorUpdate,
} from '@vcoder/shared';
import { resolveClaudePath, JsonStreamParser, computeFileChangeDiff, matchStderrError } from './shared';

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

/**
 * PersistentSession manages a single long-lived Claude CLI process
 * using bidirectional stream-json communication.
 */
export type PersistentSessionState = 'idle' | 'processing' | 'waiting' | 'closed';

export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
}

export class PersistentSession extends EventEmitter {
    private process: ChildProcess | null = null;
    private claudeSessionId: string | null = null;
    private toolNameById: Map<string, string> = new Map();
    private taskList: TaskListUpdate | null = null;
    private subagentRunMetaById: Map<string, { title: string; subagentType?: string; parentTaskId?: string; input?: Record<string, unknown> }> = new Map();
    private thinkingContent = '';
    private parser = new JsonStreamParser();
    private isRunning = false;
    private _state: PersistentSessionState = 'idle';
    private _messageCount = 0;
    private _totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
    private _startedAt: number = 0;
    private _lastActivityAt: number = 0;

    // Crash recovery
    private _crashCount = 0;
    private _recovering = false;
    private _messageBuffer: Array<{ content: string; attachments?: Attachment[] }> = [];
    private static readonly MAX_CRASH_RETRIES = 2;
    private static readonly CRASH_RETRY_DELAY_MS = 2000;

    // Idle timeout
    private _idleTimer: ReturnType<typeof setTimeout> | null = null;
    private static readonly IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

    // Health check
    private _healthCheckTimer: ReturnType<typeof setInterval> | null = null;
    private static readonly HEALTH_CHECK_INTERVAL_MS = 60 * 1000; // 60 seconds

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

    get state(): PersistentSessionState {
        return this._state;
    }

    get messageCount(): number {
        return this._messageCount;
    }

    get totalUsage(): TokenUsage {
        return { ...this._totalUsage };
    }

    get startedAt(): number {
        return this._startedAt;
    }

    get lastActivityAt(): number {
        return this._lastActivityAt;
    }

    get pid(): number | undefined {
        return this.process?.pid;
    }

    get recovering(): boolean {
        return this._recovering;
    }

    /**
     * Set an existing Claude CLI session id to resume when starting this persistent session.
     * Must be called before `start()`.
     */
    setResumeSessionId(claudeSessionId: string): void {
        if (this.process) return;
        const trimmed = claudeSessionId?.trim();
        if (!trimmed) return;
        this.claudeSessionId = trimmed;
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
            // Enable structured permission prompts over stdio so we can block on UI approval
            // via control_request(can_use_tool) / control_response.
            '--permission-prompt-tool', 'stdio',
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

        if (this.claudeSessionId) {
            args.push('--resume', this.claudeSessionId);
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
        this._state = 'idle';
        this._startedAt = Date.now();
        this._lastActivityAt = Date.now();

        // Monitor stdin for write errors
        this.process.stdin?.on('error', (err) => {
            console.error(`[PersistentSession] stdin error:`, err);
        });

        this.setupListeners();

        // Wait for init event
        return new Promise((resolve, reject) => {
            let settled = false;
            const settle = (fn: () => void) => {
                if (settled) return;
                settled = true;
                fn();
            };

            const timeout = setTimeout(() => {
                settle(() => reject(new Error('Timeout waiting for session init')));
            }, 30000);

            const onInit = () => {
                clearTimeout(timeout);
                settle(() => {
                    this.startHealthCheck();
                    this.resetIdleTimer();
                    resolve();
                });
            };

            this.once('init', onInit);

            this.process!.on('error', (err) => {
                clearTimeout(timeout);
                this.off('init', onInit);
                this.isRunning = false;
                settle(() => reject(err));
            });

            this.process!.on('close', (code) => {
                this.isRunning = false;
                this._state = 'closed';
                this.clearTimers();
                this.off('init', onInit);
                clearTimeout(timeout);

                // Reject the start() promise if process exited before init was received
                settle(() => reject(new Error(`Session process exited with code ${code ?? 'null'} before initialization`)));

                // Non-zero exit is a crash; attempt recovery
                if (code !== 0 && code !== null && code !== 143 && code !== 137) {
                    this.handleCrash(code);
                } else {
                    this.emit('close', code);
                }
            });
        });
    }

    /**
     * Send a user message to the CLI.
     * If the session is currently recovering from a crash, the message is buffered.
     */
    sendMessage(content: string, attachments?: Attachment[]): void {
        // Buffer messages during recovery
        if (this._recovering) {
            console.error(`[PersistentSession] Session recovering, buffering message`);
            this._messageBuffer.push({ content, attachments });
            return;
        }

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

        this._messageCount++;
        this._state = 'processing';
        this._lastActivityAt = Date.now();
        this.resetIdleTimer();
        console.error(`[PersistentSession] Sending message #${this._messageCount}:`, message.slice(0, 100));
        this.process.stdin.write(message);
    }

    /**
     * Send a control_response back to the CLI process (e.g. for permission prompts).
     */
    sendControlResponse(requestId: string, response: unknown): void {
        if (!this.process || !this.process.stdin || this.process.stdin.destroyed || this.process.stdin.writableEnded) {
            console.error(`[PersistentSession] Cannot send control_response: stdin not available`);
            return;
        }
        const payload = {
            type: 'control_response',
            response: {
                subtype: 'success',
                request_id: requestId,
                response,
            },
        };
        this.process.stdin.write(JSON.stringify(payload) + '\n');
    }

    /**
     * Stop the session gracefully: stdin.end() -> SIGTERM after 2s -> SIGKILL after 5s.
     */
    async stop(): Promise<void> {
        if (!this.process) return;

        this.clearTimers();
        this._recovering = false;
        this._messageBuffer.length = 0;

        return new Promise((resolve) => {
            const proc = this.process!;
            let resolved = false;
            const done = () => {
                if (resolved) return;
                resolved = true;
                this.process = null;
                this.isRunning = false;
                this._state = 'closed';
                resolve();
            };

            proc.on('close', done);

            // Try graceful shutdown first
            proc.stdin?.end();

            // SIGTERM after 2s
            const termTimer = setTimeout(() => {
                if (this.process) {
                    this.process.kill('SIGTERM');
                }
            }, 2000);

            // SIGKILL after 5s total
            const killTimer = setTimeout(() => {
                if (this.process) {
                    console.error(`[PersistentSession] Force killing session ${this.sessionId}`);
                    this.process.kill('SIGKILL');
                }
            }, 5000);

            // Cleanup timers when done
            const origDone = done;
            const wrappedDone = () => {
                clearTimeout(termTimer);
                clearTimeout(killTimer);
                origDone();
            };
            proc.removeListener('close', done);
            proc.on('close', wrappedDone);
        });
    }

    /**
     * Force kill the session
     */
    kill(): void {
        this.clearTimers();
        this._recovering = false;
        this._messageBuffer.length = 0;
        if (this.process) {
            this.process.kill('SIGKILL');
            this.process = null;
            this.isRunning = false;
            this._state = 'closed';
        }
    }

    private resolveClaudePath(): string {
        return resolveClaudePath();
    }

    private setupListeners(): void {
        if (!this.process) return;

        let stderrTail = '';

        this.process.stdout?.setEncoding('utf8');
        this.process.stdout?.on('data', (chunk: string) => {
            console.error(`[PersistentSession stdout] raw chunk (${chunk.length} bytes):`, chunk.slice(0, 500));
            const jsonTexts = this.parser.feed(chunk);
            console.error(`[PersistentSession stdout] parsed ${jsonTexts.length} JSON objects`);
            for (const jsonText of jsonTexts) {
                this.handleJsonText(jsonText);
            }
        });

        this.process.stderr?.on('data', (data) => {
            const text = data.toString();
            stderrTail = (stderrTail + text).slice(-8000);
            console.error(`[PersistentSession stderr]`, text);

            const stderrError = matchStderrError(text);
            if (stderrError) {
                this.emit('update', stderrError, 'error');
            }
        });
    }

    // =========================================================================
    // Crash Recovery
    // =========================================================================

    private handleCrash(exitCode: number): void {
        this._crashCount++;
        console.error(
            `[PersistentSession] Session ${this.sessionId} crashed (exit=${exitCode}, attempt=${this._crashCount}/${PersistentSession.MAX_CRASH_RETRIES})`
        );

        // Notify listeners about the crash
        const errorUpdate: ErrorUpdate = {
            code: 'AGENT_CRASHED',
            message: `CLI process crashed with exit code ${exitCode}`,
        };
        this.emit('update', errorUpdate, 'error');

        if (this._crashCount <= PersistentSession.MAX_CRASH_RETRIES && this.claudeSessionId) {
            this.attemptRecovery();
        } else {
            console.error(`[PersistentSession] Max retries exceeded or no CLI session to resume, giving up recovery`);
            this._messageBuffer.length = 0;
            this.emit('recoveryFailed', this.sessionId);
            this.emit('close', exitCode);
        }
    }

    private attemptRecovery(): void {
        this._recovering = true;
        console.error(
            `[PersistentSession] Attempting recovery in ${PersistentSession.CRASH_RETRY_DELAY_MS}ms...`
        );

        setTimeout(async () => {
            try {
                // Reset process state for a fresh start()
                this.process = null;
                this.parser = new JsonStreamParser();
                this.thinkingContent = '';

                await this.start();

                // Recovery succeeded
                this._recovering = false;
                console.error(`[PersistentSession] Session ${this.sessionId} recovered successfully`);
                this.emit('recovered', this.sessionId);

                // Flush buffered messages
                const buffered = [...this._messageBuffer];
                this._messageBuffer.length = 0;
                for (const msg of buffered) {
                    this.sendMessage(msg.content, msg.attachments);
                }
            } catch (err) {
                console.error(`[PersistentSession] Recovery attempt failed:`, err);
                this._recovering = false;
                this._messageBuffer.length = 0;
                this.emit('recoveryFailed', this.sessionId);
                this.emit('close', 1);
            }
        }, PersistentSession.CRASH_RETRY_DELAY_MS);
    }

    // =========================================================================
    // Idle Timeout
    // =========================================================================

    private resetIdleTimer(): void {
        if (this._idleTimer) {
            clearTimeout(this._idleTimer);
        }
        this._idleTimer = setTimeout(() => {
            console.error(`[PersistentSession] Session ${this.sessionId} idle for ${PersistentSession.IDLE_TIMEOUT_MS / 1000}s, stopping`);
            this.emit('idleTimeout', this.sessionId);
            void this.stop();
        }, PersistentSession.IDLE_TIMEOUT_MS);
    }

    // =========================================================================
    // Health Check
    // =========================================================================

    private startHealthCheck(): void {
        this._healthCheckTimer = setInterval(() => {
            if (!this.process || !this.isRunning) {
                this.clearTimers();
                return;
            }

            // Check if process is still alive by checking if pid exists
            try {
                // process.kill(0) checks process existence without sending a signal
                process.kill(this.process.pid!, 0);
            } catch {
                console.error(`[PersistentSession] Health check: process ${this.process.pid} not alive, force killing`);
                this.kill();
                this.handleCrash(1);
            }
        }, PersistentSession.HEALTH_CHECK_INTERVAL_MS);
    }

    // =========================================================================
    // Timer Management
    // =========================================================================

    private clearTimers(): void {
        if (this._idleTimer) {
            clearTimeout(this._idleTimer);
            this._idleTimer = null;
        }
        if (this._healthCheckTimer) {
            clearInterval(this._healthCheckTimer);
            this._healthCheckTimer = null;
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
        console.error(`[PersistentSession] handleEvent type=${type}, state=${this._state}`);

        switch (type) {
            case 'stream_event': {
                const inner =
                    (event.event as Record<string, unknown> | undefined) ??
                    (event.data as Record<string, unknown> | undefined) ??
                    (event.stream_event as Record<string, unknown> | undefined) ??
                    undefined;
                if (inner && typeof inner === 'object') {
                    this.handleEvent(inner);
                } else if (typeof event.event === 'string') {
                    try {
                        const parsed = JSON.parse(event.event) as Record<string, unknown>;
                        this.handleEvent(parsed);
                    } catch {
                        // ignore
                    }
                }
                break;
            }

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

            case 'control_request': {
                // Forward to parent so wrapper can show permission UI and respond
                this.emit('control_request', event);
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

                // Accumulate token usage from result
                const usage = event.usage as { input_tokens?: number; output_tokens?: number } | undefined;
                if (usage) {
                    this._totalUsage.inputTokens += usage.input_tokens ?? 0;
                    this._totalUsage.outputTokens += usage.output_tokens ?? 0;
                }

                // Reset crash count on successful turn completion
                this._crashCount = 0;

                // Transition to 'waiting' state - ready for next user input
                this._state = 'waiting';
                this._lastActivityAt = Date.now();
                this.resetIdleTimer();
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
            const isWrite = toolName === 'Write';
            const filePath = typeof toolInput?.path === 'string' ? (toolInput.path as string) : undefined;
            const proposedContent = typeof toolInput?.content === 'string' ? (toolInput.content as string) : undefined;

            const shouldComputeDiff =
                isWrite &&
                filePath &&
                typeof proposedContent === 'string' &&
                Buffer.byteLength(proposedContent, 'utf8') <= 1 * 1024 * 1024;

            const { diff, didExist } = shouldComputeDiff
                ? computeFileChangeDiff({
                      workingDirectory: this.options.workingDirectory,
                      filePath,
                      proposedContent,
                  })
                : { diff: '', didExist: true };

            const toolInputForUi =
                shouldComputeDiff && diff
                    ? { ...toolInput, diff }
                    : toolInput;

            const update: ToolUseUpdate = {
                id: toolId,
                name: toolName,
                input: toolInputForUi,
                status: 'running',
            };
            this.emit('update', update, 'tool_use');

            if (toolName === 'Write' && toolInput?.path && typeof toolInput.content === 'string') {
                const fileType: FileChangeUpdate['type'] = didExist ? 'modified' : 'created';
                const fileUpdate: FileChangeUpdate = {
                    path: toolInput.path as string,
                    type: fileType,
                    diff: diff || undefined,
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
