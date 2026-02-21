/**
 * StickyUserPrompt Component
 * Displays a sticky user prompt that can be expanded for editing
 *
 * Performance optimizations:
 * - Uses useEffect instead of useLayoutEffect to avoid blocking render
 * - RAF-throttled height updates
 * - Debounced ResizeObserver callbacks
 */

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { ChatMessage } from '../types';
import { useStore } from '../store/useStore';
import { PermissionRulesPanel } from './PermissionRulesPanel';
import { ComposerToolbar } from './ComposerToolbar';
import { useI18n } from '../i18n/I18nProvider';
import './StickyUserPrompt.scss';
import './ComposerSurface.scss';
import './InputArea.scss';

/**
 * Debounce function for ResizeObserver callbacks
 */
function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    return (...args: Parameters<T>) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            fn(...args);
            timeoutId = null;
        }, delay);
    };
}

export interface StickyUserPromptProps {
    message: ChatMessage | null;
    disabled?: boolean;
    onApplyToComposer: (text: string) => void;
    onHeightChange?: (height: number) => void;
}

export function StickyUserPrompt({ message, disabled, onApplyToComposer, onHeightChange }: StickyUserPromptProps) {
    const { t } = useI18n();
    const { model, setModel, permissionMode, setPermissionMode } = useStore();
    const rootRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [expanded, setExpanded] = useState(false);
    const [draft, setDraft] = useState('');
    const [showPermissionRules, setShowPermissionRules] = useState(false);

    const hasMessage = Boolean(message && message.role === 'user' && message.content.trim().length > 0);

    useEffect(() => {
        if (!expanded) {
            setDraft(message?.content ?? '');
        }
    }, [expanded, message?.content]);

    useEffect(() => {
        if (!expanded) return;
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(draft.length, draft.length);
    }, [expanded, draft.length]);

    // Simple text transformation - no need for useMemo as it's cheap
    const collapsedText = message?.content?.replace(/\s+/g, ' ').trim() ?? '';

    // Optimized height tracking with RAF throttling and debouncing
    useEffect(() => {
        if (!hasMessage) {
            onHeightChange?.(0);
            return;
        }

        const element = rootRef.current;
        if (!element) {
            onHeightChange?.(0);
            return;
        }

        let rafId: number | null = null;

        const updateHeight = () => {
            const height = element.getBoundingClientRect().height;
            onHeightChange?.(height);
        };

        // Debounced version for ResizeObserver
        const debouncedUpdate = debounce(updateHeight, 100);

        // Initial height update (delayed to next frame to avoid blocking)
        rafId = requestAnimationFrame(updateHeight);

        let observer: ResizeObserver | null = null;
        if (typeof ResizeObserver !== 'undefined') {
            observer = new ResizeObserver(() => {
                // Use debounced update for resize events
                debouncedUpdate();
            });
            observer.observe(element);
        }

        return () => {
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
            }
            observer?.disconnect();
        };
    }, [hasMessage, expanded, onHeightChange]);

    if (!hasMessage) return null;

    return (
        <div className="vc-sticky-user-prompt" ref={rootRef}>
            <div className="vc-sticky-user-prompt-inner">
                {expanded ? (
                    <div className="input-wrapper vc-composer-surface vc-composer-surface--interactive vc-sticky-expanded">
                        <div className="input-content">
                            <textarea
                                ref={textareaRef}
                                className="input-field"
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                rows={3}
                                placeholder={t('Chat.EditPinnedPrompt')}
                                onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
                                    if (e.key === 'Escape') {
                                        e.preventDefault();
                                        setExpanded(false);
                                        return;
                                    }
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        if (!disabled) {
                                            onApplyToComposer(draft);
                                        }
                                        setExpanded(false);
                                    }
                                }}
                            />
                            <ComposerToolbar
                                showModeSelector
                                showModelSelector
                                currentMode={permissionMode}
                                onSelectMode={setPermissionMode}
                                selectedModel={model}
                                onSelectModel={setModel}
                                showImageButton
                                primaryAction="apply"
                                onApply={() => {
                                    if (!disabled) onApplyToComposer(draft);
                                    setExpanded(false);
                                }}
                                onCancel={() => setExpanded(false)}
                                disabled={disabled}
                            />
                        </div>
                    </div>
                ) : (
                    <button
                        className="vc-sticky-user-prompt-collapsed"
                        type="button"
                        onClick={() => setExpanded(true)}
                        title={collapsedText || t('Chat.EditPinnedPrompt')}
                        aria-label={collapsedText || t('Chat.EditPinnedPrompt')}
                    >
                        <span className="vc-sticky-user-prompt-text">{collapsedText}</span>
                    </button>
)}
            </div>
            
            <PermissionRulesPanel
                visible={showPermissionRules}
                onClose={() => setShowPermissionRules(false)}
            />
        </div>
    );
}
