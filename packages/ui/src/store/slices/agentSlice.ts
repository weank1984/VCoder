import type { SliceCreator, AgentSlice } from './types';
import { postMessage } from '../../bridge';

export const createAgentSlice: SliceCreator<AgentSlice> = (set, _get) => ({
    setAgents: (agents) => set({ agents }),

    setCurrentAgent: (currentAgentId) => set({ currentAgentId }),

    selectAgent: (agentId) => {
        set({ currentAgentId: agentId });
        postMessage({ type: 'selectAgent', agentId });
    },
});
