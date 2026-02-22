import type { ConfirmationType } from '@vcoder/shared';
import { useI18n } from '../../i18n/I18nProvider';

interface ApprovalHeaderProps {
    type: ConfirmationType;
    riskLevel: 'low' | 'medium' | 'high';
    contextName?: string;
    filePath?: string;
}

export function ApprovalHeader({ type, riskLevel, contextName, filePath }: ApprovalHeaderProps) {
    const { t } = useI18n();

    const getAction = () => {
        switch (type) {
            case 'bash': return t('Agent.ActionRun');
            case 'file_write': return t('Agent.ActionWrite');
            case 'file_delete': return t('Agent.ActionDelete');
            case 'plan': return t('Agent.ActionExecute');
            case 'mcp': return t('Agent.ActionCall');
            default: return t('Agent.ActionExecute');
        }
    };

    const getRiskLabel = () => {
        switch (riskLevel) {
            case 'low': return t('Agent.RiskLow');
            case 'medium': return t('Agent.RiskMedium');
            case 'high': return t('Agent.RiskHigh');
        }
    };

    return (
        <div className="approval-header">
            <div className="header-title">
                <span>{t('Agent.AllowClaude')} <strong>{getAction()}</strong>{contextName ? <> <code className="header-context-name">{contextName}</code></> : null}?</span>
                {riskLevel !== 'low' && (
                    <div className={`risk-badge risk-${riskLevel}`}>
                        <svg viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
                        </svg>
                        <span>{getRiskLabel()}</span>
                    </div>
                )}
            </div>
            {filePath && (
                <div className="header-file-path">{filePath}</div>
            )}
        </div>
    );
}
