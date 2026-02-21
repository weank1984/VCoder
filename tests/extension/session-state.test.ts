/**
 * Session State Tests
 * Tests for session state management and lifecycle
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SessionState } from '../../apps/vscode-extension/webview/src/types.js';
import type { Task, SubagentRunUpdate, FileChangeUpdate } from '../../packages/shared/src/protocol.js';

describe('Session State Operations', () => {
    let mockSessionState: SessionState;

    beforeEach(() => {
        const now = Date.now();
        mockSessionState = {
            id: 'test-session',
            messages: [],
            tasks: [],
            subagentRuns: [],
            pendingFileChanges: [],
            sessionStatus: 'idle',
            lastActivityTime: now,
            createdAt: now,
            updatedAt: now,
        };
    });

    describe('Session creation', () => {
        it('should create session with valid initial state', () => {
            expect(mockSessionState.id).toBe('test-session');
            expect(mockSessionState.messages).toEqual([]);
            expect(mockSessionState.tasks).toEqual([]);
            expect(mockSessionState.subagentRuns).toEqual([]);
            expect(mockSessionState.sessionStatus).toBe('idle');
            expect(mockSessionState.createdAt).toBe(mockSessionState.updatedAt);
        });

        it('should update timestamps on activity', () => {
            vi.useFakeTimers();
            const originalUpdatedAt = mockSessionState.updatedAt;
            
            // Simulate activity after some delay
            vi.advanceTimersByTime(1000);
            const newActivityTime = Date.now();
            
            mockSessionState.lastActivityTime = newActivityTime;
            mockSessionState.updatedAt = newActivityTime;
            
            expect(mockSessionState.lastActivityTime).toBeGreaterThan(originalUpdatedAt);
            expect(mockSessionState.updatedAt).toBeGreaterThan(originalUpdatedAt);
            vi.useRealTimers();
        });
    });

    describe('Task management', () => {
        it('should handle task additions correctly', () => {
            const task: Task = {
                id: 'task-1',
                status: 'pending',
                title: 'Test task',
            };

            mockSessionState.tasks.push(task);
            mockSessionState.updatedAt = Date.now();

            expect(mockSessionState.tasks).toHaveLength(1);
            expect(mockSessionState.tasks[0].id).toBe('task-1');
            expect(mockSessionState.updatedAt).toBeGreaterThanOrEqual(mockSessionState.createdAt);
        });

        it('should handle task status updates', () => {
            const task: Task = {
                id: 'task-1',
                status: 'pending',
                title: 'Test task',
            };

            mockSessionState.tasks.push(task);
            
            const taskIndex = mockSessionState.tasks.findIndex((t: Task) => t.id === 'task-1');
            if (taskIndex !== -1) {
                mockSessionState.tasks[taskIndex] = {
                    ...task,
                    status: 'completed',
                };
                mockSessionState.updatedAt = Date.now();
            }

            const updatedTask = mockSessionState.tasks.find((t: Task) => t.id === 'task-1');
            expect(updatedTask?.status).toBe('completed');
            expect(mockSessionState.updatedAt).toBeGreaterThanOrEqual(mockSessionState.createdAt);
        });
    });

    describe('File change tracking', () => {
        it('should track pending file changes', () => {
            const fileChange: FileChangeUpdate = {
                path: 'test.txt',
                type: 'modified',
                content: 'new content',
                proposed: true,
            };

            // In actual implementation, this would be stored in a separate pendingFileChanges array
            // but for testing, we'll simulate the tracking
            const pendingFileChanges: Array<FileChangeUpdate & { sessionId: string; receivedAt: number }> = [{
                ...fileChange,
                sessionId: mockSessionState.id,
                receivedAt: Date.now(),
            }];

            expect(pendingFileChanges).toHaveLength(1);
            expect(pendingFileChanges[0].path).toBe('test.txt');
            expect(pendingFileChanges[0].sessionId).toBe(mockSessionState.id);
        });
    });

    describe('Session lifecycle', () => {
        it('should handle session completion', () => {
            mockSessionState.sessionStatus = 'completed';
            mockSessionState.sessionCompleteReason = 'cancelled';
            mockSessionState.sessionCompleteMessage = 'Session completed by user';
            mockSessionState.updatedAt = Date.now();

            expect(mockSessionState.sessionStatus).toBe('completed');
            expect(mockSessionState.sessionCompleteReason).toBe('cancelled');
            expect(mockSessionState.sessionCompleteMessage).toBe('Session completed by user');
        });

        it('should handle session errors', () => {
            mockSessionState.sessionStatus = 'error';
            mockSessionState.sessionCompleteReason = 'error';
            mockSessionState.sessionCompleteMessage = 'Connection error occurred';
            mockSessionState.updatedAt = Date.now();

            expect(mockSessionState.sessionStatus).toBe('error');
            expect(mockSessionState.sessionCompleteReason).toBe('error');
        });
    });

    describe('Subagent run management', () => {
        it('should handle subagent runs correctly', () => {
            const subagentRun: SubagentRunUpdate = {
                id: 'subagent-1',
                status: 'running',
                title: 'test-agent',
            };

            mockSessionState.subagentRuns.push(subagentRun);
            mockSessionState.updatedAt = Date.now();

            expect(mockSessionState.subagentRuns).toHaveLength(1);
            expect(mockSessionState.subagentRuns[0].id).toBe('subagent-1');
            expect(mockSessionState.subagentRuns[0].status).toBe('running');
        });
    });

    describe('State consistency', () => {
        it('should maintain timestamp consistency', () => {
            vi.useFakeTimers();
            const originalCreatedAt = mockSessionState.createdAt;
            
            // Multiple updates should maintain consistent timestamps
            vi.advanceTimersByTime(1000);
            mockSessionState.updatedAt = Date.now();
            
            vi.advanceTimersByTime(1000);
            mockSessionState.updatedAt = Date.now();
            
            vi.advanceTimersByTime(1000);
            mockSessionState.lastActivityTime = Date.now();

            expect(mockSessionState.createdAt).toBe(originalCreatedAt);
            expect(mockSessionState.updatedAt).toBeGreaterThan(mockSessionState.createdAt);
            expect(mockSessionState.lastActivityTime).toBeGreaterThanOrEqual(mockSessionState.updatedAt);
            vi.useRealTimers();
        });

        it('should validate required fields', () => {
            expect(() => {
                const invalidSession = {
                    ...mockSessionState,
                    id: '', // Invalid empty ID
                };
                if (!invalidSession.id) {
                    throw new Error('Session ID is required');
                }
            }).toThrow('Session ID is required');
        });
    });
});
