/**
 * ComposerToolbar - Cursor-style bottom toolbar
 * Layout: flex with left selectors (Mode + Model) and right action buttons
 */

import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
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
    SparkleIcon,
    ListCheckIcon,
    EditIcon,
} from '../Icon';
import { useI18n } from '../../i18n/I18nProvider';
import './index.scss';

/* ─── Mode definitions ─── */
interface ModeOption {
    id: PermissionMode;
    label: string;
    icon: ReactNode;
}

// 与 CLI 交互式 UI 对齐：仅暴露可在运行时切换的三种模式
// dontAsk / bypassPermissions 属于启动参数级别的高级选项，不在运行时 UI 中提供
const MODE_OPTIONS: ModeOption[] = [
    { id: 'default', label: 'Agent', icon: <SparkleIcon /> },
    { id: 'plan', label: 'Plan', icon: <ListCheckIcon /> },
    { id: 'acceptEdits', label: 'Auto Edit', icon: <EditIcon /> },
];

function getModeOption(mode: PermissionMode): ModeOption {
    return MODE_OPTIONS.find(m => m.id === mode) ?? MODE_OPTIONS[0];
}

/* ─── ModeChangeHint — system-initiated mode switch notification ─── */
interface ModeChangeHintProps {
    systemModeChange: { fromMode: PermissionMode; toMode: PermissionMode; id: number } | null;
    triggerRef: React.RefObject<HTMLDivElement | null>;
}

function ModeChangeHint({ systemModeChange, triggerRef }: ModeChangeHintProps) {
    const { t } = useI18n();
    const [visible, setVisible] = useState(false);
    const [hintStyle, setHintStyle] = useState<React.CSSProperties>({});
    const prevIdRef = useRef<number | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hintRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!systemModeChange || systemModeChange.id === prevIdRef.current) return;
        prevIdRef.current = systemModeChange.id;

        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setHintStyle({
                position: 'fixed',
                bottom: `${window.innerHeight - rect.top + 8}px`,
                left: `${rect.left}px`,
            });
        }

        setVisible(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setVisible(false), 3000);
    }, [systemModeChange, triggerRef]);

    useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

    if (!visible || !systemModeChange) return null;

    const toOption = getModeOption(systemModeChange.toMode);
    const isDanger = systemModeChange.toMode === 'bypassPermissions' || systemModeChange.toMode === 'dontAsk';

    return createPortal(
        <div
            ref={hintRef}
            className={`mode-change-hint ${isDanger ? 'mode-change-hint--warn' : ''}`}
            style={hintStyle}
            onClick={() => setVisible(false)}
            role="status"
        >
            <span className="mode-change-hint__icon">{toOption.icon}</span>
            <span className="mode-change-hint__text">
                {t('ModeSwitchedTo', toOption.label)}
            </span>
        </div>,
        document.body
    );
}

/* ─── ModeSelector sub-component ─── */
interface ModeSelectorProps {
    currentMode: PermissionMode;
    onSelectMode: (mode: PermissionMode) => void;
    disabled?: boolean;
    systemModeChange?: { fromMode: PermissionMode; toMode: PermissionMode; id: number } | null;
}

function ModeSelector({ currentMode, onSelectMode, disabled, systemModeChange }: ModeSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const triggerRef = useRef<HTMLDivElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
    const prevModeRef = useRef<PermissionMode>(currentMode);
    const [isPulsing, setIsPulsing] = useState(false);
    const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 检测外部 mode 变更（如从 server 端同步）并触发脉冲
    useEffect(() => {
        if (prevModeRef.current !== currentMode) {
            prevModeRef.current = currentMode;
            if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
            setIsPulsing(true);
            pulseTimerRef.current = setTimeout(() => setIsPulsing(false), 500);
        }
        return () => {
            if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
        };
    }, [currentMode]);

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

    const handleSelect = useCallback((mode: PermissionMode) => {
        onSelectMode(mode);
        setIsOpen(false);
        // 用户主动切换也触发脉冲
        if (mode !== currentMode) {
            if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
            setIsPulsing(true);
            pulseTimerRef.current = setTimeout(() => setIsPulsing(false), 500);
        }
    }, [onSelectMode, currentMode]);

    return (
        <div className="mode-selector" ref={triggerRef}>
            <button
                className={`composer-unified-dropdown ${disabled ? 'is-disabled' : ''} ${isPulsing ? 'is-mode-pulsing' : ''}`}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                title={current.label}
            >
                <div className="dropdown-content">
                    <span className="dropdown-icon">{current.icon}</span>
                    <span className="dropdown-label">{current.label}</span>
                </div>
                <span className="dropdown-chevron"><ArrowBottomIcon /></span>
            </button>

            <ModeChangeHint systemModeChange={systemModeChange ?? null} triggerRef={triggerRef} />

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
                                onClick={() => handleSelect(opt.id)}
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
    systemModeChange?: { fromMode: PermissionMode; toMode: PermissionMode; id: number } | null;
    selectedModel?: ModelId;
    onSelectModel?: (model: ModelId) => void;
    showImageButton?: boolean;
    onImageClick?: () => void;
    primaryAction: 'send' | 'apply';
    applyLabel?: string;
    cancelLabel?: string;
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
    systemModeChange,
    selectedModel,
    onSelectModel,
    showImageButton = true,
    onImageClick,
    primaryAction,
    applyLabel,
    cancelLabel,
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
                        systemModeChange={systemModeChange}
                        disabled={disabled}
                    />
                )}

                {showModelSelector && selectedModel && onSelectModel && (
                    <ModelSelector
                        selectedModel={selectedModel}
                        onSelectModel={onSelectModel}
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
                            {cancelLabel ?? t('Agent.Cancel')}
                        </button>
                        <button
                            className="vc-action-btn vc-action-btn--primary"
                            onClick={onApply}
                            type="button"
                            disabled={disabled}
                        >
                            {applyLabel ?? t('Chat.UseAsInput')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
