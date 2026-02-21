export type CollapseMode = 'collapse_all' | 'expand_all';

/**
 * Determine whether a step is collapsed based on a global default + per-step overrides.
 *
 * - `collapse_all`: everything is collapsed unless the step id is in `overrides` (explicitly expanded)
 * - `expand_all`: everything is expanded unless the step id is in `overrides` (explicitly collapsed)
 */
export function isStepCollapsed(stepId: string, mode: CollapseMode, overrides: Set<string>): boolean {
    if (mode === 'collapse_all') return !overrides.has(stepId);
    return overrides.has(stepId);
}

/**
 * Toggle a per-step override (meaning depends on the global collapse mode).
 * Returns a new Set instance.
 */
export function toggleStepOverride(stepId: string, overrides: Set<string>): Set<string> {
    const next = new Set(overrides);
    if (next.has(stepId)) next.delete(stepId);
    else next.add(stepId);
    return next;
}

