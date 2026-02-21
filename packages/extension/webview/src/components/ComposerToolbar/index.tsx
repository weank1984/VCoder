/**
 * ComposerToolbar - Shared toolbar component for input areas
 * Matches V0.4 design:
 * Left: Mode selector (Agent/Plan pill) + Model selector
 * Right: Image button + Stop button (when loading)
 */

import { useState, useRef, useEffect } from 'react';
import type { ModelId, PermissionMode } from '@vcoder/shared';
import { ModelSelector } from '../ModelSelector';
import { IconButton } from '../IconButton';
import {
    ImageIcon,
    ArrowBottomIcon,
    StopIcon,
    CheckIcon,
} from '../Icon';
import { useI18n } from '../../i18n/I18nProvider';
import './index.scss';

/* ─── Mode definitions ─── */
interface ModeOption {
    id: PermissionMode;
    label: string;
    icon: string;
    description: string;
}

const MODE_OPTIONS: ModeOption[] = [
    { id: 'default', label: 'Agent', icon: '∞', description: 'ModeSelector.AgentDesc' },
    { id: 'plan', label: 'Plan', icon: '📋', description: 'ModeSelector.PlanDesc' },
    { id: 'acceptEdits', label: 'Auto Edit', icon: '⚡', description: 'ModeSelector.AutoEditDesc' },
    { id: 'bypassPermissions', label: 'YOLO', icon: '🔓', description: 'ModeSelector.YoloDesc' },
];

function getModeOption(mode: PermissionMode): ModeOption {
    return MODE_OPTIONS.find(m => m.id === mode) ?? MODE_OPTIONS[0];
}

/* ─── ModeSelector sub-component ─── */
interface ModeSelectorProps {
    currentMode: PermissionMode;
    onSelectMode: (mode: PermissionMode) => void;
    disabled?: boolean;
}

function ModeSelector({ currentMode, onSelectMode, disabled }: ModeSelectorProps) {
    const { t } = useI18n();
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        if (!isOpen) return;
        const handleClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [isOpen]);

    const current = getModeOption(currentMode);

    return (
        <div className="mode-selector" ref={containerRef}>
            <button
                className={`mode-selector__trigger ${disabled ? 'is-disabled' : ''}`}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                title={t(current.description)}
            >
                <span className="mode-selector__icon">{current.icon}</span>
                <span className="mode-selector__label">{current.label}</span>
                <span className="mode-selector__chevron"><ArrowBottomIcon /></span>
            </button>

            {isOpen && (
                <div className="mode-selector__popover">
                    {MODE_OPTIONS.map(opt => (
                        <div
                            key={opt.id}
                            className={`mode-selector__item ${opt.id === currentMode ? 'is-selected' : ''}`}
                            onClick={() => {
                                onSelectMode(opt.id);
                                setIsOpen(false);
                            }}
                        >
                            <span className="mode-selector__item-icon">{opt.icon}</span>
                            <div className="mode-selector__item-info">
                                <span className="mode-selector__item-label">{opt.label}</span>
                                <span className="mode-selector__item-desc">{t(opt.description)}</span>
                            </div>
                            {opt.id === currentMode && (
                                <span className="mode-selector__item-check"><CheckIcon /></span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ─── ComposerToolbar ─── */
export interface ComposerToolbarProps {
    // Left toolbar - Mode & Model selectors
    showModeSelector?: boolean;
    showModelSelector?: boolean;
    currentMode?: PermissionMode;
    onSelectMode?: (mode: PermissionMode) => void;
    selectedModel?: ModelId;
    onSelectModel?: (model: ModelId) => void;

    // Right toolbar - Action buttons
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

    // General
    disabled?: boolean;
}

export function ComposerToolbar({
    showModeSelector = true,
    showModelSelector = true,
    currentMode = 'default',
    onSelectMode,
    selectedModel,
    onSelectModel,
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
                {showModeSelector && onSelectMode && (
                    <ModeSelector
                        currentMode={currentMode}
                        onSelectMode={onSelectMode}
                        disabled={disabled}
                    />
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
                {primaryAction === 'send' && isLoading && (
                    <IconButton
                        icon={<StopIcon />}
                        label={t('Agent.Stop')}
                        onClick={onStop}
                    />
                )}
                {primaryAction === 'apply' && (
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
