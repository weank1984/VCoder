/**
 * History Panel Component - Slide-out sidebar for session management
 */

import { useState, useEffect, useRef } from 'react';
import type { HistorySession } from '@vcoder/shared';
import { CloseIcon, TrashIcon } from './Icon';
import { SessionSkeleton } from './Skeleton';
import { postMessage } from '../utils/vscode';
import { useI18n } from '../i18n/I18nProvider';
import { useStore } from '../store/useStore';
import { sanitizeSessionTitle } from '../utils/sanitizeTitle';
import './HistoryPanel.scss';

const TOOL_OPTIONS = ['Bash', 'Write', 'Edit', 'Read', 'WebFetch', 'WebSearch'];

interface HistoryPanelProps {
    historySessions: HistorySession[];
    visible: boolean;
    onClose: () => void;
    isLoading?: boolean;
}

export function HistoryPanel({ historySessions, visible, onClose, isLoading = false }: HistoryPanelProps) {
    const { t, language } = useI18n();
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [toolFilter, setToolFilter] = useState('');
    const { viewMode, currentSessionId, exitHistoryMode } = useStore();
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Trigger a new listHistory call when search/filter changes (debounced)
    useEffect(() => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
            postMessage({
                type: 'listHistory',
                query: searchQuery || undefined,
                toolName: toolFilter || undefined,
            });
        }, 300);
        return () => {
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
        };
    }, [searchQuery, toolFilter]);

    // Reset search when panel is closed
    useEffect(() => {
        if (!visible) {
            setSearchQuery('');
            setToolFilter('');
        }
    }, [visible]);

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

    const hasActiveFilter = searchQuery || toolFilter;
    const emptyMessage = hasActiveFilter ? t('Common.NoSearchResults') : t('Common.NoHistory');

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

                <div className="history-search-area">
                    <input
                        className="history-search-input"
                        type="text"
                        placeholder={t('Common.SearchHistoryPlaceholder')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <select
                        className="history-tool-filter"
                        value={toolFilter}
                        onChange={(e) => setToolFilter(e.target.value)}
                        aria-label={t('Common.AllTools')}
                    >
                        <option value="">{t('Common.AllTools')}</option>
                        {TOOL_OPTIONS.map((tool) => (
                            <option key={tool} value={tool}>{tool}</option>
                        ))}
                    </select>
                </div>

                <div className="history-sessions-list">
                    {isLoading ? (
                        <SessionSkeleton count={3} />
                    ) : historySessions.length === 0 ? (
                        <div className="history-empty">{emptyMessage}</div>
                    ) : (
                        historySessions.map((session) => (
                            <div
                                key={session.id}
                                className={`history-session-item ${viewMode === 'history' && currentSessionId === session.id ? 'active' : ''} ${deletingId === session.id ? 'deleting' : ''}`}
                                onClick={() => handleLoadHistory(session.id)}
                            >
                                <div className="session-info">
                                    <div className="session-title">{sanitizeSessionTitle(session.title, session.id)}</div>
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
