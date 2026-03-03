/**
 * Persistent Session Pool
 * Manages a pool of long-lived Claude CLI sessions with LRU eviction.
 * Extracted from ClaudeCodeWrapper.
 */

import { EventEmitter } from 'events';
import {
    Attachment,
    TextUpdate,
    ErrorUpdate,
} from '@vcoder/shared';
import { PersistentSession, PersistentSessionSettings } from './persistentSession';
import { ClaudeCodeOptions, ClaudeCodeSettings } from './wrapper';

/**
 * PersistentSessionPool manages multiple persistent (bidirectional streaming)
 * Claude CLI sessions with an LRU eviction policy.
 *
 * Events emitted:
 * - 'update'                  (sessionId, update, type)
 * - 'complete'                (sessionId, usage?)
 * - 'persistentSessionClosed' (sessionId, code)
 * - 'control_request'         (sessionId, event)
 * - 'team_tool'               (sessionId, type, teamName)
 */
export class PersistentSessionPool extends EventEmitter {
    private readonly sessions = new Map<string, PersistentSession>();
    private static readonly MAX_SESSIONS = 3;

    constructor(
        private readonly options: ClaudeCodeOptions,
        private readonly getSettings: () => ClaudeCodeSettings,
        private readonly getClaudeSessionId: (sessionId: string) => string | undefined,
    ) {
        super();
    }

    /**
     * Send a prompt using persistent session mode (bidirectional streaming).
     * The session is kept alive for subsequent messages.
     */
    async prompt(sessionId: string, message: string, attachments?: Attachment[]): Promise<void> {
        let session = this.sessions.get(sessionId);

        if (!session) {
            // Enforce multi-session limit: evict LRU if needed
            await this.evictIfNeeded();

            const settings = this.getSettings();
            // Create new persistent session
            const sessionSettings: PersistentSessionSettings = {
                model: settings.model,
                permissionMode: settings.permissionMode,
                fallbackModel: settings.fallbackModel,
                appendSystemPrompt: settings.appendSystemPrompt,
                mcpConfigPath: settings.mcpConfigPath,
                allowedTools: settings.allowedTools,
                disallowedTools: settings.disallowedTools,
                additionalDirs: settings.additionalDirs,
                maxThinkingTokens: settings.maxThinkingTokens,
                env: {
                    CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
                },
            };

            session = new PersistentSession(sessionId, this.options, sessionSettings);
            const resumeId = this.getClaudeSessionId(sessionId);
            if (resumeId) {
                session.setResumeSessionId(resumeId);
            }
            this.forwardEvents(sessionId, session);
            this.sessions.set(sessionId, session);

            try {
                await session.start();
            } catch (err) {
                this.sessions.delete(sessionId);
                throw err;
            }
        }

        session.sendMessage(message, attachments);
    }

    /**
     * Check if a session is using persistent mode
     */
    isSession(sessionId: string): boolean {
        return this.sessions.has(sessionId);
    }

    /**
     * Get the underlying PersistentSession instance (for sendControlResponse)
     */
    getSession(sessionId: string): PersistentSession | undefined {
        return this.sessions.get(sessionId);
    }

    /**
     * Get persistent session status
     */
    getStatus(sessionId: string): {
        running: boolean;
        cliSessionId: string | null;
        state: string;
        messageCount: number;
        totalUsage: { inputTokens: number; outputTokens: number };
        pid?: number;
        startedAt?: number;
        lastActivityAt?: number;
    } | null {
        const session = this.sessions.get(sessionId);
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
    getActive(): Array<{
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
        for (const [id, session] of this.sessions.entries()) {
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
    async stop(sessionId: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (session) {
            await session.stop();
            this.sessions.delete(sessionId);
        }
    }

    /**
     * Shutdown all persistent sessions (used during wrapper shutdown)
     */
    async shutdownAll(): Promise<void> {
        const stopPromises: Promise<void>[] = [];
        for (const [sessionId, session] of this.sessions.entries()) {
            stopPromises.push(
                session.stop().catch((err) => {
                    console.error('[ClaudeCode] Failed to stop persistent session', sessionId, err);
                    // Force kill if graceful stop fails
                    session.kill();
                })
            );
        }
        await Promise.all(stopPromises);
        this.sessions.clear();
    }

    /**
     * Evict the least-recently-used persistent sessions if over the limit.
     */
    private async evictIfNeeded(): Promise<void> {
        while (this.sessions.size >= PersistentSessionPool.MAX_SESSIONS) {
            // Find the session with the oldest lastActivityAt
            let oldestId: string | null = null;
            let oldestActivity = Infinity;

            for (const [id, session] of this.sessions.entries()) {
                if (session.lastActivityAt < oldestActivity) {
                    oldestActivity = session.lastActivityAt;
                    oldestId = id;
                }
            }

            if (oldestId) {
                console.error(`[ClaudeCode] Evicting LRU persistent session ${oldestId} (lastActivity=${new Date(oldestActivity).toISOString()})`);
                await this.stop(oldestId);
                this.emit('persistentSessionClosed', oldestId, 0);
            } else {
                break;
            }
        }
    }

    private forwardEvents(sessionId: string, session: PersistentSession): void {
        session.on('update', (update: unknown, type: string) => {
            this.emit('update', sessionId, update, type);
        });

        session.on('complete', (usage?: { inputTokens: number; outputTokens: number }) => {
            this.emit('complete', sessionId, usage);
        });

        session.on('control_request', (event: Record<string, unknown>) => {
            this.emit('control_request', sessionId, event);
        });

        session.on('team_tool', (type: 'create' | 'delete', teamName: string) => {
            this.emit('team_tool', sessionId, type, teamName);
        });

        session.on('close', (code: number) => {
            console.error(`[ClaudeCode] Persistent session ${sessionId} closed with code ${code}`);
            this.sessions.delete(sessionId);
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
            this.sessions.delete(sessionId);
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
            this.sessions.delete(sessionId);
            this.emit('persistentSessionClosed', sessionId, 0);
        });
    }
}
