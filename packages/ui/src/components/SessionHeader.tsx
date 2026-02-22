/**
 * Session Header Component
 */

import { useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import type { Session } from '@vcoder/shared';
import { postMessage } from '../bridge';
import { PlusIcon, CloseIcon, ArrowBottomIcon } from './Icon';
import { sanitizeSessionTitle } from '../utils/sanitizeTitle';
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
    const current = useMemo(
        () => sessions.find((s) => s.id === currentSessionId) ?? sessions[0],
        [currentSessionId, sessions]
    );

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
            <div className="header-left">
                <div className="session-chip-wrapper">
                    <button
                        type="button"
                        className={`session-chip ${showList ? 'is-active' : ''}`}
                        onClick={() => setShowList(!showList)}
                        title={sanitizeSessionTitle(current?.title, 'Untitled chat')}
                        aria-label="Current session"
                    >
                        <span className="session-chip-title">{sanitizeSessionTitle(current?.title, 'Untitled chat')}</span>
                        <span className="session-chip-caret">
                            <ArrowBottomIcon />
                        </span>
                    </button>

                    {showList && (
                        <>
                            <div className="dropdown-overlay" onClick={() => setShowList(false)} />
                            <div className="session-list-dropdown">
                                <div className="dropdown-header">
                                    <span>Recent chats</span>
                                </div>
                                {sessions.length === 0 ? (
                                    <div className="session-empty">No recent chats</div>
                                ) : (
                                    <div className="session-list-content">
                                        {sessions.map((session) => (
                                            <div
                                                key={session.id}
                                                className={`session-item ${session.id === currentSessionId ? 'active' : ''}`}
                                                onClick={() => {
                                                    onSwitchSession(session.id);
                                                    setShowList(false);
                                                }}
                                            >
                                                <span className="session-title">{sanitizeSessionTitle(session.title, 'Untitled chat')}</span>
                                                <button
                                                    className="session-delete"
                                                    onClick={(e) => handleDeleteSession(session.id, e)}
                                                    aria-label="Delete chat"
                                                    title="Delete chat"
                                                >
                                                    <CloseIcon />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                <button type="button" className="new-chat-btn" onClick={handleNewChat}>
                    <PlusIcon />
                    <span>New Chat</span>
                </button>
            </div>

            <div className="header-right" />
        </div>
    );
}
