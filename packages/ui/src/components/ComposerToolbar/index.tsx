/**
 * ComposerToolbar - Cursor-style bottom toolbar
 * Layout: flex with left selectors (Mode + Model) and right action buttons
 */

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ModelId, PermissionMode } from '@vcoder/shared';
import { ModelSelector } from '../ModelSelector';
import { IconButton } from '../IconButton';
import {
    ImageIcon,
    ArrowBottomIcon,
    StopIcon,
    CheckIcon,
    SendIcon,
} from '../Icon';
import { useI18n } from '../../i18n/I18nProvider';
import './index.scss';

/* ─── Mode definitions ─── */
interface ModeOption {
    id: PermissionMode;
    label: string;
    icon: string;
}

const MODE_OPTIONS: ModeOption[] = [
    { id: 'default', label: 'Agent', icon: '∞' },
    { id: 'plan', label: 'Plan', icon: '⊞' },
    { id: 'acceptEdits', label: 'Auto Edit', icon: '⚡' },
    { id: 'bypassPermissions', label: 'YOLO', icon: '🔓' },
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
    const [isOpen, setIsOpen] = useState(false);
    const triggerRef = useRef<HTMLDivElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

    // Close on outside click
    useEffect(() => {
        if (!isOpen) return;
        const handleClick = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                triggerRef.current && !triggerRef.current.contains(target) &&
                popoverRef.current && !popoverRef.current.contains(target)
            ) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [isOpen]);

    // Position popover above trigger
    useEffect(() => {
        if (!isOpen || !triggerRef.current) return;
        const updatePos = () => {
            const rect = triggerRef.current!.getBoundingClientRect();
            const vh = window.innerHeight;
            const gap = 6;
            setPopoverStyle({
                position: 'fixed',
                bottom: `${vh - rect.top + gap}px`,
                left: `${rect.left}px`,
                minWidth: '180px',
            });
        };
        updatePos();
        requestAnimationFrame(updatePos);
    }, [isOpen]);

    const current = getModeOption(currentMode);

    return (
        <div className="mode-selector" ref={triggerRef}>
            <button
                className={`composer-unified-dropdown ${disabled ? 'is-disabled' : ''}`}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                title={current.label}
            >
                <div className="dropdown-content">
                    <span className="dropdown-icon">{current.icon}</span>
                    <span className="dropdown-label">{current.label}</span>
                </div>
                <span className="dropdown-chevron"><ArrowBottomIcon /></span>
            </button>

            {isOpen && createPortal(
                <>
                    <div className="mode-selector__overlay" onClick={() => setIsOpen(false)} />
                    <div
                        ref={popoverRef}
                        className="mode-selector__popover"
                        style={popoverStyle}
                        onClick={e => e.stopPropagation()}
                    >
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
                                <span className="mode-selector__item-label">{opt.label}</span>
                                {opt.id === currentMode && (
                                    <span className="mode-selector__item-check"><CheckIcon /></span>
                                )}
                            </div>
                        ))}
                    </div>
                </>,
                document.body
            )}
        </div>
    );
}

/* ─── ComposerToolbar ─── */
export interface ComposerToolbarProps {
    showModeSelector?: boolean;
    showModelSelector?: boolean;
    currentMode?: PermissionMode;
    onSelectMode?: (mode: PermissionMode) => void;
    selectedModel?: ModelId;
    onSelectModel?: (model: ModelId) => void;
    showImageButton?: boolean;
    onImageClick?: () => void;
    primaryAction: 'send' | 'apply';
    isLoading?: boolean;
    isSendDisabled?: boolean;
    onSend?: () => void;
    onStop?: () => void;
    onApply?: () => void;
    onCancel?: () => void;
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
    onSend,
    onStop,
    onApply,
    onCancel,
    disabled = false,
}: ComposerToolbarProps) {
    const { t } = useI18n();

    return (
        <div className="composer-toolbar">
            {/* Left: Mode + Model selectors */}
            <div className="toolbar-left">
                {showModeSelector && onSelectMode && (
                    <ModeSelector
                        currentMode={currentMode}
                        onSelectMode={onSelectMode}
                        disabled={disabled}
                    />
                )}

                {showModelSelector && selectedModel && onSelectModel && (
                    <ModelSelector
                        selectedModel={selectedModel}
                        onSelectModel={onSelectModel}
                        disabled={disabled}
                    />
                )}

            </div>

            {/* Right: Action buttons */}
            <div className="toolbar-right">
                {showImageButton && (
                    <IconButton
                        icon={<ImageIcon />}
                        label={t('Common.AddFiles')}
                        disabled={disabled}
                        onClick={onImageClick}
                    />
                )}

                {primaryAction === 'send' && !isLoading && (
                    <IconButton
                        icon={<SendIcon />}
                        label={t('Common.Send')}
                        disabled={disabled}
                        onClick={onSend}
                    />
                )}
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
