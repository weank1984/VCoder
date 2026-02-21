/**
 * Agent Selector Component
 * Allows users to view and switch between different agents
 * Refactored to use the unified Dropdown component
 */

import { useMemo } from 'react';
import type { AgentProfile } from '@vcoder/shared';
import { Dropdown } from './Dropdown';
import type { DropdownItem } from './Dropdown';
import { postMessage } from '../bridge';
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
    const currentAgent = agents.find((a) => a.profile.id === currentAgentId);
    const status = currentAgent?.status || 'offline';
    const statusBadge = getStatusBadge(status);

    // Convert agents to dropdown items
    const dropdownItems = useMemo<DropdownItem[]>(() => {
        return agents.map((agent) => {
            const agentBadge = getStatusBadge(agent.status);
            return {
                id: agent.profile.id,
                label: (
                    <div className="agent-item-content">
                        <div className="agent-info">
                            <span className="agent-name">{agent.profile.name}</span>
                            <span className="agent-command">{agent.profile.command}</span>
                        </div>
                    </div>
                ),
                icon: <span className={`agent-status-icon ${agentBadge.className}`}>{agentBadge.icon}</span>,
                disabled: agent.status !== 'online',
                data: agent,
            };
        });
    }, [agents]);

    const handleSelectAgent = (item: DropdownItem) => {
        onSelectAgent(item.id);
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

    // Header content with title and refresh button
    const headerContent = (
        <div className="agent-list-header">
            <span className="agent-list-title">选择 Agent</span>
            <button
                className="agent-list-refresh"
                onClick={(e) => {
                    e.stopPropagation();
                    postMessage({ type: 'refreshAgents' });
                }}
                title="刷新 Agent 列表"
            >
                ⟳
            </button>
        </div>
    );

    // Footer content with settings button
    const footerContent = (
        <button
            className="agent-list-settings"
            onClick={() => postMessage({ type: 'openSettings', setting: 'vcoder.agentProfiles' })}
        >
            ⚙️ 配置 Agent
        </button>
    );

    // Trigger button
    const trigger = (
        <button
            className="agent-selector-button"
            title={`当前 Agent: ${currentAgent?.profile.name || '未选择'} (${statusBadge.label})`}
        >
            <span className={`agent-status-icon ${statusBadge.className}`}>{statusBadge.icon}</span>
            <span className="agent-selector-label">
                {currentAgent?.profile.name || '选择 Agent'}
            </span>
            <span className="agent-selector-arrow">▾</span>
        </button>
    );

    return (
        <Dropdown
            trigger={trigger}
            items={dropdownItems}
            selectedId={currentAgentId || undefined}
            onSelect={handleSelectAgent}
            placement="bottom"
            headerContent={headerContent}
            footerContent={footerContent}
            className="agent-selector"
            popoverClassName="agent-list-dropdown"
            minWidth={280}
            maxHeight={300}
            showCheckmark={true}
        />
    );
}
