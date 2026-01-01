/**
 * Session Header Component
 */

import React, { useState } from 'react';
import { Session } from '@z-code/shared';
import { postMessage } from '../utils/vscode';
import './SessionHeader.css';

interface SessionHeaderProps {
    sessions: Session[];
    currentSessionId: string | null;
    onSwitchSession: (sessionId: string) => void;
}

export const SessionHeader: React.FC<SessionHeaderProps> = ({
    sessions,
    currentSessionId,
    onSwitchSession,
}) => {
    const [showList, setShowList] = useState(false);

    const handleNewChat = () => {
        postMessage({ type: 'newSession' });
        setShowList(false);
    };

    const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        postMessage({ type: 'deleteSession', sessionId });
    };

    const currentSession = sessions.find((s) => s.id === currentSessionId);

    return (
        <div className="session-header">
            <span className="header-title">Z-Code</span>

            <div className="header-actions">
                <button className="action-btn" onClick={handleNewChat} title="New Chat">
                    新对话
                </button>

                <button
                    className="action-btn session-list-btn"
                    onClick={() => setShowList(!showList)}
                >
                    会话列表 ▾
                </button>

                <button className="action-btn icon-btn" title="Refresh">⟳</button>
                <button className="action-btn icon-btn" title="Settings">⚙️</button>
            </div>

            {showList && (
                <div className="session-list-dropdown">
                    {sessions.length === 0 ? (
                        <div className="session-empty">No sessions</div>
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
};
