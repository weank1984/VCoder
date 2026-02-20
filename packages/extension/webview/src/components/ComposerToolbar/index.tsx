/**
 * ComposerToolbar - Shared toolbar component for input areas
 * Simplified to match Claude Code desktop UI:
 * Left: Agent selector + Model selector
 * Right: Image button + (optional) Mic button + Stop button (when loading)
 */

import type { ModelId } from '@vcoder/shared';
import { ModelSelector } from '../ModelSelector';
import { AgentSelector } from '../AgentSelector';
import type { AgentInfo } from '../AgentSelector';
import { IconButton } from '../IconButton';
import {
    ImageIcon,
    ArrowBottomIcon,
    StopIcon,
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

    // Right toolbar - Action buttons (simplified)
    showImageButton?: boolean;
    onImageClick?: () => void;

    // Primary action configuration
    primaryAction: 'send' | 'apply';
    isLoading?: boolean;
    isSendDisabled?: boolean;
    onSend?: () => void;
    onStop?: () => void;
    onApply?: () => void;
    onCancel?: () => void;

    // Legacy props (kept for StickyUserPrompt compatibility, no-op in main toolbar)
    showMentionButton?: boolean;
    showWebButton?: boolean;
    showPermissionButton?: boolean;
    onMentionClick?: () => void;
    onWebClick?: () => void;
    onPermissionClick?: () => void;

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
    showImageButton = true,
    onImageClick,
    primaryAction,
    isLoading = false,
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
                {/* Image/File Button */}
                {showImageButton && (
                    <IconButton
                        icon={<ImageIcon />}
                        label={t('Common.AddFiles')}
                        disabled={disabled}
                        onClick={onImageClick}
                    />
                )}

                {/* Primary Action Buttons */}
                {primaryAction === 'send' ? (
                    // Send mode: Only show Stop when loading (Enter key sends, no visible send button)
                    isLoading ? (
                        <IconButton
                            icon={<StopIcon />}
                            label={t('Agent.Stop')}
                            onClick={onStop}
                        />
                    ) : null
                ) : (
                    // Apply mode: Show Cancel and Apply buttons (for StickyUserPrompt)
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
