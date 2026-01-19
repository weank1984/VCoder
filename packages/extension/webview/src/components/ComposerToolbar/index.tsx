/**
 * ComposerToolbar - Shared toolbar component for input areas
 * Used by both InputArea and StickyUserPrompt
 */


import type { ModelId } from '@vcoder/shared';
import { ModelSelector } from '../ModelSelector';
import { AgentSelector } from '../AgentSelector';
import type { AgentInfo } from '../AgentSelector';
import { IconButton } from '../IconButton';
import { 
    AtIcon, 
    WebIcon, 
    ImageIcon, 
    ArrowBottomIcon, 
    SendIcon, 
    StopIcon,
    ManageIcon
} from '../Icon';
import { useI18n } from '../../i18n/I18nProvider';
import './index.scss';

export interface ComposerToolbarProps {
    // Left toolbar - Agent & Model selectors
    showAgentSelector?: boolean;
    showModelSelector?: boolean;
    agents?: AgentInfo[];
    currentAgentId?: string | null;
    onAgentSelect?: (agentId: string) => void;
    currentAgentName?: string;
    onAgentChange?: (agentId: string) => void;
    selectedModel?: ModelId;
    onSelectModel?: (model: ModelId) => void;
    
    // Right toolbar - Action buttons
    showMentionButton?: boolean;
    showWebButton?: boolean;
    showImageButton?: boolean;
    showPermissionButton?: boolean;
    onMentionClick?: () => void;
    onWebClick?: () => void;
    onImageClick?: () => void;
    onPermissionClick?: () => void;
    
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
    agents = [],
    currentAgentId = null,
    onAgentSelect,
    currentAgentName = 'Agent',
    selectedModel,
    onSelectModel,
    onAgentChange,
    showMentionButton = true,
    showWebButton = true,
    showImageButton = true,
    showPermissionButton = true,
    onMentionClick,
    onWebClick,
    onImageClick,
    onPermissionClick,
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

    return (
        <div className="composer-toolbar">
            <div className="toolbar-left">
                
                {showAgentSelector && agents.length > 0 && (
                    <AgentSelector
                        agents={agents}
                        currentAgentId={currentAgentId}
                        onSelectAgent={onAgentSelect || (() => {})}
                    />
                )}
                
                
                {showAgentSelector && agents.length === 0 && onAgentChange && (
                    <div
                        className={`composer-unified-dropdown ${disabled ? 'is-disabled' : ''}`}
                        onClick={() => {
                            if (disabled || !currentAgentName) return;
                            const modes = ['Agent', 'Plan', 'Debug', 'Ask'];
                            const currentIndex = modes.indexOf(currentAgentName);
                            const nextMode = modes[(currentIndex + 1) % modes.length];
                            onAgentChange(nextMode.toLowerCase());
                        }}
                    >
                        <div className="dropdown-content">
                            <span className="codicon codicon-infinity">♾️</span>
                            <span className="dropdown-label">{currentAgentName}</span>
                        </div>
                        <span className="codicon-chevron-down"><ArrowBottomIcon /></span>
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

                {showPermissionButton && (
                    <IconButton
                        icon={<ManageIcon />}
                        label="Permission Rules"
                        disabled={disabled}
                        onClick={onPermissionClick}
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
