/**
 * Persistent Session Tests
 * Tests multi-turn conversation, state tracking, token usage, and session lifecycle
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';

// --- Minimal mock of PersistentSession for unit testing ---

// We test the PersistentSession class logic by importing it directly
// but mocking child_process.spawn so no real CLI is started.
vi.mock('child_process', () => ({
    spawn: vi.fn(() => {
        const proc = new EventEmitter() as ReturnType<typeof import('child_process').spawn>;
        const stdin = new (require('stream').PassThrough)();
        const stdout = new (require('stream').PassThrough)();
        const stderr = new (require('stream').PassThrough)();
        Object.assign(proc, {
            stdin,
            stdout,
            stderr,
            pid: 12345,
            kill: vi.fn(),
        });
        return proc;
    }),
}));

// Mock shared utilities
vi.mock('../../packages/server/src/claude/shared', () => ({
    resolveClaudePath: () => '/usr/local/bin/claude',
    preflightCheck: () => Promise.resolve({ ok: true, checks: [] }),
    JsonStreamParser: class {
        private buffer = '';
        feed(chunk: string): string[] {
            this.buffer += chunk;
            const results: string[] = [];
            const lines = this.buffer.split('\n');
            this.buffer = lines.pop() ?? '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed) results.push(trimmed);
            }
            return results;
        }
    },
    computeFileChangeDiff: () => ({ diff: '', didExist: true }),
    matchStderrError: () => null,
}));

import { spawn } from 'child_process';
import { PersistentSession } from '../../packages/server/src/claude/persistentSession';

function getSpawnedProcess() {
    const mockSpawn = spawn as unknown as ReturnType<typeof vi.fn>;
    return mockSpawn.mock.results[mockSpawn.mock.results.length - 1].value;
}

/** Yield a microtask so that start()'s `await preflightCheck()` settles before spawn is called. */
const tick = () => new Promise<void>((r) => queueMicrotask(r));

function simulateInit(proc: ReturnType<typeof getSpawnedProcess>) {
    // Emit system init event as JSON line
    proc.stdout.push(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'cli-session-1' }) + '\n');
}

function simulateResult(proc: ReturnType<typeof getSpawnedProcess>, usage?: { input_tokens: number; output_tokens: number }) {
    const event: Record<string, unknown> = { type: 'result', subtype: 'success' };
    if (usage) event.usage = usage;
    proc.stdout.push(JSON.stringify(event) + '\n');
}

function simulateAssistantText(proc: ReturnType<typeof getSpawnedProcess>, text: string) {
    proc.stdout.push(JSON.stringify({
        type: 'assistant',
        message: {
            role: 'assistant',
            content: [{ type: 'text', text }],
        },
    }) + '\n');
}

describe('PersistentSession', () => {
    let session: PersistentSession;

    beforeEach(() => {
        vi.clearAllMocks();
        session = new PersistentSession('test-session', {
            workingDirectory: '/test/workspace',
        });
    });

    describe('State Tracking', () => {
        it('should start in idle state', () => {
            expect(session.state).toBe('idle');
            expect(session.running).toBe(false);
            expect(session.messageCount).toBe(0);
            expect(session.cliSessionId).toBeNull();
        });

        it('should transition to idle after start', async () => {
            const startPromise = session.start();
            await tick();
            const proc = getSpawnedProcess();
            simulateInit(proc);
            await startPromise;

            expect(session.running).toBe(true);
            expect(session.state).toBe('idle');
            expect(session.cliSessionId).toBe('cli-session-1');
        });

        it('should transition to processing on sendMessage', async () => {
            const startPromise = session.start();
            await tick();
            const proc = getSpawnedProcess();
            simulateInit(proc);
            await startPromise;

            session.sendMessage('Hello');
            expect(session.state).toBe('processing');
            expect(session.messageCount).toBe(1);
        });

        it('should transition to waiting on result', async () => {
            const startPromise = session.start();
            await tick();
            const proc = getSpawnedProcess();
            simulateInit(proc);
            await startPromise;

            session.sendMessage('Hello');
            expect(session.state).toBe('processing');

            simulateResult(proc);
            // Wait for event processing
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(session.state).toBe('waiting');
        });

        it('should transition to closed when process closes', async () => {
            const startPromise = session.start();
            await tick();
            const proc = getSpawnedProcess();
            simulateInit(proc);
            await startPromise;

            proc.emit('close', 0);
            expect(session.state).toBe('closed');
            expect(session.running).toBe(false);
        });
    });

    describe('Multi-turn Conversation', () => {
        it('should support 3 rounds of conversation', async () => {
            const startPromise = session.start();
            await tick();
            const proc = getSpawnedProcess();
            simulateInit(proc);
            await startPromise;

            const completeEvents: number[] = [];
            session.on('complete', () => completeEvents.push(session.messageCount));

            // Round 1
            session.sendMessage('Round 1');
            expect(session.messageCount).toBe(1);
            expect(session.state).toBe('processing');
            simulateAssistantText(proc, 'Response 1');
            simulateResult(proc, { input_tokens: 100, output_tokens: 50 });
            await new Promise(resolve => setTimeout(resolve, 10));
            expect(session.state).toBe('waiting');

            // Round 2
            session.sendMessage('Round 2');
            expect(session.messageCount).toBe(2);
            expect(session.state).toBe('processing');
            simulateAssistantText(proc, 'Response 2');
            simulateResult(proc, { input_tokens: 200, output_tokens: 100 });
            await new Promise(resolve => setTimeout(resolve, 10));
            expect(session.state).toBe('waiting');

            // Round 3
            session.sendMessage('Round 3');
            expect(session.messageCount).toBe(3);
            expect(session.state).toBe('processing');
            simulateAssistantText(proc, 'Response 3');
            simulateResult(proc, { input_tokens: 300, output_tokens: 150 });
            await new Promise(resolve => setTimeout(resolve, 10));
            expect(session.state).toBe('waiting');

            expect(completeEvents).toEqual([1, 2, 3]);
            expect(session.running).toBe(true);
        });

        it('should throw when sending message before start', () => {
            expect(() => session.sendMessage('Hello')).toThrow('Session not started');
        });
    });

    describe('Token Usage Tracking', () => {
        it('should accumulate token usage across rounds', async () => {
            const startPromise = session.start();
            await tick();
            const proc = getSpawnedProcess();
            simulateInit(proc);
            await startPromise;

            expect(session.totalUsage).toEqual({ inputTokens: 0, outputTokens: 0 });

            // Round 1
            session.sendMessage('msg 1');
            simulateResult(proc, { input_tokens: 100, output_tokens: 50 });
            await new Promise(resolve => setTimeout(resolve, 10));
            expect(session.totalUsage).toEqual({ inputTokens: 100, outputTokens: 50 });

            // Round 2
            session.sendMessage('msg 2');
            simulateResult(proc, { input_tokens: 200, output_tokens: 100 });
            await new Promise(resolve => setTimeout(resolve, 10));
            expect(session.totalUsage).toEqual({ inputTokens: 300, outputTokens: 150 });
        });

        it('should handle result without usage gracefully', async () => {
            const startPromise = session.start();
            await tick();
            const proc = getSpawnedProcess();
            simulateInit(proc);
            await startPromise;

            session.sendMessage('msg');
            simulateResult(proc); // no usage
            await new Promise(resolve => setTimeout(resolve, 10));
            expect(session.totalUsage).toEqual({ inputTokens: 0, outputTokens: 0 });
        });

        it('should return a copy of totalUsage (not reference)', async () => {
            const startPromise = session.start();
            await tick();
            const proc = getSpawnedProcess();
            simulateInit(proc);
            await startPromise;

            session.sendMessage('msg');
            simulateResult(proc, { input_tokens: 10, output_tokens: 5 });
            await new Promise(resolve => setTimeout(resolve, 10));

            const usage1 = session.totalUsage;
            const usage2 = session.totalUsage;
            expect(usage1).toEqual(usage2);
            expect(usage1).not.toBe(usage2); // different objects
        });
    });

    describe('Resume Support', () => {
        it('should accept resume session id before start', () => {
            session.setResumeSessionId('existing-cli-id');
            expect(session.cliSessionId).toBe('existing-cli-id');
        });

        it('should pass --resume flag when resuming', async () => {
            session.setResumeSessionId('existing-cli-id');
            const startPromise = session.start();
            await tick();
            const proc = getSpawnedProcess();
            simulateInit(proc);
            await startPromise;

            const mockSpawn = spawn as unknown as ReturnType<typeof vi.fn>;
            const spawnArgs = mockSpawn.mock.calls[mockSpawn.mock.calls.length - 1];
            expect(spawnArgs[1]).toContain('--resume');
            expect(spawnArgs[1]).toContain('existing-cli-id');
        });

        it('should ignore setResumeSessionId after start', async () => {
            const startPromise = session.start();
            await tick();
            const proc = getSpawnedProcess();
            simulateInit(proc);
            await startPromise;

            session.setResumeSessionId('should-be-ignored');
            // The cliSessionId should be from the init event, not the resume id
            expect(session.cliSessionId).toBe('cli-session-1');
        });

        it('should ignore empty resume session id', () => {
            session.setResumeSessionId('');
            expect(session.cliSessionId).toBeNull();

            session.setResumeSessionId('   ');
            expect(session.cliSessionId).toBeNull();
        });
    });

    describe('Event Forwarding', () => {
        it('should emit text updates', async () => {
            const startPromise = session.start();
            await tick();
            const proc = getSpawnedProcess();
            simulateInit(proc);
            await startPromise;

            const updates: Array<{ content: unknown; type: string }> = [];
            session.on('update', (content, type) => updates.push({ content, type }));

            simulateAssistantText(proc, 'Hello world');
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(updates.length).toBe(1);
            expect(updates[0].type).toBe('text');
            expect((updates[0].content as { text: string }).text).toBe('Hello world');
        });

        it('should emit error on result error', async () => {
            const startPromise = session.start();
            await tick();
            const proc = getSpawnedProcess();
            simulateInit(proc);
            await startPromise;

            const updates: Array<{ content: unknown; type: string }> = [];
            session.on('update', (content, type) => updates.push({ content, type }));

            session.sendMessage('msg');
            proc.stdout.push(JSON.stringify({ type: 'result', subtype: 'error', error: 'Something went wrong' }) + '\n');
            await new Promise(resolve => setTimeout(resolve, 10));

            const errorUpdate = updates.find(u => u.type === 'error');
            expect(errorUpdate).toBeDefined();
            expect((errorUpdate!.content as { message: string }).message).toBe('Something went wrong');
        });
    });

    describe('Parallel Sessions', () => {
        it('should maintain independent state for two sessions', async () => {
            const session1 = new PersistentSession('session-1', { workingDirectory: '/test/1' });
            const session2 = new PersistentSession('session-2', { workingDirectory: '/test/2' });

            const start1 = session1.start();
            await tick();
            const proc1 = getSpawnedProcess();
            proc1.stdout.push(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'cli-1' }) + '\n');
            await start1;

            const start2 = session2.start();
            await tick();
            const proc2 = getSpawnedProcess();
            proc2.stdout.push(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'cli-2' }) + '\n');
            await start2;

            // Both running independently
            expect(session1.cliSessionId).toBe('cli-1');
            expect(session2.cliSessionId).toBe('cli-2');
            expect(session1.messageCount).toBe(0);
            expect(session2.messageCount).toBe(0);

            // Send messages to both
            session1.sendMessage('Hello session 1');
            expect(session1.messageCount).toBe(1);
            expect(session2.messageCount).toBe(0);

            session2.sendMessage('Hello session 2');
            expect(session2.messageCount).toBe(1);

            // Complete session 1 - should not affect session 2
            simulateResult(proc1, { input_tokens: 50, output_tokens: 25 });
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(session1.state).toBe('waiting');
            expect(session2.state).toBe('processing'); // Still processing

            // Complete session 2
            simulateResult(proc2, { input_tokens: 100, output_tokens: 50 });
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(session2.state).toBe('waiting');

            // Independent token usage
            expect(session1.totalUsage).toEqual({ inputTokens: 50, outputTokens: 25 });
            expect(session2.totalUsage).toEqual({ inputTokens: 100, outputTokens: 50 });

            // Clean up
            session1.kill();
            session2.kill();
        });
    });

    describe('Stop and Kill', () => {
        it('should set state to closed on kill', async () => {
            const startPromise = session.start();
            await tick();
            const proc = getSpawnedProcess();
            simulateInit(proc);
            await startPromise;

            session.kill();
            expect(session.state).toBe('closed');
            expect(session.running).toBe(false);
        });

        it('should set state to closed on stop', async () => {
            const startPromise = session.start();
            await tick();
            const proc = getSpawnedProcess();
            simulateInit(proc);
            await startPromise;

            const stopPromise = session.stop();
            proc.emit('close', 0);
            await stopPromise;

            expect(session.state).toBe('closed');
            expect(session.running).toBe(false);
        });
    });
});
