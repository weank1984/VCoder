/**
 * History Panel Component - Slide-out sidebar for session management
 */

import { useState } from 'react';
import type { HistorySession } from '@vcoder/shared';
import { CloseIcon, TrashIcon } from './Icon';
import { postMessage } from '../utils/vscode';
import { useI18n } from '../i18n/I18nProvider';
import { useStore } from '../store/useStore';
import './HistoryPanel.scss';

interface HistoryPanelProps {
    historySessions: HistorySession[];
    visible: boolean;
    onClose: () => void;
}

export function HistoryPanel({ historySessions, visible, onClose }: HistoryPanelProps) {
    const { t, language } = useI18n();
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const { viewMode, currentSessionId, exitHistoryMode } = useStore();

    const handleNewSession = () => {
        postMessage({ type: 'newSession' });
        onClose();
    };

    const handleLoadHistory = (sessionId: string) => {
        postMessage({ type: 'loadHistory', sessionId });
        onClose();
    };

    const handleDeleteHistory = (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        setDeletingId(sessionId);
        if (viewMode === 'history' && currentSessionId === sessionId) {
            exitHistoryMode();
        }
        postMessage({ type: 'deleteHistory', sessionId });
        setTimeout(() => setDeletingId(null), 300);
    };

    const getRelativeTime = (dateStr?: string) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (diffInSeconds < 60) {
            return t('Common.JustNow');
        }
        
        const diffInMinutes = Math.floor(diffInSeconds / 60);
        if (diffInMinutes < 60) {
            return t('Common.MinutesAgo', diffInMinutes);
        }
        
        const diffInHours = Math.floor(diffInMinutes / 60);
        if (diffInHours < 24) {
            return t('Common.HoursAgo', diffInHours);
        }
        
        const diffInDays = Math.floor(diffInHours / 24);
        if (diffInDays < 7) {
            return t('Common.DaysAgo', diffInDays);
        }

        if (diffInDays < 30) {
             const weeks = Math.floor(diffInDays / 7);
             return t('Common.WeeksAgo', weeks);
        }
        
        return date.toLocaleDateString(language === 'zh-CN' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' });
    };

    return (
        <div className={`history-panel ${visible ? 'history-panel--visible' : ''}`}>
            <div className="history-panel-backdrop" onClick={onClose} />
            <div className="history-panel-content">
                <div className="history-panel-header">
                    <div className="history-header-title">
                        <span>{t('Common.History')}</span>
                    </div>
                    <button className="history-close-btn" onClick={onClose} aria-label={t('Common.Close')}>
                        <CloseIcon />
                    </button>
                </div>

                <div className="history-sessions-list">
                    <div className="history-section-title">{t('Common.OtherHistory')}</div>
                    {historySessions.length === 0 ? (
                        <div className="history-empty">{t('Common.NoHistory')}</div>
                    ) : (
                        historySessions.map((session) => (
                            <div
                                key={session.id}
                                className={`history-session-item ${viewMode === 'history' && currentSessionId === session.id ? 'active' : ''} ${deletingId === session.id ? 'deleting' : ''}`}
                                onClick={() => handleLoadHistory(session.id)}
                            >
                                <div className="session-info">
                                    <div className="session-title">{session.title || session.id}</div>
                                </div>
                                <div className="session-meta-right">{getRelativeTime(session.updatedAt)}</div>
                                <button
                                    className="session-delete-btn"
                                    onClick={(e) => handleDeleteHistory(e, session.id)}
                                    aria-label={t('Common.DeleteHistory')}
                                >
                                    <TrashIcon />
                                </button>
                            </div>
                        ))
                    )}
                </div>
                
                <div className="history-footer">
                    <button className="history-new-btn" onClick={handleNewSession}>
                        {t('Common.CreateSession')}
                    </button>
                </div>
            </div>
        </div>
    );
}
