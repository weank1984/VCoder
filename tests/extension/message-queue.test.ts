/**
 * Message Queue Tests
 * Tests for message batching, priority handling, and metrics tracking
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MessageQueue, getMessagePriority } from '../../apps/vscode-extension/src/utils/messageQueue.js';

describe('MessageQueue', () => {
    let onSend: ReturnType<typeof vi.fn>;
    let queue: MessageQueue;

    beforeEach(() => {
        vi.useFakeTimers();
        onSend = vi.fn();
        queue = new MessageQueue({
            maxBatchSize: 5,
            minFlushInterval: 16,
            maxQueueSize: 10,
            onSend,
        });
    });

    afterEach(() => {
        queue.destroy();
        vi.useRealTimers();
    });

    describe('enqueue and flush', () => {
        it('should enqueue messages and send them on flush', () => {
            queue.enqueue({ type: 'update', data: 1 });
            queue.enqueue({ type: 'update', data: 2 });

            queue.flush();

            expect(onSend).toHaveBeenCalledOnce();
            expect(onSend).toHaveBeenCalledWith([
                { type: 'update', data: 1 },
                { type: 'update', data: 2 },
            ]);
        });

        it('should auto-flush after minFlushInterval', () => {
            queue.enqueue({ type: 'update', data: 1 });

            expect(onSend).not.toHaveBeenCalled();

            vi.advanceTimersByTime(20);

            expect(onSend).toHaveBeenCalledOnce();
            expect(onSend).toHaveBeenCalledWith([{ type: 'update', data: 1 }]);
        });

        it('should auto-flush when maxBatchSize is reached', () => {
            for (let i = 0; i < 5; i++) {
                queue.enqueue({ type: 'update', data: i });
            }

            // Should have auto-flushed at batch size 5
            expect(onSend).toHaveBeenCalledOnce();
            expect(onSend.mock.calls[0][0]).toHaveLength(5);
        });

        it('should not send anything on flush when queue is empty', () => {
            queue.flush();

            expect(onSend).not.toHaveBeenCalled();
        });

        it('should clear the queue after flush', () => {
            queue.enqueue({ type: 'update', data: 1 });
            queue.flush();

            onSend.mockClear();
            queue.flush();

            expect(onSend).not.toHaveBeenCalled();
        });
    });

    describe('priority ordering', () => {
        it('should send high priority messages before normal', () => {
            queue.enqueue({ type: 'update', data: 'normal-1' }, 'normal');
            queue.enqueue({ type: 'error', data: 'high-1' }, 'high');
            queue.enqueue({ type: 'update', data: 'normal-2' }, 'normal');

            queue.flush();

            const sentMessages = onSend.mock.calls[0][0];
            expect(sentMessages[0]).toEqual({ type: 'error', data: 'high-1' });
            expect(sentMessages[1]).toEqual({ type: 'update', data: 'normal-1' });
            expect(sentMessages[2]).toEqual({ type: 'update', data: 'normal-2' });
        });

        it('should send normal priority messages before low', () => {
            queue.enqueue({ type: 'agents', data: 'low-1' }, 'low');
            queue.enqueue({ type: 'update', data: 'normal-1' }, 'normal');

            queue.flush();

            const sentMessages = onSend.mock.calls[0][0];
            expect(sentMessages[0]).toEqual({ type: 'update', data: 'normal-1' });
            expect(sentMessages[1]).toEqual({ type: 'agents', data: 'low-1' });
        });

        it('should maintain order within the same priority level', () => {
            queue.enqueue({ data: 'first' }, 'normal');
            queue.enqueue({ data: 'second' }, 'normal');
            queue.enqueue({ data: 'third' }, 'normal');

            queue.flush();

            const sentMessages = onSend.mock.calls[0][0];
            expect(sentMessages[0]).toEqual({ data: 'first' });
            expect(sentMessages[1]).toEqual({ data: 'second' });
            expect(sentMessages[2]).toEqual({ data: 'third' });
        });

        it('should order high > normal > low', () => {
            queue.enqueue({ data: 'low' }, 'low');
            queue.enqueue({ data: 'high' }, 'high');
            queue.enqueue({ data: 'normal' }, 'normal');

            queue.flush();

            const sentMessages = onSend.mock.calls[0][0];
            expect(sentMessages[0]).toEqual({ data: 'high' });
            expect(sentMessages[1]).toEqual({ data: 'normal' });
            expect(sentMessages[2]).toEqual({ data: 'low' });
        });
    });

    describe('queue overflow', () => {
        it('should drop low-priority messages when maxQueueSize is exceeded', () => {
            // Fill queue with normal priority messages (maxQueueSize = 10)
            for (let i = 0; i < 9; i++) {
                queue.enqueue({ data: `normal-${i}` }, 'normal');
            }

            // Add one low priority message
            queue.enqueue({ data: 'low-1' }, 'low');

            // Now queue is at maxQueueSize (10). Adding one more should drop a low-priority msg
            queue.enqueue({ data: 'normal-extra' }, 'normal');

            queue.flush();

            const sentMessages = onSend.mock.calls[0][0];
            // The low-priority message should have been dropped
            const hasLow = sentMessages.some((m: any) => m.data === 'low-1');
            expect(hasLow).toBe(false);
        });

        it('should force flush when queue overflows with no low-priority messages', () => {
            // Fill with all high priority (maxQueueSize = 10)
            for (let i = 0; i < 10; i++) {
                queue.enqueue({ data: `high-${i}` }, 'high');
            }

            // Queue is at max, but auto-flush happened at batch size 5
            // The first 5 were auto-flushed due to maxBatchSize
            expect(onSend).toHaveBeenCalled();

            // Adding one more triggers overflow handling (force flush since no low-priority)
            queue.enqueue({ data: 'overflow' }, 'high');

            // After all flushes, all messages should have been sent
            const allSent = onSend.mock.calls.flatMap((call: unknown[][]) => call[0]);
            expect(allSent.length).toBeGreaterThanOrEqual(10);
        });
    });

    describe('sendImmediate', () => {
        it('should flush pending messages then send immediately', () => {
            queue.enqueue({ data: 'queued' });

            queue.sendImmediate({ data: 'immediate' });

            // First call: flush of queued messages
            // Second call: the immediate message
            expect(onSend).toHaveBeenCalledTimes(2);
            expect(onSend.mock.calls[0][0]).toEqual([{ data: 'queued' }]);
            expect(onSend.mock.calls[1][0]).toEqual([{ data: 'immediate' }]);
        });

        it('should send immediately even with empty queue', () => {
            queue.sendImmediate({ data: 'immediate' });

            expect(onSend).toHaveBeenCalledOnce();
            expect(onSend).toHaveBeenCalledWith([{ data: 'immediate' }]);
        });
    });

    describe('getMetrics', () => {
        it('should track totalMessages', () => {
            queue.enqueue({ data: 1 });
            queue.enqueue({ data: 2 });
            queue.enqueue({ data: 3 });

            const metrics = queue.getMetrics();

            expect(metrics.totalMessages).toBe(3);
        });

        it('should track batchesSent', () => {
            queue.enqueue({ data: 1 });
            queue.flush();
            queue.enqueue({ data: 2 });
            queue.flush();

            const metrics = queue.getMetrics();

            expect(metrics.batchesSent).toBe(2);
        });

        it('should track droppedMessages', () => {
            // Fill queue to max
            for (let i = 0; i < 10; i++) {
                queue.enqueue({ data: `normal-${i}` }, 'normal');
            }

            // Add a low priority at position before overflow
            // Need to reset - create a new queue to test cleanly
            queue.destroy();
            queue = new MessageQueue({
                maxBatchSize: 100, // high batch size to prevent auto-flush
                minFlushInterval: 1000,
                maxQueueSize: 5,
                onSend,
            });
            onSend.mockClear();

            // Fill with 4 normal and 1 low
            for (let i = 0; i < 4; i++) {
                queue.enqueue({ data: `normal-${i}` }, 'normal');
            }
            queue.enqueue({ data: 'low-target' }, 'low');

            // Now at max (5). Adding one more should drop the low-priority message
            queue.enqueue({ data: 'extra' }, 'normal');

            const metrics = queue.getMetrics();
            expect(metrics.droppedMessages).toBe(1);
        });

        it('should track peakQueueSize', () => {
            queue.enqueue({ data: 1 });
            queue.enqueue({ data: 2 });
            queue.enqueue({ data: 3 });

            const metrics = queue.getMetrics();

            expect(metrics.peakQueueSize).toBe(3);
        });

        it('should track immediateMessages', () => {
            queue.sendImmediate({ data: 'imm-1' });
            queue.sendImmediate({ data: 'imm-2' });

            const metrics = queue.getMetrics();

            expect(metrics.immediateMessages).toBe(2);
        });

        it('should return a copy of metrics', () => {
            queue.enqueue({ data: 1 });
            const metrics1 = queue.getMetrics();
            queue.enqueue({ data: 2 });
            const metrics2 = queue.getMetrics();

            // Mutating returned metrics should not affect internal state
            expect(metrics1.totalMessages).toBe(1);
            expect(metrics2.totalMessages).toBe(2);
        });
    });

    describe('resetMetrics', () => {
        it('should reset all metrics to zero', () => {
            queue.enqueue({ data: 1 });
            queue.flush();
            queue.sendImmediate({ data: 2 });

            queue.resetMetrics();

            const metrics = queue.getMetrics();
            expect(metrics.totalMessages).toBe(0);
            expect(metrics.batchesSent).toBe(0);
            expect(metrics.immediateMessages).toBe(0);
            expect(metrics.droppedMessages).toBe(0);
            expect(metrics.peakQueueSize).toBe(0);
            expect(metrics.averageBatchSize).toBe(0);
            expect(metrics.lastFlushDuration).toBe(0);
        });
    });

    describe('destroy', () => {
        it('should cancel pending flushes', () => {
            queue.enqueue({ data: 1 });

            queue.destroy();

            // Advance timers - flush should not happen
            vi.advanceTimersByTime(100);

            expect(onSend).not.toHaveBeenCalled();
        });

        it('should clear the queue', () => {
            queue.enqueue({ data: 1 });
            queue.enqueue({ data: 2 });

            queue.destroy();
            queue.flush();

            expect(onSend).not.toHaveBeenCalled();
        });
    });
});

describe('getMessagePriority', () => {
    describe('high priority messages', () => {
        it('should return high for currentSession', () => {
            expect(getMessagePriority({ type: 'currentSession' })).toBe('high');
        });

        it('should return high for sessions', () => {
            expect(getMessagePriority({ type: 'sessions' })).toBe('high');
        });

        it('should return high for error', () => {
            expect(getMessagePriority({ type: 'error' })).toBe('high');
        });

        it('should return high for complete', () => {
            expect(getMessagePriority({ type: 'complete' })).toBe('high');
        });
    });

    describe('low priority messages', () => {
        it('should return low for workspaceFiles', () => {
            expect(getMessagePriority({ type: 'workspaceFiles' })).toBe('low');
        });

        it('should return low for historySessions', () => {
            expect(getMessagePriority({ type: 'historySessions' })).toBe('low');
        });

        it('should return low for agents', () => {
            expect(getMessagePriority({ type: 'agents' })).toBe('low');
        });
    });

    describe('normal priority messages', () => {
        it('should return normal for update', () => {
            expect(getMessagePriority({ type: 'update' })).toBe('normal');
        });

        it('should return normal for toolCall', () => {
            expect(getMessagePriority({ type: 'toolCall' })).toBe('normal');
        });

        it('should return normal for unknown types', () => {
            expect(getMessagePriority({ type: 'someRandomType' })).toBe('normal');
        });

        it('should return normal for messages without type', () => {
            expect(getMessagePriority({})).toBe('normal');
        });

        it('should return normal for messages with no matching type field', () => {
            expect(getMessagePriority({ value: 42 })).toBe('normal');
        });
    });
});
