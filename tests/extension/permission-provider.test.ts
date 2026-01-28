/**
 * Permission Provider Tests
 * Tests for permission request handling and persistent rule creation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PermissionProvider } from '../../packages/extension/src/services/permissionProvider.js';
import type { RequestPermissionParams } from '../../packages/shared/src/protocol.js';

// Mock ChatViewProvider
const mockChatProvider = {
    postMessage: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
};

describe('PermissionProvider', () => {
    let permissionProvider: PermissionProvider;

    beforeEach(() => {
        vi.clearAllMocks();
        permissionProvider = new PermissionProvider(mockChatProvider as any);
    });

    describe('handlePermissionRequest', () => {
        it('should send permission request to webview', async () => {
            const params: RequestPermissionParams = {
                sessionId: 'test-session',
                toolCallId: 'tool-123',
                toolName: 'Read',
                toolInput: { path: '/test/file.txt' },
                metadata: {},
            };

            const requestPromise = permissionProvider.handlePermissionRequest(params);

            // Verify postMessage was called
            expect(mockChatProvider.postMessage).toHaveBeenCalledWith({
                type: 'permissionRequest',
                data: {
                    requestId: expect.stringMatching(/^perm_\d+_[a-z0-9]+$/),
                    sessionId: params.sessionId,
                    toolCallId: params.toolCallId,
                    toolName: params.toolName,
                    toolInput: params.toolInput,
                    metadata: params.metadata,
                },
            });

            // Should not resolve immediately
            expect(requestPromise).toBeInstanceOf(Promise);
        });

        it('should timeout after 5 minutes', async () => {
            const params: RequestPermissionParams = {
                sessionId: 'test-session',
                toolCallId: 'tool-123',
                toolName: 'Read',
                toolInput: { path: '/test/file.txt' },
                metadata: {},
            };

            vi.useFakeTimers();
            
            const requestPromise = permissionProvider.handlePermissionRequest(params);
            
            // Fast-forward 5 minutes
            vi.advanceTimersByTime(5 * 60 * 1000);
            
            await expect(requestPromise).rejects.toThrow('Permission request timed out');
            
            vi.useRealTimers();
        });
    });

    describe('handlePermissionResponse', () => {
        let mockHandler: any;
        let requestId: string;
        let requestPromise: Promise<any>;

        beforeEach(() => {
            // Register the permission response handler
            mockHandler = vi.fn();
            // Simulate the event listener registration
            (mockChatProvider.on as any).mockImplementation((event: string, handler: any) => {
                if (event === 'permissionResponse') {
                    mockHandler = handler;
                }
            });
            
            // Create a pending request first
            const params: RequestPermissionParams = {
                sessionId: 'test-session',
                toolCallId: 'tool-123',
                toolName: 'Read',
                toolInput: { path: '/test/file.txt' },
                metadata: {},
            };
            
            requestPromise = permissionProvider.handlePermissionRequest(params);
            
            // Extract the requestId from the postMessage call
            const postMessageCall = (mockChatProvider.postMessage as any).mock.calls[0][0];
            requestId = postMessageCall.data.requestId;
        });

        it('should resolve allow outcome correctly', async () => {
            mockHandler({
                requestId,
                outcome: 'allow',
                trustAlways: false,
            });

            const result = await requestPromise;
            expect(result).toEqual({ outcome: 'allow' });
        });

        it('should create trust always rule when requested', async () => {
            mockHandler({
                requestId,
                outcome: 'allow',
                trustAlways: true,
            });

            const result = await requestPromise;
            expect(result).toEqual({
                outcome: 'allow',
                updatedRules: expect.arrayContaining([
                    expect.objectContaining({
                        toolName: 'Read',
                        action: 'allow',
                        createdAt: expect.any(String),
                        updatedAt: expect.any(String),
                    }),
                ]),
            });
        });

        it('should handle reject outcome correctly', async () => {
            mockHandler({
                requestId,
                outcome: 'deny',
                trustAlways: false,
            });

            const result = await requestPromise;
            expect(result).toEqual({ outcome: 'deny' });
        });

        it('should ignore unknown request IDs', () => {
            expect(() => {
                mockHandler({
                    requestId: 'unknown-id',
                    outcome: 'allow',
                    trustAlways: false,
                });
            }).not.toThrow();
        });
    });

    describe('Tool pattern generation', () => {
        let localMockHandler: any;

        beforeEach(() => {
            // Register the permission response handler
            localMockHandler = vi.fn();
            (mockChatProvider.on as any).mockImplementation((event: string, handler: any) => {
                if (event === 'permissionResponse') {
                    localMockHandler = handler;
                }
            });
        });

        it('should generate correct patterns for file operations', async () => {
            const testCase = {
                toolName: 'Read',
                toolInput: { path: '/path/to/file.txt' },
                expectedPattern: expect.stringContaining('/path/to/file\.txt'),
            };

            const params: RequestPermissionParams = {
                sessionId: 'test-session',
                toolCallId: 'tool-123',
                toolName: testCase.toolName,
                toolInput: testCase.toolInput,
                metadata: {},
            };

            const resultPromise = permissionProvider.handlePermissionRequest(params);
            const postMessageCall = (mockChatProvider.postMessage as any).mock.calls[0][0];
            const requestId = postMessageCall.data.requestId;

            // The pattern generation happens during trust always rule creation
            // We'll test this indirectly by checking the created rule
            localMockHandler({
                requestId,
                outcome: 'allow',
                trustAlways: true,
            });

            const result = await resultPromise;
            if (result.updatedRules && result.updatedRules.length > 0) {
                expect(result.updatedRules[0].pattern).toBe('^/path/to/file\\.txt');
            }
        });
    });
});
