/**
 * Permission Rules Matching Tests
 * Tests for automatic rule matching in PermissionProvider.
 * When a confirmation_request arrives, rules are checked and
 * matching rules auto-approve or auto-deny the request.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PermissionProvider } from '../../packages/extension/src/services/permissionProvider.js';
import type { RequestPermissionParams, PermissionRule } from '../../packages/shared/src/protocol.js';

// Mock SessionStore
function createMockSessionStore(rules: PermissionRule[] = []) {
    return {
        getPermissionRules: vi.fn().mockResolvedValue(rules),
        addPermissionRule: vi.fn().mockResolvedValue(undefined),
        deletePermissionRule: vi.fn().mockResolvedValue(undefined),
        clearPermissionRules: vi.fn().mockResolvedValue(undefined),
    };
}

// Mock ChatViewProvider
function createMockChatProvider() {
    return {
        postMessage: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
    };
}

describe('PermissionProvider - Rule Matching', () => {
    describe('Auto-approve with matching allow rule', () => {
        it('should auto-approve when toolName matches', async () => {
            const rules: PermissionRule[] = [{
                id: 'rule-1',
                toolName: 'Read',
                action: 'allow',
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-01T00:00:00Z',
            }];

            const mockStore = createMockSessionStore(rules);
            const mockChat = createMockChatProvider();
            const provider = new PermissionProvider(mockChat as any, mockStore as any);

            const params: RequestPermissionParams = {
                sessionId: 'test-session',
                toolCallId: 'tool-1',
                toolName: 'Read',
                toolInput: { path: '/test/file.txt' },
            };

            const result = await provider.handlePermissionRequest(params);
            expect(result.outcome).toBe('allow');
            // Should NOT have sent to webview (auto-approved)
            expect(mockChat.postMessage).not.toHaveBeenCalled();
        });

        it('should auto-deny when deny rule matches', async () => {
            const rules: PermissionRule[] = [{
                id: 'rule-2',
                toolName: 'Bash',
                action: 'deny',
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-01T00:00:00Z',
            }];

            const mockStore = createMockSessionStore(rules);
            const mockChat = createMockChatProvider();
            const provider = new PermissionProvider(mockChat as any, mockStore as any);

            const params: RequestPermissionParams = {
                sessionId: 'test-session',
                toolCallId: 'tool-2',
                toolName: 'Bash',
                toolInput: { command: 'rm -rf /' },
            };

            const result = await provider.handlePermissionRequest(params);
            expect(result.outcome).toBe('deny');
            expect(mockChat.postMessage).not.toHaveBeenCalled();
        });
    });

    describe('Pattern matching', () => {
        it('should match when pattern matches tool input values', async () => {
            const rules: PermissionRule[] = [{
                id: 'rule-3',
                toolName: 'Read',
                pattern: '/safe/path',
                action: 'allow',
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-01T00:00:00Z',
            }];

            const mockStore = createMockSessionStore(rules);
            const mockChat = createMockChatProvider();
            const provider = new PermissionProvider(mockChat as any, mockStore as any);

            const result = await provider.handlePermissionRequest({
                sessionId: 's1',
                toolCallId: 't1',
                toolName: 'Read',
                toolInput: { path: '/safe/path/file.txt' },
            });

            expect(result.outcome).toBe('allow');
        });

        it('should not match when pattern does not match', async () => {
            const rules: PermissionRule[] = [{
                id: 'rule-4',
                toolName: 'Read',
                pattern: '^/safe/',
                action: 'allow',
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-01T00:00:00Z',
            }];

            const mockStore = createMockSessionStore(rules);
            const mockChat = createMockChatProvider();
            const provider = new PermissionProvider(mockChat as any, mockStore as any);

            // Fire-and-forget (would hang waiting for user response)
            void provider.handlePermissionRequest({
                sessionId: 's1',
                toolCallId: 't1',
                toolName: 'Read',
                toolInput: { path: '/dangerous/path/file.txt' },
            });

            // Wait for microtask to allow async findMatchingRule to resolve
            await new Promise((r) => setTimeout(r, 10));

            // Should have sent to webview (no matching rule)
            expect(mockChat.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'permissionRequest' })
            );
        });
    });

    describe('Expiration handling', () => {
        it('should skip expired rules', async () => {
            const pastDate = new Date(Date.now() - 1000).toISOString();
            const rules: PermissionRule[] = [{
                id: 'rule-expired',
                toolName: 'Bash',
                action: 'allow',
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-01T00:00:00Z',
                expiresAt: pastDate,
            }];

            const mockStore = createMockSessionStore(rules);
            const mockChat = createMockChatProvider();
            const provider = new PermissionProvider(mockChat as any, mockStore as any);

            void provider.handlePermissionRequest({
                sessionId: 's1',
                toolCallId: 't1',
                toolName: 'Bash',
                toolInput: { command: 'echo hello' },
            });

            // Wait for microtask to allow async findMatchingRule to resolve
            await new Promise((r) => setTimeout(r, 10));

            // Should have sent to webview because the rule expired
            expect(mockChat.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'permissionRequest' })
            );
        });

        it('should apply non-expired rules', async () => {
            const futureDate = new Date(Date.now() + 60000).toISOString();
            const rules: PermissionRule[] = [{
                id: 'rule-future',
                toolName: 'Bash',
                action: 'allow',
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-01T00:00:00Z',
                expiresAt: futureDate,
            }];

            const mockStore = createMockSessionStore(rules);
            const mockChat = createMockChatProvider();
            const provider = new PermissionProvider(mockChat as any, mockStore as any);

            const result = await provider.handlePermissionRequest({
                sessionId: 's1',
                toolCallId: 't1',
                toolName: 'Bash',
                toolInput: { command: 'echo hello' },
            });

            expect(result.outcome).toBe('allow');
            expect(mockChat.postMessage).not.toHaveBeenCalled();
        });
    });

    describe('No matching rule - prompt user', () => {
        it('should prompt user when no rules match', async () => {
            const rules: PermissionRule[] = [{
                id: 'rule-other',
                toolName: 'Write',
                action: 'allow',
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-01T00:00:00Z',
            }];

            const mockStore = createMockSessionStore(rules);
            const mockChat = createMockChatProvider();
            const provider = new PermissionProvider(mockChat as any, mockStore as any);

            // Request for Read tool, but only Write rule exists
            void provider.handlePermissionRequest({
                sessionId: 's1',
                toolCallId: 't1',
                toolName: 'Read',
                toolInput: { path: '/test.txt' },
            });

            await new Promise((r) => setTimeout(r, 10));

            expect(mockChat.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'permissionRequest' })
            );
        });

        it('should prompt user when no rules exist', async () => {
            const mockStore = createMockSessionStore([]);
            const mockChat = createMockChatProvider();
            const provider = new PermissionProvider(mockChat as any, mockStore as any);

            void provider.handlePermissionRequest({
                sessionId: 's1',
                toolCallId: 't1',
                toolName: 'Bash',
                toolInput: { command: 'ls' },
            });

            await new Promise((r) => setTimeout(r, 10));

            expect(mockChat.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'permissionRequest' })
            );
        });
    });

    describe('Rule without toolName (wildcard)', () => {
        it('should match any tool when toolName is not set', async () => {
            const rules: PermissionRule[] = [{
                id: 'rule-wildcard',
                action: 'allow',
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-01T00:00:00Z',
            }];

            const mockStore = createMockSessionStore(rules);
            const mockChat = createMockChatProvider();
            const provider = new PermissionProvider(mockChat as any, mockStore as any);

            const result = await provider.handlePermissionRequest({
                sessionId: 's1',
                toolCallId: 't1',
                toolName: 'AnyTool',
                toolInput: {},
            });

            expect(result.outcome).toBe('allow');
        });
    });

    describe('Invalid pattern handling', () => {
        it('should skip rules with invalid regex patterns', async () => {
            const rules: PermissionRule[] = [{
                id: 'rule-bad-regex',
                toolName: 'Bash',
                pattern: '[invalid',
                action: 'allow',
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-01T00:00:00Z',
            }];

            const mockStore = createMockSessionStore(rules);
            const mockChat = createMockChatProvider();
            const provider = new PermissionProvider(mockChat as any, mockStore as any);

            // Should not throw, should fall through to user prompt
            void provider.handlePermissionRequest({
                sessionId: 's1',
                toolCallId: 't1',
                toolName: 'Bash',
                toolInput: { command: 'echo hello' },
            });

            await new Promise((r) => setTimeout(r, 10));

            expect(mockChat.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'permissionRequest' })
            );
        });
    });
});
