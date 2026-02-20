/**
 * Input Area Component - Claude Code desktop style
 * Simplified: Agent + Model on left, Image on right, Enter to send
 * EnvironmentSelector ("Local") below the input box
 */

import { forwardRef, useImperativeHandle, useState, useRef, useEffect, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import { postMessage } from '../utils/vscode';
import { useStore } from '../store/useStore';
import { FilePicker } from './FilePicker';
import { PermissionRulesPanel } from './PermissionRulesPanel';
import { ComposerToolbar } from './ComposerToolbar';
import { EnvironmentSelector } from './EnvironmentSelector';
import { CloseIcon } from './Icon';
import { PendingChangesBar } from './PendingChangesBar';
import { useI18n } from '../i18n/I18nProvider';
import { loadPersistedState, savePersistedState } from '../utils/persist';
import './InputArea.scss';
import './ComposerSurface.scss';

interface Attachment {
    type: 'file' | 'selection';
    path?: string;
    name: string;
    content?: string;
}

export interface InputAreaHandle {
    setText: (text: string, options?: { focus?: boolean }) => void;
    focus: () => void;
}

export const InputArea = forwardRef<InputAreaHandle>(function InputArea(_props, ref) {
    const { t } = useI18n();
    // Initialize input from persisted draft
    const [input, setInput] = useState(() => {
        const persisted = loadPersistedState();
        return persisted.inputDraft ?? '';
    });
    const [showPicker, setShowPicker] = useState(false);
    const [pickerQuery, setPickerQuery] = useState('');
    const [cursorPosition, setCursorPosition] = useState(0);
    const [isComposing, setIsComposing] = useState(false);
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [showPermissionRules, setShowPermissionRules] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const {
        model,
        isLoading,
        workspaceFiles,
        viewMode,
        currentSessionId,
        historySessions,
        exitHistoryMode,
        agents,
        currentAgentId,
        setModel,
        addMessage,
        setLoading,
    } = useStore();

    const isComposerLocked = isLoading || viewMode === 'history';
    const historyTitle = viewMode === 'history'
        ? historySessions.find((s) => s.id === currentSessionId)?.title
        : undefined;

    useImperativeHandle(ref, () => ({
        setText: (text: string, options?: { focus?: boolean }) => {
            if (isComposerLocked) return;
            setInput(text);
            if (options?.focus) {
                queueMicrotask(() => textareaRef.current?.focus());
            }
        },
        focus: () => textareaRef.current?.focus(),
    }), [isComposerLocked]);

    // Debounced save for input draft
    const saveDraft = useCallback((draft: string) => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
            savePersistedState({ inputDraft: draft });
        }, 500); // 500ms debounce
    }, []);

    // Save draft when input changes
    useEffect(() => {
        saveDraft(input);
    }, [input, saveDraft]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, []);

    // Request workspace files on mount
    useEffect(() => {
        postMessage({ type: 'getWorkspaceFiles' });
    }, []);

    useEffect(() => {
        if (!isLoading) return;
        setShowPicker(false);
        setShowPermissionRules(false);
    }, [isLoading]);

    const handleAddFiles = () => {
        if (isComposerLocked) return;
        fileInputRef.current?.click();
    };

    const handleResumeHistory = () => {
        if (viewMode !== 'history' || !currentSessionId) return;
        postMessage({ type: 'resumeHistory', sessionId: currentSessionId, title: historyTitle });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;
        
        Array.from(files).forEach((file) => {
            if (file.size > MAX_ATTACHMENT_SIZE) {
                console.warn(`[InputArea] File too large: ${file.name} (${Math.round(file.size / 1024 / 1024)}MB, max ${MAX_ATTACHMENT_SIZE / 1024 / 1024}MB)`);
                return;
            }

            const reader = new FileReader();
            reader.onload = () => {
                setAttachments((prev) => [
                    ...prev,
                    {
                        type: 'file',
                        name: file.name,
                        content: reader.result as string,
                    },
                ]);
            };
            
            reader.onerror = () => {
                console.error(`[InputArea] Failed to read file: ${file.name}`);
            };
            
            reader.readAsDataURL(file);
        });

        // Reset input so same file can be selected again
        e.target.value = '';
    };

    const removeAttachment = (index: number) => {
        setAttachments((prev) => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = () => {
        if ((!input.trim() && attachments.length === 0) || isLoading) return;

        setLoading(true);

        // Add user message to UI
        addMessage({
            id: crypto.randomUUID(),
            role: 'user',
            content: input || (attachments.length > 0 ? `[${attachments.map(a => a.name).join(', ')}]` : ''),
            isComplete: true,
        });

        // Add placeholder assistant message
        addMessage({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: '',
            isComplete: false,
        });

        // Send to extension with attachments
        postMessage({
            type: 'send',
            content: input,
            attachments: attachments.map((a) => ({
                type: a.type,
                path: a.path,
                content: a.content,
            })),
        });

        setInput('');
        setAttachments([]);
        // Clear persisted draft immediately on send
        savePersistedState({ inputDraft: '' });
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        const newPos = e.target.selectionStart;
        setInput(val);
        setCursorPosition(e.target.selectionStart);

        // Check for @ trigger
        const textBeforeCursor = val.slice(0, newPos);
        const match = /@([\w./-]*)$/.exec(textBeforeCursor);

        if (match) {
            setShowPicker(true);
            setPickerQuery(match[1]);
        } else {
            setShowPicker(false);
        }
    };

    const handleFileSelect = (file: string) => {
        const textBefore = input.slice(0, cursorPosition);
        const textAfter = input.slice(cursorPosition);
        const match = /@([\w./-]*)$/.exec(textBefore);
        
        if (match) {
            const prefix = textBefore.slice(0, match.index);
            const newValue = prefix + file + ' ' + textAfter;
            setInput(newValue);
            setShowPicker(false);
            
            // Restore focus
            textareaRef.current?.focus();
        }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        const nativeEvent = e.nativeEvent as unknown as { isComposing?: boolean; keyCode?: number; key?: string };
        const isImeComposing =
            isComposing || nativeEvent.isComposing === true || nativeEvent.keyCode === 229 || nativeEvent.key === 'Process';

        if (showPicker) {
            if (isImeComposing) return;
            if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
                // Prevent InputArea default behavior (submit/newline)
                // FilePicker handles selection via window listener
                if (e.key === 'Enter') e.preventDefault();
                return; 
            }
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            if (isImeComposing) return;
            e.preventDefault();
            handleSubmit();
        }
    };

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
        }
    }, [input]);

    const currentAgent = agents.find(a => a.profile.id === currentAgentId);
    
    const handleAgentSelect = (agentId: string) => {
        postMessage({ type: 'selectAgent', agentId });
    };
    
    return (
        <div className="input-area">
            {/* Hidden file input for attachments */}
            <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.txt,.md,.json,.js,.ts,.tsx,.py,.go,.java,.c,.cpp,.h,.hpp,.css,.scss,.html"
                onChange={handleFileChange}
                style={{ display: 'none' }}
            />

            <PendingChangesBar />

            {showPicker && (
                <FilePicker
                    files={workspaceFiles}
                    searchQuery={pickerQuery}
                    position={{ top: -300, left: 0 }}
                    onSelect={handleFileSelect}
                    onClose={() => setShowPicker(false)}
                />
            )}

            <PermissionRulesPanel
                visible={showPermissionRules}
                onClose={() => setShowPermissionRules(false)}
            />

            <div
                ref={wrapperRef}
                className={[
                    'input-wrapper',
                    'vc-composer-surface',
                    'vc-composer-surface--interactive',
                    isLoading ? 'vc-composer-surface--muted' : '',
                ].filter(Boolean).join(' ')}
            >
                <div className="input-content">
                    {/* Attachment preview */}
                    {attachments.length > 0 && (
                        <div className="attachments-preview">
                            {attachments.map((att, idx) => (
                                <div key={idx} className="attachment-chip">
                                    <span className="attachment-name">{att.name}</span>
                                    <button
                                        className="attachment-remove"
                                        onClick={() => removeAttachment(idx)}
                                        aria-label={`Remove ${att.name}`}
                                        disabled={isComposerLocked}
                                    >
                                        <CloseIcon />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <textarea
                        ref={textareaRef}
                        className="input-field"
                        placeholder={viewMode === 'history' ? t('Chat.ViewingHistoryReadonly') : 'Plan, @ for context, / for commands'}
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        onCompositionStart={() => setIsComposing(true)}
                        onCompositionEnd={() => setIsComposing(false)}
                        disabled={isLoading || viewMode === 'history'}
                        rows={1}
                        onClick={(e) => {
                            setCursorPosition(e.currentTarget.selectionStart);
                            setShowPicker(false);
                        }}
                    />

                    {viewMode === 'history' && (
                        <div className="history-mode-banner">
                            <div className="history-mode-banner__text">
                                {t('Chat.ViewingHistoryReadonly')}
                            </div>
                            <div className="history-mode-banner__actions">
                                <button
                                    type="button"
                                    className="vc-action-btn vc-action-btn--primary"
                                    onClick={handleResumeHistory}
                                    disabled={!currentSessionId}
                                >
                                    {t('Chat.ResumeHistory')}
                                </button>
                                <button
                                    type="button"
                                    className="vc-action-btn vc-action-btn--secondary"
                                    onClick={exitHistoryMode}
                                >
                                    {t('Chat.ExitHistory')}
                                </button>
                            </div>
                        </div>
                    )}

                    <ComposerToolbar
                        showAgentSelector
                        showModelSelector
                        agents={agents}
                        currentAgentId={currentAgentId}
                        onAgentSelect={handleAgentSelect}
                        currentAgentName={currentAgent?.profile.name || 'Agent'}
                        selectedModel={model}
                        onSelectModel={setModel}
                        showImageButton
                        onImageClick={handleAddFiles}
                        primaryAction="send"
                        isLoading={isLoading}
                        onStop={() => postMessage({ type: 'cancel' })}
                        disabled={isComposerLocked}
                    />
                </div>
            </div>

            {/* Environment selector below the input box */}
            <EnvironmentSelector disabled={isComposerLocked} />
        </div>
    );
});
