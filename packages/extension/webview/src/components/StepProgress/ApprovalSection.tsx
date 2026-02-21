import type { ToolCall } from '../../types';
import { useI18n } from '../../i18n/I18nProvider';
import { CheckIcon, StopIcon, InfoIcon } from '../Icon';
import { ApprovalUI } from './ApprovalUI';

interface ApprovalSectionProps {
    toolCall: ToolCall;
    isCommandPending: boolean;
    onConfirm: (tc: ToolCall, approve: boolean, options?: { trustAlways?: boolean; editedContent?: string }) => void;
}

export function ApprovalSection({ toolCall, isCommandPending, onConfirm }: ApprovalSectionProps) {
    const { t } = useI18n();
    const isAwaitingConfirmation = toolCall.status === 'awaiting_confirmation';

    if (isAwaitingConfirmation) {
        return (
            <ApprovalUI
                toolCall={toolCall}
                onApprove={(options) => onConfirm(toolCall, true, options)}
                onReject={() => onConfirm(toolCall, false)}
            />
        );
    }

    if (isCommandPending) {
        return (
            <div className="entry-approval">
                <div className="approval-message">
                    <InfoIcon />
                    <span>{t('Agent.ApprovalRequired')}</span>
                </div>
                <div className="approval-buttons">
                    <button
                        className="btn-approve"
                        onClick={(e) => {
                            e.stopPropagation();
                            onConfirm(toolCall, true);
                        }}
                    >
                        <CheckIcon /> {t('Agent.Approve')}
                    </button>
                    <button
                        className="btn-reject"
                        onClick={(e) => {
                            e.stopPropagation();
                            onConfirm(toolCall, false);
                        }}
                    >
                        <StopIcon /> {t('Agent.Reject')}
                    </button>
                </div>
            </div>
        );
    }

    return null;
}
