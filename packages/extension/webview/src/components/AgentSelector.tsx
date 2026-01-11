/**
 * Agent Selector Component
 * Allows users to view and switch between different agents
 */

import { useState } from 'react';
import type { MouseEvent } from 'react';
import type { AgentProfile } from '@vcoder/shared';
import { postMessage } from '../utils/vscode';
import './AgentSelector.scss';

export type AgentStatus = 'online' | 'offline' | 'error' | 'starting' | 'reconnecting';

export interface AgentInfo {
    profile: AgentProfile;
    status: AgentStatus;
    isActive: boolean;
}

interface AgentSelectorProps {
    agents: AgentInfo[];
    currentAgentId: string | null;
    onSelectAgent: (agentId: string) => void;
}

/**
 * Get status badge for agent
 */
function getStatusBadge(status: AgentStatus): { icon: string; className: string; label: string } {
    switch (status) {
        case 'online':
            return { icon: '●', className: 'status-online', label: '在线' };
        case 'offline':
            return { icon: '○', className: 'status-offline', label: '离线' };
        case 'error':
            return { icon: '✕', className: 'status-error', label: '错误' };
        case 'starting':
            return { icon: '◐', className: 'status-starting', label: '启动中' };
        case 'reconnecting':
            return { icon: '↻', className: 'status-reconnecting', label: '重连中' };
        default:
            return { icon: '○', className: 'status-offline', label: '未知' };
    }
}

export function AgentSelector({ agents, currentAgentId, onSelectAgent }: AgentSelectorProps) {
    const [showList, setShowList] = useState(false);

    const currentAgent = agents.find((a) => a.profile.id === currentAgentId);
    const status = currentAgent?.status || 'offline';
    const statusBadge = getStatusBadge(status);

    const handleSelectAgent = (agentId: string) => {
        if (agentId === currentAgentId) {
            setShowList(false);
            return;
        }
        
        onSelectAgent(agentId);
        setShowList(false);
    };

    const handleRefreshAgents = (e: MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        postMessage({ type: 'refreshAgents' });
    };

    // If no agents configured, show a message
    if (agents.length === 0) {
        return (
            <div className="agent-selector agent-selector--empty">
                <span className="agent-selector-label">未配置 Agent</span>
                <button
                    className="agent-selector-action"
                    onClick={() => postMessage({ type: 'openSettings', setting: 'vcoder.agentProfiles' })}
                    title="配置 Agent"
                >
                    ⚙️
                </button>
            </div>
        );
    }

    return (
        <div className="agent-selector">
            <button
                className="agent-selector-button"
                onClick={() => setShowList(!showList)}
                title={`当前 Agent: ${currentAgent?.profile.name || '未选择'} (${statusBadge.label})`}
            >
                <span className={`agent-status-icon ${statusBadge.className}`}>{statusBadge.icon}</span>
                <span className="agent-selector-label">
                    {currentAgent?.profile.name || '选择 Agent'}
                </span>
                <span className="agent-selector-arrow">▾</span>
            </button>

            {showList && (
                <div className="agent-list-dropdown">
                    <div className="agent-list-header">
                        <span className="agent-list-title">选择 Agent</span>
                        <button
                            className="agent-list-refresh"
                            onClick={handleRefreshAgents}
                            title="刷新 Agent 列表"
                        >
                            ⟳
                        </button>
                    </div>

                    <div className="agent-list">
                        {agents.map((agent) => {
                            const agentBadge = getStatusBadge(agent.status);
                            const isActive = agent.profile.id === currentAgentId;

                            return (
                                <div
                                    key={agent.profile.id}
                                    className={`agent-item ${isActive ? 'agent-item--active' : ''} ${
                                        agent.status !== 'online' ? 'agent-item--disabled' : ''
                                    }`}
                                    onClick={() => handleSelectAgent(agent.profile.id)}
                                    title={`${agent.profile.name} - ${agentBadge.label}`}
                                >
                                    <span className={`agent-status-icon ${agentBadge.className}`}>
                                        {agentBadge.icon}
                                    </span>
                                    <div className="agent-info">
                                        <span className="agent-name">{agent.profile.name}</span>
                                        <span className="agent-command">{agent.profile.command}</span>
                                    </div>
                                    {isActive && <span className="agent-active-mark">✓</span>}
                                </div>
                            );
                        })}
                    </div>

                    <div className="agent-list-footer">
                        <button
                            className="agent-list-settings"
                            onClick={() => {
                                postMessage({ type: 'openSettings', setting: 'vcoder.agentProfiles' });
                                setShowList(false);
                            }}
                        >
                            ⚙️ 配置 Agent
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
