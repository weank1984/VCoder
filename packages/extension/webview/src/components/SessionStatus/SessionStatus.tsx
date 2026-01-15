/**
 * Session Status Component
 * Displays global session status and error information
 */

import { useI18n } from '../../i18n/I18nProvider';
import { CheckIcon, ErrorIcon, InfoIcon, WarningIcon } from '../Icon';
import type { SessionStatus as SessionStatusType, SessionCompleteReason } from '../../types';
import type { ErrorUpdate } from '@vcoder/shared';
import './SessionStatus.scss';

interface SessionStatusProps {
    status: SessionStatusType;
    reason?: SessionCompleteReason;
    message?: string;
    error?: ErrorUpdate | null;
    onRetry?: () => void;
    onDismiss?: () => void;
}

export function SessionStatus({ 
    status, 
    reason, 
    message, 
    error,
    onRetry,
    onDismiss 
}: SessionStatusProps) {
    const { t } = useI18n();
    
    // Don't show banner for idle or active status
    if (status === 'idle' || status === 'active') {
        return null;
    }
    
    // Determine banner type and content
    const getBannerInfo = () => {
        if (status === 'error' || (status === 'completed' && reason === 'error')) {
            const errorCode = error?.code;
            let title = t('Error.ErrorOccurred');
            let description = message || error?.message || t('Error.Unknown');
            let recoverable = error?.recoverable ?? true;
            
            // Map error codes to friendly messages
            if (errorCode) {
                switch (errorCode) {
                    case 'AGENT_CRASHED':
                        title = t('Error.AgentCrashed');
                        description = t('Error.AgentCrashedDesc');
                        recoverable = true;
                        break;
                    case 'CONNECTION_LOST':
                        title = t('Error.ConnectionLost');
                        description = t('Error.ConnectionLostDesc');
                        recoverable = true;
                        break;
                    case 'TOOL_TIMEOUT':
                        title = t('Error.ToolTimeout');
                        description = t('Error.ToolTimeoutDesc');
                        recoverable = true;
                        break;
                    case 'SESSION_CANCELLED':
                        title = t('SessionStatus.UserCancelled');
                        description = message || '';
                        recoverable = false;
                        break;
                    case 'RATE_LIMITED':
                        title = t('Error.RateLimited');
                        description = t('Error.RateLimitedDesc');
                        recoverable = true;
                        break;
                    case 'CONTEXT_TOO_LARGE':
                        title = t('Error.ContextTooLarge');
                        description = t('Error.ContextTooLargeDesc');
                        recoverable = false;
                        break;
                }
            }
            
            return {
                type: 'error' as const,
                icon: <ErrorIcon />,
                title,
                description,
                recoverable,
            };
        }
        
        if (status === 'timeout' || (status === 'completed' && reason === 'timeout')) {
            return {
                type: 'warning' as const,
                icon: <WarningIcon />,
                title: t('Error.SessionTimeout'),
                description: message || t('Error.SessionTimeoutDesc'),
                recoverable: true,
            };
        }
        
        if (status === 'cancelled' || (status === 'completed' && reason === 'cancelled')) {
            return {
                type: 'info' as const,
                icon: <InfoIcon />,
                title: t('SessionStatus.UserCancelled'),
                description: message || '',
                recoverable: false,
            };
        }
        
        if (status === 'completed' && reason === 'completed') {
            return {
                type: 'success' as const,
                icon: <CheckIcon />,
                title: t('SessionStatus.NormalComplete'),
                description: message || '',
                recoverable: false,
            };
        }
        
        if (status === 'completed' && reason === 'max_turns_reached') {
            return {
                type: 'info' as const,
                icon: <InfoIcon />,
                title: t('SessionStatus.MaxTurnsReached'),
                description: message || '',
                recoverable: false,
            };
        }
        
        // Default
        return {
            type: 'info' as const,
            icon: <InfoIcon />,
            title: t('SessionStatus.' + status.charAt(0).toUpperCase() + status.slice(1)),
            description: message || '',
            recoverable: false,
        };
    };
    
    const bannerInfo = getBannerInfo();
    
    return (
        <div className={`session-status-banner ${bannerInfo.type}`}>
            <div className="session-status-icon">
                {bannerInfo.icon}
            </div>
            <div className="session-status-content">
                <div className="session-status-title">{bannerInfo.title}</div>
                {bannerInfo.description && (
                    <div className="session-status-description">{bannerInfo.description}</div>
                )}
                {error?.details && (
                    <details className="session-status-details">
                        <summary>{t('Error.TechnicalDetails')}</summary>
                        <pre>{error.details}</pre>
                    </details>
                )}
            </div>
            <div className="session-status-actions">
                {bannerInfo.recoverable && onRetry && (
                    <button 
                        className="session-status-btn session-status-retry"
                        onClick={onRetry}
                    >
                        {error?.action?.label || t('Error.Retry')}
                    </button>
                )}
                {onDismiss && (
                    <button 
                        className="session-status-btn session-status-dismiss"
                        onClick={onDismiss}
                        title={t('Common.Close')}
                    >
                        ✕
                    </button>
                )}
            </div>
        </div>
    );
}
