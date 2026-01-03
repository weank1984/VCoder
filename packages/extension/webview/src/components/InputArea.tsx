/**
 * Input Area Component - Redesigned based on Augment reference design
 */

import { useState, useRef, useEffect } from 'react';
import type { KeyboardEvent } from 'react';
import { postMessage } from '../utils/vscode';
import { useStore } from '../store/useStore';
import type { ModelId } from '@vcoder/shared';
import { FilePicker } from './FilePicker';
import { AddIcon, ArrowTopIcon, SendIcon, StopIcon, CloseIcon } from './Icon';

interface Attachment {
    type: 'file' | 'selection';
    path?: string;
    name: string;
    content?: string;
}
import './InputArea.scss';

const MODELS: { id: ModelId; name: string }[] = [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
    { id: 'claude-3-opus-20240229', name: 'Claude Opus 4.5 (Thinking)' },
];

export function InputArea() {
    const [input, setInput] = useState('');
    const [showPicker, setShowPicker] = useState(false);
    const [pickerQuery, setPickerQuery] = useState('');
    const [cursorPosition, setCursorPosition] = useState(0);
    const [isComposing, setIsComposing] = useState(false);
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const rectRef = useRef<SVGRectElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { planMode, model, isLoading, workspaceFiles, setPlanMode, setModel, addMessage, setLoading } = useStore();

    // Request workspace files on mount
    useEffect(() => {
        postMessage({ type: 'getWorkspaceFiles' });
    }, []);
    // Calculate perimeter for SVG animation
    useEffect(() => {
        if (!wrapperRef.current) return;

        const updatePerimeter = () => {
            if (rectRef.current) {
                const length = rectRef.current.getTotalLength();
                rectRef.current.style.setProperty('--perimeter', `${length}px`);
                // Calculate snake length (60% of perimeter for longer bar)
                const snakeLen = length * 0.6; 
                rectRef.current.style.setProperty('--snake-length', `${snakeLen}px`);
            }
        };

        const observer = new ResizeObserver(() => {
            updatePerimeter();
        });

        observer.observe(wrapperRef.current);
        
        // Initial calculation
        updatePerimeter();

        return () => observer.disconnect();
    }, [isLoading]);


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
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        const newPos = e.target.selectionStart;
        setInput(val);
        setCursorPosition(e.target.selectionStart);

        // Check for @ trigger
        const textBeforeCursor = val.slice(0, newPos);
        const match = /@([\w\-\/\.]*)$/.exec(textBeforeCursor);

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
        const match = /@([\w\-\/\.]*)$/.exec(textBefore);
        
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

            {showPicker && (
                <FilePicker
                    files={workspaceFiles}
                    searchQuery={pickerQuery}
                    position={{ top: -300, left: 0 }} // Position above input
                    onSelect={handleFileSelect}
                    onClose={() => setShowPicker(false)}
                />
            )}
            
            <div 
                ref={wrapperRef}
                className={`input-wrapper ${isLoading ? 'input-wrapper--loading' : ''}`}
            >
                {isLoading && (
                    <svg className="marquee-svg">
                        <defs>
                            <linearGradient id="neon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#00f2ff" />
                                <stop offset="50%" stopColor="#7000ff" />
                                <stop offset="100%" stopColor="#ff00a0" />
                            </linearGradient>
                        </defs>
                        <rect 
                            ref={rectRef}
                            className="marquee-rect"
                            x="1" y="1" 
                            width="calc(100% - 2px)" 
                            height="calc(100% - 2px)" 
                            rx="8" ry="8" 
                        />
                    </svg>
                )}
                <div className="input-content">
                    {/* Attachment preview chips */}
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
                        placeholder="Ask anything (⌘L), @ to mention, / for workflows"
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        onCompositionStart={() => setIsComposing(true)}
                        onCompositionEnd={() => setIsComposing(false)}
                        disabled={isLoading}
                        rows={1}
                        onClick={(e) => {
                            setCursorPosition(e.currentTarget.selectionStart);
                            setShowPicker(false); // Hide picker on click moving cursor
                        }}
                    />

                    <div className="input-toolbar">
                        <div className="toolbar-left">
                            <button className="tool-btn add-btn" title="Add files" aria-label="Add files" onClick={handleAddFiles}>
                                <AddIcon />
                            </button>

                            <button
                                className={`dropdown-btn ${planMode ? 'active' : ''}`}
                                onClick={() => setPlanMode(!planMode)}
                            >
                                <span className="dropdown-arrow" aria-hidden="true"><ArrowTopIcon /></span>
                                <span>{planMode ? 'Planning' : 'Normal'}</span>
                            </button>

                            <button className="dropdown-btn model-btn">
                                <span className="dropdown-arrow" aria-hidden="true"><ArrowTopIcon /></span>
                                <span>{selectedModel?.name || 'Select Model'}</span>
                                <select
                                    className="model-select-overlay"
                                    value={model}
                                    onChange={(e) => setModel(e.target.value as ModelId)}
                                >
                                    {MODELS.map((m) => (
                                        <option key={m.id} value={m.id}>
                                            {m.name}
                                        </option>
                                    ))}
                                </select>
                            </button>
                        </div>

                        <div className="toolbar-right">
                            {isLoading ? (
                                <button
                                    className="stop-btn"
                                    onClick={() => {
                                        postMessage({ type: 'cancel' });
                                    }}
                                    title="Stop generating"
                                    aria-label="Stop generating"
                                >
                                    <StopIcon />
                                </button>
                            ) : (
                                <button
                                    className="send-btn"
                                    onClick={handleSubmit}
                                    disabled={!input.trim() && attachments.length === 0}
                                    title="Send"
                                    aria-label="Send"
                                >
                                    <SendIcon />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
