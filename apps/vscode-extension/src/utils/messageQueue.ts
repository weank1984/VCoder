/**
 * Message Queue Utility for Extension-to-Webview Communication
 * Implements efficient batching with priority handling and performance monitoring
 */

export type MessagePriority = 'high' | 'normal' | 'low';

export interface QueuedMessage {
    message: unknown;
    priority: MessagePriority;
    timestamp: number;
}

export interface BatchMetrics {
    totalMessages: number;
    batchesSent: number;
    immediateMessages: number;
    averageBatchSize: number;
    droppedMessages: number;
    peakQueueSize: number;
    lastFlushDuration: number;
}

export interface MessageQueueOptions {
    /** Maximum batch size before forcing flush (default: 50) */
    maxBatchSize?: number;
    /** Minimum interval between flushes in ms (default: 16ms ~60fps) */
    minFlushInterval?: number;
    /** Maximum queue size before dropping low-priority messages (default: 200) */
    maxQueueSize?: number;
    /** Callback when messages are sent */
    onSend?: (messages: unknown[]) => void;
}

/**
 * High-performance message queue with batching and priority support
 */
export class MessageQueue {
    private queue: QueuedMessage[] = [];
    private flushTimer: NodeJS.Timeout | null = null;
    private lastFlushTime: number = 0;
    private metrics: BatchMetrics = {
        totalMessages: 0,
        batchesSent: 0,
        immediateMessages: 0,
        averageBatchSize: 0,
        droppedMessages: 0,
        peakQueueSize: 0,
        lastFlushDuration: 0,
    };

    private readonly maxBatchSize: number;
    private readonly minFlushInterval: number;
    private readonly maxQueueSize: number;
    private readonly onSend: (messages: unknown[]) => void;

    constructor(options: MessageQueueOptions = {}) {
        this.maxBatchSize = options.maxBatchSize ?? 50;
        this.minFlushInterval = options.minFlushInterval ?? 16;
        this.maxQueueSize = options.maxQueueSize ?? 200;
        this.onSend = options.onSend ?? (() => {});
    }

    /**
     * Enqueue a message with optional priority
     */
    public enqueue(message: unknown, priority: MessagePriority = 'normal'): void {
        this.metrics.totalMessages++;

        // Handle queue overflow by dropping low-priority messages
        if (this.queue.length >= this.maxQueueSize) {
            const lowPriorityIndex = this.queue.findIndex((m) => m.priority === 'low');
            if (lowPriorityIndex !== -1) {
                this.queue.splice(lowPriorityIndex, 1);
                this.metrics.droppedMessages++;
            } else {
                // Queue full with normal/high priority - force flush
                this.flush();
            }
        }

        const queuedMessage: QueuedMessage = {
            message,
            priority,
            timestamp: Date.now(),
        };

        // Insert based on priority (high > normal > low)
        const insertIndex = this.findInsertIndex(priority);
        this.queue.splice(insertIndex, 0, queuedMessage);

        // Update peak queue size
        if (this.queue.length > this.metrics.peakQueueSize) {
            this.metrics.peakQueueSize = this.queue.length;
        }

        // Force flush if batch size exceeded
        if (this.queue.length >= this.maxBatchSize) {
            this.flush();
            return;
        }

        // Schedule flush if not already scheduled
        this.scheduleFlush();
    }

    /**
     * Send a message immediately, bypassing the queue
     */
    public sendImmediate(message: unknown): void {
        this.metrics.immediateMessages++;
        this.metrics.totalMessages++;

        // Flush any pending messages first
        this.flush();

        // Send immediately
        this.onSend([message]);
    }

    /**
     * Flush all queued messages immediately
     */
    public flush(): void {
        if (this.flushTimer !== null) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }

        if (this.queue.length === 0) {
            return;
        }

        const startTime = Date.now();
        const messages = this.queue.map((qm) => qm.message);
        const batchSize = messages.length;

        // Send all messages
        this.onSend(messages);

        // Update metrics
        this.metrics.batchesSent++;
        this.metrics.averageBatchSize =
            (this.metrics.averageBatchSize * (this.metrics.batchesSent - 1) + batchSize) /
            this.metrics.batchesSent;
        this.metrics.lastFlushDuration = Date.now() - startTime;
        this.lastFlushTime = Date.now();

        // Clear queue
        this.queue = [];
    }

    /**
     * Get current metrics
     */
    public getMetrics(): BatchMetrics {
        return { ...this.metrics };
    }

    /**
     * Reset metrics
     */
    public resetMetrics(): void {
        this.metrics = {
            totalMessages: 0,
            batchesSent: 0,
            immediateMessages: 0,
            averageBatchSize: 0,
            droppedMessages: 0,
            peakQueueSize: 0,
            lastFlushDuration: 0,
        };
    }

    /**
     * Destroy the queue and cancel pending flushes
     */
    public destroy(): void {
        if (this.flushTimer !== null) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        this.queue = [];
    }

    /**
     * Schedule a flush using setTimeout
     */
    private scheduleFlush(): void {
        if (this.flushTimer !== null) {
            return; // Already scheduled
        }

        const timeSinceLastFlush = Date.now() - this.lastFlushTime;

        // If enough time has passed, schedule immediate flush
        const delay = Math.max(0, this.minFlushInterval - timeSinceLastFlush);

        this.flushTimer = setTimeout(() => {
            this.flushTimer = null;
            this.flush();
        }, delay);
    }

    /**
     * Find the correct insertion index based on priority
     * Maintains stability within same priority level
     */
    private findInsertIndex(priority: MessagePriority): number {
        if (this.queue.length === 0) {
            return 0;
        }

        // High priority goes to front, low priority to back
        const priorityValue = this.getPriorityValue(priority);

        for (let i = 0; i < this.queue.length; i++) {
            const queuedPriority = this.getPriorityValue(this.queue[i].priority);
            if (priorityValue > queuedPriority) {
                return i;
            }
        }

        return this.queue.length;
    }

    /**
     * Get numeric value for priority (higher = more important)
     */
    private getPriorityValue(priority: MessagePriority): number {
        switch (priority) {
            case 'high':
                return 3;
            case 'normal':
                return 2;
            case 'low':
                return 1;
        }
    }
}

/**
 * Helper function to determine message priority based on type
 */
export function getMessagePriority(message: unknown): MessagePriority {
    const msg = message as { type?: string };

    // High priority: user-facing state changes
    if (
        msg.type === 'currentSession' ||
        msg.type === 'sessions' ||
        msg.type === 'error' ||
        msg.type === 'complete'
    ) {
        return 'high';
    }

    // Low priority: background updates
    if (
        msg.type === 'workspaceFiles' ||
        msg.type === 'historySessions' ||
        msg.type === 'agents'
    ) {
        return 'low';
    }

    // Normal priority: everything else (updates, tool calls, etc.)
    return 'normal';
}
