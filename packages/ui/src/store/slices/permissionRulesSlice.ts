import type { SliceCreator, PermissionRulesSlice } from './types';
import { postMessage } from '../../bridge';

export const createPermissionRulesSlice: SliceCreator<PermissionRulesSlice> = (set) => ({
    setPermissionRules: (rules) => set({ permissionRules: rules }),

    loadPermissionRules: () => {
        postMessage({ type: 'getPermissionRules' });
    },

    addPermissionRule: (rule) => {
        postMessage({ type: 'addPermissionRule', rule });
    },

    updatePermissionRule: (ruleId, updates) => {
        postMessage({ type: 'updatePermissionRule', ruleId, updates });
    },

    deletePermissionRule: (ruleId) => {
        postMessage({ type: 'deletePermissionRule', ruleId });
        // Optimistic update
        set((state) => ({
            permissionRules: state.permissionRules.filter((r) => r.id !== ruleId),
        }));
    },

    clearPermissionRules: () => {
        postMessage({ type: 'clearPermissionRules' });
        set({ permissionRules: [] });
    },
});
