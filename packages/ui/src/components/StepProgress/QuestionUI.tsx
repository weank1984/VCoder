import { useState, useRef, useCallback, useEffect } from 'react';
import type { ToolCall } from '../../types';
import { useI18n } from '../../i18n/I18nProvider';
import './QuestionUI.scss';

interface QuestionUIProps {
    toolCall: ToolCall;
    onAnswer: (answer: string) => void;
}

export function QuestionUI({ toolCall, onAnswer }: QuestionUIProps) {
    const { t } = useI18n();
    const [inputValue, setInputValue] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const question = toolCall.confirmationData?.question ?? '';
    const options = toolCall.confirmationData?.questionOptions;
    const hasOptions = Array.isArray(options) && options.length > 0;

    useEffect(() => {
        if (!hasOptions && textareaRef.current) {
            textareaRef.current.focus();
        }
    }, [hasOptions]);

    const handleSubmit = useCallback(() => {
        const answer = inputValue.trim();
        if (!answer) return;
        onAnswer(answer);
    }, [inputValue, onAnswer]);

    const handleSkip = useCallback(() => {
        onAnswer('');
    }, [onAnswer]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        } else if (e.key === 'Escape') {
            handleSkip();
        }
    }, [handleSubmit, handleSkip]);

    return (
        <div className="question-ui">
            <div className="question-header">
                <span className="question-icon">?</span>
                <span className="question-title">{t('Agent.QuestionTitle')}</span>
            </div>
            <div className="question-text">{question}</div>
            {hasOptions ? (
                <div className="question-options">
                    {options!.map((opt, idx) => (
                        <button
                            key={idx}
                            className="question-option-btn"
                            onClick={() => onAnswer(opt)}
                        >
                            {opt}
                        </button>
                    ))}
                    <button className="question-skip-btn" onClick={handleSkip}>
                        {t('Agent.QuestionSkip')}
                    </button>
                </div>
            ) : (
                <div className="question-input-area">
                    <textarea
                        ref={textareaRef}
                        className="question-textarea"
                        placeholder={t('Agent.QuestionPlaceholder')}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        rows={3}
                    />
                    <div className="question-actions">
                        <button className="question-skip-btn" onClick={handleSkip}>
                            {t('Agent.QuestionSkip')}
                        </button>
                        <button
                            className="question-submit-btn"
                            onClick={handleSubmit}
                            disabled={!inputValue.trim()}
                        >
                            {t('Agent.QuestionSubmit')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
