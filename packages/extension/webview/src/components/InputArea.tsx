/**
 * Input Area Component
 */

import React, { useState, useRef, useEffect } from 'react';
import { postMessage } from '../utils/vscode';
import { useStore } from '../store/useStore';
import { ModelId } from '@z-code/shared';
import './InputArea.css';

const MODELS: { id: ModelId; name: string }[] = [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
];

export const InputArea: React.FC = () => {
    const [input, setInput] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const { planMode, model, isLoading, setPlanMode, setModel, addMessage } = useStore();

    const handleSubmit = () => {
        if (!input.trim() || isLoading) return;

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

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
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

    return (
        <div className="input-area">
            <div className="input-toolbar">
                <button className="tool-btn" title="Attach file">📎</button>
                <button className="tool-btn" title="Reference file (@)">@</button>
            </div>

            <div className="input-container">
                <textarea
                    ref={textareaRef}
                    className="input-field"
                    placeholder="How can I help you today?"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isLoading}
                    rows={1}
                />
                <button
                    className="send-btn"
                    onClick={handleSubmit}
                    disabled={!input.trim() || isLoading}
                >
                    ⬆
                </button>
            </div>

            <div className="input-footer">
                <button
                    className={`mode-btn ${planMode ? 'active' : ''}`}
                    onClick={() => setPlanMode(!planMode)}
                >
                    {planMode ? '📋 Plan Mode' : '⚡ Execute Mode'}
                </button>

                <select
                    className="model-select"
                    value={model}
                    onChange={(e) => setModel(e.target.value as ModelId)}
                >
                    {MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                            {m.name}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
};
