/**
 * Input Area Component - Redesigned based on Augment reference design
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import { postMessage } from '../utils/vscode';
import { useStore } from '../store/useStore';
import type { ModelId } from '@vcoder/shared';
import { FilePicker } from './FilePicker';
import { PermissionRulesPanel } from './PermissionRulesPanel';
import { AtIcon, WebIcon, ImageIcon, ArrowBottomIcon, SendIcon, StopIcon, CloseIcon, CheckIcon, ThinkIcon, ChatIcon, ListCheckIcon } from './Icon';
import { IconButton } from './IconButton';
import { PendingChangesBar } from './PendingChangesBar';
import { useI18n } from '../i18n/I18nProvider';
import { loadPersistedState, savePersistedState } from '../utils/persist';
import './InputArea.scss';

interface Attachment {
    type: 'file' | 'selection';
    path?: string;
    name: string;
    content?: string;
}

const MODELS: { id: ModelId; name: string }[] = [
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
    { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5' },
    { id: 'glm-4.6', name: 'GLM 4.6' },
];

export function InputArea() {
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
    
    // Model Picker State
    const [showModelPicker, setShowModelPicker] = useState(false);
    const [modelSearch, setModelSearch] = useState('');
    const [showAgentPicker, setShowAgentPicker] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const {
        model,
        isLoading,
        workspaceFiles,
        viewMode,
        agents,
        currentAgentId,
        setModel,
        addMessage,
        setLoading,
    } = useStore();

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

    const handleAddFiles = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        Array.from(files).forEach((file) => {
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

    const selectedModel = MODELS.find(m => m.id === model);
    const currentAgent = agents.find(a => a.profile.id === currentAgentId);
    
    // Check if send button should be disabled
    const isSendDisabled = !input.trim() && attachments.length === 0;

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
                className={`input-wrapper ${isLoading ? 'input-wrapper--loading' : ''}`}
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
                        placeholder={t('Chat.InputPlaceholder')}
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

                    <div className="input-toolbar">

                        <div className="toolbar-left">
                            <div className="composer-unified-dropdown" onClick={() => setShowAgentPicker(!showAgentPicker)}>
                                <div className="dropdown-content">
                                    <span className="codicon codicon-infinity">♾️</span>
                                    <span className="dropdown-label">{currentAgent?.profile.name || 'Agent'}</span>
                                </div>
                                <span className="codicon-chevron-down"><ArrowBottomIcon /></span>
                                
                                {showAgentPicker && (
                                    <>
                                        <div className="dropdown-select-overlay" onClick={(e) => { e.stopPropagation(); setShowAgentPicker(false); }} />
                                        <div className="agent-selector-popover" onClick={e => e.stopPropagation()}>
                                            <div className="agent-list-item selected" onClick={() => setShowAgentPicker(false)}>
                                                <span className="agent-icon"><span className="codicon codicon-infinity" style={{ fontSize: '14px' }}>♾️</span></span>
                                                <span className="agent-label">Agent</span>
                                                <span className="agent-shortcut">⌘I</span>
                                                <CheckIcon />
                                            </div>
                                            <div className="agent-list-item" onClick={() => setShowAgentPicker(false)}>
                                                <span className="agent-icon"><ListCheckIcon /></span>
                                                <span className="agent-label">Plan</span>
                                            </div>
                                            <div className="agent-list-item" onClick={() => setShowAgentPicker(false)}>
                                                <span className="agent-icon"><span className="codicon codicon-debug-alt" style={{ fontSize: '14px' }}></span></span>
                                                <span className="agent-label">Debug</span>
                                            </div>
                                            <div className="agent-list-item" onClick={() => setShowAgentPicker(false)}>
                                                <span className="agent-icon"><ChatIcon /></span>
                                                <span className="agent-label">Ask</span>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="composer-unified-dropdown-model" onClick={() => setShowModelPicker(!showModelPicker)}>
                                <span className="model-label">{selectedModel?.name || 'Model'}</span>
                                <span className="codicon-chevron-down"><ArrowBottomIcon /></span>
                                
                                {showModelPicker && (
                                    <>
                                        <div className="dropdown-select-overlay" onClick={(e) => { e.stopPropagation(); setShowModelPicker(false); }} />
                                        <div className="model-selector-popover" onClick={e => e.stopPropagation()}>
                                            <div className="model-search-wrapper">
                                                <input 
                                                    type="text" 
                                                    placeholder="Search models" 
                                                    autoFocus
                                                    value={modelSearch}
                                                    onChange={e => setModelSearch(e.target.value)}
                                                />
                                            </div>
                                            
                                            <div className="model-section">
                                                <div className="model-toggle-item">
                                                    <span>Auto</span>
                                                    <div className="toggle-switch" />
                                                </div>
                                                <div className="model-toggle-item">
                                                    <span>MAX Mode</span>
                                                    <div className="toggle-switch" />
                                                </div>
                                                <div className="model-toggle-item">
                                                    <span>Use Multiple Models</span>
                                                    <div className="toggle-switch" />
                                                </div>
                                            </div>

                                            <div className="model-section">
                                                {MODELS.filter(m => m.name.toLowerCase().includes(modelSearch.toLowerCase())).map((m) => (
                                                    <div 
                                                        key={m.id} 
                                                        className={`model-list-item ${model === m.id ? 'selected' : ''}`}
                                                        onClick={() => {
                                                            setModel(m.id);
                                                            setShowModelPicker(false);
                                                        }}
                                                    >
                                                        <div className="model-item-left">
                                                            <span>{m.name}</span>
                                                            <span className="brain-icon"><ThinkIcon /></span>
                                                        </div>
                                                        {model === m.id && <CheckIcon />}
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="model-footer">
                                                Add Models {'>'}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="toolbar-right">
                             {/* Context/Mention Button */}
                             <IconButton 
                                icon={<AtIcon />}
                                label="Mention"
                                onClick={() => {
                                     const newText = input + '@';
                                     setInput(newText);
                                     textareaRef.current?.focus();
                                     // Trigger React state update manually if needed to check regex immediately
                                     // But onChange handler on textarea usually handles it.
                                     // We might need to manually trigger the picker logic if changing state directly doesn't fire onChange.
                                     // Actually just setting input and focus is enough for next keystroke, but to show picker immediately:
                                     setShowPicker(true);
                                     setPickerQuery(''); 
                                }}
                             />

                             {/* Web/Globe Button */}
                             <IconButton 
                                icon={<WebIcon />}
                                label="Web Search"
                                onClick={() => {
                                    // Placeholder
                                }}
                             />

                             {/* Add File Button */}
                             <IconButton
                                icon={<ImageIcon />}
                                label="Add Files"
                                onClick={handleAddFiles}
                             />
                            
                            {/* Send / Stop Button */}
                             {isLoading ? (
                                <IconButton
                                    icon={<StopIcon />}
                                    label="Stop Generating"
                                    onClick={() => postMessage({ type: 'cancel' })}
                                />
                            ) : (
                                <IconButton
                                    variant="background"
                                    icon={<SendIcon />}
                                    label="Send Message"
                                    disabled={isSendDisabled}
                                    onClick={handleSubmit}
                                />
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
