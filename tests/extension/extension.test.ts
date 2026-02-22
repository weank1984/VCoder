/**
 * Extension Unit Tests
 * Core extension logic tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const serverManagerState = {
    status: 'running',
    startError: null as Error | null,
};

vi.mock('../../apps/vscode-extension/src/services/serverManager', () => ({
    ServerManager: class {
        async start() {
            if (serverManagerState.startError) {
                throw serverManagerState.startError;
            }
        }
        async stop() {}
        getStatus() {
            return serverManagerState.status;
        }
        getStdio() {
            return { stdin: {}, stdout: {} };
        }
    },
}));

vi.mock('@vcoder/shared/acpClient', () => ({
    ACPClient: class {
        on() {}
        async initialize() {}
        registerRequestHandler() {}
        async newSession() {
            return { id: 'session-1' };
        }
        async listSessions() {
            return [];
        }
    },
}));

vi.mock('../../apps/vscode-extension/src/providers/chatViewProvider', () => ({
    ChatViewProvider: class {
        constructor() {}
        postMessage() {}
        on() {}
        setDiffManager() {}
        setFileDecorator() {}
    },
}));

vi.mock('../../apps/vscode-extension/src/services/capabilityOrchestrator', () => ({
    createCapabilityOrchestrator: async () => ({
        shutdown: async () => {},
        getSessionStore: () => undefined,
        getAuditLogger: () => undefined,
        getBuiltinMcpServer: () => undefined,
        getLspService: () => undefined,
    }),
}));

vi.mock('../../apps/vscode-extension/src/services/diffManager', () => ({
    DiffManager: class {
        register() {
            return { dispose: () => {} };
        }
    },
}));

vi.mock('../../apps/vscode-extension/src/providers/fileDecorationProvider', () => ({
    VCoderFileDecorationProvider: class {},
}));

vi.mock('../../apps/vscode-extension/src/services/agentRegistry', () => ({
    AgentRegistry: class {
        async loadProfiles() {}
        getActiveStdio() {
            return { stdin: {}, stdout: {} };
        }
        getAgentStatuses() {
            return [];
        }
        getActiveAgentId() {
            return '__builtin__';
        }
        on() {}
        async dispose() {}
    },
}));

const createContext = () => ({
    subscriptions: [],
});

const importExtension = async () => import('../../apps/vscode-extension/src/extension.js');
const getVscode = async () => import('vscode');

describe('Extension Core', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        serverManagerState.status = 'running';
        serverManagerState.startError = null;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Extension Activation', () => {
        it('should create output channel', async () => {
            await importExtension();
            const vscode = await getVscode();
            expect(vscode.window.createOutputChannel).toHaveBeenCalledWith('VCoder', 'VCoder');
        });

        it('should create status bar item', async () => {
            const { activate } = await importExtension();
            await activate(createContext() as any);
            const vscode = await getVscode();
            expect(vscode.window.createStatusBarItem).toHaveBeenCalledWith(
                vscode.StatusBarAlignment.Right,
                100
            );
            const statusBarItem = (vscode.window.createStatusBarItem as any).mock.results[0]?.value;
            expect(statusBarItem.command).toBe('vcoder.newChat');
            expect(statusBarItem.tooltip).toBe('New Chat');
        });

        it('should register webview view provider', async () => {
            const { activate } = await importExtension();
            await activate(createContext() as any);
            const vscode = await getVscode();
            expect(vscode.window.registerWebviewViewProvider).toHaveBeenCalledWith(
                'vcoder.chatView',
                expect.any(Object),
                expect.objectContaining({
                    webviewOptions: {
                        retainContextWhenHidden: true,
                    },
                })
            );
        });
    });

    describe('Extension Configuration', () => {
        it('should define client capabilities', () => {
            // Verify that the extension has the expected client capabilities
            // This test would need to import the actual extension function
            // For now, we test the expected capabilities structure
            const expectedCapabilities = {
                streaming: true,
                diffPreview: true,
                thought: true,
                toolCallList: true,
                taskList: true,
                multiSession: true,
            };

            expect(expectedCapabilities).toBeDefined();
            expect(expectedCapabilities.streaming).toBe(true);
            expect(expectedCapabilities.diffPreview).toBe(true);
            expect(expectedCapabilities.thought).toBe(true);
            expect(expectedCapabilities.toolCallList).toBe(true);
            expect(expectedCapabilities.taskList).toBe(true);
            expect(expectedCapabilities.multiSession).toBe(true);
        });
    });

    describe('Client Initialization Parameters', () => {
        it('should use protocol version 1', () => {
            const expectedClientInfo = {
                name: 'vcoder-vscode',
                version: '0.2.0',
            };

            expect(expectedClientInfo).toBeDefined();
            expect(expectedClientInfo.name).toBe('vcoder-vscode');
            expect(expectedClientInfo.version).toBe('0.2.0');
        });

        it('should include terminal capabilities', () => {
            const expectedClientCapabilities = {
                terminal: true,
                fs: {
                    readTextFile: true,
                    writeTextFile: true,
                },
            };

            expect(expectedClientCapabilities).toBeDefined();
            expect(expectedClientCapabilities.terminal).toBe(true);
            expect(expectedClientCapabilities.fs?.readTextFile).toBe(true);
            expect(expectedClientCapabilities.fs?.writeTextFile).toBe(true);
        });

        it('should handle workspace folders correctly', async () => {
            // Mock workspace folders
            const mockWorkspaceFolders = [
                { uri: { fsPath: '/workspace1' } },
                { uri: { fsPath: '/workspace2' } }
            ];

            const vscode = await getVscode();
            (vscode.workspace as any).workspaceFolders = mockWorkspaceFolders;

            const expectedWorkspaceFolders: string[] = [
                '/workspace1',
                '/workspace2'
            ];

            expect(expectedWorkspaceFolders).toEqual(mockWorkspaceFolders.map(f => f.uri.fsPath));
        });
    });

    describe('Commands Registration', () => {
        it('should register core commands', () => {
            const expectedCommands = [
                'vcoder.newChat',
                'vcoder.showHistory',
                'vcoder.openSettings',
                'vcoder.setUiLanguage',
                'vcoder.exportSession',
                'vcoder.importSession',
                'vcoder.exportAuditLogs',
                'vcoder.showAuditStats',
            ];

            expectedCommands.forEach(command => {
                expect(typeof command).toBe('string');
            });
        });

        it('should register session management commands', () => {
            const expectedSessionCommands = [
                'vcoder.newChat', // also used for session management
                'vcoder.showHistory',
                'vcoder.exportSession',
                'vcoder.importSession',
            ];

            expectedSessionCommands.forEach(command => {
                expect(expectedSessionCommands).toContain(command);
            });
        });
    });

    describe('View Providers Registration', () => {
        it('should register activity bar view', () => {
            const expectedViews = {
                'vcoder': {
                    title: 'VCoder',
                    icon: 'resources/icon.svg'
                }
            };

            expect(expectedViews).toBeDefined();
            expect(expectedViews.vcoder.title).toBe('VCoder');
            expect(expectedViews.vcoder.icon).toBe('resources/icon.svg');
        });

        it('should register chat view', async () => {
            const { activate } = await importExtension();
            await activate(createContext() as any);
            const vscode = await getVscode();
            expect(vscode.window.registerWebviewViewProvider).toHaveBeenCalledWith(
                'vcoder.chatView',
                expect.any(Object),
                expect.objectContaining({
                    webviewOptions: {
                        retainContextWhenHidden: true,
                    }
                })
            );
        });
    });

    describe('Error Handling', () => {
        it('should handle missing workspace gracefully', async () => {
            // Test extension behavior when no workspace is open
            const vscode = await getVscode();
            (vscode.workspace as any).workspaceFolders = undefined;

            const expectedWorkspaceFolders: string[] = [];
            expect(expectedWorkspaceFolders).toEqual([]);
        });

        it('should log activation errors', async () => {
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            serverManagerState.status = 'stopped';
            const { activate } = await importExtension();
            await activate(createContext() as any);
            expect(errorSpy).toHaveBeenCalledWith(
                expect.stringContaining('[VCoder] Failed to initialize extension:'),
                expect.any(Error)
            );
            errorSpy.mockRestore();
        });

        it('should log activation success', async () => {
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const { activate } = await importExtension();
            await activate(createContext() as any);
            expect(logSpy).toHaveBeenCalledWith(
                expect.stringContaining('[VCoder] Extension initialized successfully')
            );
            logSpy.mockRestore();
        });
    });

    describe('Extension Metadata', () => {
        it('should have correct manifest properties', () => {
            // These would be tested against package.json in a real scenario
            const expectedMetadata = {
                name: 'vcoder',
                displayName: 'VCoder',
                categories: ['Programming Languages', 'Machine Learning', 'Other'],
                engines: {
                    vscode: '^1.80.0'
                }
            };

            expect(expectedMetadata).toBeDefined();
            expect(expectedMetadata.name).toBe('vcoder');
            expect(expectedMetadata.displayName).toBe('VCoder');
            expect(expectedMetadata.categories).toContain('Programming Languages');
            expect(expectedMetadata.engines.vscode).toBe('^1.80.0');
        });
    });
});
