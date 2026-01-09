/**
 * Chat Bubble Component
 * Renders message content in chronological order based on contentBlocks
 */

import { useMemo, useState, useCallback } from 'react';
import type { ChatMessage, ContentBlock, ToolCall } from '../types';
import { ThoughtBlock } from './ThoughtBlock';
import { StepProgressList } from './StepProgress';
import { MarkdownContent } from './MarkdownContent';
import { UserIcon, VoyahIcon, CopyIcon, CheckIcon } from './Icon';
import { useI18n } from '../i18n/I18nProvider';
import './ChatBubble.scss';

interface ChatBubbleProps {
    message: ChatMessage;
}

/**
 * Generate contentBlocks for legacy messages without them
 * Order: thought -> tools -> text (since for history, tools usually happened first)
 */
function generateLegacyContentBlocks(message: ChatMessage): ContentBlock[] {
    const blocks: ContentBlock[] = [];
    
    // 1. Thought block (if exists)
    if (message.thought && message.thought.length > 0) {
        blocks.push({
            type: 'thought',
            content: message.thought,
            isComplete: message.thoughtIsComplete !== false,
        });
    }
    
    // 2. Tools block (if exists) - tools before text for legacy messages
    if (message.toolCalls && message.toolCalls.length > 0) {
        blocks.push({
            type: 'tools',
            toolCallIds: message.toolCalls.map(tc => tc.id),
        });
    }
    
    // 3. Text block (if exists)
    if (message.content && message.content.length > 0) {
        blocks.push({
            type: 'text',
            content: message.content,
        });
    }
    
    return blocks;
}

/**
 * Render a single content block
 */
function renderContentBlock(
    block: ContentBlock, 
    index: number,
    message: ChatMessage,
    toolCallMap: Map<string, ToolCall>
) {
    switch (block.type) {
        case 'thought':
            return (
                <ThoughtBlock
                    key={`thought-${index}`}
                    content={block.content}
                    defaultExpanded={!block.isComplete}
                    isComplete={block.isComplete}
                />
            );
        case 'text':
            return (
                <MarkdownContent 
                    key={`text-${index}`}
                    content={block.content} 
                    isComplete={message.isComplete} 
                />
            );
        case 'tools': {
            const tools = block.toolCallIds
                .map(id => toolCallMap.get(id))
                .filter((tc): tc is ToolCall => tc !== undefined);
            if (tools.length === 0) return null;
            return (
                <StepProgressList 
                    key={`tools-${index}`}
                    toolCalls={tools} 
                />
            );
        }
        default:
            return null;
    }
}

export function ChatBubble({ message }: ChatBubbleProps) {
    const { t } = useI18n();
    const isUser = message.role === 'user';
    const bubbleClass = `vc-bubble ${isUser ? 'vc-bubble--user' : 'vc-bubble--assistant'}`;
    
    const [copied, setCopied] = useState(false);
    
    // Build tool call lookup map for efficient access
    const toolCallMap = useMemo(() => {
        const map = new Map<string, ToolCall>();
        message.toolCalls?.forEach(tc => map.set(tc.id, tc));
        return map;
    }, [message.toolCalls]);
    
    // Use contentBlocks if available, otherwise generate from legacy fields
    const contentBlocks = useMemo(() => {
        if (message.contentBlocks && message.contentBlocks.length > 0) {
            return message.contentBlocks;
        }
        // Generate contentBlocks for legacy messages
        return generateLegacyContentBlocks(message);
    }, [message]);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(message.content);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy message:', err);
        }
    }, [message.content]);

    return (
        <div className={bubbleClass}>
            {/* Background gradient for assistant messages */}
            {!isUser && <div className="vc-bubble-bg" />}
            
            <div className="vc-bubble-header">
                <div className={`vc-bubble-avatar ${isUser ? 'avatar--user' : 'avatar--assistant'}`}>
                    {isUser ? <UserIcon /> : <VoyahIcon />}
                </div>
                <span className="vc-bubble-title">{isUser ? t('Chat.You') || 'You' : 'VCoder'}</span>
                
                {/* Message actions for assistant messages */}
                {!isUser && message.content && (
                    <div className="vc-bubble-actions">
                        <button 
                            className="action-btn" 
                            onClick={handleCopy}
                            title={copied ? t('Agent.MessageCopied') : t('Agent.CopyMessage')}
                            aria-label={copied ? t('Agent.MessageCopied') : t('Agent.CopyMessage')}
                        >
                            {copied ? <CheckIcon /> : <CopyIcon />}
                        </button>
                    </div>
                )}
            </div>

            <div className="vc-bubble-content">
                {isUser ? (
                    // User messages: simple text display
                    <div className="message-text">{message.content}</div>
                ) : (
                    // Assistant messages: render content blocks in chronological order
                    contentBlocks.map((block, index) => 
                        renderContentBlock(block, index, message, toolCallMap)
                    )
                )}
            </div>
        </div>
    );
}
