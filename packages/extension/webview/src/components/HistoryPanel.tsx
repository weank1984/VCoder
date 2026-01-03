/**
 * History Panel Component - Slide-out sidebar for session management
 */

import { useState } from 'react';
import type { Session, HistorySession } from '@vcoder/shared';
import { CloseIcon, TrashIcon } from './Icon';
import { postMessage } from '../utils/vscode';
import './HistoryPanel.scss';

interface HistoryPanelProps {
    sessions: Session[];
    historySessions: HistorySession[];
    currentSessionId: string | null;
    visible: boolean;
    onClose: () => void;
}

export function HistoryPanel({ sessions, historySessions, currentSessionId, visible, onClose }: HistoryPanelProps) {
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

    const handleLoadHistory = (sessionId: string) => {
        postMessage({ type: 'loadHistory', sessionId });
        onClose();
    };

    const getRelativeTime = (dateStr?: string) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (diffInSeconds < 60) {
            return '刚刚';
        }
        
        const diffInMinutes = Math.floor(diffInSeconds / 60);
        if (diffInMinutes < 60) {
            return `${diffInMinutes}分钟前`;
        }
        
        const diffInHours = Math.floor(diffInMinutes / 60);
        if (diffInHours < 24) {
            return `${diffInHours}小时前`;
        }
        
        const diffInDays = Math.floor(diffInHours / 24);
        if (diffInDays < 7) {
            return `${diffInDays}天前`;
        }

        if (diffInDays < 30) {
             const weeks = Math.floor(diffInDays / 7);
             return `${weeks}周前`;
        }
        
        return date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
    };

    const currentSession = sessions.find(s => s.id === currentSessionId);
    const recentSessions = sessions.filter(s => s.id !== currentSessionId);

    return (
        <div className={`history-panel ${visible ? 'history-panel--visible' : ''}`}>
            <div className="history-panel-backdrop" onClick={onClose} />
            <div className="history-panel-content">
                <div className="history-panel-header">
                    <div className="history-header-title">
                        <span>选择会话</span>
                    </div>
                    <button className="history-close-btn" onClick={onClose} aria-label="关闭">
                        <CloseIcon />
                    </button>
                </div>

                <div className="history-sessions-list">
                    {/* Current Session */}
                    {currentSession && (
                        <>
                            <div className="history-section-title">当前会话</div>
                            <div
                                key={currentSession.id}
                                className={`history-session-item active ${deletingId === currentSession.id ? 'deleting' : ''}`}
                                onClick={() => handleSwitchSession(currentSession.id)}
                            >
                                <div className="session-info">
                                    <div className="session-title">{currentSession.title || '未命名会话'}</div>
                                    <div className="session-meta"></div>
                                </div>
                                <div className="session-meta-right">{getRelativeTime(currentSession.updatedAt)}</div>
                                <button
                                    className="session-delete-btn"
                                    onClick={(e) => handleDeleteSession(e, currentSession.id)}
                                    aria-label="删除会话"
                                >
                                    <TrashIcon />
                                </button>
                            </div>
                        </>
                    )}

                    {/* Recent Sessions */}
                    <div className="history-section-title" style={{ marginTop: currentSession ? '20px' : '0' }}>最近会话 (VCoder)</div>
                    {recentSessions.length === 0 ? (
                        <div className="history-empty">无其他活动会话</div>
                    ) : (
                        recentSessions.map((session) => (
                            <div
                                key={session.id}
                                className={`history-session-item ${deletingId === session.id ? 'deleting' : ''}`}
                                onClick={() => handleSwitchSession(session.id)}
                            >
                                <div className="session-info">
                                    <div className="session-title">{session.title || '未命名会话'}</div>
                                </div>
                                <div className="session-meta-right">{getRelativeTime(session.updatedAt)}</div>
                                <button
                                    className="session-delete-btn"
                                    onClick={(e) => handleDeleteSession(e, session.id)}
                                    aria-label="删除会话"
                                >
                                    <TrashIcon />
                                </button>
                            </div>
                        ))
                    )}

                    {/* Historical Sessions */}
                    <div className="history-section-title" style={{ marginTop: '20px' }}>其他历史记录</div>
                    {historySessions.length === 0 ? (
                        <div className="history-empty">暂无历史记录</div>
                    ) : (
                        historySessions.map((session) => (
                            <div
                                key={session.id}
                                className="history-session-item"
                                onClick={() => handleLoadHistory(session.id)}
                            >
                                <div className="session-info">
                                    <div className="session-title">{session.title || session.id}</div>
                                </div>
                                <div className="session-meta-right">{getRelativeTime(session.updatedAt)}</div>
                            </div>
                        ))
                    )}
                </div>
                
                <div className="history-footer">
                    <button className="history-new-btn" onClick={handleNewSession}>
                        + 新建会话
                    </button>
                </div>
            </div>
        </div>
    );
}
