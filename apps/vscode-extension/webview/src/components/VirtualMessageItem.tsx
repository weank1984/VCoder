/**
 * Virtual Message Item
 * Wraps ChatBubble with height measurement for virtual list
 */

import { useEffect, useRef } from 'react';
import { ChatBubble } from './ChatBubble';
import { setItemHeight } from '../hooks/useVirtualList';
import type { ChatMessage } from '../types';

interface VirtualMessageItemProps {
    message: ChatMessage;
    index: number;
    hideUserMessage?: boolean;
}

export function VirtualMessageItem({ message, index, hideUserMessage }: VirtualMessageItemProps) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (hideUserMessage && message.role === 'user') {
            setItemHeight(index, 0);
            return;
        }
        if (ref.current) {
            const height = ref.current.getBoundingClientRect().height;
            setItemHeight(index, height);
        }
    }, [hideUserMessage, index, message.content, message.role, message.thought, message.thoughtIsComplete, message.toolCalls?.length]);

    if (hideUserMessage && message.role === 'user') {
        return null;
    }

    return (
        <div
            ref={ref}
            className="virtual-message-item"
            data-message-index={index}
            data-message-role={message.role}
        >
            <ChatBubble message={message} />
        </div>
    );
}
