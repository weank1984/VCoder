/**
 * Chat Bubble Component
 */

import React from 'react';
import { ChatMessage } from '../types';
import { ThoughtBlock } from './ThoughtBlock';
import { ToolCallList } from './ToolCallList';
import './ChatBubble.css';

interface ChatBubbleProps {
    message: ChatMessage;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ message }) => {
    const isUser = message.role === 'user';

    return (
        <div className={`chat-bubble ${isUser ? 'user' : 'assistant'}`}>
            <div className="bubble-header">
                <span className="role-icon">{isUser ? '👤' : '🤖'}</span>
                <span className="role-name">{isUser ? 'You' : 'Z-Code'}</span>
            </div>

            <div className="bubble-content">
                {/* Show thought process for assistant */}
                {!isUser && message.thought && (
                    <ThoughtBlock content={message.thought} />
                )}

                {/* Show tool calls for assistant */}
                {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
                    <ToolCallList toolCalls={message.toolCalls} />
                )}

                {/* Main message content */}
                <div className="message-text">
                    {message.content}
                    {!message.isComplete && <span className="cursor">▊</span>}
                </div>
            </div>
        </div>
    );
};
