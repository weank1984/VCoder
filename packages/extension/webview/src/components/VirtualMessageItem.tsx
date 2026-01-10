/**
 * Virtual Message Item
 * Wraps ChatBubble with height measurement for virtual list
 */

import { useEffect, useRef, memo } from 'react';
import { ChatBubble } from './ChatBubble';
import { setItemHeight } from '../hooks/useVirtualList';
import type { ChatMessage } from '../types';

interface VirtualMessageItemProps {
    message: ChatMessage;
    index: number;
}

export const VirtualMessageItem = memo(function VirtualMessageItem({ message, index }: VirtualMessageItemProps) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (ref.current) {
            const height = ref.current.getBoundingClientRect().height;
            setItemHeight(index, height);
        }
    }, [index, message.content, message.thought, message.thoughtIsComplete, message.toolCalls?.length]);

    return (
        <div ref={ref} className="virtual-message-item">
            <ChatBubble message={message} />
        </div>
    );
});
