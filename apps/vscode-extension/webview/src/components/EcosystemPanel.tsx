/**
 * Ecosystem Panel - CLI Ecosystem management UI
 * Shows MCP servers, Skills, Hooks, and Plugins from ~/.claude/
 */

import { useState } from 'react';
import type { EcosystemData, EcosystemMcpServer } from '../types';
import { CloseIcon, TrashIcon, AddIcon } from './Icon';
import { postMessage } from '../utils/vscode';
import { useI18n } from '../i18n/I18nProvider';
import './EcosystemPanel.scss';

type EcosystemTab = 'mcp' | 'skills' | 'hooks' | 'plugins';

interface EcosystemPanelProps {
    visible: boolean;
    onClose: () => void;
    data: EcosystemData | null;
    isLoading?: boolean;
    onRefresh: () => void;
}

const EMPTY_FORM: { name: string; type: 'stdio' | 'http' | 'sse'; command: string; url: string } = { name: '', type: 'stdio', command: '', url: '' };

export function EcosystemPanel({ visible, onClose, data, isLoading = false, onRefresh }: EcosystemPanelProps) {
    const { t } = useI18n();
    const [activeTab, setActiveTab] = useState<EcosystemTab>('mcp');
    const [showAddForm, setShowAddForm] = useState(false);
    const [newServer, setNewServer] = useState(EMPTY_FORM);

    const handleAddServer = () => {
        if (!newServer.name.trim()) return;
        postMessage({ type: 'addMcpServer', server: { ...newServer, name: newServer.name.trim() } });
        setShowAddForm(false);
        setNewServer(EMPTY_FORM);
        onRefresh();
    };

    const handleRemoveServer = (server: EcosystemMcpServer) => {
        postMessage({ type: 'removeMcpServer', id: server.id });
        onRefresh();
    };

    const tabs: { key: EcosystemTab; label: string }[] = [
        { key: 'mcp', label: t('Common.EcosystemMcp') },
        { key: 'skills', label: t('Common.EcosystemSkills') },
        { key: 'hooks', label: t('Common.EcosystemHooks') },
        { key: 'plugins', label: t('Common.EcosystemPlugins') },
    ];

    return (
        <div className={`ecosystem-panel ${visible ? 'ecosystem-panel--visible' : ''}`}>
            <div className="ecosystem-panel-backdrop" onClick={onClose} />
            <div className="ecosystem-panel-content">
                <div className="ecosystem-panel-header">
                    <span className="ecosystem-panel-title">{t('Common.Ecosystem')}</span>
                    <button className="ecosystem-close-btn" onClick={onClose} aria-label={t('Common.Close')}>
                        <CloseIcon />
                    </button>
                </div>

                <div className="ecosystem-tabs">
                    {tabs.map((tab) => (
                        <button
                            key={tab.key}
                            className={`ecosystem-tab ${activeTab === tab.key ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="ecosystem-body">
                    {isLoading ? (
                        <div className="ecosystem-loading">{t('Common.Loading')}</div>
                    ) : (
                        <>
                            {activeTab === 'mcp' && (
                                <div className="ecosystem-section">
                                    {!data?.mcp.length ? (
                                        <div className="ecosystem-empty">{t('Common.EcosystemNoMcp')}</div>
                                    ) : (
                                        <ul className="ecosystem-list">
                                            {data.mcp.map((server) => (
                                                <li key={server.id} className="ecosystem-item">
                                                    <div className="ecosystem-item-main">
                                                        <span className="ecosystem-item-name">
                                                            {server.name || server.id}
                                                        </span>
                                                        <span className="ecosystem-item-badge">{server.type}</span>
                                                        {server.readonly && (
                                                            <span className="ecosystem-item-badge readonly">
                                                                {t('Common.EcosystemBuiltin')}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="ecosystem-item-sub">
                                                        {server.command || server.url || ''}
                                                    </div>
                                                    {!server.readonly && (
                                                        <button
                                                            className="ecosystem-item-delete"
                                                            onClick={() => handleRemoveServer(server)}
                                                            aria-label="Remove server"
                                                        >
                                                            <TrashIcon />
                                                        </button>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    )}

                                    {showAddForm ? (
                                        <div className="ecosystem-add-form">
                                            <input
                                                className="ecosystem-input"
                                                placeholder={t('Common.EcosystemServerName')}
                                                value={newServer.name}
                                                onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
                                            />
                                            <select
                                                className="ecosystem-select"
                                                value={newServer.type}
                                                onChange={(e) => setNewServer({ ...newServer, type: e.target.value as 'stdio' | 'http' | 'sse' })}
                                            >
                                                <option value="stdio">stdio</option>
                                                <option value="http">http</option>
                                                <option value="sse">sse</option>
                                            </select>
                                            {newServer.type === 'stdio' ? (
                                                <input
                                                    className="ecosystem-input"
                                                    placeholder={t('Common.EcosystemServerCommand')}
                                                    value={newServer.command}
                                                    onChange={(e) => setNewServer({ ...newServer, command: e.target.value })}
                                                />
                                            ) : (
                                                <input
                                                    className="ecosystem-input"
                                                    placeholder={t('Common.EcosystemServerUrl')}
                                                    value={newServer.url}
                                                    onChange={(e) => setNewServer({ ...newServer, url: e.target.value })}
                                                />
                                            )}
                                            <div className="ecosystem-form-actions">
                                                <button className="ecosystem-btn-primary" onClick={handleAddServer}>
                                                    {t('Common.EcosystemAdd')}
                                                </button>
                                                <button
                                                    className="ecosystem-btn-secondary"
                                                    onClick={() => { setShowAddForm(false); setNewServer(EMPTY_FORM); }}
                                                >
                                                    {t('Common.Close')}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button
                                            className="ecosystem-add-btn"
                                            onClick={() => setShowAddForm(true)}
                                        >
                                            <AddIcon />
                                            <span>{t('Common.EcosystemAddMcp')}</span>
                                        </button>
                                    )}
                                </div>
                            )}

                            {activeTab === 'skills' && (
                                <div className="ecosystem-section">
                                    {!data?.skills.length ? (
                                        <div className="ecosystem-empty">{t('Common.EcosystemNoSkills')}</div>
                                    ) : (
                                        <ul className="ecosystem-list">
                                            {data.skills.map((skill) => (
                                                <li key={skill.path} className="ecosystem-item">
                                                    <div className="ecosystem-item-main">
                                                        <span className="ecosystem-item-name">{skill.name}</span>
                                                        <span className="ecosystem-item-badge">
                                                            {t(`Common.Ecosystem${skill.source === 'global' ? 'Global' : 'Workspace'}`)}
                                                        </span>
                                                    </div>
                                                    {skill.description && (
                                                        <div className="ecosystem-item-sub">{skill.description}</div>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}

                            {activeTab === 'hooks' && (
                                <div className="ecosystem-section">
                                    {!data?.hooks.length ? (
                                        <div className="ecosystem-empty">{t('Common.EcosystemNoHooks')}</div>
                                    ) : (
                                        <ul className="ecosystem-list">
                                            {data.hooks.map((hook, i) => (
                                                <li key={i} className="ecosystem-item">
                                                    <div className="ecosystem-item-main">
                                                        <span className="ecosystem-item-name">{hook.event}</span>
                                                        {hook.matcher && (
                                                            <span className="ecosystem-item-badge">{hook.matcher}</span>
                                                        )}
                                                    </div>
                                                    <div className="ecosystem-item-sub ecosystem-item-code">{hook.command}</div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}

                            {activeTab === 'plugins' && (
                                <div className="ecosystem-section">
                                    {!data?.plugins.length ? (
                                        <div className="ecosystem-empty">{t('Common.EcosystemNoPlugins')}</div>
                                    ) : (
                                        <ul className="ecosystem-list">
                                            {data.plugins.map((plugin) => (
                                                <li key={plugin.path} className="ecosystem-item">
                                                    <div className="ecosystem-item-main">
                                                        <span className="ecosystem-item-name">{plugin.name}</span>
                                                        {plugin.version && (
                                                            <span className="ecosystem-item-badge">v{plugin.version}</span>
                                                        )}
                                                        <span className="ecosystem-item-badge">
                                                            {t(`Common.Ecosystem${plugin.source === 'global' ? 'Global' : 'Workspace'}`)}
                                                        </span>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
