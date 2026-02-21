/**
 * Desktop Sidebar - Persistent session list for Electron desktop app
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { HistorySession } from '@vcoder/shared';
import { useStore } from '@vcoder/ui/store/useStore';
import { useI18n } from '@vcoder/ui/i18n/I18nProvider';
import { postMessage } from '@vcoder/ui/bridge';
import { sanitizeSessionTitle } from '@vcoder/ui/utils/sanitizeTitle';
import { groupByDate } from '@vcoder/ui/utils/timeFormat';
import {
    PlusIcon,
    SearchIcon,
    ChatIcon,
    TrashIcon,
    AloneLeftIcon,
    AloneRightIcon,
    GeneralSettingIcon,
} from '@vcoder/ui/components/Icon';
import './DesktopSidebar.scss';

interface DesktopSidebarProps {
    collapsed: boolean;
    onToggleCollapse: () => void;
    onShowEcosystem?: () => void;
}

export function DesktopSidebar({
    collapsed,
    onToggleCollapse,
    onShowEcosystem,
}: DesktopSidebarProps) {
    const { t, language } = useI18n();
    const [searchQuery, setSearchQuery] = useState('');
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const sessionsRef = useRef<HTMLDivElement>(null);

    const {
        historySessions,
        currentSessionId,
        viewMode,
        exitHistoryMode,
    } = useStore();

    // Fetch history on mount
    useEffect(() => {
        postMessage({ type: 'listHistory' });
    }, []);

    // Local search filter for instant feedback
    const filteredSessions = useMemo(() => {
        if (!searchQuery.trim()) return historySessions;
        const query = searchQuery.toLowerCase();
        return historySessions.filter((s) => {
            const title = sanitizeSessionTitle(s.title, s.id).toLowerCase();
            return title.includes(query);
        });
    }, [historySessions, searchQuery]);

    // Group sessions by date
    const groupedSessions = useMemo(
        () => groupByDate<HistorySession>(
            filteredSessions,
            (s) => s.updatedAt,
            language,
        ),
        [filteredSessions, language],
    );

    const handleNewChat = useCallback(() => {
        postMessage({ type: 'newSession' });
    }, []);

    const handleLoadSession = useCallback((sessionId: string) => {
        // If viewing a history session and clicking it again, exit history mode
        if (viewMode === 'history' && currentSessionId === sessionId) {
            exitHistoryMode();
            return;
        }
        postMessage({ type: 'loadHistory', sessionId });
    }, [viewMode, currentSessionId, exitHistoryMode]);

    const handleDeleteSession = useCallback((e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        setDeletingId(sessionId);
        if (viewMode === 'history' && currentSessionId === sessionId) {
            exitHistoryMode();
        }
        postMessage({ type: 'deleteHistory', sessionId });
        setTimeout(() => setDeletingId(null), 300);
    }, [viewMode, currentSessionId, exitHistoryMode]);

    const isActive = useCallback((sessionId: string) => {
        return currentSessionId === sessionId;
    }, [currentSessionId]);

    return (
        <aside className={`desktop-sidebar${collapsed ? ' desktop-sidebar--collapsed' : ''}`}>
            {/* Header: Brand + Collapse */}
            <div className="desktop-sidebar__header">
                {!collapsed && (
                    <div className="desktop-sidebar__brand">
                        <span className="desktop-sidebar__brand-name">VCoder</span>
                    </div>
                )}
                <button
                    type="button"
                    className="desktop-sidebar__toggle"
                    onClick={onToggleCollapse}
                    title={collapsed ? t('Common.ExpandSidebar') : t('Common.CollapseSidebar')}
                >
                    {collapsed ? <AloneRightIcon /> : <AloneLeftIcon />}
                </button>
            </div>

            {/* New Chat button */}
            {!collapsed && (
                <div className="desktop-sidebar__new-chat-row">
                    <button
                        type="button"
                        className="desktop-sidebar__new-chat"
                        onClick={handleNewChat}
                        title={t('Common.NewChat')}
                    >
                        <PlusIcon />
                        <span>{t('Common.NewChat')}</span>
                    </button>
                </div>
            )}

            {/* Collapsed: show only icon buttons */}
            {collapsed && (
                <div className="desktop-sidebar__collapsed-actions">
                    <button
                        type="button"
                        className="desktop-sidebar__icon-btn"
                        onClick={handleNewChat}
                        title={t('Common.NewChat')}
                    >
                        <PlusIcon />
                    </button>
                    {onShowEcosystem && (
                        <button
                            type="button"
                            className="desktop-sidebar__icon-btn"
                            onClick={onShowEcosystem}
                            title={t('Common.Ecosystem')}
                        >
                            <GeneralSettingIcon />
                        </button>
                    )}
                </div>
            )}

            {/* Search */}
            {!collapsed && (
                <div className="desktop-sidebar__search">
                    <SearchIcon />
                    <input
                        type="text"
                        placeholder={t('Common.SearchHistoryPlaceholder')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            )}

            {/* Sessions list */}
            {!collapsed && (
                <nav className="desktop-sidebar__sessions" ref={sessionsRef}>
                    {filteredSessions.length === 0 ? (
                        <div className="desktop-sidebar__empty">
                            {searchQuery ? t('Common.NoSearchResults') : t('Common.NoHistory')}
                        </div>
                    ) : (
                        groupedSessions.map((group) => (
                            <div key={group.label} className="desktop-sidebar__group">
                                <div className="desktop-sidebar__group-label">{group.label}</div>
                                {group.items.map((session) => (
                                    <div
                                        key={session.id}
                                        className={[
                                            'desktop-sidebar__session-item',
                                            isActive(session.id) ? 'active' : '',
                                            deletingId === session.id ? 'deleting' : '',
                                        ].filter(Boolean).join(' ')}
                                        onClick={() => handleLoadSession(session.id)}
                                    >
                                        <ChatIcon />
                                        <span className="desktop-sidebar__session-title">
                                            {sanitizeSessionTitle(session.title, session.id)}
                                        </span>
                                        <button
                                            type="button"
                                            className="desktop-sidebar__delete-btn"
                                            onClick={(e) => handleDeleteSession(e, session.id)}
                                            title={t('Common.DeleteHistory')}
                                        >
                                            <TrashIcon />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ))
                    )}
                </nav>
            )}

            {/* Footer: Ecosystem / Settings button (user menu area, like Claude.ai) */}
            {!collapsed && onShowEcosystem && (
                <div className="desktop-sidebar__footer">
                    <button
                        type="button"
                        className="desktop-sidebar__footer-btn"
                        onClick={onShowEcosystem}
                        title={t('Common.Ecosystem')}
                    >
                        <GeneralSettingIcon />
                        <span>{t('Common.Ecosystem')}</span>
                    </button>
                </div>
            )}
        </aside>
    );
}
