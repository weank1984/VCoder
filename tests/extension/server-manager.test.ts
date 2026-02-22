/**
 * Server Manager Tests
 * Tests for server process lifecycle management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PassThrough } from 'stream';

const mockProcess = {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    on: vi.fn(),
    kill: vi.fn(),
    pid: 12345,
    killed: false,
};

vi.mock('child_process', () => ({
    spawn: vi.fn(() => mockProcess),
}));

vi.mock('fs', () => ({
    existsSync: vi.fn((path: string) => {
        // By default, the bundled path exists
        if (path.includes('server/index.js')) return true;
        return false;
    }),
}));

// Note: 'vscode' is aliased to tests/mocks/vscode.ts via vitest.config.ts

const createMockContext = () => ({
    extensionPath: '/mock/extension',
    extensionMode: 2, // vscode.ExtensionMode.Development
    secrets: {
        get: vi.fn(async () => 'test-api-key'),
    },
    subscriptions: [],
});

describe('ServerManager', () => {
    let ServerManager: typeof import('../../apps/vscode-extension/src/services/serverManager.js').ServerManager;
    let serverManager: InstanceType<typeof ServerManager>;
    let mockContext: ReturnType<typeof createMockContext>;

    beforeEach(async () => {
        vi.clearAllMocks();

        // Reset mock process streams for each test
        mockProcess.stdin = new PassThrough();
        mockProcess.stdout = new PassThrough();
        mockProcess.stderr = new PassThrough();
        mockProcess.on = vi.fn();
        mockProcess.kill = vi.fn();
        mockProcess.killed = false;

        const mod = await import('../../apps/vscode-extension/src/services/serverManager.js');
        ServerManager = mod.ServerManager;
        mockContext = createMockContext();
        serverManager = new ServerManager(mockContext as any);
    });

    describe('start', () => {
        it('should change status to running after start', async () => {
            await serverManager.start();

            expect(serverManager.getStatus()).toBe('running');
        });

        it('should spawn a node process', async () => {
            const { spawn } = await import('child_process');

            await serverManager.start();

            expect(spawn).toHaveBeenCalledWith(
                'node',
                expect.arrayContaining([expect.stringContaining('index.js')]),
                expect.objectContaining({
                    stdio: ['pipe', 'pipe', 'pipe'],
                })
            );
        });

        it('should do nothing when already running', async () => {
            const { spawn } = await import('child_process');

            await serverManager.start();
            const callCountAfterFirst = (spawn as ReturnType<typeof vi.fn>).mock.calls.length;

            await serverManager.start();

            expect((spawn as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCountAfterFirst);
            expect(serverManager.getStatus()).toBe('running');
        });

        it('should pass API key as ANTHROPIC_API_KEY environment variable', async () => {
            const { spawn } = await import('child_process');

            await serverManager.start();

            const spawnCall = (spawn as ReturnType<typeof vi.fn>).mock.calls[0];
            const envOptions = spawnCall[2];
            expect(envOptions.env.ANTHROPIC_API_KEY).toBe('test-api-key');
        });

        it('should not set ANTHROPIC_API_KEY when secrets returns empty string', async () => {
            mockContext.secrets.get = vi.fn(async () => '  ');
            serverManager = new ServerManager(mockContext as any);

            const { spawn } = await import('child_process');

            await serverManager.start();

            const spawnCall = (spawn as ReturnType<typeof vi.fn>).mock.calls[0];
            const envOptions = spawnCall[2];
            expect(envOptions.env.ANTHROPIC_API_KEY).toBeUndefined();
        });

        it('should register error and exit handlers on the process', async () => {
            await serverManager.start();

            const registeredEvents = mockProcess.on.mock.calls.map(
                (call: unknown[]) => call[0]
            );
            expect(registeredEvents).toContain('error');
            expect(registeredEvents).toContain('exit');
        });
    });

    describe('stop', () => {
        it('should kill the process and change status to stopped', async () => {
            await serverManager.start();

            await serverManager.stop();

            expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
            expect(serverManager.getStatus()).toBe('stopped');
        });

        it('should set status to stopped even when no process is running', async () => {
            await serverManager.stop();

            expect(serverManager.getStatus()).toBe('stopped');
        });
    });

    describe('restart', () => {
        it('should stop then start the server', async () => {
            const { spawn } = await import('child_process');

            await serverManager.start();
            const initialCallCount = (spawn as ReturnType<typeof vi.fn>).mock.calls.length;

            await serverManager.restart();

            expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
            expect((spawn as ReturnType<typeof vi.fn>).mock.calls.length).toBe(initialCallCount + 1);
            expect(serverManager.getStatus()).toBe('running');
        });
    });

    describe('getStdio', () => {
        it('should return stdin and stdout when server is running', async () => {
            await serverManager.start();

            const stdio = serverManager.getStdio();

            expect(stdio).toHaveProperty('stdin');
            expect(stdio).toHaveProperty('stdout');
        });

        it('should throw when server is not running', () => {
            expect(() => serverManager.getStdio()).toThrow('Server not running');
        });
    });

    describe('getServerPath', () => {
        it('should return bundled path when it exists', async () => {
            const { spawn } = await import('child_process');
            const fs = await import('fs');

            // In development mode, existsSync returns false for devPath,
            // true for bundled path
            (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation((p: string) => {
                if (p.includes('/server/dist/')) return false;
                if (p.includes('server/index.js')) return true;
                return false;
            });

            serverManager = new ServerManager(mockContext as any);
            await serverManager.start();

            const spawnCall = (spawn as ReturnType<typeof vi.fn>).mock.calls[0];
            const serverPath = spawnCall[1][0];
            expect(serverPath).toContain('server/index.js');
        });

        it('should prefer dev path in development mode when it exists', async () => {
            const { spawn } = await import('child_process');
            const fs = await import('fs');

            (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation((p: string) => {
                // dev path exists
                if (p.includes('/server/dist/index.js')) return true;
                return true;
            });

            mockContext.extensionMode = 2; // Development
            serverManager = new ServerManager(mockContext as any);
            await serverManager.start();

            const spawnCall = (spawn as ReturnType<typeof vi.fn>).mock.calls[0];
            const serverPath = spawnCall[1][0];
            expect(serverPath).toContain('server/dist/index.js');
        });
    });

    describe('getStatus', () => {
        it('should return stopped initially', () => {
            expect(serverManager.getStatus()).toBe('stopped');
        });

        it('should return running after start', async () => {
            await serverManager.start();

            expect(serverManager.getStatus()).toBe('running');
        });

        it('should return stopped after stop', async () => {
            await serverManager.start();
            await serverManager.stop();

            expect(serverManager.getStatus()).toBe('stopped');
        });
    });
});
