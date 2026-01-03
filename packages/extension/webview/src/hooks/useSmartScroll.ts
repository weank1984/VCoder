/**
 * useSmartScroll Hook
 * Implements bottom-lock + jump-to-bottom behavior for message lists
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import type { RefObject } from 'react';

const AUTO_SCROLL_THRESHOLD_PX = 80;

function isNearBottom(el: HTMLElement): boolean {
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distanceFromBottom < AUTO_SCROLL_THRESHOLD_PX;
}

interface SmartScrollResult {
    containerRef: RefObject<HTMLDivElement | null>;
    endRef: RefObject<HTMLDivElement | null>;
    onScroll: () => void;
    autoScroll: boolean;
    jumpToBottom: () => void;
}

export function useSmartScroll<T>(deps: T[]): SmartScrollResult {
    const containerRef = useRef<HTMLDivElement>(null);
    const endRef = useRef<HTMLDivElement>(null);
    const [autoScroll, setAutoScroll] = useState(true);

    const onScroll = useCallback(() => {
        const el = containerRef.current;
        if (!el) return;
        setAutoScroll(isNearBottom(el));
    }, []);

    useEffect(() => {
        if (!autoScroll) return;
        endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [deps, autoScroll]);

    const jumpToBottom = useCallback(() => {
        setAutoScroll(true);
        endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, []);

    return { containerRef, endRef, onScroll, autoScroll, jumpToBottom };
}
