/**
 * Agent Teams Panel - Experimental multi-agent coordination UI
 */

import { useState } from 'react';
import { CloseIcon } from './Icon';
import { useI18n } from '../i18n/I18nProvider';
import { useStore } from '../store/useStore';
import './AgentTeamsPanel.scss';

interface AgentTeamsPanelProps {
    visible: boolean;
    onClose: () => void;
}

export function AgentTeamsPanel({ visible, onClose }: AgentTeamsPanelProps) {
    const { t } = useI18n();
    const { experimentalAgentTeams, setExperimentalAgentTeams } = useStore();
    const [teamName, setTeamName] = useState('');
    const [teamDesc, setTeamDesc] = useState('');
    const [showCreateForm, setShowCreateForm] = useState(false);

    if (!visible) return null;

    const handleEnable = () => {
        setExperimentalAgentTeams(true);
    };

    const handleDisable = () => {
        setExperimentalAgentTeams(false);
    };

    const handleCreateTeam = () => {
        if (!teamName.trim()) return;
        // Team creation is done via Claude Code's TeamCreate capability in conversation
        // Here we just reset the form and provide guidance
        setTeamName('');
        setTeamDesc('');
        setShowCreateForm(false);
    };

    return (
        <div className="agent-teams-panel">
            <div className="agent-teams-overlay" onClick={onClose} />
            <div className="agent-teams-drawer">
                <div className="agent-teams-header">
                    <div className="agent-teams-header-title">
                        <span>{t('Common.AgentTeams')}</span>
                        <span className="agent-teams-badge">{t('Common.AgentTeamsExperimental')}</span>
                    </div>
                    <button
                        type="button"
                        className="agent-teams-close"
                        onClick={onClose}
                        aria-label={t('Common.Close')}
                    >
                        <CloseIcon />
                    </button>
                </div>

                <div className="agent-teams-content">
                    {!experimentalAgentTeams ? (
                        <div className="agent-teams-enable-prompt">
                            <div className="agent-teams-icon">🧪</div>
                            <p className="agent-teams-enable-desc">{t('Common.AgentTeamsEnablePrompt')}</p>
                            <p className="agent-teams-desc">{t('Common.AgentTeamsDescription')}</p>
                            <button
                                type="button"
                                className="agent-teams-btn agent-teams-btn--primary"
                                onClick={handleEnable}
                            >
                                {t('Common.AgentTeamsEnable')}
                            </button>
                        </div>
                    ) : (
                        <>
                            <p className="agent-teams-desc">{t('Common.AgentTeamsDescription')}</p>

                            <div className="agent-teams-section">
                                <div className="agent-teams-section-header">
                                    <span className="agent-teams-section-title">{t('Common.AgentTeamsCreateTeam')}</span>
                                    <button
                                        type="button"
                                        className="agent-teams-btn agent-teams-btn--ghost"
                                        onClick={() => setShowCreateForm((v) => !v)}
                                    >
                                        {showCreateForm ? '−' : '+'}
                                    </button>
                                </div>
                                {showCreateForm && (
                                    <div className="agent-teams-form">
                                        <input
                                            className="agent-teams-input"
                                            placeholder={t('Common.AgentTeamsTeamName')}
                                            value={teamName}
                                            onChange={(e) => setTeamName(e.target.value)}
                                        />
                                        <input
                                            className="agent-teams-input"
                                            placeholder={t('Common.AgentTeamsDescription2')}
                                            value={teamDesc}
                                            onChange={(e) => setTeamDesc(e.target.value)}
                                        />
                                        <button
                                            type="button"
                                            className="agent-teams-btn agent-teams-btn--primary"
                                            disabled={!teamName.trim()}
                                            onClick={handleCreateTeam}
                                        >
                                            {t('Common.AgentTeamsCreate')}
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="agent-teams-section">
                                <div className="agent-teams-section-title">{t('Common.AgentTeamsHowItWorks')}</div>
                                <ol className="agent-teams-steps">
                                    <li>{t('Common.AgentTeamsStep1')}</li>
                                    <li>{t('Common.AgentTeamsStep2')}</li>
                                    <li>{t('Common.AgentTeamsStep3')}</li>
                                    <li>{t('Common.AgentTeamsStep4')}</li>
                                </ol>
                            </div>

                            <div className="agent-teams-footer">
                                <button
                                    type="button"
                                    className="agent-teams-btn agent-teams-btn--danger"
                                    onClick={handleDisable}
                                >
                                    {t('Common.AgentTeamsDisable')}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
