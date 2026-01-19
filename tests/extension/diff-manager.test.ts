/**
 * Diff Manager Tests
 * Tests for diff preview and file change management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DiffManager } from '../../packages/extension/src/services/diffManager.js';
import { ACPClient } from '../../packages/extension/src/acp/client.js';
import type { FileChangeUpdate } from '@vcoder/shared';

// Mock vscode
const mockWorkspace = {
    registerTextDocumentContentProvider: vi.fn(),
    fs: {
        readFile: vi.fn(),
        writeFile: vi.fn(),
        delete: vi.fn(),
        createDirectory: vi.fn(),
    },
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
};

// Mock vscode.window
const mockWindow = {
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showTextDocument: vi.fn(),
};

// Mock vscode.Uri
const mockUri = {
    file: vi.fn((path: string) => ({ fsPath: path })),
    parse: vi.fn(),
};

vi.mock('vscode', () => ({
    workspace: mockWorkspace,
    window: mockWindow,
    Uri: mockUri,
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
            const uri = mockUri.parse('vcoder-diff:/test.txt?sessionId=test&path=test.txt&side=proposed');
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

            // First preview the change to populate pending
            await diffManager.previewChange('test-session', change);

            const uri = mockUri.parse('vcoder-diff:/test.txt?sessionId=test&path=test.txt&side=proposed');
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
        it('should handle file changes correctly', async () => {
            const change: FileChangeUpdate = {
                path: 'test.txt',
                type: 'modified',
                content: 'new content',
                proposed: true,
            };

            const mockChoice = 'Accept';
            mockWindow.showInformationMessage.mockResolvedValueOnce(mockChoice);
            mockWorkspace.fs.readFile.mockResolvedValueOnce(Buffer.from('old content'));

            await diffManager.previewChange('test-session', change);

            expect(mockWindow.showInformationMessage).toHaveBeenCalled();
            expect(mockAcpClient.acceptFileChange).toHaveBeenCalledWith('test.txt');
        });

        it('should handle rejected changes correctly', async () => {
            const change: FileChangeUpdate = {
                path: 'test.txt',
                type: 'modified',
                content: 'new content',
                proposed: true,
            };

            const mockChoice = 'Reject';
            mockWindow.showInformationMessage.mockResolvedValueOnce(mockChoice);
            mockWorkspace.fs.readFile.mockResolvedValueOnce(Buffer.from('old content'));

            await diffManager.previewChange('test-session', change);

            expect(mockAcpClient.rejectFileChange).toHaveBeenCalledWith('test.txt');
        });
    });

    describe('workspace boundary checking', () => {
        it('should create directories within workspace', async () => {
            const change: FileChangeUpdate = {
                path: 'subdir/test.txt',
                type: 'created',
                content: 'new file content',
                proposed: true,
            };

            mockWindow.showInformationMessage.mockResolvedValueOnce('Accept');
            
            // Manually trigger apply by simulating accept
            await diffManager.previewChange('test-session', change);

            expect(mockWorkspace.fs.createDirectory).toHaveBeenCalled();
        });
    });
});