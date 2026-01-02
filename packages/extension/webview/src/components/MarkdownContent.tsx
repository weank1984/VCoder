/**
 * Markdown Content Component
 * Renders Markdown with syntax-highlighted code blocks
 */

import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useState, useCallback } from 'react';
import './MarkdownContent.scss';

interface MarkdownContentProps {
    content: string;
    isComplete: boolean;
}

interface CodeBlockProps {
    inline?: boolean;
    className?: string;
    children?: React.ReactNode;
}

function CodeBlock({ inline, className, children }: CodeBlockProps) {
    const [copied, setCopied] = useState(false);
    
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

    if (inline) {
        return <code className="inline-code">{children}</code>;
    }

    return (
        <div className="vc-markdown-code-block">
            <div className="code-block-header">
                {language && <span className="code-language">{language}</span>}
                <button 
                    className="copy-btn" 
                    onClick={handleCopy}
                    title={copied ? '已复制!' : '复制代码'}
                >
                    {copied ? '✓' : '📋'}
                </button>
            </div>
            <SyntaxHighlighter
                style={vscDarkPlus}
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

export function MarkdownContent({ content }: MarkdownContentProps) {
    if (!content) {
        return null;
    }

    return (
        <div className="vc-markdown">
            <ReactMarkdown
                components={{
                    code: CodeBlock,
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}
