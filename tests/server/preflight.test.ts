/**
 * Preflight Check Tests
 * Tests CLI environment validation before spawning Claude CLI processes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as dns from 'dns';
import * as childProcess from 'child_process';
import { preflightCheck, resolveClaudePath } from '../../packages/server/src/claude/shared';

// Mock modules
vi.mock('fs', async () => {
    const actual = await vi.importActual<typeof import('fs')>('fs');
    return {
        ...actual,
        accessSync: vi.fn(),
        existsSync: vi.fn(() => false),
        constants: actual.constants,
    };
});

vi.mock('dns', () => ({
    lookup: vi.fn(),
}));

vi.mock('child_process', () => ({
    execFile: vi.fn(),
    spawn: vi.fn(),
}));

describe('preflightCheck', () => {
    const mockAccessSync = vi.mocked(fs.accessSync);
    const mockExistsSync = vi.mocked(fs.existsSync);
    const mockDnsLookup = vi.mocked(dns.lookup);
    const mockExecFile = vi.mocked(childProcess.execFile);

    beforeEach(() => {
        vi.clearAllMocks();
        // Default: resolveClaudePath returns 'claude' (bare name fallback)
        mockExistsSync.mockReturnValue(false);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    /**
     * Helper: make `which claude` succeed
     */
    function mockWhichSuccess(path = '/usr/local/bin/claude'): void {
        mockExecFile.mockImplementation(((cmd: string, args: string[], opts: unknown, cb: Function) => {
            if (cmd === 'which') {
                cb(null, path + '\n', '');
                return { on: vi.fn() };
            }
            // claude --version
            cb(null, 'claude 1.0.0\n', '');
            return { on: vi.fn() };
        }) as unknown as typeof childProcess.execFile);
    }

    /**
     * Helper: make `which claude` fail
     */
    function mockWhichFail(): void {
        mockExecFile.mockImplementation(((cmd: string, _args: string[], _opts: unknown, cb: Function) => {
            if (cmd === 'which') {
                cb(new Error('not found'), '', '');
                return { on: vi.fn() };
            }
            cb(new Error('not found'), '', '');
            return { on: vi.fn() };
        }) as unknown as typeof childProcess.execFile);
    }

    /**
     * Helper: make all checks pass
     */
    function mockAllPass(): void {
        mockExecFile.mockImplementation(((cmd: string, _args: string[], _opts: unknown, cb: Function) => {
            if (cmd === 'which') {
                cb(null, '/usr/local/bin/claude\n', '');
                return { on: vi.fn() };
            }
            // claude --version
            cb(null, 'claude 1.0.0\n', '');
            return { on: vi.fn() };
        }) as unknown as typeof childProcess.execFile);

        mockAccessSync.mockImplementation(() => {});
        mockDnsLookup.mockImplementation((_hostname: string, cb: Function) => {
            cb(null, '1.2.3.4', 4);
        });

        // Set API key env
        process.env.ANTHROPIC_API_KEY = 'sk-test-key';
    }

    it('should pass when CLI is found, executable, versioned, with API key and network', async () => {
        mockAllPass();

        const result = await preflightCheck();

        expect(result.ok).toBe(true);
        expect(result.checks.length).toBeGreaterThanOrEqual(4);
        expect(result.checks.every((c) => c.status === 'pass')).toBe(true);

        delete process.env.ANTHROPIC_API_KEY;
    });

    it('should fail when CLI is not found (which fails)', async () => {
        mockWhichFail();

        const result = await preflightCheck();

        expect(result.ok).toBe(false);
        const cliCheck = result.checks.find((c) => c.name === 'cli_installed');
        expect(cliCheck).toBeDefined();
        expect(cliCheck!.status).toBe('fail');
        expect(cliCheck!.message).toContain('not found');
    });

    it('should fail when CLI exists but is not executable', async () => {
        // Make resolveClaudePath return a specific path
        mockExistsSync.mockImplementation((p) => String(p).includes('.local/bin/claude'));
        mockAccessSync.mockImplementation((p, mode) => {
            if (mode === fs.constants.F_OK) return;
            if (mode === fs.constants.X_OK) {
                throw new Error('EACCES');
            }
        });

        const result = await preflightCheck();

        expect(result.ok).toBe(false);
        const execCheck = result.checks.find((c) => c.name === 'cli_executable');
        expect(execCheck).toBeDefined();
        expect(execCheck!.status).toBe('fail');
        expect(execCheck!.message).toContain('not executable');
    });

    it('should fail when claude --version times out or errors', async () => {
        mockExecFile.mockImplementation(((cmd: string, args: string[], _opts: unknown, cb: Function) => {
            if (cmd === 'which') {
                cb(null, '/usr/local/bin/claude\n', '');
                return { on: vi.fn() };
            }
            // claude --version fails
            cb(new Error('timeout'), '', 'timeout');
            return { on: vi.fn() };
        }) as unknown as typeof childProcess.execFile);

        const result = await preflightCheck();

        expect(result.ok).toBe(false);
        const versionCheck = result.checks.find((c) => c.name === 'cli_version');
        expect(versionCheck).toBeDefined();
        expect(versionCheck!.status).toBe('fail');
    });

    it('should warn (not fail) when API key is missing', async () => {
        const savedKey = process.env.ANTHROPIC_API_KEY;
        const savedClaudeKey = process.env.CLAUDE_API_KEY;
        delete process.env.ANTHROPIC_API_KEY;
        delete process.env.CLAUDE_API_KEY;

        mockWhichSuccess();
        mockAccessSync.mockImplementation(() => {
            // credentials file doesn't exist
            throw new Error('ENOENT');
        });
        mockDnsLookup.mockImplementation((_hostname: string, cb: Function) => {
            cb(null, '1.2.3.4', 4);
        });

        const result = await preflightCheck();

        // Should still be ok (api_key is advisory)
        expect(result.ok).toBe(true);
        const apiCheck = result.checks.find((c) => c.name === 'api_key');
        expect(apiCheck).toBeDefined();
        expect(apiCheck!.status).toBe('warn');
        expect(apiCheck!.message).toContain('No API key');

        // Restore
        if (savedKey) process.env.ANTHROPIC_API_KEY = savedKey;
        if (savedClaudeKey) process.env.CLAUDE_API_KEY = savedClaudeKey;
    });

    it('should warn (not fail) when DNS lookup fails', async () => {
        mockAllPass();
        mockDnsLookup.mockImplementation((_hostname: string, cb: Function) => {
            cb(new Error('ENOTFOUND'));
        });

        const result = await preflightCheck();

        expect(result.ok).toBe(true);
        const networkCheck = result.checks.find((c) => c.name === 'network');
        expect(networkCheck).toBeDefined();
        expect(networkCheck!.status).toBe('warn');
        expect(networkCheck!.message).toContain('Cannot resolve');

        delete process.env.ANTHROPIC_API_KEY;
    });

    it('should pass api_key check when ANTHROPIC_API_KEY is set', async () => {
        process.env.ANTHROPIC_API_KEY = 'sk-test';
        mockWhichSuccess();
        mockDnsLookup.mockImplementation((_hostname: string, cb: Function) => {
            cb(null, '1.2.3.4', 4);
        });

        const result = await preflightCheck();

        const apiCheck = result.checks.find((c) => c.name === 'api_key');
        expect(apiCheck).toBeDefined();
        expect(apiCheck!.status).toBe('pass');

        delete process.env.ANTHROPIC_API_KEY;
    });

    it('should pass api_key check when CLAUDE_API_KEY is set', async () => {
        delete process.env.ANTHROPIC_API_KEY;
        process.env.CLAUDE_API_KEY = 'sk-test';
        mockWhichSuccess();
        mockDnsLookup.mockImplementation((_hostname: string, cb: Function) => {
            cb(null, '1.2.3.4', 4);
        });

        const result = await preflightCheck();

        const apiCheck = result.checks.find((c) => c.name === 'api_key');
        expect(apiCheck).toBeDefined();
        expect(apiCheck!.status).toBe('pass');

        delete process.env.CLAUDE_API_KEY;
    });

    it('should return early with only cli_installed fail on missing CLI', async () => {
        mockWhichFail();

        const result = await preflightCheck();

        expect(result.ok).toBe(false);
        expect(result.checks).toHaveLength(1);
        expect(result.checks[0].name).toBe('cli_installed');
        expect(result.checks[0].status).toBe('fail');
    });

    it('should handle total timeout gracefully', async () => {
        // Simulate an extremely slow check that exceeds total timeout
        mockExecFile.mockImplementation(((cmd: string, _args: string[], _opts: unknown, cb: Function) => {
            if (cmd === 'which') {
                // Never call cb — simulate hang
                return { on: vi.fn() };
            }
            return { on: vi.fn() };
        }) as unknown as typeof childProcess.execFile);

        const result = await preflightCheck();

        // Should eventually return with a fail due to timeout
        expect(result.ok).toBe(false);
    }, 15_000);
});

describe('resolveClaudePath', () => {
    it('should return "claude" as fallback when no candidates exist', () => {
        const mockExistsSync = vi.mocked(fs.existsSync);
        mockExistsSync.mockReturnValue(false);

        const result = resolveClaudePath();
        expect(result).toBe('claude');
    });

    it('should use CLAUDE_PATH env if set and file exists', () => {
        const savedPath = process.env.CLAUDE_PATH;
        process.env.CLAUDE_PATH = '/custom/path/claude';
        const mockExistsSync = vi.mocked(fs.existsSync);
        mockExistsSync.mockImplementation((p) => String(p) === '/custom/path/claude');

        const result = resolveClaudePath();
        expect(result).toBe('/custom/path/claude');

        if (savedPath) process.env.CLAUDE_PATH = savedPath;
        else delete process.env.CLAUDE_PATH;
    });
});
