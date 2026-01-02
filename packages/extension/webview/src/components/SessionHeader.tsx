/**
 * Session Header Component
 */

import { useState } from 'react';
import type { MouseEvent } from 'react';
import type { Session } from '@vcoder/shared';
import { postMessage } from '../utils/vscode';
import './SessionHeader.scss';

interface SessionHeaderProps {
    sessions: Session[];
    currentSessionId: string | null;
    onSwitchSession: (sessionId: string) => void;
}

export function SessionHeader({
    sessions,
    currentSessionId,
    onSwitchSession,
}: SessionHeaderProps) {
    const [showList, setShowList] = useState(false);

    const handleNewChat = () => {
        postMessage({ type: 'newSession' });
        setShowList(false);
    };

    const handleDeleteSession = (sessionId: string, e: MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        postMessage({ type: 'deleteSession', sessionId });
    };

    return (
        <div className="session-header">
            <span className="session-header-title">VCoder</span>

            <div className="header-actions">
                <button className="action-btn primary" onClick={handleNewChat} title="新对话">
                    新对话
                </button>

                <button
                    className="action-btn session-list-btn"
                    onClick={() => setShowList(!showList)}
                >
                    会话列表 ▾
                </button>

                <button className="action-btn icon-btn" title="刷新" aria-label="刷新">⟳</button>
                <button className="action-btn icon-btn" title="设置" aria-label="设置">⚙️</button>
            </div>

            {showList && (
                <div className="session-list-dropdown">
                    {sessions.length === 0 ? (
                        <div className="session-empty">暂无会话</div>
                    ) : (
                        sessions.map((session) => (
                            <div
                                key={session.id}
                                className={`session-item ${session.id === currentSessionId ? 'active' : ''}`}
                                onClick={() => {
                                    onSwitchSession(session.id);
                                    setShowList(false);
                                }}
                            >
                                <span className="session-title">{session.title}</span>
                                <button
                                    className="session-delete"
                                    onClick={(e) => handleDeleteSession(session.id, e)}
                                    aria-label="删除会话"
                                    title="删除会话"
                                >
                                    ×
                                </button>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
