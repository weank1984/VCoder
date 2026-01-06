import type { ConfirmationType } from '../../types';
import { useI18n } from '../../i18n/I18nProvider';

interface ApprovalHeaderProps {
    type: ConfirmationType;
    riskLevel: 'low' | 'medium' | 'high';
}

export function ApprovalHeader({ type, riskLevel }: ApprovalHeaderProps) {
    const { t } = useI18n();
    
    const getIcon = () => {
        switch (type) {
            case 'bash':
                return (
                    <svg viewBox="0 0 16 16" fill="currentColor">
                        <path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm9.5 10.5H5a.5.5 0 0 0 0 1h4.5a.5.5 0 0 0 0-1zM3.75 4.5a.75.75 0 0 0 0 1.5h.5a.75.75 0 0 0 0-1.5h-.5zm0 3a.75.75 0 0 0 0 1.5h.5a.75.75 0 0 0 0-1.5h-.5zm4 0a.75.75 0 0 0 0 1.5h.5a.75.75 0 0 0 0-1.5h-.5z" />
                    </svg>
                );
            case 'file_write':
                return (
                    <svg viewBox="0 0 16 16" fill="currentColor">
                        <path d="M12.854 2.854a.5.5 0 0 0-.708-.708l-9 9A.5.5 0 0 0 3 11.5v1a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .354-.146l9-9z" />
                        <path fillRule="evenodd" d="M13.5 1a.5.5 0 0 1 .5.5v13a.5.5 0 0 1-1 0v-13a.5.5 0 0 1 .5-.5z" />
                    </svg>
                );
            case 'file_delete':
                return (
                    <svg viewBox="0 0 16 16" fill="currentColor">
                        <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
                        <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1z" />
                    </svg>
                );
            case 'plan':
                return (
                    <svg viewBox="0 0 16 16" fill="currentColor">
                        <path d="M2.5 3.5a.5.5 0 0 1 0-1h11a.5.5 0 0 1 0 1h-11zm0 3a.5.5 0 0 1 0-1h6a.5.5 0 0 1 0 1h-6zm0 3a.5.5 0 0 1 0-1h6a.5.5 0 0 1 0 1h-6zm0 3a.5.5 0 0 1 0-1h11a.5.5 0 0 1 0 1h-11zm9-6a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 0 1h-1a.5.5 0 0 1-.5-.5zm0 3a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 0 1h-1a.5.5 0 0 1-.5-.5z" />
                    </svg>
                );
            case 'mcp':
                return (
                    <svg viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zM4.5 7.5a.5.5 0 0 1 0-1h7a.5.5 0 0 1 0 1h-7zm0 2a.5.5 0 0 1 0-1h7a.5.5 0 0 1 0 1h-7z" />
                    </svg>
                );
            default:
                return (
                    <svg viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z" />
                        <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z" />
                    </svg>
                );
        }
    };
    
    const getTitle = () => {
        switch (type) {
            case 'bash':
                return t('Agent.ConfirmBash');
            case 'file_write':
                return t('Agent.ConfirmFileWrite');
            case 'file_delete':
                return t('Agent.ConfirmFileDelete');
            case 'plan':
                return t('Agent.ConfirmPlan');
            case 'mcp':
                return t('Agent.ConfirmMcp');
            default:
                return t('Agent.ConfirmDangerous');
        }
    };
    
    const getRiskLabel = () => {
        switch (riskLevel) {
            case 'low':
                return t('Agent.RiskLow');
            case 'medium':
                return t('Agent.RiskMedium');
            case 'high':
                return t('Agent.RiskHigh');
        }
    };
    
    return (
        <div className="approval-header">
            <div className="header-title">
                {getIcon()}
                <span>{getTitle()}</span>
            </div>
            {riskLevel !== 'low' && (
                <div className={`risk-badge risk-${riskLevel}`}>
                    <svg viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
                    </svg>
                    <span>{getRiskLabel()}</span>
                </div>
            )}
        </div>
    );
}
