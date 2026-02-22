import type { ToolCall } from '../../types';
import { useI18n } from '../../i18n/I18nProvider';
import { copyToClipboard } from '../../utils/clipboard';

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
                <span className="command-text">{command}</span>
                <button
                    className="command-copy-btn"
                    onClick={(e) => { e.stopPropagation(); copyToClipboard(command); }}
                    title={t('Terminal.CopyOutput')}
                >
                    <svg viewBox="0 0 16 16" fill="currentColor" width="13" height="13">
                        <path d="M4 4l1-1h5.414L13 5.586V14l-1 1H5l-1-1V4zm9 2l-3-3H5v10h8V6z"/>
                        <path d="M3 1L2 2v10l1 1V2h6l1-1H3z"/>
                    </svg>
                </button>
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
                            <li key={index}>{t(`Agent.${reason}`)}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
