/**
 * Jump to Bottom Button Component
 * Floating button that appears when user scrolls up
 */

import './JumpToBottom.scss';
import { useI18n } from '../i18n/I18nProvider';

interface JumpToBottomProps {
    visible: boolean;
    onClick: () => void;
}

export function JumpToBottom({ visible, onClick }: JumpToBottomProps) {
    const { t } = useI18n();

    if (!visible) return null;

    return (
        <button 
            className="vc-jump-to-bottom"
            onClick={onClick}
            title={t('Chat.JumpToBottom')}
            aria-label={t('Chat.JumpToBottom')}
        >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 12L3 7h10L8 12z" />
            </svg>
            <span>{t('Chat.JumpToBottom')}</span>
        </button>
    );
}
