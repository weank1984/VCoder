/**
 * Diff Manager Tests
 * Tests for diff preview and file change management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DiffManager } from '../../apps/vscode-extension/src/services/diffManager.js';
import { ACPClient } from '../../apps/vscode-extension/src/acp/client.js';
import type { FileChangeUpdate } from '../../packages/shared/src/protocol.js';

const { mockWorkspace, mockWindow, mockUri, MockEventEmitter } = vi.hoisted(() => ({
    mockWorkspace: {
        registerTextDocumentContentProvider: vi.fn(() => ({ dispose: vi.fn() })),
        onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
        fs: {
            readFile: vi.fn(),
            writeFile: vi.fn(),
            delete: vi.fn(),
            createDirectory: vi.fn(),
        },
        workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
    },
    mockWindow: {
        showInformationMessage: vi.fn(),
        showWarningMessage: vi.fn(),
        showTextDocument: vi.fn(),
    },
    mockUri: {
        file: vi.fn((path: string) => ({
            scheme: 'file',
            authority: '',
            path,
            query: '',
            fragment: '',
            fsPath: path,
            with: vi.fn(),
            toString: () => path,
            toJSON: () => ({ path }),
        })),
        parse: vi.fn((value: string) => {
            const queryIndex = value.indexOf('?');
            const query = queryIndex >= 0 ? value.slice(queryIndex + 1) : '';
            return {
                scheme: 'vcoder-diff',
                authority: '',
                path: value,
                query,
                fragment: '',
                fsPath: value,
                with: vi.fn(),
                toString: () => value,
                toJSON: () => ({ value, query }),
            };
        }),
    },
    MockEventEmitter: class<T> {
        private listeners = new Set<(event: T) => void>();

        event = (listener: (event: T) => void) => {
            this.listeners.add(listener);
            return { dispose: () => this.listeners.delete(listener) };
        };

        fire(event: T) {
            for (const listener of this.listeners) {
                listener(event);
            }
        }

        dispose() {
            this.listeners.clear();
        }
    },
}));

vi.mock('vscode', () => ({
    workspace: mockWorkspace,
    window: mockWindow,
    Uri: mockUri,
    EventEmitter: MockEventEmitter,
    Disposable: {
        from: (...disposables: { dispose: () => any }[]) => ({
            dispose: () => disposables.forEach(d => d.dispose()),
        }),
    },
    commands: {
        executeCommand: vi.fn(),
    },
}));

// Mock ACPClient
const mockAcpClient = {
    acceptFileChange: vi.fn(),
    rejectFileChange: vi.fn(),
} as any as ACPClient;

describe('DiffManager', () => {
    let diffManager: DiffManager;

    beforeEach(() => {
        vi.clearAllMocks();
        diffManager = new DiffManager(mockAcpClient);
    });

    describe('Registration', () => {
        it('should register as text document content provider', () => {
            const disposable = diffManager.register();
            expect(mockWorkspace.registerTextDocumentContentProvider).toHaveBeenCalledWith('vcoder-diff', diffManager);
            expect(disposable).toBeDefined();
        });
    });

    describe('providing text document content', () => {
        it('should return empty string for non-proposed entries without pending data', async () => {
            const uri = mockUri.parse('vcoder-diff:/test.txt?sessionId=test-session&path=test.txt&side=proposed');
            const content = await diffManager.provideTextDocumentContent(uri);
            expect(content).toBe('');
        });

        it('should return original content for original side without pending data', async () => {
            const uri = mockUri.parse('vcoder-diff:/test.txt?sessionId=test&path=test.txt&side=original');
            
            // Mock successful file read
            mockWorkspace.fs.readFile.mockResolvedValueOnce(Buffer.from('original content'));
            
            const content = await diffManager.provideTextDocumentContent(uri);
            expect(content).toBe('original content');
        });

        it('should return proposed content when available', async () => {
            const change: FileChangeUpdate = {
                path: 'test.txt',
                type: 'modified',
                content: 'proposed content',
                proposed: true,
            };

            // Preview the change to populate pending (no modal, completes immediately)
            await diffManager.previewChange('test-session', change);

            const uri = mockUri.parse('vcoder-diff:/test.txt?sessionId=test-session&path=test.txt&side=proposed');
            const content = await diffManager.provideTextDocumentContent(uri);
            expect(content).toBe('proposed content');
        });

        it('should return empty string for deleted files on proposed side', async () => {
            const change: FileChangeUpdate = {
                path: 'test.txt',
                type: 'deleted',
                proposed: true,
            };

            await diffManager.previewChange('test-session', change);

            const uri = mockUri.parse('vcoder-diff:/test.txt?sessionId=test&path=test.txt&side=proposed');
            const content = await diffManager.provideTextDocumentContent(uri);
            expect(content).toBe('');
        });
    });

    describe('file change operations', () => {
        it('should leave change pending after preview (no modal)', async () => {
            const change: FileChangeUpdate = {
                path: 'test.txt',
                type: 'modified',
                content: 'new content',
                proposed: true,
            };

            await diffManager.previewChange('test-session', change);

            // No modal dialog — change stays pending
            expect(mockWindow.showInformationMessage).not.toHaveBeenCalled();
            const pending = diffManager.getPendingChanges('test-session');
            expect(pending.length).toBe(1);
            expect(pending[0].originalPath).toBe('test.txt');
        });

        it('should accept changes via acceptChange method', async () => {
            const change: FileChangeUpdate = {
                path: 'test.txt',
                type: 'modified',
                content: 'new content',
                proposed: true,
            };

            await diffManager.previewChange('test-session', change);
            await diffManager.acceptChange('test-session', 'test.txt');

            expect(mockAcpClient.acceptFileChange).toHaveBeenCalledWith('test.txt', 'test-session');
        });

        it('should reject changes via rejectChange method', async () => {
            const change: FileChangeUpdate = {
                path: 'test.txt',
                type: 'modified',
                content: 'new content',
                proposed: true,
            };

            await diffManager.previewChange('test-session', change);
            await diffManager.rejectChange('test-session', 'test.txt');

            expect(mockAcpClient.rejectFileChange).toHaveBeenCalledWith('test.txt', 'test-session');
        });
    });

    describe('workspace boundary checking', () => {
        it('should create directories within workspace on accept', async () => {
            const change: FileChangeUpdate = {
                path: 'subdir/test.txt',
                type: 'created',
                content: 'new file content',
                proposed: true,
            };

            // Preview leaves it pending; accept applies the change
            await diffManager.previewChange('test-session', change);
            await diffManager.acceptChange('test-session', 'subdir/test.txt');

            expect(mockWorkspace.fs.createDirectory).toHaveBeenCalled();
        });
    });
});
