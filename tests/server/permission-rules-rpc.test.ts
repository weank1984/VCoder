/**
 * Permission Rules RPC Tests
 * Tests for permissionRules/list, permissionRule/add, permissionRule/update, permissionRule/delete
 * Server-side handlers that forward to Client via bidirectional RPC.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Readable, Writable } from 'stream';
import { ACPServer } from '../../packages/server/src/acp/server';
import { ClaudeCodeWrapper } from '../../packages/server/src/claude/wrapper';
import type {
    JsonRpcRequest,
    PermissionRule,
    PermissionRulesListResult,
} from '@vcoder/shared';

// Mock ClaudeCodeWrapper
vi.mock('../../packages/server/src/claude/wrapper', () => ({
    ClaudeCodeWrapper: class {
        on = vi.fn();
        prompt = vi.fn().mockResolvedValue(undefined);
        updateSettings = vi.fn();
        bindClaudeSessionId = vi.fn();
        acceptFileChange = vi.fn().mockResolvedValue(undefined);
        rejectFileChange = vi.fn().mockResolvedValue(undefined);
        confirmBash = vi.fn().mockResolvedValue(undefined);
        skipBash = vi.fn().mockResolvedValue(undefined);
        confirmPlan = vi.fn().mockResolvedValue(undefined);
        confirmTool = vi.fn().mockResolvedValue(undefined);
        cancel = vi.fn().mockResolvedValue(undefined);
        promptPersistent = vi.fn().mockResolvedValue(undefined);
        getPersistentSessionStatus = vi.fn().mockReturnValue(null);
        stopPersistentSession = vi.fn().mockResolvedValue(undefined);
        shutdown = vi.fn().mockResolvedValue(undefined);
        constructor(options: unknown) {}
    },
}));

describe('Permission Rules RPC (Server)', () => {
    let mockStdin: Readable;
    let mockStdout: Writable;
    let mockClaudeCode: ClaudeCodeWrapper;
    let server: ACPServer;
    let stdoutData: string[];

    beforeEach(() => {
        mockStdin = new Readable();
        mockStdin._read = vi.fn();

        stdoutData = [];
        mockStdout = new Writable();
        mockStdout._write = (chunk: Buffer, encoding, callback) => {
            stdoutData.push(chunk.toString());
            callback();
        };

        mockClaudeCode = new ClaudeCodeWrapper({ workingDirectory: '/test' });
        server = new ACPServer(mockStdin, mockStdout, mockClaudeCode);
    });

    const sampleRule: PermissionRule = {
        id: 'rule-1',
        toolName: 'Bash',
        pattern: '^echo\\s+',
        action: 'allow',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        description: 'Allow echo commands',
    };

    /**
     * Helper: simulate a client response to the server's bidirectional RPC request.
     * The server sends the request to stdout, we parse it and inject a response into stdin.
     */
    function setupClientResponse(result: unknown): void {
        // After the server writes a request to stdout, we parse and respond
        const originalWrite = mockStdout._write!.bind(mockStdout);
        mockStdout._write = (chunk: Buffer, encoding: any, callback: any) => {
            const text = chunk.toString().trim();
            stdoutData.push(text);
            try {
                const msg = JSON.parse(text);
                // If this is a request (has 'method' and 'id'), send a response
                if (msg.method && msg.id !== undefined) {
                    const response = JSON.stringify({
                        jsonrpc: '2.0',
                        id: msg.id,
                        result,
                    });
                    // Feed the response back into stdin
                    mockStdin.push(response + '\n');
                }
            } catch {
                // Not JSON, ignore
            }
            callback();
        };
    }

    describe('permissionRules/list', () => {
        it('should forward list request to client and return rules', async () => {
            const expectedResult: PermissionRulesListResult = {
                rules: [sampleRule],
            };
            setupClientResponse(expectedResult);

            // Start listening for stdin
            await server.start();

            const request: JsonRpcRequest = {
                jsonrpc: '2.0',
                id: 1,
                method: 'permissionRules/list',
                params: {},
            };

            const response = await (server as any).handleRequest(request);

            expect(response.error).toBeUndefined();
            expect(response.result).toEqual(expectedResult);
        });

        it('should forward toolName filter parameter', async () => {
            const expectedResult: PermissionRulesListResult = { rules: [] };
            setupClientResponse(expectedResult);
            await server.start();

            const request: JsonRpcRequest = {
                jsonrpc: '2.0',
                id: 2,
                method: 'permissionRules/list',
                params: { toolName: 'Bash' },
            };

            const response = await (server as any).handleRequest(request);
            expect(response.error).toBeUndefined();

            // Verify the request sent to client includes the toolName filter
            const sentRequest = stdoutData
                .map(d => { try { return JSON.parse(d); } catch { return null; } })
                .find(m => m?.method === 'permissionRules/list');
            expect(sentRequest?.params?.toolName).toBe('Bash');
        });
    });

    describe('permissionRule/add', () => {
        it('should forward add request to client and return updated rules', async () => {
            const expectedResult: PermissionRulesListResult = {
                rules: [sampleRule],
            };
            setupClientResponse(expectedResult);
            await server.start();

            const request: JsonRpcRequest = {
                jsonrpc: '2.0',
                id: 3,
                method: 'permissionRule/add',
                params: {
                    sessionId: 'test-session',
                    rule: {
                        toolName: 'Bash',
                        pattern: '^echo\\s+',
                        action: 'allow',
                        description: 'Allow echo commands',
                    },
                },
            };

            const response = await (server as any).handleRequest(request);
            expect(response.error).toBeUndefined();
            expect(response.result.rules).toHaveLength(1);
        });
    });

    describe('permissionRule/update', () => {
        it('should forward update request to client', async () => {
            const updatedRule = { ...sampleRule, action: 'deny' as const };
            const expectedResult: PermissionRulesListResult = {
                rules: [updatedRule],
            };
            setupClientResponse(expectedResult);
            await server.start();

            const request: JsonRpcRequest = {
                jsonrpc: '2.0',
                id: 4,
                method: 'permissionRule/update',
                params: {
                    sessionId: 'test-session',
                    ruleId: 'rule-1',
                    updates: { action: 'deny' },
                },
            };

            const response = await (server as any).handleRequest(request);
            expect(response.error).toBeUndefined();
            expect(response.result.rules[0].action).toBe('deny');
        });
    });

    describe('permissionRule/delete', () => {
        it('should forward delete request to client and return empty rules', async () => {
            const expectedResult: PermissionRulesListResult = { rules: [] };
            setupClientResponse(expectedResult);
            await server.start();

            const request: JsonRpcRequest = {
                jsonrpc: '2.0',
                id: 5,
                method: 'permissionRule/delete',
                params: {
                    sessionId: 'test-session',
                    ruleId: 'rule-1',
                },
            };

            const response = await (server as any).handleRequest(request);
            expect(response.error).toBeUndefined();
            expect(response.result.rules).toHaveLength(0);
        });
    });

    describe('Error handling', () => {
        it('should return error when client request times out', async () => {
            // Don't set up client response -> timeout
            vi.useFakeTimers();

            const request: JsonRpcRequest = {
                jsonrpc: '2.0',
                id: 6,
                method: 'permissionRules/list',
                params: {},
            };

            const responsePromise = (server as any).handleRequest(request);

            // Advance past the 30s timeout
            vi.advanceTimersByTime(31000);

            const response = await responsePromise;
            expect(response.error).toBeDefined();
            expect(response.error.message).toContain('timeout');

            vi.useRealTimers();
        });
    });
});
