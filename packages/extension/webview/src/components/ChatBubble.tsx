/**
 * Chat Bubble Component
 */

import type { ChatMessage } from '../types';
import { ThoughtBlock } from './ThoughtBlock';
import { ToolCallList } from './ToolCallList';
import { MarkdownContent } from './MarkdownContent';
import './ChatBubble.css';

interface ChatBubbleProps {
    message: ChatMessage;
}

export function ChatBubble({ message }: ChatBubbleProps) {
    const isUser = message.role === 'user';

    return (
        <div className={`chat-bubble ${isUser ? 'user' : 'assistant'}`}>
            <div className="bubble-header">
                <span className="role-icon">{isUser ? '👤' : '🤖'}</span>
                <span className="role-name">{isUser ? '你' : 'VCoder'}</span>
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

                {/* Main message content with Markdown rendering for assistant */}
                {isUser ? (
                    <div className="message-text">{message.content}</div>
                ) : (
                    <MarkdownContent content={message.content} isComplete={message.isComplete} />
                )}
            </div>
        </div>
    );
}
