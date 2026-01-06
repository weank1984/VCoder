import { useState } from 'react';
import type { ConfirmationType } from '../../types';
import { useI18n } from '../../i18n/I18nProvider';

interface ApprovalActionsProps {
    type: ConfirmationType;
    riskLevel: 'low' | 'medium' | 'high';
    onApprove: (options?: { trustAlways?: boolean; editedContent?: string }) => void;
    onReject: () => void;
}

export function ApprovalActions({ type, riskLevel, onApprove, onReject }: ApprovalActionsProps) {
    const { t } = useI18n();
    const [trustAlways, setTrustAlways] = useState(false);
    
    const getApproveLabel = () => {
        switch (type) {
            case 'bash':
                return t('Agent.ApproveAndRun');
            case 'file_write':
                return t('Agent.AcceptChanges');
            case 'file_delete':
                return t('Agent.ConfirmDelete');
            case 'plan':
                return t('Agent.RunPlan');
            default:
                return t('Agent.ApproveAndRun');
        }
    };
    
    const getRejectLabel = () => {
        switch (type) {
            case 'file_delete':
                return t('Agent.Cancel');
            default:
                return t('Agent.RejectChanges');
        }
    };
    
    const handleApprove = () => {
        onApprove({ trustAlways });
    };
    
    const isDangerous = type === 'file_delete' || riskLevel === 'high';
    
    return (
        <div className="approval-actions">
            {/* Trust always option - only for low/medium risk */}
            {riskLevel !== 'high' && (
                <label className="trust-option">
                    <input
                        type="checkbox"
                        checked={trustAlways}
                        onChange={(e) => setTrustAlways(e.target.checked)}
                    />
                    <span>{t('Agent.TrustAlways')}</span>
                </label>
            )}
            
            {/* Action buttons */}
            <button
                className="approval-btn btn-secondary"
                onClick={onReject}
            >
                <svg viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
                </svg>
                <span>{getRejectLabel()}</span>
            </button>
            
            <button
                className={`approval-btn ${isDangerous ? 'btn-danger' : 'btn-primary'}`}
                onClick={handleApprove}
            >
                <svg viewBox="0 0 16 16" fill="currentColor">
                    <path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425a.247.247 0 0 1 .02-.022Z" />
                </svg>
                <span>{getApproveLabel()}</span>
            </button>
        </div>
    );
}
