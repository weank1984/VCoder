/**
 * Markdown Content Component
 * Renders Markdown with syntax-highlighted code blocks and GFM support
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useState, useCallback, memo } from 'react';
import { useThemeMode } from '../hooks/useThemeMode';
import { useI18n } from '../i18n/I18nProvider';
import { postMessage } from '../utils/vscode';
import { CopyIcon, InsertIcon, CheckIcon } from './Icon';
import { FilePath, isFilePath } from './FilePath';
import './MarkdownContent.scss';

interface MarkdownContentProps {
    content: string;
    isComplete?: boolean;
}

interface CodeBlockProps {
    inline?: boolean;
    className?: string;
    children?: React.ReactNode;
}

function CodeBlock({ inline, className, children, isComplete, syntaxTheme, t }: CodeBlockProps & { isComplete?: boolean; syntaxTheme: Record<string, React.CSSProperties>; t: (key: string) => string }) {
    const [copied, setCopied] = useState(false);
    const [inserted, setInserted] = useState(false);
    
    // Extract language from className (format: "language-xxx")
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';
    const codeString = String(children).replace(/\n$/, '');

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(codeString);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy code:', err);
        }
    }, [codeString]);

    const handleInsert = useCallback(() => {
        postMessage({ type: 'insertText', text: codeString });
        setInserted(true);
        setTimeout(() => setInserted(false), 2000);
    }, [codeString]);

    // For inline code, check if it's a file path
    if (inline) {
        if (isFilePath(codeString)) {
            return <FilePath path={codeString} variant="inline" />;
        }
        return <code className="inline-code">{children}</code>;
    }
    
    // For code blocks without language, check if entire content is a file path
    if (!language && isFilePath(codeString)) {
        return <FilePath path={codeString} variant="block" />;
    }

    // 流式渲染时使用简化渲染，避免频繁重渲染导致的性能问题
    if (!isComplete) {
        return (
            <div className="vc-code-block">
                <div className="code-block-header">
                    {language && (
                        <div className="code-language-badge">
                            <span className="language-dot" />
                            <span className="language-name">{language}</span>
                        </div>
                    )}
                </div>
                <pre className="code-block-simple">
                    <code>{codeString}</code>
                </pre>
            </div>
        );
    }

    return (
        <div className="vc-code-block">
            <div className="code-block-header">
                {language && (
                    <div className="code-language-badge">
                        <span className="language-dot" />
                        <span className="language-name">{language}</span>
                    </div>
                )}
                <div className="code-block-actions">
                    <button 
                        className={`code-action-btn ${inserted ? 'is-success' : ''}`}
                        onClick={handleInsert}
                        title={inserted ? t('Agent.CodeInserted') : t('Agent.InsertToEditor')}
                        aria-label={inserted ? t('Agent.CodeInserted') : t('Agent.InsertToEditor')}
                    >
                        {inserted ? <CheckIcon /> : <InsertIcon />}
                    </button>
                    <button 
                        className={`code-action-btn ${copied ? 'is-success' : ''}`}
                        onClick={handleCopy}
                        title={copied ? t('Agent.CodeCopied') : t('Agent.CopyCode')}
                        aria-label={copied ? t('Agent.CodeCopied') : t('Agent.CopyCode')}
                    >
                        {copied ? <CheckIcon /> : <CopyIcon />}
                    </button>
                </div>
            </div>
            <SyntaxHighlighter
                style={syntaxTheme}
                language={language || 'text'}
                PreTag="div"
                customStyle={{
                    margin: 0,
                    borderRadius: '0 0 6px 6px',
                    fontSize: '13px',
                }}
            >
                {codeString}
            </SyntaxHighlighter>
        </div>
    );
}

export const MarkdownContent = memo(function MarkdownContent({ content, isComplete = true }: MarkdownContentProps) {
    const { t } = useI18n();
    const themeMode = useThemeMode();
    const syntaxTheme = themeMode === 'light' ? vs : vscDarkPlus;

    if (!content) {
        // 即使没有内容，如果正在加载也显示光标
        if (!isComplete) {
            return (
                <div className="vc-markdown">
                    <span className="streaming-cursor" />
                </div>
            );
        }
        return null;
    }

    return (
        <div className="vc-markdown">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    code: (props) => (
                        <CodeBlock 
                            {...props} 
                            isComplete={isComplete} 
                            syntaxTheme={syntaxTheme}
                            t={t}
                        />
                    ),
                }}
            >
                {content}
            </ReactMarkdown>
            {!isComplete && <span className="streaming-cursor" />}
        </div>
    );
});


