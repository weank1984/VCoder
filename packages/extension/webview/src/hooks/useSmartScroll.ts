/**
 * useSmartScroll Hook
 * Implements bottom-lock + jump-to-bottom behavior for message lists
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import type { RefObject } from 'react';

const DEFAULT_AUTO_SCROLL_THRESHOLD_PX = 80;
const DEFAULT_AUTO_SCROLL_HYSTERESIS_PX = 40;

function distanceFromBottom(el: HTMLElement): number {
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distanceFromBottom;
}

interface SmartScrollResult {
    containerRef: RefObject<HTMLDivElement | null>;
    endRef: RefObject<HTMLDivElement | null>;
    onScroll: () => void;
    autoScroll: boolean;
    jumpToBottom: () => void;
}

interface SmartScrollOptions {
    /**
     * When disabled, this hook will not auto-scroll on new content.
     * Manual jump-to-bottom still works.
     */
    enabled?: boolean;
    thresholdPx?: number;
    hysteresisPx?: number;
    autoScrollBehavior?: ScrollBehavior;
    jumpBehavior?: ScrollBehavior;
}

export function useSmartScroll<T>(deps: T[], options: SmartScrollOptions = {}): SmartScrollResult {
    const {
        enabled = true,
        thresholdPx = DEFAULT_AUTO_SCROLL_THRESHOLD_PX,
        hysteresisPx = DEFAULT_AUTO_SCROLL_HYSTERESIS_PX,
        autoScrollBehavior = 'auto',
        jumpBehavior = 'smooth',
    } = options;
    const containerRef = useRef<HTMLDivElement>(null);
    const endRef = useRef<HTMLDivElement>(null);
    const [autoScroll, setAutoScroll] = useState(true);
    const autoScrollRef = useRef(true);

    const onScroll = useCallback(() => {
        const el = containerRef.current;
        if (!el) return;
        const dist = distanceFromBottom(el);
        const current = autoScrollRef.current;
        const next = current ? dist < thresholdPx + hysteresisPx : dist < thresholdPx;
        autoScrollRef.current = next;
        setAutoScroll((prev) => (prev === next ? prev : next));
    }, [thresholdPx, hysteresisPx]);

    useEffect(() => {
        if (!enabled) return;
        if (!autoScrollRef.current) return;
        endRef.current?.scrollIntoView({ behavior: autoScrollBehavior, block: 'end' });
    }, [deps, enabled, autoScrollBehavior]);

    const jumpToBottom = useCallback(() => {
        setAutoScroll(true);
        autoScrollRef.current = true;
        endRef.current?.scrollIntoView({ behavior: jumpBehavior, block: 'end' });
    }, [jumpBehavior]);

    return { containerRef, endRef, onScroll, autoScroll, jumpToBottom };
}
