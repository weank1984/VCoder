import { useFloatingApproval } from '../../hooks/useFloatingApproval';
import { useI18n } from '../../i18n/I18nProvider';
import { ApprovalUI } from '../StepProgress/ApprovalUI';
import { QuestionUI } from '../StepProgress/QuestionUI';
import './FloatingApproval.scss';

/**
 * FloatingApproval — renders the most recent awaiting_confirmation tool call
 * as an absolute-positioned card above the InputArea (inside .app-input-dock).
 * Subagent child tool calls are handled by MissionControl and excluded here.
 */
export function FloatingApproval() {
    const { t } = useI18n();
    const { pendingToolCall, pendingCount, isQuestion, onConfirm, onAnswer } = useFloatingApproval();

    if (!pendingToolCall) {
        return null;
    }

    return (
        <div className="floating-approval">
            {pendingCount > 1 && (
                <div className="floating-approval__queue-badge">
                    {t('FloatingApproval.QueuedCount', { count: String(pendingCount - 1) })}
                </div>
            )}
            <div className="floating-approval__card">
                {isQuestion ? (
                    <QuestionUI
                        toolCall={pendingToolCall}
                        onAnswer={(answer) => onAnswer(pendingToolCall, answer)}
                    />
                ) : (
                    <ApprovalUI
                        toolCall={pendingToolCall}
                        onApprove={(options) => onConfirm(pendingToolCall, true, options)}
                        onReject={() => onConfirm(pendingToolCall, false)}
                    />
                )}
            </div>
        </div>
    );
}
