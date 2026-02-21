/**
 * Shared utilities for Claude CLI integration
 * Extracted from ClaudeCodeWrapper and PersistentSession to eliminate code duplication
 */

import * as fs from 'fs';
import * as path from 'path';
import { ErrorUpdate } from '@vcoder/shared';
import { generateUnifiedDiff } from '../utils/unifiedDiff';

/**
 * Resolve the path to the Claude CLI binary.
 * Checks common install locations in order of priority.
 */
export function resolveClaudePath(): string {
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

/**
 * Streaming JSON parser for Claude CLI output.
 * Parses a stream of bytes into complete JSON objects.
 */
export class JsonStreamParser {
    private buffer = '';
    private scanIndex = 0;
    private jsonStart = -1;
    private depth = 0;
    private inString = false;
    private escaped = false;

    /**
     * Feed a chunk of data into the parser.
     * Returns an array of complete JSON strings found in the chunk.
     */
    feed(chunk: string): string[] {
        this.buffer += chunk;
        const results: string[] = [];

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
                    results.push(this.buffer.slice(this.jsonStart, this.scanIndex + 1));
                    this.buffer = this.buffer.slice(this.scanIndex + 1);
                    this.scanIndex = -1;
                    this.jsonStart = -1;
                }
            }
        }

        return results;
    }

    /**
     * Reset parser state (e.g., when starting a new session).
     */
    reset(): void {
        this.buffer = '';
        this.scanIndex = 0;
        this.jsonStart = -1;
        this.depth = 0;
        this.inString = false;
        this.escaped = false;
    }
}

/**
 * Compute a unified diff for a proposed file change.
 * Returns diff string and whether the file previously existed.
 */
export function computeFileChangeDiff(options: {
    workingDirectory: string;
    filePath: string;
    proposedContent: string;
}): { diff: string; didExist: boolean } {
    try {
        return generateUnifiedDiff(options);
    } catch {
        return { diff: '', didExist: true };
    }
}

/**
 * Check stderr text for known error patterns from Claude CLI.
 * Returns an ErrorUpdate if a known error pattern is found, null otherwise.
 */
export function matchStderrError(text: string): ErrorUpdate | null {
    if (text.includes('Please run `claude login`')) {
        return {
            code: 'AUTH_REQUIRED',
            message: 'Authentication required. Please set your API Key or run `claude login`.',
            action: { label: 'Set API Key', command: 'vcoder.setApiKey' },
        };
    }

    if (text.includes('command not found')) {
        return {
            code: 'CLI_NOT_FOUND',
            message: 'Claude Code CLI not found.',
            action: { label: 'Install', command: 'vcoder.openInstallGuide' },
        };
    }

    return null;
}
