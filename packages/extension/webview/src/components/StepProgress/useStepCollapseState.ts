import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { ToolCall } from '../../types';
import type { Step } from '../../utils/stepAggregator';
import { useStore } from '../../store/useStore';
import { isStepCollapsed as checkStepCollapsed, toggleStepOverride, type CollapseMode } from '../../utils/stepCollapse';
import { isTerminalToolName, isFileEditToolName } from '../../utils/toolClassifiers';

interface StepCollapseState {
    collapseMode: CollapseMode;
    isStepCollapsed: (stepId: string) => boolean;
    areAllCollapsed: boolean;
    toggleStep: (stepId: string) => void;
    toggleAll: () => void;
}

function isStickyOpenStep(step: Step): boolean {
    return step.entries.some((e) => {
        const tc = e.toolCall;
        return (
            tc.status === 'awaiting_confirmation' ||
            tc.name === 'TodoWrite' ||
            isTerminalToolName(tc.name) ||
            isFileEditToolName(tc.name)
        );
    });
}

function shouldDefaultExpand(step: Step): boolean {
    return step.entries.some((e) => {
        const tc = e.toolCall;
        return (
            tc.status === 'awaiting_confirmation' ||
            tc.name === 'TodoWrite' ||
            isTerminalToolName(tc.name) ||
            isFileEditToolName(tc.name)
        );
    });
}

export function useStepCollapseState(steps: Step[], toolCalls: ToolCall[]): StepCollapseState {
    const { viewMode } = useStore();

    const [collapseMode, setCollapseMode] = useState<CollapseMode>(viewMode === 'history' ? 'collapse_all' : 'expand_all');
    const [stepOverrides, setStepOverrides] = useState<Set<string>>(new Set());

    const prevStepStatusRef = useRef<Map<string, Step['status']>>(new Map());
    const seenStepIdsRef = useRef<Set<string>>(new Set());
    const prevToolCallCountRef = useRef<number>(toolCalls.length);

    // Keep default collapse mode in sync with viewMode changes.
    useEffect(() => {
        setCollapseMode(viewMode === 'history' ? 'collapse_all' : 'expand_all');
        setStepOverrides(new Set());
        prevStepStatusRef.current = new Map();
        seenStepIdsRef.current = new Set();
        prevToolCallCountRef.current = toolCalls.length;
    }, [viewMode]);

    // Auto-collapse steps that transition from running to completed/failed.
    useEffect(() => {
        if (collapseMode !== 'expand_all') return;
        const prevStatusMap = prevStepStatusRef.current;
        const stepsToCollapse: string[] = [];

        steps.forEach(step => {
            const prevStatus = prevStatusMap.get(step.id);
            if (
                prevStatus === 'running' &&
                (step.status === 'completed' || step.status === 'failed') &&
                !isStickyOpenStep(step)
            ) {
                stepsToCollapse.push(step.id);
            }
            prevStatusMap.set(step.id, step.status);
        });

        if (stepsToCollapse.length === 0) return;

        const timeoutId = setTimeout(() => {
            setStepOverrides((prev) => {
                const next = new Set(prev);
                stepsToCollapse.forEach((id) => next.add(id));
                return next;
            });
        }, 0);

        return () => clearTimeout(timeoutId);
    }, [collapseMode, steps]);

    // Never hide awaiting-confirmation steps behind a global "collapse all" choice.
    useEffect(() => {
        if (collapseMode !== 'collapse_all') return;
        const toForceExpand: string[] = [];
        for (const step of steps) {
            if (step.entries.some((e) => e.toolCall.status === 'awaiting_confirmation')) {
                toForceExpand.push(step.id);
            }
        }
        if (toForceExpand.length === 0) return;
        setStepOverrides((prev) => {
            const next = new Set(prev);
            for (const id of toForceExpand) next.add(id);
            return next;
        });
    }, [collapseMode, steps]);

    // Live mode: default-collapse non-important steps.
    useEffect(() => {
        const didReset = toolCalls.length < prevToolCallCountRef.current;
        prevToolCallCountRef.current = toolCalls.length;

        setStepOverrides((prev) => {
            if (viewMode === 'history' || steps.length === 0 || didReset) {
                seenStepIdsRef.current = new Set();
                return new Set();
            }
            if (collapseMode !== 'expand_all') return prev;

            const next = new Set(prev);
            for (const step of steps) {
                if (seenStepIdsRef.current.has(step.id)) continue;
                seenStepIdsRef.current.add(step.id);
                if (!shouldDefaultExpand(step)) next.add(step.id);
            }
            return next;
        });
    }, [collapseMode, steps, toolCalls.length, viewMode]);

    const areAllCollapsed = useMemo(() => {
        if (steps.length === 0) return false;
        return steps.every((s) => checkStepCollapsed(s.id, collapseMode, stepOverrides));
    }, [collapseMode, stepOverrides, steps]);

    const isCollapsed = useCallback(
        (stepId: string) => checkStepCollapsed(stepId, collapseMode, stepOverrides),
        [collapseMode, stepOverrides],
    );

    const toggleStep = useCallback((stepId: string) => {
        setStepOverrides((prev) => toggleStepOverride(stepId, prev));
    }, []);

    const toggleAll = useCallback(() => {
        setCollapseMode(areAllCollapsed ? 'expand_all' : 'collapse_all');
        setStepOverrides(new Set());
    }, [areAllCollapsed]);

    return {
        collapseMode,
        isStepCollapsed: isCollapsed,
        areAllCollapsed,
        toggleStep,
        toggleAll,
    };
}
