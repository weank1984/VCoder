/**
 * Input Area Component - Redesigned based on reference design
 */

import { useState, useRef, useEffect } from 'react';
import type { KeyboardEvent } from 'react';
import { postMessage } from '../utils/vscode';
import { useStore } from '../store/useStore';
import type { ModelId } from '@vcoder/shared';
import './InputArea.css';

const MODELS: { id: ModelId; name: string }[] = [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
    { id: 'claude-3-opus-20240229', name: 'Claude Opus 4.5 (Thinking)' },
];

export function InputArea() {
    const [input, setInput] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const { planMode, model, isLoading, setPlanMode, setModel, addMessage, setLoading } = useStore();

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

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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

    const selectedModel = MODELS.find(m => m.id === model);

    return (
        <div className="input-area">
            <div className="input-wrapper">
                <textarea
                    ref={textareaRef}
                    className="input-field"
                    placeholder="Ask anything (⌘L), @ to mention, / for workflows"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isLoading}
                    rows={1}
                />

                <div className="input-toolbar">
                    <div className="toolbar-left">
                        <button className="tool-btn" title="添加文件" aria-label="添加文件">
                            <span className="icon">+</span>
                        </button>

                        <button
                            className={`dropdown-btn ${planMode ? 'active' : ''}`}
                            onClick={() => setPlanMode(!planMode)}
                        >
                            <span className="dropdown-icon">▽</span>
                            <span>{planMode ? 'Planning' : 'Normal'}</span>
                        </button>

                        <button className="dropdown-btn model-btn">
                            <span className="dropdown-icon">▽</span>
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
                        <button className="tool-btn mic-btn" title="语音输入" aria-label="语音输入">
                            <span className="icon">🎤</span>
                        </button>

                        <button
                            className="send-btn"
                            onClick={handleSubmit}
                            disabled={!input.trim() || isLoading}
                            title="发送"
                            aria-label="发送"
                        >
                            <span className="icon">→</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
