/**
 * TeamManager - Agent Team process lifecycle management
 * Reads team config files, polls for new members, and manages teammate PersistentSessions.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { TeamMemberInfo, TeamUpdate, TeamListResult } from '@vcoder/shared';
import { PersistentSession } from './persistentSession';

/** Raw team config as written by Claude CLI's TeamCreate tool */
interface TeamConfigMember {
    name: string;
    agentId: string;
    agentType?: string;
    model?: string;
    prompt?: string;
    cwd?: string;
}

interface TeamConfig {
    team_name: string;
    description?: string;
    members: TeamConfigMember[];
}

interface ManagedTeam {
    config: TeamConfig;
    leadSessionId: string;
    memberSessions: Map<string, PersistentSession>;
    memberStatuses: Map<string, TeamMemberInfo>;
    watchTimer?: ReturnType<typeof setInterval>;
}

export class TeamManager extends EventEmitter {
    private teams: Map<string, ManagedTeam> = new Map();
    static readonly MAX_TEAMMATES = 6;
    static readonly MEMBER_POLL_INTERVAL_MS = 3000;

    constructor(private defaultWorkingDirectory: string) {
        super();
    }

    /**
     * Called when the lead CLI uses the TeamCreate tool.
     * Starts polling the config file for new members.
     */
    async onTeamCreated(teamName: string, leadSessionId: string): Promise<void> {
        if (this.teams.has(teamName)) {
            console.error(`[TeamManager] Team "${teamName}" already managed, updating lead session`);
            this.teams.get(teamName)!.leadSessionId = leadSessionId;
            return;
        }

        const config = await this.readTeamConfig(teamName);
        if (!config) {
            console.error(`[TeamManager] Could not read config for team "${teamName}"`);
            return;
        }

        const managed: ManagedTeam = {
            config,
            leadSessionId,
            memberSessions: new Map(),
            memberStatuses: new Map(),
        };
        this.teams.set(teamName, managed);

        // Emit initial team_update
        this.emitTeamUpdate(teamName, 'created');

        // Start polling for new members
        managed.watchTimer = setInterval(() => {
            void this.pollForMembers(teamName).catch((err) => {
                console.error(`[TeamManager] Poll error for team "${teamName}":`, err);
            });
        }, TeamManager.MEMBER_POLL_INTERVAL_MS);

        // Do an immediate poll
        await this.pollForMembers(teamName);
    }

    /**
     * Called when the lead CLI uses the TeamDelete tool.
     */
    async onTeamDeleted(teamName: string): Promise<void> {
        await this.stopTeam(teamName, true);
    }

    /**
     * Stop all members and remove team tracking.
     */
    async stopTeam(teamName: string, disbanded = false): Promise<void> {
        const managed = this.teams.get(teamName);
        if (!managed) return;

        // Stop polling
        if (managed.watchTimer) {
            clearInterval(managed.watchTimer);
            managed.watchTimer = undefined;
        }

        // Stop all member sessions
        const stopPromises: Promise<void>[] = [];
        for (const [memberName, session] of managed.memberSessions.entries()) {
            stopPromises.push(
                session.stop().catch((err) => {
                    console.error(`[TeamManager] Failed to stop member "${memberName}":`, err);
                    session.kill();
                })
            );
        }
        await Promise.all(stopPromises);

        // Update statuses
        for (const [name, status] of managed.memberStatuses) {
            status.status = 'stopped';
            managed.memberStatuses.set(name, status);
        }

        if (disbanded) {
            this.emitTeamUpdate(teamName, 'disbanded');
            this.teams.delete(teamName);
        } else {
            this.emitTeamUpdate(teamName, 'member_status_changed');
        }
    }

    /**
     * Stop a single team member.
     */
    async stopMember(teamName: string, memberName: string): Promise<void> {
        const managed = this.teams.get(teamName);
        if (!managed) return;

        const session = managed.memberSessions.get(memberName);
        if (session) {
            await session.stop().catch((err) => {
                console.error(`[TeamManager] Failed to stop member "${memberName}":`, err);
                session.kill();
            });
            managed.memberSessions.delete(memberName);
        }

        const status = managed.memberStatuses.get(memberName);
        if (status) {
            status.status = 'stopped';
            managed.memberStatuses.set(memberName, status);
        }

        this.emitTeamUpdate(teamName, 'member_status_changed');
    }

    /**
     * Shutdown all teams (called on server shutdown).
     */
    async shutdownAll(): Promise<void> {
        const teamNames = [...this.teams.keys()];
        await Promise.all(teamNames.map((name) => this.stopTeam(name)));
        this.teams.clear();
    }

    /**
     * Get team list for ACP team/list method.
     */
    getTeams(): TeamListResult['teams'] {
        const result: TeamListResult['teams'] = [];
        for (const [teamName, managed] of this.teams) {
            result.push({
                teamName,
                description: managed.config.description,
                leadSessionId: managed.leadSessionId,
                members: [...managed.memberStatuses.values()],
            });
        }
        return result;
    }

    /**
     * Check if a session is a lead for any team, and stop that team if so.
     */
    async onLeadSessionClosed(sessionId: string): Promise<void> {
        for (const [teamName, managed] of this.teams) {
            if (managed.leadSessionId === sessionId) {
                console.error(`[TeamManager] Lead session "${sessionId}" closed, stopping team "${teamName}"`);
                await this.stopTeam(teamName, true);
            }
        }
    }

    // =========================================================================
    // Private
    // =========================================================================

    private async pollForMembers(teamName: string): Promise<void> {
        const managed = this.teams.get(teamName);
        if (!managed) return;

        const config = await this.readTeamConfig(teamName);
        if (!config) return;

        managed.config = config;

        // Check for new members
        for (const member of config.members) {
            if (managed.memberSessions.has(member.name) || managed.memberStatuses.get(member.name)?.status === 'stopped') {
                continue; // Already managed or explicitly stopped
            }

            // Enforce member limit
            const activeCount = [...managed.memberStatuses.values()].filter(
                (s) => s.status === 'running' || s.status === 'starting' || s.status === 'idle'
            ).length;
            if (activeCount >= TeamManager.MAX_TEAMMATES) {
                console.error(`[TeamManager] Max teammates (${TeamManager.MAX_TEAMMATES}) reached for team "${teamName}", skipping "${member.name}"`);
                continue;
            }

            // New member found, start it
            console.error(`[TeamManager] New member detected: "${member.name}" in team "${teamName}"`);
            await this.startMember(teamName, member);
        }
    }

    private async startMember(teamName: string, member: TeamConfigMember): Promise<void> {
        const managed = this.teams.get(teamName);
        if (!managed) return;

        const sessionId = `team:${teamName}:member:${member.name}`;

        // Set initial status
        const memberInfo: TeamMemberInfo = {
            name: member.name,
            agentId: member.agentId,
            agentType: member.agentType,
            model: member.model,
            status: 'starting',
            sessionId,
        };
        managed.memberStatuses.set(member.name, memberInfo);
        this.emitTeamUpdate(teamName, 'member_added');

        try {
            const session = new PersistentSession(sessionId, {
                workingDirectory: member.cwd || this.defaultWorkingDirectory,
            }, {
                model: member.model as import('@vcoder/shared').ModelId | undefined,
                permissionMode: 'bypassPermissions',
                appendSystemPrompt: member.prompt,
                disallowedTools: [], // Allow all tools for teammates
                env: {
                    CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
                },
            });

            // Forward events
            session.on('update', (update: unknown, type: string) => {
                this.emit('teammate_update', sessionId, update, type);
            });

            session.on('complete', () => {
                // Update status to idle after completing a turn
                const status = managed.memberStatuses.get(member.name);
                if (status && status.status !== 'stopped') {
                    status.status = 'idle';
                    managed.memberStatuses.set(member.name, status);
                    this.emitTeamUpdate(teamName, 'member_status_changed');
                }
                this.emit('teammate_complete', sessionId);
            });

            session.on('close', (code: number) => {
                console.error(`[TeamManager] Member "${member.name}" session closed with code ${code}`);
                managed.memberSessions.delete(member.name);
                const status = managed.memberStatuses.get(member.name);
                if (status) {
                    status.status = code === 0 ? 'stopped' : 'failed';
                    managed.memberStatuses.set(member.name, status);
                }
                this.emitTeamUpdate(teamName, 'member_status_changed');
            });

            managed.memberSessions.set(member.name, session);
            await session.start();

            // Send a bootstrap message so the CLI enters its processing loop.
            // The team lead will send actual work via the file system inbox;
            // this initial prompt tells the CLI to start monitoring for messages.
            const bootstrapPrompt = [
                `You are a team member "${member.name}" in team "${teamName}".`,
                member.agentType ? `Your role type is: ${member.agentType}.` : '',
                'Check your inbox for tasks from the team lead. Use TaskList and TaskGet to find work assigned to you.',
                'When you complete a task, mark it completed with TaskUpdate and check for new work.',
            ].filter(Boolean).join(' ');
            session.sendMessage(bootstrapPrompt);

            // Successfully started
            memberInfo.status = 'running';
            managed.memberStatuses.set(member.name, memberInfo);
            this.emitTeamUpdate(teamName, 'member_status_changed');

            console.error(`[TeamManager] Member "${member.name}" started successfully (pid=${session.pid})`);
        } catch (err) {
            console.error(`[TeamManager] Failed to start member "${member.name}":`, err);
            memberInfo.status = 'failed';
            managed.memberStatuses.set(member.name, memberInfo);
            managed.memberSessions.delete(member.name);
            this.emitTeamUpdate(teamName, 'member_status_changed');
        }
    }

    private emitTeamUpdate(teamName: string, status: TeamUpdate['status']): void {
        const managed = this.teams.get(teamName);
        if (!managed && status !== 'disbanded') return;

        const update: TeamUpdate = {
            teamName,
            description: managed?.config.description,
            leadSessionId: managed?.leadSessionId ?? '',
            members: managed ? [...managed.memberStatuses.values()] : [],
            status,
        };
        this.emit('team_update', update);
    }

    private async readTeamConfig(teamName: string, retries = 3): Promise<TeamConfig | null> {
        const configPath = path.join(os.homedir(), '.claude', 'teams', teamName, 'config.json');
        for (let i = 0; i < retries; i++) {
            try {
                const content = await fs.readFile(configPath, 'utf8');
                return JSON.parse(content) as TeamConfig;
            } catch {
                if (i < retries - 1) await new Promise((r) => setTimeout(r, 500));
            }
        }
        return null;
    }
}
