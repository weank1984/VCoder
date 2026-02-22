/**
 * Claude Code CLI Wrapper
 * Spawns Claude Code CLI and parses JSON stream output
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
    ToolResultUpdate,
    FileChangeUpdate,
    McpCallUpdate,
    TaskListUpdate,
    SubagentRunUpdate,
    ErrorUpdate,
    ConfirmationRequestUpdate,
    ConfirmationType,
} from '@vcoder/shared';
import { PersistentSession, PersistentSessionSettings } from './persistentSession';
import { resolveClaudePath, JsonStreamParser, computeFileChangeDiff, matchStderrError, preflightCheck } from './shared';

export interface ClaudeCodeOptions {
    workingDirectory: string;
}

export interface ClaudeCodeSettings {
    model?: ModelId;
    planMode?: boolean; // Legacy, kept for compatibility
    permissionMode?: PermissionMode;
    fallbackModel?: ModelId;
    appendSystemPrompt?: string;
    mcpConfigPath?: string;
    allowedTools?: string[];
    disallowedTools?: string[];
    additionalDirs?: string[];
    maxThinkingTokens?: number;
}

export class ClaudeCodeWrapper extends EventEmitter {
    private readonly processesByLocalSessionId: Map<string, ChildProcess> = new Map();
    private readonly claudeSessionIdByLocalSessionId: Map<string, string> = new Map();
    private readonly startedLocalSessions: Set<string> = new Set();
    private settings: ClaudeCodeSettings = {
        model: 'claude-haiku-4-5-20251001',
        planMode: false,
        permissionMode: 'default',
    };
    private toolNameByIdByLocalSessionId: Map<string, Map<string, string>> = new Map();
    private taskListByLocalSessionId: Map<string, TaskListUpdate> = new Map();
    private subagentRunMetaByIdByLocalSessionId: Map<
        string,
        Map<string, { title: string; subagentType?: string; parentTaskId?: string; input?: Record<string, unknown> }>
    > = new Map();
    private thinkingContentByLocalSessionId: Map<string, string> = new Map();
    // Track if we've received streaming events (content_block_delta) for a session
    // If we have, we should ignore the final assistant message to avoid duplication
    private receivedStreamingTextByLocalSessionId: Map<string, boolean> = new Map();
    private receivedStreamingThinkingByLocalSessionId: Map<string, boolean> = new Map();
    // Throttle thinking_delta IPC emissions (150ms interval)
    private thinkingThrottleTimerByLocalSessionId: Map<string, ReturnType<typeof setTimeout>> = new Map();
    private thinkingLastEmitTimeByLocalSessionId: Map<string, number> = new Map();
    // Track emitted tool_use IDs to avoid duplicates
    private emittedToolUseIdsByLocalSessionId: Map<string, Set<string>> = new Map();
    private readonly debugThinking = process.env.VCODER_DEBUG_THINKING === '1';
    private lastToolIdByLocalSessionId: Map<string, string> = new Map();
    private readonly pendingCanUseToolByToolCallKey: Map<
        string,
        {
            requestId: string;
            toolCallId: string;
            toolName: string;
            toolInput: Record<string, unknown>;
            suggestions?: unknown;
        }
    > = new Map();
    private readonly seenCanUseToolByLocalSessionId: Set<string> = new Set();
    
    // Promise resolvers for pending permission confirmations
    // This allows handleControlRequest to block until user confirms/denies
    private readonly pendingConfirmationResolvers: Map<
        string,
        {
            resolve: () => void;
            reject: (error: Error) => void;
        }
    > = new Map();
    
    
    // Persistent sessions for bidirectional streaming
    private readonly persistentSessions: Map<string, PersistentSession> = new Map();
    private static readonly MAX_PERSISTENT_SESSIONS = 3;

    constructor(private options: ClaudeCodeOptions) {
        super();
    }

    /**
     * Clean up all session-related state maps for a given session.
     */
    private cleanupSession(sessionId: string): void {
        this.processesByLocalSessionId.delete(sessionId);
        this.toolNameByIdByLocalSessionId.delete(sessionId);
        this.subagentRunMetaByIdByLocalSessionId.delete(sessionId);
        this.receivedStreamingTextByLocalSessionId.delete(sessionId);
        this.receivedStreamingThinkingByLocalSessionId.delete(sessionId);
        this.lastToolIdByLocalSessionId.delete(sessionId);
        this.seenCanUseToolByLocalSessionId.delete(sessionId);
        this.emittedToolUseIdsByLocalSessionId.delete(sessionId);
        // Clear thinking throttle timer
        const throttleTimer = this.thinkingThrottleTimerByLocalSessionId.get(sessionId);
        if (throttleTimer) clearTimeout(throttleTimer);
        this.thinkingThrottleTimerByLocalSessionId.delete(sessionId);
        this.thinkingLastEmitTimeByLocalSessionId.delete(sessionId);

        for (const [key, resolver] of this.pendingConfirmationResolvers.entries()) {
            if (key.startsWith(`${sessionId}:`)) {
                resolver.resolve();
                this.pendingConfirmationResolvers.delete(key);
                this.pendingCanUseToolByToolCallKey.delete(key);
            }
        }
    }

    /**
     * Bind an existing Claude Code CLI session id to a local session id so future prompts use `--resume`.
     * This is used to continue a conversation loaded from CLI history transcripts.
     */
    bindClaudeSessionId(localSessionId: string, claudeSessionId: string): void {
        if (!claudeSessionId || !claudeSessionId.trim()) return;
        this.claudeSessionIdByLocalSessionId.set(localSessionId, claudeSessionId.trim());
    }

    private logThinking(sessionId: string, message: string): void {
        if (!this.debugThinking) return;
        console.error(`[ClaudeCode][thinking] ${sessionId} ${message}`);
    }

    updateSettings(settings: ClaudeCodeSettings): void {
        if (settings.model !== undefined) {
            this.settings.model = settings.model;
        }
        if (settings.planMode !== undefined) {
            this.settings.planMode = settings.planMode;
            // Sync planMode to permissionMode for backward compatibility
            if (settings.planMode && !settings.permissionMode) {
                this.settings.permissionMode = 'plan';
            }
        }
        if (settings.permissionMode !== undefined) {
            this.settings.permissionMode = settings.permissionMode;
        }
        if (settings.fallbackModel !== undefined) {
            this.settings.fallbackModel = settings.fallbackModel;
        }
        if (settings.appendSystemPrompt !== undefined) {
            this.settings.appendSystemPrompt = settings.appendSystemPrompt;
        }
        if (settings.mcpConfigPath !== undefined) {
            this.settings.mcpConfigPath = settings.mcpConfigPath;
        }
        if (settings.allowedTools !== undefined) {
            this.settings.allowedTools = settings.allowedTools;
        }
        if (settings.disallowedTools !== undefined) {
            this.settings.disallowedTools = settings.disallowedTools;
        }
        if (settings.additionalDirs !== undefined) {
            this.settings.additionalDirs = settings.additionalDirs;
        }
        if (settings.maxThinkingTokens !== undefined) {
            this.settings.maxThinkingTokens = settings.maxThinkingTokens;
        }
    }

    /**
     * Send a prompt to Claude Code CLI
     */
    async prompt(sessionId: string, message: string, attachments?: Attachment[]): Promise<void> {
        if (this.processesByLocalSessionId.has(sessionId)) {
            throw new Error(`Session ${sessionId} already has a running Claude process`);
        }

        const fullMessage = attachments
            ? `${message}\n\nAttachments:\n${attachments.map((a) => `${a.name}: ${a.content}`).join('\n')}`
            : message;

        // Pass the user message via -p flag.
        // We do NOT use --input-format stream-json for the user message because combining
        // -p "" with --input-format stream-json and --resume SESSION_ID causes the CLI to
        // process the empty -p as a spurious first turn, emitting `result` (which kills
        // the process) before it ever reads the real message from stdin.
        // stdin is kept open exclusively for control_request/control_response exchanges
        // (--permission-prompt-tool stdio).
        const args: string[] = [
            '-p',
            fullMessage,
            '--output-format',
            'stream-json',
            '--verbose',
            '--include-partial-messages',
            // Enable structured permission prompts over stdio so we can block on UI approval
            // via control_request(can_use_tool) / control_response.
            '--permission-prompt-tool',
            'stdio',
        ];

        if (this.settings.model) {
            args.push('--model', this.settings.model);
        }

        // Permission mode: handles plan mode and other permission configurations
        const permissionMode = this.settings.permissionMode || (this.settings.planMode ? 'plan' : 'default');
        if (permissionMode && permissionMode !== 'default') {
            args.push('--permission-mode', permissionMode);
        }

        // Fallback model for when primary model is overloaded
        if (this.settings.fallbackModel) {
            args.push('--fallback-model', this.settings.fallbackModel);
        }

        // Custom system prompt (appended to default)
        if (this.settings.appendSystemPrompt) {
            args.push('--append-system-prompt', this.settings.appendSystemPrompt);
        }

        // MCP server configuration
        if (this.settings.mcpConfigPath) {
            args.push('--mcp-config', this.settings.mcpConfigPath);
        }

        // Tool permissions: allowed tools
        if (this.settings.allowedTools && this.settings.allowedTools.length > 0) {
            args.push('--allowedTools', this.settings.allowedTools.join(' '));
        } else if (process.env.VCODER_ALLOWED_TOOLS && process.env.VCODER_ALLOWED_TOOLS.trim().length > 0) {
            // Fallback to environment variable
            args.push('--allowedTools', process.env.VCODER_ALLOWED_TOOLS.trim());
        }

        // Tool permissions: disallowed tools (default: disable interactive questions)
        const disallowedTools = this.settings.disallowedTools || ['AskUserQuestion'];
        if (disallowedTools.length > 0) {
            args.push('--disallowed-tools', disallowedTools.join(' '));
        }

        // Additional directories to allow tool access
        if (this.settings.additionalDirs && this.settings.additionalDirs.length > 0) {
            for (const dir of this.settings.additionalDirs) {
                args.push('--add-dir', dir);
            }
        }

        // Claude's headless flow is: `claude -p "<prompt>" --continue` or `--resume <session_id>`.
        // Keep ordering aligned with docs (flags after `-p`) to avoid CLI parsing edge-cases.
        // Prefer `--resume` so multiple conversations don't collide.
        const claudeSessionId = this.claudeSessionIdByLocalSessionId.get(sessionId);
        if (claudeSessionId) {
            args.push('--resume', claudeSessionId);
        } else if (this.startedLocalSessions.has(sessionId)) {
            args.push('--continue');
        }

        this.logThinking(sessionId, `spawn include_partial=${args.includes('--include-partial-messages')} max_tokens=${this.settings.maxThinkingTokens ?? 'unset'}`);

        // Pre-flight environment validation
        const preflight = await preflightCheck();
        if (!preflight.ok) {
            const failed = preflight.checks.filter((c) => c.status === 'fail');
            const msg = failed.map((c) => c.message).join('; ');
            throw new Error(`Preflight check failed: ${msg}`);
        }
        for (const check of preflight.checks) {
            if (check.status === 'warn') {
                console.error(`[ClaudeCode] Preflight warning: ${check.name} - ${check.message}`);
            }
        }

        // Start Claude Code CLI subprocess
        const claudePath = this.resolveClaudePath();
        console.error(`[ClaudeCode] Spawning session ${sessionId} with args:`, args.join(' '));

        const child = spawn(claudePath, args, {
            cwd: this.options.workingDirectory,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                ...process.env,
                TERM: 'xterm-256color',
                HOME: process.env.HOME || os.homedir(),
                ...(this.settings.maxThinkingTokens ? { MAX_THINKING_TOKENS: String(this.settings.maxThinkingTokens) } : {}),
            },
        });

        // IMPORTANT: We keep stdin open to support interactive permissions!
        // The user message is already passed via -p; stdin is used only for
        // control_request/control_response exchanges (permission prompts).

        // Setup Listeners
        this.processesByLocalSessionId.set(sessionId, child);
        this.startedLocalSessions.add(sessionId);
        this.toolNameByIdByLocalSessionId.set(sessionId, new Map());
        this.subagentRunMetaByIdByLocalSessionId.set(sessionId, new Map());
        this.emittedToolUseIdsByLocalSessionId.set(sessionId, new Set());
        this.lastToolIdByLocalSessionId.set(sessionId, ''); // Reset last tool
        this.setupProcessListeners(sessionId, child);

        return new Promise((resolve, reject) => {
            child.on('close', (code) => {
                // Exit code 143 = SIGTERM (128+15), 137 = SIGKILL (128+9)
                // These indicate successful cancellation, not errors
                if (code === 0 || code === 143 || code === 137 || code === null) {
                     this.emit('complete', sessionId);
                     resolve();
                } else {
                     reject(new Error(`Exit code ${code}`));
                }
                this.cleanupSession(sessionId);
            });
            child.on('error', (err) => {
                this.cleanupSession(sessionId);
                reject(err);
            });
        });
    }

    private resolveClaudePath(): string {
        return resolveClaudePath();
    }

    private setupProcessListeners(sessionId: string, process: ChildProcess) {
        const parser = new JsonStreamParser();
        let stderrTail = '';

        process.stdout?.setEncoding('utf8');
        process.stdout?.on('data', (chunk: string) => {
            const jsonTexts = parser.feed(chunk);
            for (const jsonText of jsonTexts) {
                try {
                    const event = JSON.parse(jsonText);
                    if (this.debugThinking) {
                        const eventType = event.type as string;
                        const deltaType = (event.delta as Record<string, unknown>)?.type;
                        console.error(`[ClaudeCode][event] type=${eventType}${deltaType ? ` delta.type=${deltaType}` : ''}`);
                    }
                    this.handleClaudeCodeEvent(sessionId, event);
                } catch (err) {
                    console.error('[ClaudeCode] JSON parse error:', err);
                }
            }
        });

        process.stderr?.on('data', (data) => {
            const text = data.toString();
            stderrTail = (stderrTail + text).slice(-8000);
            console.error(`[ClaudeCode stderr]`, text);

            // If the CLI supports protocol-level can_use_tool, ignore stderr heuristics to avoid
            // showing an approval UI after the tool already failed.
            const allowStderrPermissionHeuristics = !this.seenCanUseToolByLocalSessionId.has(sessionId);

            // Detect permission requests in stderr
            if (allowStderrPermissionHeuristics) {
                const lastToolId = this.lastToolIdByLocalSessionId.get(sessionId);
                if (lastToolId) {
                    // If we're already handling a protocol-level can_use_tool request for this tool,
                    // ignore any best-effort stderr parsing to avoid duplicate prompts.
                    if (!this.pendingCanUseToolByToolCallKey.has(`${sessionId}:${lastToolId}`)) {
                        const toolName = this.toolNameByIdByLocalSessionId.get(sessionId)?.get(lastToolId);
                        const permissionRequest = this.detectPermissionRequest(text, toolName);
                        if (permissionRequest) {
                            // Emit confirmation_request
                            const confirmUpdate: ConfirmationRequestUpdate = {
                                id: `confirm-${lastToolId}-${Date.now()}`,
                                type: permissionRequest.type,
                                toolCallId: lastToolId,
                                summary: permissionRequest.summary,
                                details: permissionRequest.details,
                            };
                            this.emit('update', sessionId, confirmUpdate, 'confirmation_request');
                            console.error(
                                `[ClaudeCode] Permission request detected via stderr for tool ${lastToolId}: ${permissionRequest.summary}`
                            );
                        }
                    }
                }
            }

            const stderrError = matchStderrError(text);
            if (stderrError) {
                this.emit('update', sessionId, stderrError, 'error');
            }
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
        // Capture the CLI session id when present, so we can `--resume` later.
        const maybeSessionIdDirect =
            (event.session_id as string | undefined) ||
            (event.sessionId as string | undefined) ||
            (event.sessionID as string | undefined);
        const maybeSessionFromSessionObject = (event.session as { id?: unknown } | undefined)?.id;
        const maybeSessionFromMeta =
            ((event.meta as { session_id?: unknown } | undefined)?.session_id ??
                (event.metadata as { session_id?: unknown } | undefined)?.session_id) as unknown;

        const maybeSessionId =
            (typeof maybeSessionIdDirect === 'string' && maybeSessionIdDirect) ||
            (typeof maybeSessionFromSessionObject === 'string' && maybeSessionFromSessionObject) ||
            (typeof maybeSessionFromMeta === 'string' && maybeSessionFromMeta) ||
            undefined;

        if (maybeSessionId && typeof maybeSessionId === 'string') {
            this.claudeSessionIdByLocalSessionId.set(sessionId, maybeSessionId);
        }

        const type = event.type as string;

        switch (type) {
            case 'stream_event': {
                const inner =
                    (event.event as Record<string, unknown> | undefined) ??
                    (event.data as Record<string, unknown> | undefined) ??
                    (event.stream_event as Record<string, unknown> | undefined) ??
                    undefined;
                if (inner && typeof inner === 'object') {
                    this.handleClaudeCodeEvent(sessionId, inner);
                } else if (typeof event.event === 'string') {
                    try {
                        const parsed = JSON.parse(event.event) as Record<string, unknown>;
                        this.handleClaudeCodeEvent(sessionId, parsed);
                    } catch {
                        // ignore
                    }
                }
                break;
            }

            case 'control_request': {
                void this.handleControlRequest(sessionId, event).catch((err) => {
                    console.error('[ClaudeCode] Failed handling control_request:', err);
                });
                break;
            }

            case 'system': {
                // Init event, log but don't emit
                console.error('[ClaudeCode] System event:', event.subtype);
                break;
            }

            case 'user': {
                // In stream-json, tool results are emitted as a "user" message containing tool_result blocks.
                const message = event.message as Record<string, unknown> | undefined;
                const content = message?.content as Array<Record<string, unknown>> | undefined;
                if (content && Array.isArray(content)) {
                    for (const block of content) {
                        if (block.type !== 'tool_result') continue;
                        const toolUseId = block.tool_use_id as string | undefined;
                        if (!toolUseId) continue;

                        const isError = (block.is_error as boolean | undefined) === true;
                        const result = block.content;
                        // Clear last tool ID on result
                        // this.lastToolIdByLocalSessionId.set(sessionId, ''); 
                        // Actually, keep it until next tool use? No, clear it to avoid stale checks.
                        
                        this.emitToolResult(sessionId, toolUseId, result, isError ? this.formatToolError(result) : undefined);
                    }
                }
                break;
            }

            case 'assistant': {
                // Parse message content
                const message = event.message as Record<string, unknown> | undefined;
                if (!message) break;

                const content = message.content as Array<Record<string, unknown>> | undefined;
                if (!content || !Array.isArray(content)) break;

                // Check if we've already received streaming content for this session
                // If so, skip corresponding blocks to avoid duplication
                const receivedStreamingText = this.receivedStreamingTextByLocalSessionId.get(sessionId) ?? false;
                const receivedStreamingThinking = this.receivedStreamingThinkingByLocalSessionId.get(sessionId) ?? false;
                if (this.debugThinking && receivedStreamingText) {
                    console.error(`[ClaudeCode] assistant event: skipping text blocks (already streamed)`);
                }
                if (this.debugThinking && receivedStreamingThinking) {
                    console.error(`[ClaudeCode] assistant event: skipping thinking blocks (already streamed)`);
                }

                for (const block of content) {
                    if (block.type === 'thinking' && typeof block.thinking === 'string' && block.thinking) {
                        // Skip if we already sent this via content_block_delta/content_block_stop
                        if (receivedStreamingThinking) continue;
                        this.logThinking(sessionId, `assistant_block len=${block.thinking.length}`);
                        const update: ThoughtUpdate = {
                            content: block.thinking,
                            isComplete: true,
                        };
                        this.emit('update', sessionId, update, 'thought');
                    } else if (block.type === 'text' && typeof block.text === 'string' && block.text) {
                        // Only emit text if we haven't received streaming updates
                        // This handles the case where CLI doesn't support streaming
                        if (!receivedStreamingText) {
                            if (this.debugThinking) {
                                console.error(`[ClaudeCode] assistant event: emitting text (no streaming) len=${block.text.length}`);
                            }
                            const update: TextUpdate = {
                                text: block.text,
                            };
                            this.emit('update', sessionId, update, 'text');
                        }
                    } else if (block.type === 'tool_use') {
                        const toolName = block.name as string | undefined;
                        const toolId = block.id as string | undefined;
                        const toolInput = block.input as Record<string, unknown> | undefined;
                        if (!toolName || !toolId || !toolInput) continue;

                        // Track last tool ID for permission handling in stderr
                        this.lastToolIdByLocalSessionId.set(sessionId, toolId);

                        this.emitToolUse(sessionId, toolName, toolInput, toolId);
                    }
                }

                // Reset streaming flags after processing assistant message
                // (for next turn in multi-turn conversations)
                this.receivedStreamingTextByLocalSessionId.delete(sessionId);
                this.receivedStreamingThinkingByLocalSessionId.delete(sessionId);
                break;
            }

            case 'tool': {
                // Tool invocation
                const tool = event.tool as { name: string; input: Record<string, unknown>; id?: string } | undefined;
                if (!tool) break;

                const toolName = tool.name || 'unknown';
                const toolId = tool.id || (event.uuid as string) || crypto.randomUUID();
                
                // Track last tool ID
                this.lastToolIdByLocalSessionId.set(sessionId, toolId);
                
                this.emitToolUse(sessionId, toolName, tool.input, toolId);
                break;
            }

            case 'tool_result': {
                const toolResult = event.tool_result as { content?: unknown; error?: string; id?: string } | undefined;
                const toolId = toolResult?.id || (event.tool_use_id as string) || '';
                this.emitToolResult(sessionId, toolId, toolResult?.content, toolResult?.error);
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
                
                // For one-shot prompt sessions, 'result' indicates the end of the turn.
                // Since we are keeping stdin open, the process won't exit by itself.
                // We must forcibly kill the process to signal completion to 'prompt' promise.
                if (this.processesByLocalSessionId.has(sessionId)) {
                    console.error(`[ClaudeCode] One-shot session ${sessionId} completed, closing process.`);
                    const child = this.processesByLocalSessionId.get(sessionId);
                    child?.kill('SIGTERM'); 
                }
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

            // Streaming thinking events (with --include-partial-messages)
            case 'content_block_start': {
                const contentBlock = event.content_block as Record<string, unknown> | undefined;
                if (contentBlock?.type === 'thinking') {
                    // Start of a new thinking block - initialize accumulator
                    this.thinkingContentByLocalSessionId.set(sessionId, '');
                    this.logThinking(sessionId, 'stream_start');
                }
                break;
            }

            case 'content_block_delta': {
                const delta = event.delta as Record<string, unknown> | undefined;
                if (delta?.type === 'thinking_delta' && typeof delta.thinking === 'string') {
                    // Accumulate thinking content
                    const existing = this.thinkingContentByLocalSessionId.get(sessionId) || '';
                    const next = existing + delta.thinking;
                    this.thinkingContentByLocalSessionId.set(sessionId, next);
                    this.receivedStreamingThinkingByLocalSessionId.set(sessionId, true);
                    this.logThinking(sessionId, `stream_delta len=${delta.thinking.length} total=${next.length}`);

                    // Throttled emit: only send IPC update at most every 150ms
                    const now = Date.now();
                    const lastEmit = this.thinkingLastEmitTimeByLocalSessionId.get(sessionId) ?? 0;
                    const elapsed = now - lastEmit;

                    if (elapsed >= 150) {
                        // Enough time has passed, emit immediately
                        this.thinkingLastEmitTimeByLocalSessionId.set(sessionId, now);
                        const existingTimer = this.thinkingThrottleTimerByLocalSessionId.get(sessionId);
                        if (existingTimer) {
                            clearTimeout(existingTimer);
                            this.thinkingThrottleTimerByLocalSessionId.delete(sessionId);
                        }
                        const update: ThoughtUpdate = {
                            content: next,
                            isComplete: false,
                        };
                        this.emit('update', sessionId, update, 'thought');
                    } else {
                        // Schedule a delayed emit if not already scheduled
                        if (!this.thinkingThrottleTimerByLocalSessionId.has(sessionId)) {
                            const timer = setTimeout(() => {
                                this.thinkingThrottleTimerByLocalSessionId.delete(sessionId);
                                this.thinkingLastEmitTimeByLocalSessionId.set(sessionId, Date.now());
                                const accumulated = this.thinkingContentByLocalSessionId.get(sessionId) || '';
                                if (accumulated) {
                                    const delayedUpdate: ThoughtUpdate = {
                                        content: accumulated,
                                        isComplete: false,
                                    };
                                    this.emit('update', sessionId, delayedUpdate, 'thought');
                                }
                            }, 150 - elapsed);
                            this.thinkingThrottleTimerByLocalSessionId.set(sessionId, timer);
                        }
                    }
                } else if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
                    // Streaming text content - emit incremental updates for typewriter effect
                    // Mark that we've received streaming text, so we can skip duplicates in assistant event
                    this.receivedStreamingTextByLocalSessionId.set(sessionId, true);
                    if (this.debugThinking) {
                        console.error(`[ClaudeCode][stream] text_delta len=${delta.text.length}`);
                    }
                    const update: TextUpdate = {
                        text: delta.text,
                    };
                    this.emit('update', sessionId, update, 'text');
                } else if (delta?.type === 'input_json_delta') {
                    // Tool input streaming delta; handled by assistant event's tool_use block
                } else if (delta) {
                    console.error(`[ClaudeCode] Unhandled delta type: ${delta.type}`);
                }
                break;
            }

            case 'content_block_stop': {
                // Clear any pending throttle timer
                const pendingTimer = this.thinkingThrottleTimerByLocalSessionId.get(sessionId);
                if (pendingTimer) {
                    clearTimeout(pendingTimer);
                    this.thinkingThrottleTimerByLocalSessionId.delete(sessionId);
                }
                this.thinkingLastEmitTimeByLocalSessionId.delete(sessionId);

                // Finalize thinking block if we were accumulating
                const thinking = this.thinkingContentByLocalSessionId.get(sessionId);
                if (thinking !== undefined) {
                    // Emit final complete update if there was content
                    if (thinking.length > 0) {
                        this.logThinking(sessionId, `stream_end total=${thinking.length}`);
                        const update: ThoughtUpdate = {
                            content: thinking,
                            isComplete: true,
                        };
                        this.emit('update', sessionId, update, 'thought');
                    }
                    this.thinkingContentByLocalSessionId.delete(sessionId);
                }
                break;
            }

            case 'message_start':
            case 'message_delta':
            case 'message_stop':
                // Claude API message-level envelope events; safely ignored
                break;

            default:
                // Don't spam logs for harmless new event types; keep as debug.
                console.error('[ClaudeCode] Unhandled event type:', type);
        }
    }

    private async handleControlRequest(sessionId: string, event: Record<string, unknown>): Promise<void> {
        const requestId = event.request_id as string | undefined;
        const request = event.request as Record<string, unknown> | undefined;
        const subtype = request?.subtype as string | undefined;

        if (!requestId || !request || !subtype) {
            return;
        }

        if (subtype !== 'can_use_tool') {
            // Best-effort: immediately ack unknown control requests so we don't hang.
            this.sendControlResponse(sessionId, requestId, {});
            return;
        }

        this.seenCanUseToolByLocalSessionId.add(sessionId);

        const toolName = (request.tool_name as string | undefined) ?? 'Tool';
        const toolInput = (request.input as Record<string, unknown> | undefined) ?? {};
        const suggestions = request.permission_suggestions ?? request.suggestions;
        const toolCallId =
            (request.tool_use_id as string | undefined) ??
            (request.toolUseID as string | undefined) ??
            this.lastToolIdByLocalSessionId.get(sessionId) ??
            requestId;

        const key = `${sessionId}:${toolCallId}`;
        this.pendingCanUseToolByToolCallKey.set(key, { requestId, toolCallId, toolName, toolInput, suggestions });

        // Ensure the tool appears in UI even if tool_use was missed.
        this.emitToolUse(sessionId, toolName, toolInput, toolCallId);

        // Emit a structured confirmation request so the webview can block until user decides.
        const confirmUpdate = this.buildConfirmationRequestUpdate(toolCallId, toolName, toolInput);
        this.emit('update', sessionId, confirmUpdate, 'confirmation_request');

        // Block until user confirms or denies in the UI.
        // The confirmTool method will resolve this promise when user makes a decision.
        return new Promise<void>((resolve, reject) => {
            this.pendingConfirmationResolvers.set(key, { resolve, reject });

            // Timeout after 10 minutes to prevent indefinite blocking
            const timeoutId = setTimeout(() => {
                if (this.pendingConfirmationResolvers.has(key)) {
                    console.warn(`[ClaudeCode] Permission confirmation timed out for ${toolCallId}`);
                    this.pendingConfirmationResolvers.delete(key);
                    this.pendingCanUseToolByToolCallKey.delete(key);
                    // Send deny response on timeout
                    this.sendControlResponse(sessionId, requestId, {
                        behavior: 'deny',
                        message: 'Permission confirmation timed out',
                        interrupt: true,
                    });
                    resolve();
                }
            }, 10 * 60 * 1000);

            // Store timeout ID for cleanup
            const originalResolver = this.pendingConfirmationResolvers.get(key)!;
            this.pendingConfirmationResolvers.set(key, {
                resolve: () => {
                    clearTimeout(timeoutId);
                    originalResolver.resolve();
                },
                reject: (error: Error) => {
                    clearTimeout(timeoutId);
                    originalResolver.reject(error);
                },
            });
        });
    }

    private sendControlResponse(sessionId: string, requestId: string, response: unknown): void {
        // Try persistent session first
        const persistentSession = this.persistentSessions.get(sessionId);
        if (persistentSession) {
            persistentSession.sendControlResponse(requestId, response);
            return;
        }

        // Fall back to one-shot session
        const process = this.processesByLocalSessionId.get(sessionId);
        if (!process?.stdin || process.stdin.destroyed || process.stdin.writableEnded) {
            console.warn(`[ClaudeCode] sendControlResponse: no stdin for session ${sessionId}`);
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
        process.stdin.write(JSON.stringify(payload) + '\n');
    }

    private buildConfirmationRequestUpdate(
        toolCallId: string,
        toolName: string,
        toolInput: Record<string, unknown>
    ): ConfirmationRequestUpdate {
        const lower = toolName.toLowerCase();

        if (lower === 'bash' || lower.includes('bash')) {
            const command =
                (typeof toolInput.command === 'string' && toolInput.command) ||
                (typeof toolInput.cmd === 'string' && toolInput.cmd) ||
                '';
            return {
                id: `confirm-${toolCallId}-${Date.now()}`,
                type: 'bash',
                toolCallId,
                summary: `执行命令需要权限确认: ${command.slice(0, 60)}${command.length > 60 ? '...' : ''}`,
                details: {
                    command,
                    riskLevel: this.assessBashRisk(command),
                    riskReasons: this.getBashRiskReasons(command),
                },
            };
        }

        if (lower === 'write' || lower === 'edit' || lower.includes('write') || lower.includes('edit')) {
            const filePath =
                (typeof toolInput.file_path === 'string' && toolInput.file_path) ||
                (typeof toolInput.path === 'string' && toolInput.path) ||
                '';

            let diff: string | undefined;
            const proposedContent = typeof toolInput.content === 'string' ? toolInput.content : undefined;
            if (filePath && typeof proposedContent === 'string' && Buffer.byteLength(proposedContent, 'utf8') <= 1 * 1024 * 1024) {
                const result = computeFileChangeDiff({
                    workingDirectory: this.options.workingDirectory,
                    filePath,
                    proposedContent,
                });
                diff = result.diff || undefined;
            }
            return {
                id: `confirm-${toolCallId}-${Date.now()}`,
                type: 'file_write',
                toolCallId,
                summary: filePath ? `写入文件需要权限确认: ${filePath}` : '写入文件需要权限确认',
                details: {
                    filePath,
                    diff,
                    riskLevel: 'medium',
                },
            };
        }

        if (lower.includes('delete') || lower.includes('remove')) {
            const filePath =
                (typeof toolInput.file_path === 'string' && toolInput.file_path) ||
                (typeof toolInput.path === 'string' && toolInput.path) ||
                '';
            return {
                id: `confirm-${toolCallId}-${Date.now()}`,
                type: 'file_delete',
                toolCallId,
                summary: filePath ? `删除文件需要权限确认: ${filePath}` : '删除文件需要权限确认',
                details: {
                    filePath,
                    riskLevel: 'high',
                },
            };
        }

        if (lower.startsWith('mcp__') || lower.startsWith('mcp_')) {
            return {
                id: `confirm-${toolCallId}-${Date.now()}`,
                type: 'mcp',
                toolCallId,
                summary: `MCP 工具调用需要权限确认: ${toolName}`,
                details: {
                    riskLevel: 'medium',
                },
            };
        }

        return {
            id: `confirm-${toolCallId}-${Date.now()}`,
            type: 'dangerous',
            toolCallId,
            summary: `工具调用需要权限确认: ${toolName}`,
            details: {
                riskLevel: 'medium',
            },
        };
    }

    private formatToolError(result: unknown): string {
        if (typeof result === 'string' && result.trim().length > 0) return result;
        try {
            return JSON.stringify(result);
        } catch {
            return 'Tool error';
        }
    }

    private inferCurrentTaskId(tasks: TaskListUpdate['tasks']): string | undefined {
        const visit = (items: TaskListUpdate['tasks']): string | undefined => {
            for (const item of items) {
                if (item.status === 'in_progress') return item.id;
                if (item.children) {
                    const child = visit(item.children);
                    if (child) return child;
                }
            }
            return undefined;
        };
        return visit(tasks);
    }

    private firstLine(text: string): string {
        const line = text.split('\n', 1)[0] ?? '';
        return line.trim();
    }

    private formatSubagentRunTitle(toolInput: Record<string, unknown>): { title: string; subagentType?: string } {
        const description = typeof toolInput.description === 'string' ? toolInput.description.trim() : '';
        const prompt = typeof toolInput.prompt === 'string' ? this.firstLine(toolInput.prompt) : '';
        const subagentType =
            typeof toolInput.subagent_type === 'string'
                ? toolInput.subagent_type
                : typeof toolInput.subagentType === 'string'
                  ? toolInput.subagentType
                  : typeof toolInput.subagent_name === 'string'
                    ? toolInput.subagent_name
                    : typeof toolInput.subagentName === 'string'
                      ? toolInput.subagentName
                      : typeof toolInput.agent_type === 'string'
                        ? toolInput.agent_type
                        : typeof toolInput.agentType === 'string'
                          ? toolInput.agentType
                          : typeof toolInput.agent_name === 'string'
                            ? toolInput.agent_name
                            : typeof toolInput.agentName === 'string'
                              ? toolInput.agentName
                              : undefined;

        return { title: description || prompt || 'Task', subagentType };
    }

    private emitSubagentRun(sessionId: string, update: SubagentRunUpdate): void {
        this.emit('update', sessionId, update, 'subagent_run');
    }

    private emitToolResult(sessionId: string, toolId: string, result: unknown, error?: string): void {
        const toolName = this.toolNameByIdByLocalSessionId.get(sessionId)?.get(toolId);
        // Some Claude CLI flows represent user-questions as tool errors; treat them as informational.
        if (toolName === 'AskUserQuestion') {
            error = undefined;
        }
        
        // Detect permission requests in tool results (fallback only).
        // When can_use_tool is available, tool permission should be handled through control_request/control_response.
        if (!this.seenCanUseToolByLocalSessionId.has(sessionId)) {
            if (!this.pendingCanUseToolByToolCallKey.has(`${sessionId}:${toolId}`)) {
                const permissionRequest = this.detectPermissionRequest(result, toolName);
                if (permissionRequest) {
                    // Emit confirmation_request instead of tool_result
                    const confirmUpdate: ConfirmationRequestUpdate = {
                        id: `confirm-${toolId}-${Date.now()}`,
                        type: permissionRequest.type,
                        toolCallId: toolId,
                        summary: permissionRequest.summary,
                        details: permissionRequest.details,
                    };
                    this.emit('update', sessionId, confirmUpdate, 'confirmation_request');
                    console.error(
                        `[ClaudeCode] Permission request detected for tool ${toolId}: ${permissionRequest.summary}`
                    );
                    return; // Don't emit tool_result for permission requests
                }
            }
        }
        
        const update: ToolResultUpdate = {
            id: toolId,
            result,
            error,
        };
        this.emit('update', sessionId, update, 'tool_result');

        if (toolName === 'Task') {
            const meta = this.subagentRunMetaByIdByLocalSessionId.get(sessionId)?.get(toolId);
            const title = meta?.title ?? 'Task';
            const subagentType = meta?.subagentType;
            const parentTaskId = meta?.parentTaskId;
            const input = meta?.input;

            const runUpdate: SubagentRunUpdate = {
                id: toolId,
                title,
                subagentType,
                parentTaskId,
                input,
                status: error ? 'failed' : 'completed',
                result,
                error,
            };
            this.emitSubagentRun(sessionId, runUpdate);
            this.subagentRunMetaByIdByLocalSessionId.get(sessionId)?.delete(toolId);
        }
    }

    /**
     * Detect if a tool result indicates a permission request from Claude CLI.
     * Returns parsed permission info if detected, null otherwise.
     */
    private detectPermissionRequest(
        result: unknown, 
        toolName?: string
    ): { type: ConfirmationType; summary: string; details: ConfirmationRequestUpdate['details'] } | null {
        // Convert result to string for pattern matching
        let text: string;
        if (typeof result === 'string') {
            text = result;
        } else if (result && typeof result === 'object') {
            try {
                text = JSON.stringify(result);
            } catch {
                return null;
            }
        } else {
            return null;
        }

        // Pattern: "Claude requested permissions to write to <path>"
        const writeMatch = text.match(/Claude requested permissions? to write to ([^\n,]+)/i);
        if (writeMatch) {
            const filePath = writeMatch[1].trim().replace(/['"]/g, '');
            return {
                type: 'file_write',
                summary: `写入文件需要权限确认: ${filePath}`,
                details: { 
                    filePath,
                    riskLevel: 'medium',
                },
            };
        }

        // Pattern: "Claude requested permissions to edit <path>"
        const editMatch = text.match(/Claude requested permissions? to edit ([^\n,]+)/i);
        if (editMatch) {
            const filePath = editMatch[1].trim().replace(/['"]/g, '');
            return {
                type: 'file_write',
                summary: `编辑文件需要权限确认: ${filePath}`,
                details: { 
                    filePath,
                    riskLevel: 'medium',
                },
            };
        }

        // Pattern: "Claude requested permissions to delete <path>"
        const deleteMatch = text.match(/Claude requested permissions? to delete ([^\n,]+)/i);
        if (deleteMatch) {
            const filePath = deleteMatch[1].trim().replace(/['"]/g, '');
            return {
                type: 'file_delete',
                summary: `删除文件需要权限确认: ${filePath}`,
                details: { 
                    filePath,
                    riskLevel: 'high',
                },
            };
        }

        // Pattern: "Claude requested permissions to run: <command>"
        const bashMatch = text.match(/Claude requested permissions? to run:?\s*([^\n]+)/i);
        if (bashMatch) {
            const command = bashMatch[1].trim();
            return {
                type: 'bash',
                summary: `执行命令需要权限确认: ${command.slice(0, 50)}${command.length > 50 ? '...' : ''}`,
                details: { 
                    command,
                    riskLevel: this.assessBashRisk(command),
                    riskReasons: this.getBashRiskReasons(command),
                },
            };
        }

        // Generic permission denial patterns
        if (text.includes("haven't granted it yet") || 
            text.includes("permission denied") ||
            text.includes("requires user permission") ||
            text.includes("waiting for user approval")) {
            // Infer type from tool name
            const inferredType = this.inferConfirmationType(toolName);
            return {
                type: inferredType,
                summary: '操作需要权限确认',
                details: {
                    riskLevel: 'medium',
                },
            };
        }

        return null;
    }

    /**
     * Infer confirmation type from tool name
     */
    private inferConfirmationType(toolName?: string): ConfirmationType {
        if (!toolName) return 'dangerous';
        const name = toolName.toLowerCase();
        
        if (name === 'bash' || name === 'run_command' || name.includes('bash')) {
            return 'bash';
        }
        if (name === 'write' || name === 'edit' || name.includes('write') || name.includes('edit')) {
            return 'file_write';
        }
        if (name.includes('delete') || name.includes('remove')) {
            return 'file_delete';
        }
        if (name.startsWith('mcp__') || name.startsWith('mcp_')) {
            return 'mcp';
        }
        
        return 'dangerous';
    }

    /**
     * Assess risk level of a bash command
     */
    private assessBashRisk(command: string): 'low' | 'medium' | 'high' {
        const lowerCmd = command.toLowerCase();
        
        // High risk patterns
        if (lowerCmd.includes('sudo') || 
            lowerCmd.includes('rm -rf') ||
            lowerCmd.includes('rm -r') ||
            lowerCmd.includes('> /') ||
            lowerCmd.includes('chmod') ||
            lowerCmd.includes('chown') ||
            lowerCmd.includes('mkfs') ||
            lowerCmd.includes('dd if=')) {
            return 'high';
        }
        
        // Medium risk patterns
        if (lowerCmd.includes('npm publish') ||
            lowerCmd.includes('npm install') ||
            lowerCmd.includes('pip install') ||
            lowerCmd.includes('yarn add') ||
            lowerCmd.includes('curl') ||
            lowerCmd.includes('wget') ||
            lowerCmd.includes('git push')) {
            return 'medium';
        }
        
        return 'low';
    }

    /**
     * Get risk reasons for a bash command
     */
    private getBashRiskReasons(command: string): string[] {
        const reasons: string[] = [];
        const lowerCmd = command.toLowerCase();
        
        if (lowerCmd.includes('sudo')) reasons.push('命令包含 sudo 提权');
        if (lowerCmd.includes('rm ')) reasons.push('会删除文件');
        if (lowerCmd.includes('node_modules')) reasons.push('会修改 node_modules 目录');
        if (lowerCmd.includes('npm publish')) reasons.push('会发布包到 npm registry');
        if (lowerCmd.includes('|') || lowerCmd.includes('&&')) reasons.push('命令包含管道或链式操作');
        if (lowerCmd.includes('curl') || lowerCmd.includes('wget')) reasons.push('会访问网络');
        if (lowerCmd.includes('git push')) reasons.push('会推送代码到远程仓库');
        
        return reasons;
    }

    private emitToolUse(sessionId: string, toolName: string, toolInput: Record<string, unknown>, toolId: string): void {
        // Dedup: skip if we've already emitted this tool_use ID
        let emittedIds = this.emittedToolUseIdsByLocalSessionId.get(sessionId);
        if (!emittedIds) {
            emittedIds = new Set();
            this.emittedToolUseIdsByLocalSessionId.set(sessionId, emittedIds);
        }
        if (emittedIds.has(toolId)) return;
        emittedIds.add(toolId);

        this.toolNameByIdByLocalSessionId.get(sessionId)?.set(toolId, toolName);

        if (toolName === 'Task') {
            const { title, subagentType } = this.formatSubagentRunTitle(toolInput);
            const parentTaskId = this.taskListByLocalSessionId.get(sessionId)?.currentTaskId;

            this.subagentRunMetaByIdByLocalSessionId.get(sessionId)?.set(toolId, {
                title,
                subagentType,
                parentTaskId,
                input: toolInput,
            });

            const runUpdate: SubagentRunUpdate = {
                id: toolId,
                title,
                subagentType,
                parentTaskId,
                status: 'running',
                input: toolInput,
            };
            this.emitSubagentRun(sessionId, runUpdate);
        }

        // Handle specific tool types
        if (toolName === 'Write' || toolName === 'Edit') {
            // File write event - will be handled when result comes back
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
            this.emit('update', sessionId, update, 'tool_use');

            // Synthesize file_change notification for DiffManager
            // TODO: Handle 'Edit' tool which might provide diffs/patches instead of full content
            if (toolName === 'Write' && filePath && typeof proposedContent === 'string') {
                const fileType: FileChangeUpdate['type'] = didExist ? 'modified' : 'created';
                const fileUpdate: FileChangeUpdate = {
                    path: filePath,
                    type: fileType,
                    diff: diff || undefined,
                    content: proposedContent,
                    proposed: true,
                };
                this.emit('update', sessionId, fileUpdate, 'file_change');
            }
            return;
        }

        if (toolName === 'TodoWrite') {
            const raw = (toolInput?.tasks ??
                (toolInput as unknown as { todos?: unknown }).todos ??
                (toolInput as unknown as { items?: unknown }).items) as unknown;

            const normalizeTasks = (value: unknown): TaskListUpdate['tasks'] | undefined => {
                if (!Array.isArray(value)) return undefined;

                const coerceStatus = (status: unknown): TaskListUpdate['tasks'][number]['status'] => {
                    if (status === 'completed' || status === 'in_progress' || status === 'pending' || status === 'failed') return status;
                    return 'pending';
                };

                const visit = (item: unknown, index: number): TaskListUpdate['tasks'][number] | null => {
                    if (!item || typeof item !== 'object') return null;
                    const obj = item as Record<string, unknown>;
                    const id = (typeof obj.id === 'string' && obj.id) ? obj.id : `task-${index + 1}`;
                    const titleCandidate =
                        (typeof obj.title === 'string' && obj.title) ? obj.title :
                        (typeof obj.content === 'string' && obj.content) ? obj.content :
                        (typeof obj.text === 'string' && obj.text) ? obj.text :
                        undefined;
                    const title = titleCandidate ?? `Task ${index + 1}`;
                    const status = coerceStatus(obj.status);
                    const childrenRaw = obj.children ?? obj.subtasks;
                    const children = Array.isArray(childrenRaw)
                        ? childrenRaw
                              .map((c, i) => visit(c, i))
                              .filter((c): c is TaskListUpdate['tasks'][number] => c !== null)
                        : undefined;

                    return children && children.length > 0
                        ? { id, title, status, children }
                        : { id, title, status };
                };

                const tasks = value
                    .map((t, i) => visit(t, i))
                    .filter((t): t is TaskListUpdate['tasks'][number] => t !== null);

                return tasks.length > 0 ? tasks : undefined;
            };

            const tasks = normalizeTasks(raw);
            if (tasks && tasks.length > 0) {
                const currentTaskId = this.inferCurrentTaskId(tasks);
                const update: TaskListUpdate = {
                    tasks,
                    currentTaskId,
                };
                this.emit('update', sessionId, update, 'task_list');
                this.taskListByLocalSessionId.set(sessionId, update);
            }
            return;
        }

        if (toolName.startsWith('mcp__')) {
            const parts = toolName.split('__');
            const update: McpCallUpdate = {
                id: toolId,
                server: parts[1] || 'unknown',
                tool: parts.slice(2).join('__') || toolName,
                input: toolInput,
                status: 'running',
            };
            this.emit('update', sessionId, update, 'mcp_call');
            return;
        }

        // Default: represent tool invocations uniformly.
        const update: ToolUseUpdate = {
            id: toolId,
            name: toolName,
            input: toolInput,
            status: 'running',
        };
        this.emit('update', sessionId, update, 'tool_use');
    }

    async acceptFileChange(sessionId: string, path: string): Promise<void> {
        // Send a file_change update with proposed: false to clear the pending change from UI
        // The actual file write is handled by the tool execution (Write/Edit tool)
        // This just signals to the UI that the change has been accepted and should be removed from pending list
        const clearUpdate: FileChangeUpdate = {
            path,
            type: 'modified',
            proposed: false,
            sessionId,
        };
        this.emit('update', sessionId, {
            type: 'file_change',
            content: clearUpdate,
            sessionId,
        }, 'file_change');
    }

    async rejectFileChange(sessionId: string, path: string): Promise<void> {
        // Send a file_change update with proposed: false to clear the pending change from UI
        // No file write occurs when rejecting
        const clearUpdate: FileChangeUpdate = {
            path,
            type: 'modified',
            proposed: false,
            sessionId,
        };
        this.emit('update', sessionId, {
            type: 'file_change',
            content: clearUpdate,
            sessionId,
        }, 'file_change');
    }

    /**
     * Confirm or reject a tool operation that requires user approval.
     * This is the unified method for handling all permission confirmations.
     */
    async confirmTool(
        sessionId: string, 
        toolCallId: string, 
        confirmed: boolean,
        options?: { trustAlways?: boolean; editedContent?: string }
    ): Promise<void> {
        const key = `${sessionId}:${toolCallId}`;
        const pending = this.pendingCanUseToolByToolCallKey.get(key);
        if (!pending) {
            console.warn(`[ClaudeCode] confirmTool: no pending can_use_tool request for ${toolCallId}`);
            return;
        }

        const { requestId, toolInput, suggestions } = pending;

        if (confirmed) {
            const updatedInput: Record<string, unknown> = { ...toolInput };
            if (typeof options?.editedContent === 'string') {
                if (typeof updatedInput.content === 'string') {
                    updatedInput.content = options.editedContent;
                } else if (typeof updatedInput.new_text === 'string') {
                    updatedInput.new_text = options.editedContent;
                } else if (typeof updatedInput.text === 'string') {
                    updatedInput.text = options.editedContent;
                }
            }

            const response: Record<string, unknown> = {
                behavior: 'allow',
                updatedInput,
            };

            if (options?.trustAlways && Array.isArray(suggestions)) {
                response.updatedPermissions = suggestions;
            }

            this.sendControlResponse(sessionId, requestId, response);
        } else {
            this.sendControlResponse(sessionId, requestId, {
                behavior: 'deny',
                message: 'User denied',
                interrupt: true,
            });

            // Emit a tool_result with error to notify UI the tool was rejected
            const toolResultUpdate: ToolResultUpdate = {
                id: toolCallId,
                result: null,
                error: 'User denied permission',
            };
            this.emit('update', sessionId, toolResultUpdate, 'tool_result');
        }

        this.pendingCanUseToolByToolCallKey.delete(key);

        // Resolve the pending confirmation promise to unblock handleControlRequest
        const resolver = this.pendingConfirmationResolvers.get(key);
        if (resolver) {
            resolver.resolve();
            this.pendingConfirmationResolvers.delete(key);
        }
    }

    async cancel(sessionId: string): Promise<void> {
        const process = this.processesByLocalSessionId.get(sessionId);
        if (process) {
            try {
                process.kill('SIGTERM');
                console.error(`[ClaudeCode] Cancelled session ${sessionId}`);
            } catch (err) {
                console.error('[ClaudeCode] Failed to cancel process:', err);
            }
        }
        this.cleanupSession(sessionId);
    }

    async shutdown(): Promise<void> {
        // Shutdown one-shot processes
        for (const [sessionId, proc] of this.processesByLocalSessionId.entries()) {
            try {
                proc.kill('SIGTERM');
            } catch (err) {
                console.error('[ClaudeCode] Failed to kill process for session', sessionId, err);
            }
        }
        this.processesByLocalSessionId.clear();

        // Shutdown persistent sessions (concurrently)
        const stopPromises: Promise<void>[] = [];
        for (const [sessionId, session] of this.persistentSessions.entries()) {
            stopPromises.push(
                session.stop().catch((err) => {
                    console.error('[ClaudeCode] Failed to stop persistent session', sessionId, err);
                    // Force kill if graceful stop fails
                    session.kill();
                })
            );
        }
        await Promise.all(stopPromises);
        this.persistentSessions.clear();

        // Clean up all pending confirmation promises
        for (const [, resolver] of this.pendingConfirmationResolvers.entries()) {
            resolver.resolve();
        }
        this.pendingConfirmationResolvers.clear();
        this.pendingCanUseToolByToolCallKey.clear();
    }

    // =========================================================================
    // Persistent Session Mode (Bidirectional Streaming)
    // =========================================================================

    /**
     * Send a prompt using persistent session mode (bidirectional streaming).
     * The session is kept alive for subsequent messages.
     */
    async promptPersistent(sessionId: string, message: string, attachments?: Attachment[]): Promise<void> {
        let session = this.persistentSessions.get(sessionId);

        if (!session) {
            // Enforce multi-session limit: evict LRU if needed
            await this.evictLruSessionsIfNeeded();

            // Create new persistent session
            const settings: PersistentSessionSettings = {
                model: this.settings.model,
                permissionMode: this.settings.permissionMode,
                fallbackModel: this.settings.fallbackModel,
                appendSystemPrompt: this.settings.appendSystemPrompt,
                mcpConfigPath: this.settings.mcpConfigPath,
                allowedTools: this.settings.allowedTools,
                disallowedTools: this.settings.disallowedTools,
                additionalDirs: this.settings.additionalDirs,
                maxThinkingTokens: this.settings.maxThinkingTokens,
            };

            session = new PersistentSession(sessionId, this.options, settings);
            const resumeId = this.claudeSessionIdByLocalSessionId.get(sessionId);
            if (resumeId) {
                session.setResumeSessionId(resumeId);
            }
            this.forwardPersistentSessionEvents(sessionId, session);
            this.persistentSessions.set(sessionId, session);

            try {
                await session.start();
            } catch (err) {
                this.persistentSessions.delete(sessionId);
                throw err;
            }
        }

        session.sendMessage(message, attachments);
    }

    /**
     * Check if a session is using persistent mode
     */
    isPersistentSession(sessionId: string): boolean {
        return this.persistentSessions.has(sessionId);
    }

    /**
     * Get persistent session status
     */
    getPersistentSessionStatus(sessionId: string): {
        running: boolean;
        cliSessionId: string | null;
        state: string;
        messageCount: number;
        totalUsage: { inputTokens: number; outputTokens: number };
        pid?: number;
        startedAt?: number;
        lastActivityAt?: number;
    } | null {
        const session = this.persistentSessions.get(sessionId);
        if (!session) return null;
        return {
            running: session.running,
            cliSessionId: session.cliSessionId,
            state: session.state,
            messageCount: session.messageCount,
            totalUsage: session.totalUsage,
            pid: session.pid,
            startedAt: session.startedAt,
            lastActivityAt: session.lastActivityAt,
        };
    }

    /**
     * Get a list of all active persistent sessions with resource info
     */
    getActivePersistentSessions(): Array<{
        sessionId: string;
        pid?: number;
        startedAt: number;
        lastActivityAt: number;
        state: string;
        messageCount: number;
    }> {
        const result: Array<{
            sessionId: string;
            pid?: number;
            startedAt: number;
            lastActivityAt: number;
            state: string;
            messageCount: number;
        }> = [];
        for (const [id, session] of this.persistentSessions.entries()) {
            result.push({
                sessionId: id,
                pid: session.pid,
                startedAt: session.startedAt,
                lastActivityAt: session.lastActivityAt,
                state: session.state,
                messageCount: session.messageCount,
            });
        }
        return result;
    }

    /**
     * Stop a persistent session
     */
    async stopPersistentSession(sessionId: string): Promise<void> {
        const session = this.persistentSessions.get(sessionId);
        if (session) {
            await session.stop();
            this.persistentSessions.delete(sessionId);
        }
    }

    /**
     * Evict the least-recently-used persistent sessions if over the limit.
     */
    private async evictLruSessionsIfNeeded(): Promise<void> {
        while (this.persistentSessions.size >= ClaudeCodeWrapper.MAX_PERSISTENT_SESSIONS) {
            // Find the session with the oldest lastActivityAt
            let oldestId: string | null = null;
            let oldestActivity = Infinity;

            for (const [id, session] of this.persistentSessions.entries()) {
                if (session.lastActivityAt < oldestActivity) {
                    oldestActivity = session.lastActivityAt;
                    oldestId = id;
                }
            }

            if (oldestId) {
                console.error(`[ClaudeCode] Evicting LRU persistent session ${oldestId} (lastActivity=${new Date(oldestActivity).toISOString()})`);
                await this.stopPersistentSession(oldestId);
                this.emit('persistentSessionClosed', oldestId, 0);
            } else {
                break;
            }
        }
    }

    private forwardPersistentSessionEvents(sessionId: string, session: PersistentSession): void {
        session.on('update', (update: unknown, type: string) => {
            this.emit('update', sessionId, update, type);
        });

        session.on('complete', () => {
            this.emit('complete', sessionId);
        });

        session.on('control_request', (event: Record<string, unknown>) => {
            void this.handleControlRequest(sessionId, event);
        });

        session.on('close', (code: number) => {
            console.error(`[ClaudeCode] Persistent session ${sessionId} closed with code ${code}`);
            this.persistentSessions.delete(sessionId);
            // Notify clients that the persistent session has disconnected
            this.emit('persistentSessionClosed', sessionId, code);
        });

        session.on('recovered', () => {
            console.error(`[ClaudeCode] Persistent session ${sessionId} recovered`);
            const update: TextUpdate = { text: '[Session recovered automatically after crash]\n' };
            this.emit('update', sessionId, update, 'text');
        });

        session.on('recoveryFailed', () => {
            console.error(`[ClaudeCode] Persistent session ${sessionId} recovery failed, falling back to one-shot`);
            this.persistentSessions.delete(sessionId);
            // Notify clients about recovery failure - they should fall back to one-shot
            const errorUpdate: ErrorUpdate = {
                code: 'PERSISTENT_SESSION_CLOSED',
                message: 'Persistent session recovery failed. Falling back to one-shot mode.',
            };
            this.emit('update', sessionId, errorUpdate, 'error');
            this.emit('persistentSessionClosed', sessionId, 1);
        });

        session.on('idleTimeout', () => {
            console.error(`[ClaudeCode] Persistent session ${sessionId} idle timeout, stopping`);
            this.persistentSessions.delete(sessionId);
            this.emit('persistentSessionClosed', sessionId, 0);
        });
    }
}
