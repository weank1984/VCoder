/**
 * ComposerToolbar - Shared toolbar component for input areas
 * Used by both InputArea and StickyUserPrompt
 */

import { useState } from 'react';
import type { ModelId } from '@vcoder/shared';
import { ModelSelector } from '../ModelSelector';
import { IconButton } from '../IconButton';
import { 
    AtIcon, 
    WebIcon, 
    ImageIcon, 
    ArrowBottomIcon, 
    SendIcon, 
    StopIcon, 
    CheckIcon, 
    ChatIcon, 
    ListCheckIcon
} from '../Icon';
import { useI18n } from '../../i18n/I18nProvider';
import './index.scss';

export interface ComposerToolbarProps {
    // Left toolbar - Agent & Model selectors
    showAgentSelector?: boolean;
    showModelSelector?: boolean;
    currentAgentName?: string;
    selectedModel?: ModelId;
    onSelectModel?: (model: ModelId) => void;
    onAgentChange?: (agentId: string) => void;
    
    // Right toolbar - Action buttons
    showMentionButton?: boolean;
    showWebButton?: boolean;
    showImageButton?: boolean;
    onMentionClick?: () => void;
    onWebClick?: () => void;
    onImageClick?: () => void;
    
    // Primary action configuration
    primaryAction: 'send' | 'apply';
    isLoading?: boolean;
    isSendDisabled?: boolean;
    onSend?: () => void;
    onStop?: () => void;
    onApply?: () => void;
    onCancel?: () => void;
    
    // General
    disabled?: boolean;
}

export function ComposerToolbar({
    showAgentSelector = true,
    showModelSelector = true,
    currentAgentName = 'Agent',
    selectedModel,
    onSelectModel,
    onAgentChange,
    showMentionButton = true,
    showWebButton = true,
    showImageButton = true,
    onMentionClick,
    onWebClick,
    onImageClick,
    primaryAction,
    isLoading = false,
    isSendDisabled = false,
    onSend,
    onStop,
    onApply,
    onCancel,
    disabled = false,
}: ComposerToolbarProps) {
    const { t } = useI18n();
    const [showAgentPicker, setShowAgentPicker] = useState(false);

    const handleAgentSelect = (agentId: string) => {
        onAgentChange?.(agentId);
        setShowAgentPicker(false);
    };

    return (
        <div className="composer-toolbar">
            <div className="toolbar-left">
                {/* Agent Selector */}
                {showAgentSelector && (
                    <div
                        className={`composer-unified-dropdown ${disabled ? 'is-disabled' : ''}`}
                        onClick={() => {
                            if (disabled) return;
                            setShowAgentPicker(!showAgentPicker);
                        }}
                    >
                        <div className="dropdown-content">
                            <span className="codicon codicon-infinity">♾️</span>
                            <span className="dropdown-label">{currentAgentName}</span>
                        </div>
                        <span className="codicon-chevron-down"><ArrowBottomIcon /></span>
                        
                        {showAgentPicker && (
                            <>
                                <div 
                                    className="dropdown-select-overlay" 
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        setShowAgentPicker(false); 
                                    }} 
                                />
                                <div className="agent-selector-popover" onClick={e => e.stopPropagation()}>
                                    <div 
                                        className="agent-list-item selected" 
                                        onClick={() => handleAgentSelect('agent')}
                                    >
                                        <span className="agent-icon">
                                            <span className="codicon codicon-infinity" style={{ fontSize: '14px' }}>♾️</span>
                                        </span>
                                        <span className="agent-label">Agent</span>
                                        <span className="agent-shortcut">⌘I</span>
                                        <CheckIcon />
                                    </div>
                                    <div 
                                        className="agent-list-item" 
                                        onClick={() => handleAgentSelect('plan')}
                                    >
                                        <span className="agent-icon"><ListCheckIcon /></span>
                                        <span className="agent-label">Plan</span>
                                    </div>
                                    <div 
                                        className="agent-list-item" 
                                        onClick={() => handleAgentSelect('debug')}
                                    >
                                        <span className="agent-icon">
                                            <span className="codicon codicon-debug-alt" style={{ fontSize: '14px' }}></span>
                                        </span>
                                        <span className="agent-label">Debug</span>
                                    </div>
                                    <div 
                                        className="agent-list-item" 
                                        onClick={() => handleAgentSelect('ask')}
                                    >
                                        <span className="agent-icon"><ChatIcon /></span>
                                        <span className="agent-label">Ask</span>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* Model Selector */}
                {showModelSelector && selectedModel && onSelectModel && (
                    <ModelSelector
                        selectedModel={selectedModel}
                        onSelectModel={onSelectModel}
                        disabled={disabled}
                    />
                )}
            </div>

            <div className="toolbar-right">
                {/* Mention Button */}
                {showMentionButton && (
                    <IconButton
                        icon={<AtIcon />}
                        label="Mention"
                        disabled={disabled}
                        onClick={onMentionClick}
                    />
                )}

                {/* Web Search Button */}
                {showWebButton && (
                    <IconButton
                        icon={<WebIcon />}
                        label="Web Search"
                        disabled={disabled}
                        onClick={onWebClick}
                    />
                )}

                {/* Image/File Button */}
                {showImageButton && (
                    <IconButton
                        icon={<ImageIcon />}
                        label="Add Files"
                        disabled={disabled}
                        onClick={onImageClick}
                    />
                )}

                {/* Primary Action Buttons */}
                {primaryAction === 'send' ? (
                    // Send mode: Show Send or Stop button
                    isLoading ? (
                        <IconButton
                            icon={<StopIcon />}
                            label={t('Agent.Stop')}
                            onClick={onStop}
                        />
                    ) : (
                        <IconButton
                            icon={<SendIcon />}
                            label={t('Agent.Send')}
                            disabled={isSendDisabled}
                            onClick={onSend}
                        />
                    )
                ) : (
                    // Apply mode: Show Cancel and Apply buttons
                    <div className="toolbar-apply-actions">
                        <button
                            className="vc-action-btn vc-action-btn--secondary"
                            onClick={onCancel}
                            type="button"
                        >
                            {t('Agent.Cancel')}
                        </button>
                        <button
                            className="vc-action-btn vc-action-btn--primary"
                            onClick={onApply}
                            type="button"
                            disabled={disabled}
                        >
                            {t('Chat.UseAsInput')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
