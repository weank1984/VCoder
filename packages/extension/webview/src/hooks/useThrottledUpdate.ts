/**
 * Throttled Update Hook
 * Provides throttling for high-frequency updates (agent messages, terminal output)
 * Features:
 * - Configurable throttle delay
 * - Automatic batching of updates
 * - Backpressure handling
 * - Flush on completion
 */

import { useState, useCallback, useEffect, useRef } from 'react';

interface ThrottleOptions {
    delay: number; // Throttle delay in ms
    maxBatchSize?: number; // Maximum batch size before forcing flush
    leading?: boolean; // Execute on leading edge
    trailing?: boolean; // Execute on trailing edge
}

const DEFAULT_OPTIONS: Required<ThrottleOptions> = {
    delay: 100,
    maxBatchSize: 50,
    leading: false,
    trailing: true,
};

/**
 * Throttled update hook for high-frequency updates.
 */
export function useThrottledUpdate<T>(
    onUpdate: (value: T) => void,
    options: ThrottleOptions = { delay: 100 }
) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    
    const [pendingUpdates, setPendingUpdates] = useState<T[]>([]);
    const throttleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastUpdateTime = useRef<number>(0);
    const isMounted = useRef(true);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            isMounted.current = false;
            if (throttleTimer.current) {
                clearTimeout(throttleTimer.current);
            }
        };
    }, []);

    /**
     * Add update to queue.
     */
    const addUpdate = useCallback((value: T) => {
        if (!isMounted.current) return;

        setPendingUpdates(prev => {
            const newUpdates = [...prev, value];
            
            // Check if we need to force flush due to batch size
            if (newUpdates.length >= opts.maxBatchSize) {
                // Schedule immediate flush
                if (throttleTimer.current) {
                    clearTimeout(throttleTimer.current);
                }
                throttleTimer.current = setTimeout(() => flush(newUpdates), 0);
                return [];
            }
            
            // Schedule throttled flush
            scheduleFlush();
            
            return newUpdates;
        });
    }, [opts.maxBatchSize]);

    /**
     * Schedule a throttled flush.
     */
    const scheduleFlush = useCallback(() => {
        if (throttleTimer.current) {
            return; // Already scheduled
        }

        const now = Date.now();
        const timeSinceLastUpdate = now - lastUpdateTime.current;

        if (opts.leading && timeSinceLastUpdate >= opts.delay) {
            // Execute immediately (leading edge)
            flush(pendingUpdates);
            setPendingUpdates([]);
        } else {
            // Schedule for later (trailing edge)
            const delay = opts.trailing
                ? Math.max(0, opts.delay - timeSinceLastUpdate)
                : opts.delay;

            throttleTimer.current = setTimeout(() => {
                throttleTimer.current = null;
                if (isMounted.current) {
                    setPendingUpdates(updates => {
                        flush(updates);
                        return [];
                    });
                }
            }, delay);
        }
    }, [opts.delay, opts.leading, opts.trailing]);

    /**
     * Flush pending updates.
     */
    const flush = useCallback((updates: T[]) => {
        if (updates.length === 0 || !isMounted.current) {
            return;
        }

        lastUpdateTime.current = Date.now();
        
        // Batch process all pending updates
        for (const update of updates) {
            onUpdate(update);
        }
    }, [onUpdate]);

    /**
     * Force flush all pending updates immediately.
     */
    const forceFlush = useCallback(() => {
        if (throttleTimer.current) {
            clearTimeout(throttleTimer.current);
            throttleTimer.current = null;
        }

        setPendingUpdates(updates => {
            flush(updates);
            return [];
        });
    }, [flush]);

    /**
     * Get current queue size.
     */
    const getQueueSize = useCallback(() => {
        return pendingUpdates.length;
    }, [pendingUpdates.length]);

    return {
        addUpdate,
        forceFlush,
        getQueueSize,
        hasPendingUpdates: pendingUpdates.length > 0,
    };
}

/**
 * Throttled value hook - simpler version that returns throttled value.
 */
export function useThrottledValue<T>(value: T, delay: number = 100): T {
    const [throttledValue, setThrottledValue] = useState<T>(value);
    const throttleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (throttleTimer.current) {
            clearTimeout(throttleTimer.current);
        }

        throttleTimer.current = setTimeout(() => {
            setThrottledValue(value);
        }, delay);

        return () => {
            if (throttleTimer.current) {
                clearTimeout(throttleTimer.current);
            }
        };
    }, [value, delay]);

    return throttledValue;
}
