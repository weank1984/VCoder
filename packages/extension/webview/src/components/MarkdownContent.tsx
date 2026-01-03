/**
 * Markdown Content Component
 * Renders Markdown with syntax-highlighted code blocks and GFM support
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useState, useCallback } from 'react';
import { useThemeMode } from '../hooks/useThemeMode';
import { postMessage } from '../utils/vscode';
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

function CodeBlock({ inline, className, children, isComplete, syntaxTheme }: CodeBlockProps & { isComplete?: boolean; syntaxTheme: Record<string, React.CSSProperties> }) {
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

    if (inline) {
        return <code className="inline-code">{children}</code>;
    }

    // 流式渲染时使用简化渲染，避免频繁重渲染导致的性能问题
    if (!isComplete) {
        return (
            <div className="vc-markdown-code-block">
                <div className="code-block-header">
                    {language && <span className="code-language">{language}</span>}
                </div>
                <pre className="code-block-simple">
                    <code>{codeString}</code>
                </pre>
            </div>
        );
    }

    return (
        <div className="vc-markdown-code-block">
            <div className="code-block-header">
                {language && <span className="code-language">{language}</span>}
                <div className="code-block-actions">
                    <button 
                        className="code-action-btn" 
                        onClick={handleInsert}
                        title={inserted ? '已插入!' : '插入编辑器'}
                    >
                        {inserted ? '✓' : '⤵️'}
                    </button>
                    <button 
                        className="code-action-btn" 
                        onClick={handleCopy}
                        title={copied ? '已复制!' : '复制代码'}
                    >
                        {copied ? '✓' : '📋'}
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

export function MarkdownContent({ content, isComplete = true }: MarkdownContentProps) {
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
                        />
                    ),
                }}
            >
                {content}
            </ReactMarkdown>
            {!isComplete && <span className="streaming-cursor" />}
        </div>
    );
}


