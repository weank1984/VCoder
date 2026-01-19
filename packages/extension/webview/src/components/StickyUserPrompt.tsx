import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { ChatMessage } from '../types';
import { useStore } from '../store/useStore';
import { PermissionRulesPanel } from './PermissionRulesPanel';
import { ComposerToolbar } from './ComposerToolbar';
import { useI18n } from '../i18n/I18nProvider';
import { postMessage } from '../utils/vscode';
import './StickyUserPrompt.scss';
import './ComposerSurface.scss';
import './InputArea.scss';

export interface StickyUserPromptProps {
    message: ChatMessage | null;
    disabled?: boolean;
    onApplyToComposer: (text: string) => void;
    onHeightChange?: (height: number) => void;
}

export function StickyUserPrompt({ message, disabled, onApplyToComposer, onHeightChange }: StickyUserPromptProps) {
    const { t } = useI18n();
    const { model, setModel, agents, currentAgentId } = useStore();
    const rootRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [expanded, setExpanded] = useState(false);
    const [draft, setDraft] = useState('');
    const [showPermissionRules, setShowPermissionRules] = useState(false);

    const currentAgent = agents.find(a => a.profile.id === currentAgentId);

    const handleAgentSelect = (agentId: string) => {
        postMessage({ type: 'selectAgent', agentId });
    };

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

    const collapsedText = useMemo(() => {
        if (!message) return '';
        return message.content.replace(/\s+/g, ' ').trim();
    }, [message]);

    useLayoutEffect(() => {
        if (!hasMessage) {
            onHeightChange?.(0);
            return;
        }

        const element = rootRef.current;
        if (!element) {
            onHeightChange?.(0);
            return;
        }

        const updateHeight = () => {
            const height = element.getBoundingClientRect().height;
            onHeightChange?.(height);
        };

        updateHeight();

        let observer: ResizeObserver | null = null;
        if (typeof ResizeObserver !== 'undefined') {
            observer = new ResizeObserver(updateHeight);
            observer.observe(element);
        }

        return () => {
            observer?.disconnect();
        };
    }, [hasMessage, expanded, draft, message?.content, onHeightChange]);

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
                                showAgentSelector
                                showModelSelector
                                agents={agents}
                                currentAgentId={currentAgentId}
                                onAgentSelect={handleAgentSelect}
                                currentAgentName={currentAgent?.profile.name || 'Agent'}
                                selectedModel={model}
                                onSelectModel={setModel}
                                showMentionButton
                                showWebButton
                                showImageButton
                                showPermissionButton
                                primaryAction="apply"
                                onPermissionClick={() => setShowPermissionRules(true)}
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
