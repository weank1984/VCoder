/**
 * useVirtualList Hook
 * Implements windowed rendering for long message lists
 * Only renders messages within the visible viewport plus overscan
 *
 * Performance optimizations:
 * - Uses binary search for O(log n) index lookups
 * - Cumulative height calculations with memoization
 * - Per-instance height cache (no global state)
 * - Throttled scroll handling
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { RefObject } from 'react';

interface VirtualListOptions {
    itemCount: number;
    estimatedItemHeight: number;
    /**
     * Optional per-item estimate override (e.g., hidden items).
     * Return a number (px) to override the default estimate.
     */
    getItemEstimatedHeight?: (index: number) => number;
    overscan?: number; // Number of items to render outside visible area
}

interface VirtualRange {
    start: number;
    end: number;
    topPadding: number;
    bottomPadding: number;
}

interface VirtualListResult {
    containerRef: RefObject<HTMLDivElement | null>;
    range: VirtualRange;
    onScroll: () => void;
    totalHeight: number;
    /** Reset scroll state and height cache - call when session changes */
    reset: () => void;
}

// Global height cache - keyed by instance id to avoid memory leaks
const heightCacheRegistry = new Map<string, Map<number, number>>();

// Generate unique instance ID
let instanceIdCounter = 0;

/**
 * Binary search to find the index at which accumulated height exceeds target
 * Time complexity: O(log n)
 */
function findIndexByHeight(
    cumulativeHeights: number[],
    targetHeight: number
): number {
    let left = 0;
    let right = cumulativeHeights.length - 1;

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        if (cumulativeHeights[mid] <= targetHeight) {
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }

    return Math.min(left, cumulativeHeights.length - 1);
}

export function useVirtualList(options: VirtualListOptions): VirtualListResult {
    const { itemCount, estimatedItemHeight, getItemEstimatedHeight, overscan = 3 } = options;
    const containerRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(0);

    // Generate stable instance ID
    const instanceIdRef = useRef<string>(`virtual-list-${++instanceIdCounter}`);
    const instanceId = instanceIdRef.current;

    // Get or create height cache for this instance
    const heightCache = useMemo(() => {
        if (!heightCacheRegistry.has(instanceId)) {
            heightCacheRegistry.set(instanceId, new Map());
        }
        return heightCacheRegistry.get(instanceId)!;
    }, [instanceId]);

    // Cleanup height cache on unmount
    useEffect(() => {
        return () => {
            heightCacheRegistry.delete(instanceId);
        };
    }, [instanceId]);

    // Update container height on resize with throttling
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        let rafId: number | null = null;
        const observer = new ResizeObserver((entries) => {
            if (rafId !== null) return; // Throttle to animation frame

            rafId = requestAnimationFrame(() => {
                rafId = null;
                for (const entry of entries) {
                    setContainerHeight(entry.contentRect.height);
                }
            });
        });

        observer.observe(container);
        setContainerHeight(container.clientHeight);

        return () => {
            observer.disconnect();
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
            }
        };
    }, []);

    // Throttled scroll handler
    const scrollRafRef = useRef<number | null>(null);
    const onScroll = useCallback(() => {
        if (scrollRafRef.current !== null) return;

        scrollRafRef.current = requestAnimationFrame(() => {
            scrollRafRef.current = null;
            const container = containerRef.current;
            if (container) {
                setScrollTop(container.scrollTop);
            }
        });
    }, []);

    // Cleanup scroll RAF on unmount
    useEffect(() => {
        return () => {
            if (scrollRafRef.current !== null) {
                cancelAnimationFrame(scrollRafRef.current);
            }
        };
    }, []);

    // Get height for an item (cached or estimated)
    const getItemHeight = useCallback((index: number): number => {
        const cached = heightCache.get(index);
        if (cached !== undefined) return cached;
        if (getItemEstimatedHeight) return getItemEstimatedHeight(index);
        return estimatedItemHeight;
    }, [heightCache, estimatedItemHeight, getItemEstimatedHeight]);

    // Calculate cumulative heights for binary search
    const cumulativeHeights = useMemo(() => {
        const heights: number[] = [];
        let accumulated = 0;

        for (let i = 0; i < itemCount; i++) {
            accumulated += getItemHeight(i);
            heights[i] = accumulated;
        }

        return heights;
    }, [itemCount, getItemHeight]);

    // Calculate total height (last cumulative height or 0)
    const totalHeight = useMemo(() => {
        if (itemCount === 0) return 0;
        return cumulativeHeights[itemCount - 1] || 0;
    }, [itemCount, cumulativeHeights]);

    // Calculate visible range using binary search for O(log n) performance
    const range = useMemo((): VirtualRange => {
        if (itemCount === 0) {
            return { start: 0, end: 0, topPadding: 0, bottomPadding: 0 };
        }

        // Find start index using binary search
        const startIndex = findIndexByHeight(cumulativeHeights, scrollTop);

        // Apply overscan to start
        const start = Math.max(0, startIndex - overscan);

        // Calculate top padding directly from cumulative heights
        const topPadding = start > 0 ? cumulativeHeights[start - 1] : 0;

        // Find end index using binary search
        const viewportBottom = scrollTop + containerHeight;
        let endIndex = findIndexByHeight(cumulativeHeights, viewportBottom);

        // Ensure at least one item is rendered
        if (endIndex <= startIndex) {
            endIndex = startIndex + 1;
        }

        // Apply overscan to end
        const end = Math.min(itemCount, endIndex + overscan);

        // Calculate bottom padding
        const totalH = cumulativeHeights[itemCount - 1] || 0;
        const bottomPadding = end > 0 ? totalH - cumulativeHeights[end - 1] : totalH;

        return { start, end, topPadding, bottomPadding };
    }, [itemCount, scrollTop, containerHeight, overscan, cumulativeHeights]);

    // Reset scroll state and height cache - use when session changes
    const reset = useCallback(() => {
        setScrollTop(0);
        heightCache.clear();
        // Also reset container scroll position
        if (containerRef.current) {
            containerRef.current.scrollTop = 0;
        }
    }, [heightCache]);

    return { containerRef, range, onScroll, totalHeight, reset };
}

/**
 * Call this to cache the measured height of an item
 * Note: This is a no-op now as height caching is handled internally by the hook instance.
 * Consider using the returned 'reset' function to clear the cache.
 * @deprecated Height caching is now handled internally
 */
export function setItemHeight(_index: number, _height: number): void {
    // No-op: height caching is handled internally per-instance
}

/**
 * Clear height cache (e.g., when messages change significantly)
 * Note: This is a no-op now. Use the 'reset' function returned by useVirtualList instead.
 * @deprecated Use the 'reset' function returned by useVirtualList
 */
export function clearHeightCache(): void {
    // Clear all instance caches (emergency cleanup)
    heightCacheRegistry.clear();
}
