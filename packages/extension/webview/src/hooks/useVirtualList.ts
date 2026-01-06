/**
 * useVirtualList Hook
 * Implements windowed rendering for long message lists
 * Only renders messages within the visible viewport plus overscan
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { RefObject } from 'react';

interface VirtualListOptions {
    itemCount: number;
    estimatedItemHeight: number;
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

// Height cache for measured items
const heightCache = new Map<number, number>();

export function useVirtualList(options: VirtualListOptions): VirtualListResult {
    const { itemCount, estimatedItemHeight, overscan = 3 } = options;
    const containerRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(0);

    // Update container height on resize
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setContainerHeight(entry.contentRect.height);
            }
        });

        observer.observe(container);
        setContainerHeight(container.clientHeight);

        return () => observer.disconnect();
    }, []);

    const onScroll = useCallback(() => {
        const container = containerRef.current;
        if (container) {
            setScrollTop(container.scrollTop);
        }
    }, []);

    // Get height for an item (cached or estimated)
    const getItemHeight = useCallback((index: number): number => {
        return heightCache.get(index) ?? estimatedItemHeight;
    }, [estimatedItemHeight]);

    // Calculate total height
    const totalHeight = useMemo(() => {
        let height = 0;
        for (let i = 0; i < itemCount; i++) {
            height += getItemHeight(i);
        }
        return height;
    }, [itemCount, getItemHeight]);

    // Calculate visible range
    const range = useMemo((): VirtualRange => {
        if (itemCount === 0) {
            return { start: 0, end: 0, topPadding: 0, bottomPadding: 0 };
        }

        // Find start index
        let accumulatedHeight = 0;
        let startIndex = 0;
        for (let i = 0; i < itemCount; i++) {
            const itemHeight = getItemHeight(i);
            if (accumulatedHeight + itemHeight > scrollTop) {
                startIndex = i;
                break;
            }
            accumulatedHeight += itemHeight;
        }

        // Apply overscan to start
        const start = Math.max(0, startIndex - overscan);

        // Calculate top padding (height of items before start)
        let topPadding = 0;
        for (let i = 0; i < start; i++) {
            topPadding += getItemHeight(i);
        }

        // Find end index
        let visibleHeight = 0;
        let endIndex = startIndex;
        const startOffset = accumulatedHeight;
        
        for (let i = startIndex; i < itemCount; i++) {
            visibleHeight += getItemHeight(i);
            endIndex = i + 1;
            if (startOffset + visibleHeight > scrollTop + containerHeight) {
                break;
            }
        }

        // Apply overscan to end
        const end = Math.min(itemCount, endIndex + overscan);

        // Calculate bottom padding (height of items after end)
        let bottomPadding = 0;
        for (let i = end; i < itemCount; i++) {
            bottomPadding += getItemHeight(i);
        }

        return { start, end, topPadding, bottomPadding };
    }, [itemCount, scrollTop, containerHeight, overscan, getItemHeight]);

    // Reset scroll state and height cache - use when session changes
    const reset = useCallback(() => {
        setScrollTop(0);
        heightCache.clear();
        // Also reset container scroll position
        if (containerRef.current) {
            containerRef.current.scrollTop = 0;
        }
    }, []);

    return { containerRef, range, onScroll, totalHeight, reset };
}

/**
 * Call this to cache the measured height of an item
 */
export function setItemHeight(index: number, height: number): void {
    heightCache.set(index, height);
}

/**
 * Clear height cache (e.g., when messages change significantly)
 */
export function clearHeightCache(): void {
    heightCache.clear();
}
