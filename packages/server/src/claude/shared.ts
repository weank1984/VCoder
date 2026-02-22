/**
 * Shared utilities for Claude CLI integration
 * Extracted from ClaudeCodeWrapper and PersistentSession to eliminate code duplication
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dns from 'dns';
import { execFile } from 'child_process';
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

// =========================================================================
// Preflight Check
// =========================================================================

export type PreflightCheckName = 'cli_installed' | 'cli_executable' | 'cli_version' | 'api_key' | 'network';

export interface PreflightCheckItem {
    name: PreflightCheckName;
    status: 'pass' | 'fail' | 'warn' | 'skip';
    message: string;
    detail?: string;
}

export interface PreflightResult {
    ok: boolean;
    checks: PreflightCheckItem[];
}

const PREFLIGHT_TOTAL_TIMEOUT_MS = 10_000;
const CLI_VERSION_TIMEOUT_MS = 5_000;
const DNS_TIMEOUT_MS = 3_000;

/**
 * Run pre-flight checks to validate the Claude CLI environment before spawning.
 * Blocking checks (cli_installed, cli_executable, cli_version) → ok: false on fail.
 * Advisory checks (api_key, network) → warn only.
 */
export async function preflightCheck(): Promise<PreflightResult> {
    const checks: PreflightCheckItem[] = [];

    const run = async (): Promise<void> => {
        // 1. CLI installed
        const claudePath = resolveClaudePath();
        const isBareName = claudePath === 'claude';

        if (isBareName) {
            // Bare name — need to verify it exists on PATH
            const whichResult = await execFileAsync('which', ['claude'], 2000).catch(() => null);
            if (!whichResult || whichResult.exitCode !== 0) {
                checks.push({
                    name: 'cli_installed',
                    status: 'fail',
                    message: 'Claude CLI not found. Install it with: npm install -g @anthropic-ai/claude-code',
                });
                return; // fatal — skip remaining checks
            }
            checks.push({ name: 'cli_installed', status: 'pass', message: `Found at: ${whichResult.stdout.trim()}` });
        } else {
            try {
                fs.accessSync(claudePath, fs.constants.F_OK);
                checks.push({ name: 'cli_installed', status: 'pass', message: `Found at: ${claudePath}` });
            } catch {
                checks.push({
                    name: 'cli_installed',
                    status: 'fail',
                    message: `Claude CLI not found at ${claudePath}`,
                });
                return;
            }
        }

        // 2. CLI executable
        const resolvedPath = isBareName
            ? checks[0].detail ?? checks[0].message.replace('Found at: ', '')
            : claudePath;
        // On Windows executability check is not meaningful; skip gracefully
        if (process.platform !== 'win32' && !isBareName) {
            try {
                fs.accessSync(resolvedPath, fs.constants.X_OK);
                checks.push({ name: 'cli_executable', status: 'pass', message: 'CLI binary is executable' });
            } catch {
                checks.push({
                    name: 'cli_executable',
                    status: 'fail',
                    message: `Claude CLI is not executable: ${resolvedPath}. Run: chmod +x ${resolvedPath}`,
                });
                return;
            }
        } else {
            checks.push({ name: 'cli_executable', status: 'pass', message: 'CLI binary is executable' });
        }

        // 3. CLI version — actually run the binary
        const versionResult = await execFileAsync(claudePath, ['--version'], CLI_VERSION_TIMEOUT_MS).catch((err) => ({
            stdout: '',
            stderr: '',
            exitCode: -1,
            error: err instanceof Error ? err.message : String(err),
        }));

        if (versionResult.exitCode !== 0) {
            checks.push({
                name: 'cli_version',
                status: 'fail',
                message: 'Claude CLI failed to execute',
                detail: (versionResult as { error?: string }).error ?? versionResult.stderr,
            });
            return;
        }

        const version = versionResult.stdout.trim();
        checks.push({ name: 'cli_version', status: 'pass', message: version || 'OK', detail: version });

        // 4. API key (advisory)
        const hasEnvKey = Boolean(
            process.env.ANTHROPIC_API_KEY?.trim() ||
            process.env.CLAUDE_API_KEY?.trim()
        );
        if (!hasEnvKey) {
            // Check for credentials file
            const home = process.env.HOME || '';
            const credPaths = [
                home ? path.join(home, '.claude', '.credentials.json') : '',
                home ? path.join(home, '.claude', 'credentials.json') : '',
                home ? path.join(home, '.config', 'claude', 'credentials.json') : '',
            ].filter(Boolean);
            const hasCredFile = credPaths.some((p) => {
                try { fs.accessSync(p, fs.constants.F_OK); return true; } catch { return false; }
            });
            if (!hasCredFile) {
                checks.push({
                    name: 'api_key',
                    status: 'warn',
                    message: 'No API key found. Set ANTHROPIC_API_KEY or run `claude login`.',
                });
            } else {
                checks.push({ name: 'api_key', status: 'pass', message: 'Credentials file found' });
            }
        } else {
            checks.push({ name: 'api_key', status: 'pass', message: 'API key environment variable set' });
        }

        // 5. Network (advisory)
        const dnsOk = await dnsLookupAsync('api.anthropic.com', DNS_TIMEOUT_MS).catch(() => false);
        if (dnsOk) {
            checks.push({ name: 'network', status: 'pass', message: 'api.anthropic.com reachable' });
        } else {
            checks.push({
                name: 'network',
                status: 'warn',
                message: 'Cannot resolve api.anthropic.com. Check network connection.',
            });
        }
    };

    // Wrap all checks in a total timeout
    await Promise.race([
        run(),
        new Promise<void>((resolve) => {
            setTimeout(() => {
                if (checks.length === 0) {
                    checks.push({
                        name: 'cli_installed',
                        status: 'fail',
                        message: 'Preflight check timed out',
                    });
                }
                resolve();
            }, PREFLIGHT_TOTAL_TIMEOUT_MS);
        }),
    ]);

    const ok = !checks.some((c) => c.status === 'fail');
    return { ok, checks };
}

// ── Helpers ──────────────────────────────────────────────────────────────

function execFileAsync(
    cmd: string,
    args: string[],
    timeoutMs: number,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
        const child = execFile(cmd, args, { timeout: timeoutMs, encoding: 'utf-8' }, (error, stdout, stderr) => {
            if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
                resolve({ stdout: '', stderr: '', exitCode: -1 });
                return;
            }
            resolve({
                stdout: typeof stdout === 'string' ? stdout : '',
                stderr: typeof stderr === 'string' ? stderr : '',
                exitCode: error ? (error as { code?: number }).code ?? 1 : 0,
            });
        });
        child.on('error', reject);
    });
}

function dnsLookupAsync(hostname: string, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), timeoutMs);
        dns.lookup(hostname, (err) => {
            clearTimeout(timer);
            resolve(!err);
        });
    });
}
