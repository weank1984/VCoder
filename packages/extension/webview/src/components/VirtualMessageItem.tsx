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
}

export function VirtualMessageItem({ message, index }: VirtualMessageItemProps) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (ref.current) {
            const height = ref.current.getBoundingClientRect().height;
            setItemHeight(index, height);
        }
    }, [index, message.content, message.toolCalls?.length]);

    return (
        <div ref={ref} className="virtual-message-item">
            <ChatBubble message={message} />
        </div>
    );
}
