/**
 * Jump to Bottom Button Component
 * Floating button that appears when user scrolls up
 */

import './JumpToBottom.scss';

interface JumpToBottomProps {
    visible: boolean;
    onClick: () => void;
}

export function JumpToBottom({ visible, onClick }: JumpToBottomProps) {
    if (!visible) return null;

    return (
        <button 
            className="vc-jump-to-bottom"
            onClick={onClick}
            title="跳到最新"
            aria-label="跳到最新消息"
        >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 12L3 7h10L8 12z" />
            </svg>
            <span>跳到最新</span>
        </button>
    );
}
