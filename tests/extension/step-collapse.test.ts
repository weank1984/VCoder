import { describe, expect, it } from 'vitest';
import { isStepCollapsed, toggleStepOverride } from '../../packages/ui/src/utils/stepCollapse';

describe('stepCollapse', () => {
    it('collapse_all: default collapsed, override expands', () => {
        const overrides = new Set<string>();
        expect(isStepCollapsed('s1', 'collapse_all', overrides)).toBe(true);

        const overrides2 = toggleStepOverride('s1', overrides);
        expect(isStepCollapsed('s1', 'collapse_all', overrides2)).toBe(false);

        const overrides3 = toggleStepOverride('s1', overrides2);
        expect(isStepCollapsed('s1', 'collapse_all', overrides3)).toBe(true);
    });

    it('expand_all: default expanded, override collapses', () => {
        const overrides = new Set<string>();
        expect(isStepCollapsed('s1', 'expand_all', overrides)).toBe(false);

        const overrides2 = toggleStepOverride('s1', overrides);
        expect(isStepCollapsed('s1', 'expand_all', overrides2)).toBe(true);

        const overrides3 = toggleStepOverride('s1', overrides2);
        expect(isStepCollapsed('s1', 'expand_all', overrides3)).toBe(false);
    });
});

