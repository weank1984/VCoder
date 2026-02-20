/**
 * Performance Monitoring Utilities for Webview Message Batching
 * Provides metrics tracking and analysis for message processing
 */

export interface PerformanceMetrics {
    /** Total messages received */
    totalMessagesReceived: number;
    /** Total batches processed */
    batchesProcessed: number;
    /** Average batch size */
    averageBatchSize: number;
    /** Peak batch size */
    peakBatchSize: number;
    /** Total processing time (ms) */
    totalProcessingTime: number;
    /** Average processing time per message (ms) */
    avgProcessingTimePerMessage: number;
    /** Frame drops detected */
    frameDrops: number;
    /** Last update timestamp */
    lastUpdateTime: number;
}

/**
 * Performance monitor for tracking message processing metrics
 */
export class PerformanceMonitor {
    private metrics: PerformanceMetrics = {
        totalMessagesReceived: 0,
        batchesProcessed: 0,
        averageBatchSize: 0,
        peakBatchSize: 0,
        totalProcessingTime: 0,
        avgProcessingTimePerMessage: 0,
        frameDrops: 0,
        lastUpdateTime: Date.now(),
    };

    private lastFrameTime: number = Date.now();
    private readonly TARGET_FRAME_TIME = 16.67; // 60fps

    /**
     * Record a batch processing event
     */
    public recordBatch(batchSize: number, processingTime: number): void {
        this.metrics.totalMessagesReceived += batchSize;
        this.metrics.batchesProcessed++;
        this.metrics.totalProcessingTime += processingTime;

        // Update average batch size
        this.metrics.averageBatchSize =
            (this.metrics.averageBatchSize * (this.metrics.batchesProcessed - 1) + batchSize) /
            this.metrics.batchesProcessed;

        // Update peak batch size
        if (batchSize > this.metrics.peakBatchSize) {
            this.metrics.peakBatchSize = batchSize;
        }

        // Update average processing time
        this.metrics.avgProcessingTimePerMessage =
            this.metrics.totalProcessingTime / this.metrics.totalMessagesReceived;

        // Detect frame drops
        const now = Date.now();
        const frameDelta = now - this.lastFrameTime;
        if (frameDelta > this.TARGET_FRAME_TIME * 2) {
            this.metrics.frameDrops++;
        }
        this.lastFrameTime = now;
        this.metrics.lastUpdateTime = now;
    }

    /**
     * Get current metrics
     */
    public getMetrics(): PerformanceMetrics {
        return { ...this.metrics };
    }

    /**
     * Reset all metrics
     */
    public reset(): void {
        this.metrics = {
            totalMessagesReceived: 0,
            batchesProcessed: 0,
            averageBatchSize: 0,
            peakBatchSize: 0,
            totalProcessingTime: 0,
            avgProcessingTimePerMessage: 0,
            frameDrops: 0,
            lastUpdateTime: Date.now(),
        };
        this.lastFrameTime = Date.now();
    }

    /**
     * Check if performance is degraded
     */
    public isPerformanceDegraded(): boolean {
        const recentFrameDropRate = this.metrics.frameDrops / Math.max(1, this.metrics.batchesProcessed);
        return recentFrameDropRate > 0.1 || this.metrics.avgProcessingTimePerMessage > 10;
    }
}

/**
 * Global performance monitor instance
 */
export const performanceMonitor = new PerformanceMonitor();
