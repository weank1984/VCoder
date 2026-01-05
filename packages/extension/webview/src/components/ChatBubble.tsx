/**
 * Chat Bubble Component
 */

import { memo } from 'react';
import type { ChatMessage } from '../types';
import { ThoughtBlock } from './ThoughtBlock';
import { StepProgressList } from './StepProgress';
import { MarkdownContent } from './MarkdownContent';
import { UserIcon, VoyahIcon } from './Icon';
import './ChatBubble.scss';

interface ChatBubbleProps {
    message: ChatMessage;
}

export const ChatBubble = memo(function ChatBubble({ message }: ChatBubbleProps) {
    const isUser = message.role === 'user';
    const bubbleClass = `vc-bubble ${isUser ? 'user' : 'assistant'}`;
    const hasThought = typeof message.thought === 'string' && message.thought.length > 0;
    const thoughtComplete = message.thoughtIsComplete !== false;

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
                {!isUser && (hasThought || message.thoughtIsComplete === false) && (
                    <ThoughtBlock
                        content={message.thought || ''}
                        defaultExpanded={!thoughtComplete}
                        isComplete={thoughtComplete}
                    />
                )}

                {/* Main message content with Markdown rendering for assistant */}
                {isUser ? (
                    <div className="message-text">{message.content}</div>
                ) : (
                    <MarkdownContent content={message.content} isComplete={message.isComplete} />
                )}

                {/* Show tool calls for assistant - Step-based Progress View */}
                {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
                    <StepProgressList toolCalls={message.toolCalls} />
                )}
            </div>
        </div>
    );
});
