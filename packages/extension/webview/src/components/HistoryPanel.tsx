/**
 * History Panel Component - Slide-out sidebar for session management
 */

import { useState } from 'react';
import type { Session } from '@vcoder/shared';
import { CloseIcon, TrashIcon, HistoryIcon } from './Icon';
import { postMessage } from '../utils/vscode';
import './HistoryPanel.scss';

interface HistoryPanelProps {
    sessions: Session[];
    currentSessionId: string | null;
    visible: boolean;
    onClose: () => void;
}

export function HistoryPanel({ sessions, currentSessionId, visible, onClose }: HistoryPanelProps) {
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const handleSwitchSession = (sessionId: string) => {
        if (sessionId === currentSessionId) return;
        postMessage({ type: 'switchSession', sessionId });
        onClose();
    };

    const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        setDeletingId(sessionId);
        postMessage({ type: 'deleteSession', sessionId });
        // Will be removed from sessions list via update
        setTimeout(() => setDeletingId(null), 300);
    };

    const handleNewSession = () => {
        postMessage({ type: 'newSession' });
        onClose();
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        if (isToday) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    return (
        <div className={`history-panel ${visible ? 'history-panel--visible' : ''}`}>
            <div className="history-panel-backdrop" onClick={onClose} />
            <div className="history-panel-content">
                <div className="history-panel-header">
                    <div className="history-header-title">
                        <HistoryIcon />
                        <span>会话历史</span>
                    </div>
                    <button className="history-close-btn" onClick={onClose} aria-label="Close">
                        <CloseIcon />
                    </button>
                </div>

                <button className="history-new-btn" onClick={handleNewSession}>
                    + 新建会话
                </button>

                <div className="history-sessions-list">
                    {sessions.length === 0 ? (
                        <div className="history-empty">暂无历史会话</div>
                    ) : (
                        sessions.map((session) => (
                            <div
                                key={session.id}
                                className={`history-session-item ${session.id === currentSessionId ? 'active' : ''} ${deletingId === session.id ? 'deleting' : ''}`}
                                onClick={() => handleSwitchSession(session.id)}
                            >
                                <div className="session-info">
                                    <div className="session-title">{session.title || '未命名会话'}</div>
                                    <div className="session-meta">{formatDate(session.createdAt)}</div>
                                </div>
                                <button
                                    className="session-delete-btn"
                                    onClick={(e) => handleDeleteSession(e, session.id)}
                                    aria-label="Delete session"
                                >
                                    <TrashIcon />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
