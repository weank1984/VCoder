import type { ChatMessage, ContentBlock, SessionState } from './types';

const debugThinking = (globalThis as unknown as { __vcoderDebugThinking?: boolean }).__vcoderDebugThinking === true;
export { debugThinking };

export const DEFAULT_MAX_THINKING_TOKENS = 16000;

export function createId(): string {
    const anyCrypto = (globalThis as unknown as { crypto?: unknown }).crypto as { randomUUID?: () => string } | undefined;
    if (anyCrypto && typeof anyCrypto.randomUUID === 'function') return anyCrypto.randomUUID();
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeToolName(name: string): string {
    const raw = (name ?? '').trim();
    if (!raw) return 'Tool';
    if (raw.startsWith('mcp__')) return raw;

    const lower = raw.toLowerCase();

    if (lower === 'bash' || lower === 'bash_request' || lower === 'shell') return 'Bash';
    if (lower === 'bashoutput' || lower === 'bash_output') return 'BashOutput';
    if (lower === 'killshell' || lower === 'kill_shell') return 'KillShell';

    if (lower === 'read') return 'Read';
    if (lower === 'write') return 'Write';
    if (lower === 'edit') return 'Edit';
    if (lower === 'notebookedit' || lower === 'notebook_edit') return 'NotebookEdit';
    if (lower === 'glob') return 'Glob';
    if (lower === 'grep') return 'Grep';
    if (lower === 'task') return 'Task';
    if (lower === 'todowrite' || lower === 'todo_write') return 'TodoWrite';

    return raw;
}

export function createSessionState(sessionId: string): SessionState {
    const now = Date.now();
    return {
        id: sessionId,
        messages: [],
        tasks: [],
        subagentRuns: [],
        pendingFileChanges: [],
        sessionStatus: 'idle',
        lastActivityTime: now,
        createdAt: now,
        updatedAt: now,
    };
}

export function appendContentBlock(target: ChatMessage, block: ContentBlock): void {
    const blocks = target.contentBlocks ? [...target.contentBlocks] : [];
    const lastIndex = blocks.length - 1;
    const last = blocks[lastIndex];

    if (block.type === 'text') {
        if (last?.type === 'text') {
            blocks[lastIndex] = { ...last, content: last.content + block.content };
        } else {
            blocks.push(block);
        }
    } else if (block.type === 'tools') {
        if (last?.type === 'tools') {
            const newToolCallIds = [...last.toolCallIds];
            for (const id of block.toolCallIds) {
                if (!newToolCallIds.includes(id)) {
                    newToolCallIds.push(id);
                }
            }
            blocks[lastIndex] = { ...last, toolCallIds: newToolCallIds };
        } else {
            blocks.push(block);
        }
    } else if (block.type === 'thought') {
        if (last?.type === 'thought') {
            blocks[lastIndex] = {
                ...last,
                content: last.content + block.content,
                isComplete: block.isComplete
            };
        } else {
            blocks.push(block);
        }
    }

    target.contentBlocks = blocks;
}

// Streaming text update batching with adaptive throttling (per session)
type TextBufferState = {
    buffer: string;
    rafId: number | null;
    lastFlushTime: number;
};

const textBuffers = new Map<string, TextBufferState>();
const MIN_FLUSH_INTERVAL = 16;
const MAX_BUFFER_SIZE = 100;

export function cleanupTextBuffer(sessionId?: string | null): void {
    const sessionKey = sessionId && sessionId.trim().length > 0 ? sessionId : 'default';
    const bufferState = textBuffers.get(sessionKey);
    if (bufferState && bufferState.rafId !== null) {
        const anyGlobal = globalThis as unknown as { cancelAnimationFrame?: (id: number) => void };
        if (typeof anyGlobal.cancelAnimationFrame === 'function') {
            anyGlobal.cancelAnimationFrame(bufferState.rafId);
        }
    }
    textBuffers.delete(sessionKey);
}

export function cleanupAllTextBuffers(): void {
    const anyGlobal = globalThis as unknown as { cancelAnimationFrame?: (id: number) => void };
    for (const [, bufferState] of textBuffers.entries()) {
        if (bufferState && bufferState.rafId !== null && typeof anyGlobal.cancelAnimationFrame === 'function') {
            anyGlobal.cancelAnimationFrame(bufferState.rafId);
        }
    }
    textBuffers.clear();
}

function resolveSessionKey(sessionId?: string | null): string {
    return sessionId && sessionId.trim().length > 0 ? sessionId : 'default';
}

function getTextBufferState(sessionKey: string): TextBufferState {
    const existing = textBuffers.get(sessionKey);
    if (existing) return existing;
    const created: TextBufferState = {
        buffer: '',
        rafId: null,
        lastFlushTime: 0,
    };
    textBuffers.set(sessionKey, created);
    return created;
}

export function flushTextBuffer(
    store: { appendToLastMessage: (text: string, sessionId?: string) => void },
    sessionId?: string
) {
    const sessionKey = resolveSessionKey(sessionId);
    const bufferState = textBuffers.get(sessionKey);
    if (!bufferState) return;

    if (bufferState.rafId !== null) {
        const anyGlobal = globalThis as unknown as { cancelAnimationFrame?: (id: number) => void };
        if (typeof anyGlobal.cancelAnimationFrame === 'function') {
            anyGlobal.cancelAnimationFrame(bufferState.rafId);
        }
        bufferState.rafId = null;
    }
    if (bufferState.buffer) {
        store.appendToLastMessage(bufferState.buffer, sessionId);
        bufferState.buffer = '';
        bufferState.lastFlushTime = Date.now();
    }
}

export function queueTextUpdate(
    text: string,
    store: { appendToLastMessage: (text: string, sessionId?: string) => void },
    sessionId?: string
) {
    const anyGlobal = globalThis as unknown as { requestAnimationFrame?: (cb: () => void) => number };

    if (typeof anyGlobal.requestAnimationFrame !== 'function') {
        store.appendToLastMessage(text, sessionId);
        return;
    }

    const sessionKey = resolveSessionKey(sessionId);
    const bufferState = getTextBufferState(sessionKey);
    bufferState.buffer += text;

    const now = Date.now();
    const timeSinceLastFlush = now - bufferState.lastFlushTime;

    if (bufferState.buffer.length >= MAX_BUFFER_SIZE || timeSinceLastFlush >= MIN_FLUSH_INTERVAL * 2) {
        if (bufferState.rafId !== null) {
            const caf = anyGlobal as unknown as { cancelAnimationFrame?: (id: number) => void };
            if (typeof caf.cancelAnimationFrame === 'function') {
                caf.cancelAnimationFrame(bufferState.rafId);
            }
            bufferState.rafId = null;
        }
        store.appendToLastMessage(bufferState.buffer, sessionId);
        bufferState.buffer = '';
        bufferState.lastFlushTime = now;
        return;
    }

    if (bufferState.rafId !== null) return;

    bufferState.rafId = anyGlobal.requestAnimationFrame(() => {
        bufferState.rafId = null;
        if (bufferState.buffer) {
            store.appendToLastMessage(bufferState.buffer, sessionId);
            bufferState.buffer = '';
            bufferState.lastFlushTime = Date.now();
        }
    });
}
