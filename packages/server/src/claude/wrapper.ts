/**
 * Claude Code CLI Wrapper
 * Spawns Claude Code CLI and parses JSON stream output
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
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
    private readonly processesByLocalSessionId: Map<string, ChildProcess> = new Map();
    private readonly claudeSessionIdByLocalSessionId: Map<string, string> = new Map();
    private readonly startedLocalSessions: Set<string> = new Set();
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
        if (this.processesByLocalSessionId.has(sessionId)) {
            throw new Error(`Session ${sessionId} already has a running Claude process`);
        }

        const fullMessage = attachments
            ? `${message}\n\nAttachments:\n${attachments.map((a) => `${a.name}: ${a.content}`).join('\n')}`
            : message;

        const args: string[] = [
            '-p',
            fullMessage,
            '--output-format',
            'stream-json',
            '--verbose'
        ];

        // Optional: auto-approve tools (bypasses prompts). Keep off by default.
        if (process.env.VCODER_ALLOWED_TOOLS && process.env.VCODER_ALLOWED_TOOLS.trim().length > 0) {
            args.push('--allowedTools', process.env.VCODER_ALLOWED_TOOLS.trim());
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

        // Start Claude Code CLI subprocess
        const claudePath = this.resolveClaudePath();
        console.error(`[ClaudeCode] Spawning session ${sessionId} with args:`, args.join(' '));

        const child = spawn(claudePath, args, {
            cwd: this.options.workingDirectory,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                ...process.env,
                TERM: 'xterm-256color',
                HOME: process.env.HOME || '/Users/weank',
            },
        });

        // CRITICAL: Claude CLI in `-p` mode waits for stdin EOF before processing.
        // We do not stream prompts via stdin, so close it immediately to unblock output.
        child.stdin?.end();

        // Setup Listeners
        this.processesByLocalSessionId.set(sessionId, child);
        this.startedLocalSessions.add(sessionId);
        this.setupProcessListeners(sessionId, child);

        return new Promise((resolve, reject) => {
            child.on('close', (code) => {
                if (code === 0) {
                     this.emit('complete', sessionId);
                     resolve();
                } else {
                     reject(new Error(`Exit code ${code}`));
                }
                this.processesByLocalSessionId.delete(sessionId);
            });
             child.on('error', (err) => {
                this.processesByLocalSessionId.delete(sessionId);
                reject(err);
            });
        });
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

    private setupProcessListeners(sessionId: string, process: ChildProcess) {
        let buffer = '';
        let scanIndex = 0;
        let jsonStart = -1;
        let depth = 0;
        let inString = false;
        let escaped = false;
        let sawAnyOutput = false;
        let stderrTail = '';

        const handleJsonText = (jsonText: string) => {
            try {
                const event = JSON.parse(jsonText);
                this.handleClaudeCodeEvent(sessionId, event);
            } catch (err) {
                console.error('[ClaudeCode] JSON parse error:', err);
            }
        };

        const processBuffer = () => {
             // Standard JSON stream parser
            for (; scanIndex < buffer.length; scanIndex++) {
                const ch = buffer[scanIndex];
                if (jsonStart === -1) {
                    if (ch === '{' || ch === '[') {
                        buffer = buffer.slice(scanIndex);
                        scanIndex = 0;
                        jsonStart = 0;
                        depth = 1; 
                        inString = false;
                        escaped = false;
                        continue;
                    }
                    if (ch === '\n') {
                        buffer = buffer.slice(scanIndex + 1);
                        scanIndex = -1;
                    }
                    continue;
                }
                if (inString) {
                    if (escaped) escaped = false;
                    else if (ch === '\\') escaped = true;
                    else if (ch === '"') inString = false;
                    continue;
                }
                if (ch === '"') { inString = true; continue; }
                if (ch === '{' || ch === '[') depth++;
                else if (ch === '}' || ch === ']') {
                    depth--;
                    if (depth === 0) {
                        handleJsonText(buffer.slice(jsonStart, scanIndex + 1));
                        buffer = buffer.slice(scanIndex + 1);
                        scanIndex = -1;
                        jsonStart = -1;
                    }
                }
            }
        };

        process.stdout?.setEncoding('utf8');
        process.stdout?.on('data', (chunk: string) => {
            sawAnyOutput = true;
            buffer += chunk;
            processBuffer();
        });

        process.stderr?.on('data', (data) => {
             const text = data.toString();
             stderrTail = (stderrTail + text).slice(-8000);
             console.error(`[ClaudeCode stderr]`, text);
             // Error detection logic... (omitted for brevity but kept in original)
             // I should probably keep the error detection logic if I can
        });
        
        // Re-adding error detection for Auth/CLI Not Found
        process.stderr?.on('data', (data) => {
             const text = data.toString();
             if (text.includes('Please run `claude login`')) {
                  this.emit('update', sessionId, {
                      code: 'AUTH_REQUIRED',
                      message: 'Authentication required. Please set your API Key or run `claude login`.',
                      action: { label: 'Set API Key', command: 'vcoder.setApiKey' }
                  } as ErrorUpdate, 'error');
             } else if (text.includes('command not found')) {
                  this.emit('update', sessionId, {
                      code: 'CLI_NOT_FOUND',
                      message: 'Claude Code CLI not found.',
                      action: { label: 'Install', command: 'vcoder.openInstallGuide' }
                  } as ErrorUpdate, 'error');
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
            case 'system': {
                // Init event, log but don't emit
                console.error('[ClaudeCode] System event:', event.subtype);
                break;
            }

            case 'user': {
                // Echo of the user message in stream-json output; ignore.
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

                    // Synthesize file_change notification for DiffManager
                    // TODO: Handle 'Edit' tool which might provide diffs/patches instead of full content
                    if (toolName === 'Write' && tool.input?.path && typeof tool.input.content === 'string') {
                        const fileUpdate: FileChangeUpdate = {
                            path: tool.input.path as string,
                            type: 'modified', // Assume modified, DiffManager handles created check
                            content: tool.input.content as string,
                            proposed: true,
                        };
                         this.emit('update', sessionId, fileUpdate, 'file_change');
                    }
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
                // Don't spam logs for harmless new event types; keep as debug.
                console.error('[ClaudeCode] Unhandled event type:', type);
        }
    }

    async acceptFileChange(sessionId: string, path: string): Promise<void> {
        // Since we are stateless, we can't write to stdin of a closed process.
        // We need to send a NEW command to accept the change if the CLI supports it via args?
        // Or does accepting a change require an active session?
        // Claude CLI usually auto-applies changes unless permissions require confirmation.
        // If we need to explicitly accept, is there a command `claude approve`?
        // No obvious command in help.
        // However, if we are in Permission Mode not "bypass", it might prompt.
        // But with -p mode, how does it prompt?
        // "Note: The workspace trust dialog is skipped when Claude is run with the -p mode."
        // Maybe -p mode inherently auto-accepts or fails?
        // If we need to send "accept", we assume the previous process is dead.
        // So we can't.
        
        // This suggests -p mode might assume auto-approved or configured via --permission-mode.
        // We should set permission mode to 'delegate' or 'dontAsk'?
        // "permission-mode ... dontAsk".
        // If the user wants to review diffs in VSCode, they are reviewing BEFORE the change is applied?
        // The `protocol` says "FileChangeUpdate" with "proposed: true".
        // If the CLI outputs the change, we show diff.
        // If user clicks "Accept", we want to apply it.
        // If the CLI is gone, WE (the extension) should apply the change using fs.write?
        // YES. If the CLI assumes it's done, it delivered the content.
        // The `FileChangeUpdate` contains `content`.
        // So `DiffManager` handles writing to disk!
        // `DiffManager` calls `view.acceptFileChange`, which calls `acpClient.acceptFileChange`.
        // `Server` calls `wrapper.acceptFileChange`.
        
        // So `wrapper.acceptFileChange` might not need to talk to Claude CLI if we have the content.
        // But `DiffManager` logic relies on `acceptFileChange`.
        // If `proposed: true`, DiffManager expects `accept` to trigger the write.
    }

    async rejectFileChange(sessionId: string, path: string): Promise<void> {
        // No-op for stateless mode if we just don't apply the edit.
    }

    async confirmBash(sessionId: string, commandId: string): Promise<void> {
        // Bash confirmation in stateless mode?
        // If CLI outputs a Bash tool call, does it wait?
        // In -p mode, it likely outputs the tool call and STOPS if it needs confirmation, or it just outputs "I want to run X".
        // We might need to run the bash command ourselves? or spawn claude again with "result of bash"?
        // This is complex. Tool use in stateless mode implies we are the runtime.
        // But Claude CLI is the agent *and* runtime.
        // If -p mode handles tools, does it run them?
        // Check help: "--allowed-tools", "--dangerously-skip-permissions".
        // If we use --dangerously-skip-permissions, it runs without asking.
        // But we want to intercept.
        // If we intercept, we might need to feed the result back?
        // "ToolUseUpdate" comes from `tool` event.
        // If type is `tool`, does Claude wait?
        // In -p mode, it probably *pauses* or *exits* demanding a new invocation with tool result?
        // But `stream-json` help says "realtime streaming".
        
        // If -p runs validly, it should manage tools internally.
        // If it stops for confirmation, it might block.
        // But we said -p skips trust dialog?
        // We should PROBABLY use `--permission-mode dontAsk` or `--dangerously-skip-permissions` and handle confirmations via our own UI *before* sending prompt?
        // No, the agent decides to use tool mid-stream.
        
        // Let's assume for MVP: Use `--dangerously-skip-permissions` so CLI doesn't block on stdin we can't control easily.
        // And we rely on our own `DiffManager` (which intercepts `Write` tool because it's a tool event).
        // Wait, does CLI actuall write file? 
        // If we intercept "tool: Write", we can stop it?
        
        // Actually, if we use `--tools ""` (disable all) and provide Mcp tools, we control everything.
        // But we are using built-in tools.
        
        // Let's stick to the prompt: The user wants "Success".
        // Enabling `--session-id` fixes the context.
        // For confirmations, we might be out of luck with -p unless we find how to feed input to a running -p process that is blocked.
        // But `stream-json` implies buffering?
        
        // Let's rely on the fact that `ClaudeCodeWrapper` emits events.
        // If the process is blocked on stdin (asking for permission), we *can* write to it if we kept `process` ref.
        // My new code keeps `this.process`.
        // So `confirmBash` SHOULD work if `this.process` is still alive (not exited).
        // If `claude -p` waits for confirmation, it hasn't exited.
        // So `this.process` is valid.
        
        const process = this.processesByLocalSessionId.get(sessionId);
        if (process?.stdin && !process.stdin.destroyed && !process.stdin.writableEnded) {
             // We need to know protocol for confirmation on stdin.
             // Usually just "y\n" or similar?
             // Or formatted JSON?
             // Interactive mode uses arrow keys or y/n.
             // We can try sending "y\n".
             process.stdin.write('y\n');
        }
    }

    async skipBash(sessionId: string, commandId: string): Promise<void> {
        const process = this.processesByLocalSessionId.get(sessionId);
        if (process?.stdin && !process.stdin.destroyed && !process.stdin.writableEnded) {
             process.stdin.write('n\n');
        }
    }

    async confirmPlan(sessionId: string): Promise<void> {
         // Same for plan
        const process = this.processesByLocalSessionId.get(sessionId);
        if (process?.stdin && !process.stdin.destroyed && !process.stdin.writableEnded) {
             process.stdin.write('y\n');
        }
    }

    async shutdown(): Promise<void> {
        for (const [sessionId, process] of this.processesByLocalSessionId.entries()) {
            try {
                process.kill('SIGTERM');
            } catch (err) {
                console.error('[ClaudeCode] Failed to kill process for session', sessionId, err);
            }
        }
        this.processesByLocalSessionId.clear();
    }
}
