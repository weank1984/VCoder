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
import { useI18n } from '../i18n/I18nProvider';
import { postMessage } from '../utils/vscode';
import { CopyIcon, InsertIcon, CheckIcon } from './Icon';
import { FilePath, isFilePath } from './FilePath';
import { MermaidBlock } from './MermaidBlock';
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
    
    // 判断是否为内联代码 (react-markdown v9+ 中 inline prop 可能不准确)
    // 规则：无语言标识 + 单行 + 无换行符 = 内联代码
    const isSingleLine = !codeString.includes('\n');
    const isInlineCode = inline === true || (!language && isSingleLine);

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

    // 内联代码处理
    if (isInlineCode) {
        // 文件路径 - 使用 FilePath 组件（内联样式）
        if (isFilePath(codeString)) {
            return <FilePath path={codeString} variant="inline" />;
        }
        // 普通内联代码
        return <code className="inline-code">{children}</code>;
    }
    
    // 块级代码：有语言标识或多行内容
    // 仅当是多行文件路径时才用 block 变体（这种情况很少见）
    if (!language && isFilePath(codeString) && !isSingleLine) {
        return <FilePath path={codeString} variant="block" />;
    }

    // 流式渲染时使用简化渲染，避免频繁重渲染导致的性能问题
    // 对于 mermaid 等需要完整代码的特殊语言，流式时也显示纯文本，避免渲染不完整语法报错
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

    // Mermaid diagrams - 只在完整内容时渲染
    if (language === 'mermaid') {
        return <MermaidBlock code={codeString} />;
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

/**
 * 预处理 markdown 内容，修复常见的解析问题
 * - 转义行内 `>` 符号（在内联代码之间），避免被误解析为 blockquote
 */
function preprocessMarkdown(content: string): string {
    // 修复: `A` > `B` 这种模式中的 > 被误解析为 blockquote
    // 匹配: 内联代码 + 空格 + > + 空格 + 内联代码
    // 替换 > 为 HTML 实体 &gt; 或 \>
    return content.replace(
        /(`[^`]+`)\s*>\s*(`[^`]+`)/g,
        '$1 \\> $2'
    );
}

export function MarkdownContent({ content, isComplete = true }: MarkdownContentProps) {
    const { t } = useI18n();
    const themeMode = useThemeMode();
    const syntaxTheme = themeMode === 'light' ? vs : vscDarkPlus;

    if (!content) {
        return null;
    }

    // 预处理内容
    const processedContent = preprocessMarkdown(content);

    return (
        <div className="vc-markdown">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    code: (props: CodeBlockProps) => (
                        <CodeBlock 
                            {...props} 
                            isComplete={isComplete} 
                            syntaxTheme={syntaxTheme}
                            t={t}
                        />
                    ),
                }}
            >
                {processedContent}
            </ReactMarkdown>
        </div>
    );
}

