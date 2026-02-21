/**
 * Chat Bubble Component
 * Renders message content in chronological order based on contentBlocks
 */

import { useMemo, useState, useCallback } from 'react';
import type { ChatMessage, ContentBlock, ToolCall } from '../types';
import { ThoughtBlock } from './ThoughtBlock';
import { StepProgressList } from './StepProgress';
import { MarkdownContent } from './MarkdownContent';
import { ExploredSummary } from './ExploredSummary';
import { partitionToolCalls } from '../utils/toolCallPartitioner';
import { CopyIcon, CheckIcon } from './Icon';
import { useI18n } from '../i18n/I18nProvider';
import { useToast } from '../utils/Toast';
import { copyToClipboardAsync } from '../utils/clipboard';
import './ChatBubble.scss';
import './ComposerSurface.scss';

interface ChatBubbleProps {
    message: ChatMessage;
}

function isPlaceholderText(text: string): boolean {
    const trimmed = text.trim();
    return (
        trimmed === '(no content)' ||
        trimmed === '(no output)' ||
        trimmed === '(无内容)' ||
        trimmed === '(无输出)'
    );
}

function stripTrailingPlaceholders(text: string): string {
    return text.replace(/\s*(?:\((?:no content|no output|无内容|无输出)\)\s*)+$/gi, '').trimEnd();
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
                    defaultExpanded={false}
                    isComplete={block.isComplete}
                />
            );
        case 'text': {
            // Backends sometimes emit placeholder text for tool-only messages.
            // Hide it to keep the conversation flow clean.
            if (isPlaceholderText(block.content)) return null;
            const cleaned = stripTrailingPlaceholders(block.content);
            if (!cleaned.trim() || isPlaceholderText(cleaned)) return null;
            return (
                <MarkdownContent 
                    key={`text-${index}`}
                    content={cleaned}
                    isComplete={message.isComplete} 
                />
            );
        }
        case 'tools': {
            const tools = block.toolCallIds
                .map(id => toolCallMap.get(id))
                .filter((tc): tc is ToolCall => tc !== undefined);
            if (tools.length === 0) return null;

            const { exploredCalls, actionCalls } = partitionToolCalls(tools);
            const isComplete = message.isComplete !== false;

            return (
                <div key={`tools-${index}`}>
                    {exploredCalls.length > 0 && (
                        <ExploredSummary
                            toolCalls={exploredCalls}
                            isComplete={isComplete}
                        />
                    )}
                    {actionCalls.length > 0 && (
                        <StepProgressList toolCalls={actionCalls} />
                    )}
                </div>
            );
        }
        default:
            return null;
    }
}

export function ChatBubble({ message }: ChatBubbleProps) {
    const { t } = useI18n();
    const { showError, showSuccess } = useToast();
    const isUser = message.role === 'user';
    const baseBubbleClass = `vc-bubble ${isUser ? 'vc-bubble--user' : 'vc-bubble--assistant'}`;

    const [copied, setCopied] = useState(false);
    const [isCopying, setIsCopying] = useState(false);
    
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

    const isToolOnlyAssistant = useMemo(() => {
        if (isUser) return false;
        const hasTools = (message.toolCalls?.length ?? 0) > 0;
        if (!hasTools) return false;
        const hasThought = Boolean(message.thought && message.thought.trim().length > 0);
        const hasVisibleText = contentBlocks.some((b) => {
            if (b.type !== 'text') return false;
            if (!b.content || b.content.trim().length === 0) return false;
            if (isPlaceholderText(b.content)) return false;
            return true;
        });
        return !hasThought && !hasVisibleText;
    }, [contentBlocks, isUser, message.thought, message.toolCalls]);

    const bubbleClass = `${baseBubbleClass}${isToolOnlyAssistant ? ' vc-bubble--tool-only' : ''}`;
    const showBottomCursor = !isUser && message.isComplete === false;

    const handleCopy = useCallback(async () => {
        if (isCopying) return;

        setIsCopying(true);
        try {
            await copyToClipboardAsync(message.content);
            setCopied(true);
            showSuccess(t('Agent.MessageCopied'));
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error('Failed to copy message:', err);
            showError(t('Agent.CopyFailed', { error: errorMessage }));
        } finally {
            setIsCopying(false);
        }
    }, [message.content, isCopying, showSuccess, showError, t]);

    return (
        <div className={bubbleClass} data-role={message.role}>
            {isUser ? (
                // User Message: Right-aligned bubble (Claude style)
                <div className="vc-human-message-container">
                    <div className="vc-human-message-content">
                        {message.content}
                    </div>
                </div>
            ) : (
                // Assistant Message: Transparent, document flow
                <div className="vc-ai-message-container">
                    {contentBlocks.map((block, index) => 
                        renderContentBlock(block, index, message, toolCallMap)
                    )}

                    {showBottomCursor && (
                        <div className="vc-streaming-indicator-row" aria-label={t('Agent.Thinking')}>
                            <span className="vc-typing-indicator" aria-hidden="true">
                                <span className="dot" />
                                <span className="dot" />
                                <span className="dot" />
                            </span>
                            <span className="vc-typing-label">{t('Agent.Thinking')}</span>
                        </div>
                    )}
                    
                    {/* Message Actions for AI */}
                    {message.content && (
                        <div className="vc-ai-actions">
                            <button 
                                className="action-btn" 
                                onClick={handleCopy}
                                title={copied ? t('Agent.MessageCopied') : t('Agent.CopyMessage')}
                            >
                                {copied ? <CheckIcon /> : <CopyIcon />}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
