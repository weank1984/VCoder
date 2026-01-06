import type { ToolCall } from '../../types';
import { useI18n } from '../../i18n/I18nProvider';

interface BashApprovalContentProps {
    toolCall: ToolCall;
}

export function BashApprovalContent({ toolCall }: BashApprovalContentProps) {
    const { t } = useI18n();
    const command = toolCall.confirmationData?.command || '';
    const riskReasons = toolCall.confirmationData?.riskReasons || [];
    
    return (
        <div className="approval-content">
            {/* Command preview */}
            <div className="command-preview">
                <span className="command-prompt">$</span>
                <span>{command}</span>
            </div>
            
            {/* Risk hints */}
            {riskReasons.length > 0 && (
                <div className="risk-hints">
                    <div className="risk-title">
                        <svg viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z" />
                            <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z" />
                        </svg>
                        <span>{t('Agent.RiskHint')}</span>
                    </div>
                    <ul className="risk-list">
                        {riskReasons.map((reason, index) => (
                            <li key={index}>• {t(`Agent.${reason}`)}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
