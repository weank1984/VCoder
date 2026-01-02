/**
 * Input Area Component - Redesigned based on Augment reference design
 */

import { useState, useRef, useEffect } from 'react';
import type { KeyboardEvent } from 'react';
import { postMessage } from '../utils/vscode';
import { useStore } from '../store/useStore';
import type { ModelId } from '@vcoder/shared';
import { FilePicker } from './FilePicker';
import { AddIcon, ArrowTopIcon, LoadingIcon, SendIcon } from './Icon';
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
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const { planMode, model, isLoading, workspaceFiles, setPlanMode, setModel, addMessage, setLoading } = useStore();

    // Request workspace files on mount
    useEffect(() => {
        postMessage({ type: 'getWorkspaceFiles' });
    }, []);

    const handleSubmit = () => {
        if (!input.trim() || isLoading) return;

        setLoading(true);

        // Add user message to UI
        addMessage({
            id: crypto.randomUUID(),
            role: 'user',
            content: input,
            isComplete: true,
        });

        // Add placeholder assistant message
        addMessage({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: '',
            isComplete: false,
        });

        // Send to extension
        postMessage({
            type: 'send',
            content: input,
        });

        setInput('');
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
            {showPicker && (
                <FilePicker
                    files={workspaceFiles}
                    searchQuery={pickerQuery}
                    position={{ top: -300, left: 0 }} // Position above input
                    onSelect={handleFileSelect}
                    onClose={() => setShowPicker(false)}
                />
            )}
            
            <div className="input-wrapper">
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
                        <button className="tool-btn add-btn" title="Add context" aria-label="Add context" onClick={() => setShowPicker(true)}>
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


                        <button
                            className="send-btn"
                            onClick={handleSubmit}
                            disabled={!input.trim() || isLoading}
                            title={isLoading ? 'Generating…' : 'Send'}
                            aria-label={isLoading ? 'Generating…' : 'Send'}
                        >
                            {isLoading ? <LoadingIcon className="icon-spin" /> : <SendIcon />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
