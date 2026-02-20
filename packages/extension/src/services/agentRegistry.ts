/**
 * Agent Registry
 * Manages multiple agent process instances and provides unified switching interface.
 */

import * as vscode from 'vscode';
import { Readable, Writable } from 'stream';
import { AgentProfile } from '@vcoder/shared';
import { AgentProcessManager, AgentStatus } from './agentProcessManager';
import { ServerManager } from './serverManager';
import { EventEmitter } from 'events';

export type UIAgentStatus = 'online' | 'offline' | 'error' | 'starting' | 'reconnecting';

export interface AgentInfo {
    profile: AgentProfile;
    status: UIAgentStatus;
    isActive: boolean;
}

const BUILTIN_AGENT_ID = '__builtin__';

const BUILTIN_PROFILE: AgentProfile = {
    id: BUILTIN_AGENT_ID,
    name: 'Claude Code (Built-in)',
    command: 'node',
};

function mapStatus(status: AgentStatus | string): UIAgentStatus {
    switch (status) {
        case 'running':
            return 'online';
        case 'starting':
            return 'starting';
        case 'reconnecting':
            return 'reconnecting';
        case 'error':
        case 'degraded':
            return 'error';
        default:
            return 'offline';
    }
}

export class AgentRegistry extends EventEmitter {
    private agents: Map<string, AgentProcessManager> = new Map();
    private activeAgentId: string = BUILTIN_AGENT_ID;
    private disposables: vscode.Disposable[] = [];

    constructor(
        private context: vscode.ExtensionContext,
        private serverManager: ServerManager,
    ) {
        super();
    }

    /**
     * Load agent profiles from VSCode configuration.
     * Creates AgentProcessManager instances for each profile.
     */
    async loadProfiles(): Promise<void> {
        // Clean up existing external agents
        for (const [, manager] of this.agents) {
            await manager.dispose();
        }
        this.agents.clear();

        const config = vscode.workspace.getConfiguration('vcoder');
        const profiles = config.get<AgentProfile[]>('agentProfiles', []) ?? [];

        for (const profile of profiles) {
            if (!profile.id || !profile.command) continue;
            const manager = new AgentProcessManager(this.context);
            // Forward status changes
            const disposable = manager.onStatusChange((status) => {
                this.emit('agentStatusChange', profile.id, mapStatus(status));
            });
            this.disposables.push(disposable);
            this.agents.set(profile.id, manager);
        }
    }

    /**
     * Get all agent statuses including built-in.
     */
    getAgentStatuses(): AgentInfo[] {
        const result: AgentInfo[] = [];

        // Built-in agent
        result.push({
            profile: BUILTIN_PROFILE,
            status: mapStatus(this.serverManager.getStatus()),
            isActive: this.activeAgentId === BUILTIN_AGENT_ID,
        });

        // External agents
        const config = vscode.workspace.getConfiguration('vcoder');
        const profiles = config.get<AgentProfile[]>('agentProfiles', []) ?? [];

        for (const profile of profiles) {
            const manager = this.agents.get(profile.id);
            result.push({
                profile,
                status: manager ? mapStatus(manager.getStatus()) : 'offline',
                isActive: this.activeAgentId === profile.id,
            });
        }

        return result;
    }

    /**
     * Switch to a different agent. Returns its stdio streams.
     */
    async switchAgent(agentId: string): Promise<{ stdin: Writable; stdout: Readable }> {
        if (agentId === this.activeAgentId) {
            return this.getActiveStdio();
        }

        // Switch to built-in
        if (agentId === BUILTIN_AGENT_ID) {
            this.activeAgentId = BUILTIN_AGENT_ID;
            // Ensure built-in server is running
            if (this.serverManager.getStatus() !== 'running') {
                await this.serverManager.start();
            }
            this.emit('agentSwitched', agentId);
            return this.serverManager.getStdio();
        }

        // Switch to external agent
        const config = vscode.workspace.getConfiguration('vcoder');
        const profiles = config.get<AgentProfile[]>('agentProfiles', []);
        const profile = profiles.find(p => p.id === agentId);
        if (!profile) {
            throw new Error(`Agent profile not found: ${agentId}`);
        }

        let manager = this.agents.get(agentId);
        if (!manager) {
            manager = new AgentProcessManager(this.context);
            const disposable = manager.onStatusChange((status) => {
                this.emit('agentStatusChange', agentId, mapStatus(status));
            });
            this.disposables.push(disposable);
            this.agents.set(agentId, manager);
        }

        // Start the agent if not running
        if (!manager.isRunning()) {
            await manager.start(profile);
        }

        this.activeAgentId = agentId;
        this.emit('agentSwitched', agentId);
        return manager.getStdio();
    }

    /**
     * Get stdio streams for the currently active agent.
     */
    getActiveStdio(): { stdin: Writable; stdout: Readable } {
        if (this.activeAgentId === BUILTIN_AGENT_ID) {
            return this.serverManager.getStdio();
        }

        const manager = this.agents.get(this.activeAgentId);
        if (!manager || !manager.isRunning()) {
            // Fallback to built-in
            console.warn(`[AgentRegistry] Active agent ${this.activeAgentId} not available, falling back to built-in`);
            this.activeAgentId = BUILTIN_AGENT_ID;
            return this.serverManager.getStdio();
        }

        return manager.getStdio();
    }

    /**
     * Get the active agent ID.
     */
    getActiveAgentId(): string {
        return this.activeAgentId;
    }

    /**
     * Dispose all agent processes and listeners.
     */
    async dispose(): Promise<void> {
        for (const [, manager] of this.agents) {
            await manager.dispose();
        }
        this.agents.clear();
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables = [];
        this.removeAllListeners();
    }
}
