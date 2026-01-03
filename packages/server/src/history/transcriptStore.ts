/**
 * Transcript Store - Read Claude Code CLI history files
 * 
 * Claude Code stores transcripts in ~/.claude/projects/<projectKey>/*.jsonl
 * Each JSONL file represents one session with line-by-line events.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import type { HistorySession, HistoryChatMessage, HistoryToolCall } from '@vcoder/shared';

/**
 * Derive the projectKey from a workspace path.
 * Claude Code converts "/" to "-" and removes the leading separator.
 * e.g., /Users/weank/Documents/vcoder → -Users-weank-Documents-vcoder
 */
export function deriveProjectKey(workspacePath: string): string {
    // Normalize path and replace path separators with dashes
    const normalized = path.normalize(workspacePath);
    // Replace all "/" with "-" (macOS/Linux) and "\" with "-" (Windows)
    return normalized.replace(/[/\\]/g, '-');
}

function deriveProjectKeyWithoutLeadingSeparator(workspacePath: string): string {
    const normalized = path.normalize(workspacePath);
    const stripped = normalized.replace(/^[\\/]+/, '');
    return stripped.replace(/[/\\]/g, '-');
}

/**
 * Get the Claude projects directory path.
 */
function getClaudeDir(): string {
    const fromEnv =
        process.env.VCODER_CLAUDE_DIR ??
        process.env.CLAUDE_HOME ??
        process.env.CLAUDE_DIR;

    if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) {
        return path.resolve(fromEnv);
    }

    return path.join(os.homedir(), '.claude');
}

function getClaudeProjectsDir(): string {
    return path.join(getClaudeDir(), 'projects');
}

function getClaudeHistoryIndexPath(): string {
    return path.join(getClaudeDir(), 'history.jsonl');
}

function normalizePathForComparison(p: string): string {
    const normalized = path.normalize(path.resolve(p));
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function getWorkspacePathVariants(workspacePath: string): string[] {
    const variants: string[] = [];
    const seen = new Set<string>();
    const add = (p: string) => {
        const key = normalizePathForComparison(p);
        if (!seen.has(key)) {
            seen.add(key);
            variants.push(key);
        }
    };

    if (workspacePath) add(workspacePath);
    if (workspacePath) {
        try {
            add(fs.realpathSync(workspacePath));
        } catch {
            // ignore
        }
    }
    return variants;
}

function getProjectKeyCandidates(workspacePath: string): string[] {
    const candidates: string[] = [];
    const seen = new Set<string>();
    const add = (key: string) => {
        if (!key) return;
        if (key === '.') return;
        if (!seen.has(key)) {
            seen.add(key);
            candidates.push(key);
        }
    };

    const workspacePaths = [workspacePath];
    if (workspacePath) {
        try {
            workspacePaths.push(fs.realpathSync(workspacePath));
        } catch {
            // ignore
        }
    }

    for (const p of workspacePaths) {
        if (!p) continue;
        const withLeading = deriveProjectKey(p);
        const withoutLeadingSep = deriveProjectKeyWithoutLeadingSeparator(p);

        add(withLeading);
        add(withLeading.replace(/^-+/, ''));
        add(withoutLeadingSep);
        add(`-${withoutLeadingSep}`);
    }

    return candidates;
}

function resolveProjectDir(workspacePath: string): { projectDir: string; projectKey: string } | null {
    const projectsDir = getClaudeProjectsDir();
    const candidates = getProjectKeyCandidates(workspacePath);
    for (const projectKey of candidates) {
        const projectDir = path.join(projectsDir, projectKey);
        try {
            if (fs.existsSync(projectDir) && fs.statSync(projectDir).isDirectory()) {
                return { projectDir, projectKey };
            }
        } catch {
            // ignore
        }
    }
    return null;
}

function listProjectDirs(): string[] {
    const projectsDir = getClaudeProjectsDir();
    if (!fs.existsSync(projectsDir)) return [];
    try {
        return fs
            .readdirSync(projectsDir, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => path.join(projectsDir, d.name));
    } catch {
        return [];
    }
}

function findSessionFileInAllProjects(sessionId: string): { filePath: string; projectKey: string } | null {
    for (const projectDir of listProjectDirs()) {
        const filePath = path.join(projectDir, `${sessionId}.jsonl`);
        if (fs.existsSync(filePath)) {
            return { filePath, projectKey: path.basename(projectDir) };
        }
    }
    return null;
}

function isSafeSessionId(sessionId: string): boolean {
    if (!sessionId) return false;
    if (sessionId !== path.basename(sessionId)) return false;
    if (sessionId.includes('..')) return false;
    // Claude session ids are typically UUID-ish; be permissive but exclude path separators and control chars.
    return /^[a-zA-Z0-9._-]+$/.test(sessionId);
}

function isPathWithin(parentDir: string, childPath: string): boolean {
    const parent = path.resolve(parentDir) + path.sep;
    const child = path.resolve(childPath);
    return child.startsWith(parent);
}

async function listSessionIdsFromHistoryIndex(workspacePath: string): Promise<string[]> {
    const historyIndexPath = getClaudeHistoryIndexPath();
    if (!fs.existsSync(historyIndexPath)) return [];

    const workspaceVariants = new Set(getWorkspacePathVariants(workspacePath));
    const sessionLatestTs = new Map<string, number>();

    const fileStream = fs.createReadStream(historyIndexPath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
    });

    for await (const line of rl) {
        if (!line.trim()) continue;
        try {
            const event = JSON.parse(line);
            const project = typeof event.project === 'string' ? normalizePathForComparison(event.project) : null;
            const sessionId = typeof event.sessionId === 'string' ? event.sessionId : null;
            const timestamp = typeof event.timestamp === 'number' ? event.timestamp : null;
            if (!project || !sessionId) continue;
            if (!workspaceVariants.has(project)) continue;

            const prev = sessionLatestTs.get(sessionId) ?? 0;
            sessionLatestTs.set(sessionId, Math.max(prev, timestamp ?? prev));
        } catch {
            // ignore malformed lines
        }
    }

    return [...sessionLatestTs.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([sessionId]) => sessionId);
}

/**
 * List all history sessions for a given workspace path.
 * Returns sessions sorted by updatedAt (most recent first).
 */
export async function listHistorySessions(workspacePath: string): Promise<HistorySession[]> {
    if (!workspacePath) {
        const sessions: HistorySession[] = [];
        for (const projectDir of listProjectDirs()) {
            const projectKey = path.basename(projectDir);
            try {
                const files = fs.readdirSync(projectDir).filter((f) => f.endsWith('.jsonl'));
                for (const file of files) {
                    const sessionId = file.replace('.jsonl', '');
                    const filePath = path.join(projectDir, file);
                    try {
                        const metadata = await extractSessionMetadata(filePath, sessionId, projectKey);
                        if (metadata) sessions.push(metadata);
                    } catch (err) {
                        console.error(`[TranscriptStore] Error reading ${filePath}:`, err);
                    }
                }
            } catch {
                // ignore unreadable dirs
            }
        }

        sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        return sessions;
    }

    const resolved = resolveProjectDir(workspacePath);
    const projectDir = resolved?.projectDir ?? '';
    const projectKey = resolved?.projectKey ?? '';

    // Check if directory exists
    if (resolved && fs.existsSync(projectDir)) {
        // Read all .jsonl files
        const files = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));
        console.error(`[TranscriptStore] Found ${files.length} history files in ${projectDir}`);

        const sessions: HistorySession[] = [];

        for (const file of files) {
            const sessionId = file.replace('.jsonl', '');
            const filePath = path.join(projectDir, file);

            try {
                const metadata = await extractSessionMetadata(filePath, sessionId, projectKey);
                if (metadata) {
                    sessions.push(metadata);
                }
            } catch (err) {
                console.error(`[TranscriptStore] Error reading ${file}:`, err);
            }
        }

        // Sort by updatedAt descending (most recent first)
        sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

        return sessions;
    }

    console.error(
        `[TranscriptStore] No matching project directory for workspace "${workspacePath}". ` +
        `Tried keys: ${getProjectKeyCandidates(workspacePath).join(', ') || '(none)'}`
    );

    // Fallback: use ~/.claude/history.jsonl to find sessionIds for this workspace, then locate transcripts.
    const sessionIds = await listSessionIdsFromHistoryIndex(workspacePath);
    if (sessionIds.length === 0) return [];

    const sessions: HistorySession[] = [];
    for (const sessionId of sessionIds) {
        const located = findSessionFileInAllProjects(sessionId);
        if (!located) continue;

        try {
            const metadata = await extractSessionMetadata(located.filePath, sessionId, located.projectKey);
            if (metadata) sessions.push(metadata);
        } catch (err) {
            console.error(`[TranscriptStore] Error reading ${located.filePath}:`, err);
        }
    }

    // Sort by updatedAt descending (most recent first)
    sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return sessions;
}

function getEventRole(event: any): 'user' | 'assistant' | null {
    const t = typeof event?.type === 'string' ? event.type : null;
    if (t === 'user' || t === 'assistant') return t;
    const role = typeof event?.message?.role === 'string' ? event.message.role : null;
    if (role === 'user' || role === 'assistant') return role;
    return null;
}

/**
 * Extract session metadata from a JSONL file.
 * Reads first and last events to get title, createdAt, updatedAt.
 */
async function extractSessionMetadata(
    filePath: string,
    sessionId: string,
    projectKey: string
): Promise<HistorySession | null> {
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
    });

    let firstEvent: any = null;
    let lastEvent: any = null;
    let title = '未命名会话';

    for await (const line of rl) {
        if (!line.trim()) continue;

        try {
            const event = JSON.parse(line);
            
            if (!firstEvent) {
                firstEvent = event;
            }
            lastEvent = event;

            // Extract title from first user message
            if (!title || title === '未命名会话') {
                const role = getEventRole(event);
                if (role === 'user' && event.message) {
                    const content = extractTextContent(event.message.content);
                    if (content) {
                        // Take first 50 characters as title
                        title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
                    }
                } else if (role === 'assistant' && event.message) {
                    const content = extractTextContent(event.message.content);
                    if (content) {
                        title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
                    }
                }
            }
        } catch {
            // Skip malformed lines
        }
    }

    if (!firstEvent) return null;

    const createdAt = extractTimestamp(firstEvent) || new Date().toISOString();
    const updatedAt = extractTimestamp(lastEvent) || createdAt;

    return {
        id: sessionId,
        title,
        createdAt,
        updatedAt,
        projectKey,
    };
}

/**
 * Load all messages from a history session.
 */
export async function loadHistorySession(
    sessionId: string,
    workspacePath: string
): Promise<HistoryChatMessage[]> {
    if (!isSafeSessionId(sessionId)) {
        console.error(`[TranscriptStore] Refusing to load unsafe sessionId="${sessionId}"`);
        return [];
    }

    const resolved = resolveProjectDir(workspacePath);
    const preferredPath = resolved ? path.join(resolved.projectDir, `${sessionId}.jsonl`) : '';
    let filePath = preferredPath;

    if (!filePath || !fs.existsSync(filePath)) {
        const located = findSessionFileInAllProjects(sessionId);
        if (!located) {
            console.error(
                `[TranscriptStore] Session file not found for sessionId="${sessionId}" (workspace="${workspacePath}"). ` +
                `Tried: ${preferredPath || '(none)'}`
            );
            return [];
        }
        filePath = located.filePath;
    }

    const projectsDir = getClaudeProjectsDir();
    if (!isPathWithin(projectsDir, filePath)) {
        console.error(`[TranscriptStore] Refusing to read file outside projects dir: ${filePath}`);
        return [];
    }

    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
    });

    const messages: HistoryChatMessage[] = [];
    // Track tool results to associate with their tool_use
    const toolResultsById = new Map<string, { result?: unknown; error?: string }>();
    let messageId = 0;

    for await (const line of rl) {
        if (!line.trim()) continue;

        try {
            const event = JSON.parse(line);
            const message = parseEventToMessage(event, () => `msg_${messageId++}`, toolResultsById);
            if (message) {
                messages.push(message);
            }
        } catch {
            // Skip malformed lines
        }
    }

    // Post-process: attach tool results to tool calls
    for (const msg of messages) {
        if (msg.toolCalls) {
            for (const tc of msg.toolCalls) {
                const result = toolResultsById.get(tc.id);
                if (result) {
                    tc.result = result.result;
                    tc.error = result.error;
                    tc.status = result.error ? 'failed' : 'completed';
                }
            }
        }
    }

    return messages;
}

/**
 * Delete a history session transcript file.
 * Returns true when a file was found and deleted.
 */
export async function deleteHistorySession(sessionId: string, workspacePath: string): Promise<boolean> {
    if (!isSafeSessionId(sessionId)) {
        console.error(`[TranscriptStore] Refusing to delete unsafe sessionId="${sessionId}"`);
        return false;
    }

    const resolved = resolveProjectDir(workspacePath);
    const preferredPath = resolved ? path.join(resolved.projectDir, `${sessionId}.jsonl`) : '';
    let filePath = preferredPath;

    if (!filePath || !fs.existsSync(filePath)) {
        const located = findSessionFileInAllProjects(sessionId);
        if (!located) {
            console.error(
                `[TranscriptStore] Session file not found for delete sessionId="${sessionId}" (workspace="${workspacePath}"). ` +
                `Tried: ${preferredPath || '(none)'}`
            );
            return false;
        }
        filePath = located.filePath;
    }

    try {
        const projectsDir = getClaudeProjectsDir();
        if (!isPathWithin(projectsDir, filePath)) {
            console.error(`[TranscriptStore] Refusing to delete file outside projects dir: ${filePath}`);
            return false;
        }
        await fs.promises.unlink(filePath);
        return true;
    } catch (err) {
        console.error(`[TranscriptStore] Failed to delete ${filePath}:`, err);
        return false;
    }
}

/**
 * Parse a single JSONL event into a HistoryChatMessage.
 */
function parseEventToMessage(
    event: any,
    generateId: () => string,
    toolResultsById: Map<string, { result?: unknown; error?: string }>
): HistoryChatMessage | null {
    const timestamp = extractTimestamp(event);

    // Some transcript formats emit tool_result as standalone events; capture and skip.
    if (event?.type === 'tool_result' && event.tool_use_id) {
        toolResultsById.set(String(event.tool_use_id), {
            result: event.content,
            error: event.is_error ? String(event.content) : undefined,
        });
        return null;
    }

    const role = getEventRole(event);

    if (role === 'user' && event.message) {
        const content = extractTextContent(event.message.content);
        
        // Check for tool_result in user message (Claude stores them here)
        if (Array.isArray(event.message.content)) {
            for (const block of event.message.content) {
                if (block.type === 'tool_result' && block.tool_use_id) {
                    toolResultsById.set(block.tool_use_id, {
                        result: block.content,
                        error: block.is_error ? String(block.content) : undefined,
                    });
                }
            }
        }

        // Skip user messages that only contain tool_result (no visible text)
        if (!content) return null;

        return {
            id: generateId(),
            role: 'user',
            content,
            timestamp,
        };
    }

    if (role === 'assistant' && event.message) {
        const blocks = event.message.content;
        if (typeof blocks === 'string') {
            return {
                id: generateId(),
                role: 'assistant',
                content: blocks,
                timestamp,
            };
        }
        if (!Array.isArray(blocks)) return null;

        let textContent = '';
        let thought = '';
        const toolCalls: HistoryToolCall[] = [];

        for (const block of blocks) {
            if (block.type === 'text') {
                textContent += (textContent ? '\n' : '') + block.text;
            } else if (block.type === 'thinking') {
                thought += (thought ? '\n' : '') + block.thinking;
            } else if (block.type === 'tool_use') {
                toolCalls.push({
                    id: block.id,
                    name: block.name,
                    input: block.input,
                    status: 'completed', // Will be updated later with tool_result
                });
            }
        }

        // Skip empty assistant messages
        if (!textContent && !thought && toolCalls.length === 0) return null;

        return {
            id: generateId(),
            role: 'assistant',
            content: textContent,
            thought: thought || undefined,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            timestamp,
        };
    }

    // Ignore other event types (queue-operation, etc.)
    return null;
}

/**
 * Extract text content from message content.
 * Handles both string and block array formats.
 */
function extractTextContent(content: unknown): string {
    if (typeof content === 'string') {
        return content;
    }

    if (Array.isArray(content)) {
        const textParts: string[] = [];
        for (const block of content) {
            if (block.type === 'text' && block.text) {
                textParts.push(block.text);
            }
        }
        return textParts.join('\n');
    }

    return '';
}

/**
 * Extract timestamp from an event.
 * Handles both ISO string and millisecond timestamp formats.
 */
function extractTimestamp(event: any): string | undefined {
    if (!event) return undefined;

    const timestamp = event.timestamp ?? event.message?.timestamp;
    if (timestamp) {
        if (typeof timestamp === 'number') return new Date(timestamp).toISOString();
        if (typeof timestamp === 'string') return timestamp;
    }

    return undefined;
}
