/**
 * Modern Loading System Component
 * Provides context-aware loading states with different animation types
 */

import React from 'react';
import classNames from 'classnames';
import LoadingIcon from '../Icon/icons/LoadingIcon';
import { useI18n } from '../../i18n/I18nProvider';
import './LoadingSystem.scss';

export type LoadingType = 'typing' | 'thinking' | 'processing' | 'searching' | 'executing';

interface LoadingSystemProps {
    type: LoadingType;
    message?: string;
    progress?: number;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
    showProgress?: boolean;
    inline?: boolean;
}

const LoadingSystem: React.FC<LoadingSystemProps> = ({
    type,
    message,
    progress,
    size = 'md',
    className,
    showProgress = false,
    inline = false
}) => {
    const { t } = useI18n();
    
    const getSizeClass = () => {
        switch (size) {
            case 'sm': return 'vc-loading--sm';
            case 'lg': return 'vc-loading--lg';
            default: return 'vc-loading--md';
        }
    };

    const getAnimationClass = () => {
        switch (type) {
            case 'typing':
                return 'vc-loading--typing';
            case 'thinking':
                return 'vc-loading--thinking';
            case 'processing':
                return 'vc-loading--processing';
            case 'searching':
                return 'vc-loading--searching';
            case 'executing':
                return 'vc-loading--executing';
            default:
                return 'vc-loading--typing';
        }
    };

    const getDefaultMessage = () => {
        switch (type) {
            case 'typing':
                return t('Loading.Typing') || '正在输入...';
            case 'thinking':
                return t('Loading.Thinking') || '正在思考...';
            case 'processing':
                return t('Loading.Processing') || '处理中...';
            case 'searching':
                return t('Loading.Searching') || '搜索中...';
            case 'executing':
                return t('Loading.Executing') || '执行中...';
            default:
                return t('Loading.Loading') || '加载中...';
        }
    };

    const displayMessage = message || getDefaultMessage();

    const renderAnimation = () => {
        switch (type) {
            case 'typing':
                return (
                    <div className="vc-loading__typing-indicator">
                        <span className="vc-loading__typing-dot" />
                        <span className="vc-loading__typing-dot" />
                        <span className="vc-loading__typing-dot" />
                    </div>
                );
            case 'thinking':
                return (
                    <div className="vc-loading__thinking-indicator">
                        <LoadingIcon className="vc-loading__spin-icon" />
                    </div>
                );
            case 'processing':
                return (
                    <div className="vc-loading__processing-indicator">
                        <div className="vc-loading__processing-circle" />
                        <div className="vc-loading__processing-circle" />
                        <div className="vc-loading__processing-circle" />
                    </div>
                );
            case 'searching':
                return (
                    <div className="vc-loading__searching-indicator">
                        <div className="vc-loading__search-bar" />
                        <div className="vc-loading__search-bar" />
                        <div className="vc-loading__search-bar" />
                    </div>
                );
            case 'executing':
                return (
                    <div className="vc-loading__executing-indicator">
                        <div className="vc-loading__executing-terminal">
                            <span className="vc-loading__terminal-cursor" />
                        </div>
                    </div>
                );
            default:
                return <LoadingIcon className="vc-loading__default-icon" />;
        }
    };

    const content = (
        <div className={classNames(
            'vc-loading',
            getSizeClass(),
            getAnimationClass(),
            { 'vc-loading--inline': inline },
            className
        )}>
            <div className="vc-loading__animation">
                {renderAnimation()}
            </div>
            
            {displayMessage && (
                <div className="vc-loading__content">
                    <span className="vc-loading__message">{displayMessage}</span>
                    
                    {showProgress && progress !== undefined && (
                        <div className="vc-loading__progress-container">
                            <div className="vc-loading__progress-bar">
                                <div 
                                    className="vc-loading__progress-fill"
                                    style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                                />
                            </div>
                            <span className="vc-loading__progress-text">{progress}%</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );

    return content;
};

export default LoadingSystem;