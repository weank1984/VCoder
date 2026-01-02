/**
 * Chat Bubble Component
 */

import type { ChatMessage } from '../types';
import { ThoughtBlock } from './ThoughtBlock';
import { ToolCallList } from './ToolCallList';
import { MarkdownContent } from './MarkdownContent';
import { UserIcon, VoyahIcon } from './Icon';
import './ChatBubble.scss';

interface ChatBubbleProps {
    message: ChatMessage;
}

export function ChatBubble({ message }: ChatBubbleProps) {
    const isUser = message.role === 'user';
    const bubbleClass = `vc-bubble ${isUser ? 'user' : 'assistant'}`;

    return (
        <div className={bubbleClass}>
            <div className="vc-bubble-header">
                <span className="vc-bubble-avatar">
                    {isUser ? <UserIcon /> : <VoyahIcon />}
                </span>
                <span className="vc-bubble-title">{isUser ? 'User' : 'VCoder'}</span>
            </div>

            <div className="vc-bubble-content">
                {/* Show thought process for assistant */}
                {!isUser && message.thought && (
                    <ThoughtBlock content={message.thought} />
                )}

                {/* Main message content with Markdown rendering for assistant */}
                {isUser ? (
                    <div className="message-text">{message.content}</div>
                ) : (
                    <MarkdownContent content={message.content} isComplete={message.isComplete} />
                )}

                {/* Show tool calls for assistant */}
                {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
                    <ToolCallList toolCalls={message.toolCalls} />
                )}
            </div>
        </div>
    );
}
