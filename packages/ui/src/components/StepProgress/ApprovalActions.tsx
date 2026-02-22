import { useEffect } from 'react';
import type { ConfirmationType } from '@vcoder/shared';
import { useI18n } from '../../i18n/I18nProvider';

interface ApprovalActionsProps {
    type: ConfirmationType;
    riskLevel: 'low' | 'medium' | 'high';
    onApprove: (options?: { trustAlways?: boolean; editedContent?: string }) => void;
    onReject: () => void;
}

export function ApprovalActions({ type, riskLevel, onApprove, onReject }: ApprovalActionsProps) {
    const { t } = useI18n();
    const isDangerous = type === 'file_delete' || riskLevel === 'high';

    // 键盘快捷键
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onReject();
            } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !isDangerous) {
                e.preventDefault();
                onApprove({ trustAlways: true });
            } else if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                onApprove({ trustAlways: false });
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isDangerous, onApprove, onReject]);

    return (
        <div className="approval-actions">
            <button
                className="approval-btn btn-deny"
                onClick={onReject}
            >
                <span>{t('Agent.Deny')}</span>
                <kbd className="kbd-hint">Esc</kbd>
            </button>

            {!isDangerous && (
                <button
                    className="approval-btn btn-session"
                    onClick={() => onApprove({ trustAlways: true })}
                >
                    <span>{t('Agent.AlwaysAllowSession')}</span>
                    <kbd className="kbd-hint">⌘</kbd>
                    <kbd className="kbd-hint">↵</kbd>
                </button>
            )}

            <button
                className={`approval-btn ${isDangerous ? 'btn-danger' : 'btn-allow'}`}
                onClick={() => onApprove({ trustAlways: false })}
            >
                <span>{isDangerous ? t('Agent.ConfirmDelete') : t('Agent.AllowOnce')}</span>
                <kbd className="kbd-hint">↵</kbd>
            </button>
        </div>
    );
}
