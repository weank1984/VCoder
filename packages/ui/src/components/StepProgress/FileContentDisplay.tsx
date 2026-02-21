/**
 * File Content Display Component
 * Displays file content with syntax highlighting and line numbers
 * 使用 Shiki 进行语法高亮
 */

import { useMemo, useState, useEffect } from 'react';
import { getFileExtension, detectLanguage } from '../../utils/pathUtils';
import { useThemeMode } from '../../hooks/useThemeMode';
import { renderMarkdown } from '../../lib/markdown';
import { createHighlighter, type Highlighter, type BundledLanguage } from 'shiki';

interface FileContentDisplayProps {
    content: string;
    filePath?: string;
    startLine?: number;
}

// Shiki highlighter 单例
let highlighter: Highlighter | null = null;
let highlighterPromise: Promise<Highlighter> | null = null;

async function getHighlighter(): Promise<Highlighter> {
    if (highlighter) return highlighter;
    
    if (!highlighterPromise) {
        highlighterPromise = createHighlighter({
            themes: ['github-dark', 'github-light'],
            langs: [
                'typescript', 'javascript', 'tsx', 'jsx',
                'python', 'java', 'go', 'rust', 'c', 'cpp',
                'html', 'css', 'scss', 'json', 'yaml',
                'bash', 'shell', 'sql', 'markdown',
                'diff', 'dockerfile',
            ],
        });
    }
    
    highlighter = await highlighterPromise;
    return highlighter;
}

/**
 * Clean line number prefixes from text content
 * Removes patterns like "1→", "2|", "3:" from the start of lines
 */
function cleanLineNumbers(text: string): string {
    return text.replace(/^\s*\d+[→|:]\s?/gm, '');
}

/**
 * Check if file is markdown
 */
function isMarkdownFile(filePath?: string): boolean {
    if (!filePath) return false;
    const ext = getFileExtension(filePath);
    return ['md', 'markdown', 'mdx'].includes(ext);
}

/**
 * 将语言名转换为 Shiki 支持的格式
 */
function normalizeLanguage(lang: string): BundledLanguage {
    const langMap: Record<string, BundledLanguage> = {
        'js': 'javascript',
        'ts': 'typescript',
        'py': 'python',
        'rb': 'ruby',
        'sh': 'bash',
        'zsh': 'bash',
        'yml': 'yaml',
        'md': 'markdown',
    };
    
    const normalized = lang.toLowerCase();
    return (langMap[normalized] || normalized || 'text') as BundledLanguage;
}

/**
 * 添加行号的 HTML 渲染
 */
function renderWithLineNumbers(code: string, html: string, startLine: number): string {
    const lines = code.split('\n');
    const lineCount = lines.length;
    
    // 重建带行号的 HTML
    let result = '<div class="file-content-with-lines">';
    result += '<div class="line-numbers">';
    for (let i = 0; i < lineCount; i++) {
        result += `<span class="line-number">${startLine + i}</span>`;
    }
    result += '</div>';
    result += '<div class="code-content">' + html + '</div>';
    result += '</div>';
    
    return result;
}

export function FileContentDisplay({ content, filePath, startLine = 1 }: FileContentDisplayProps) {
    const cleanContent = useMemo(() => cleanLineNumbers(content), [content]);
    const ext = useMemo(() => filePath ? getFileExtension(filePath) : '', [filePath]);
    const language = useMemo(() => detectLanguage(ext), [ext]);
    const isMarkdown = useMemo(() => isMarkdownFile(filePath), [filePath]);
    const themeMode = useThemeMode();
    
    const [viewMode, setViewMode] = useState<'code' | 'preview'>(isMarkdown ? 'preview' : 'code');
    const [highlightedHtml, setHighlightedHtml] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    
    // 异步高亮代码
    useEffect(() => {
        let mounted = true;
        
        async function highlight() {
            setIsLoading(true);
            try {
                const hl = await getHighlighter();
                const themeName = themeMode === 'dark' ? 'github-dark' : 'github-light';
                const lang = normalizeLanguage(language);
                
                let html: string;
                try {
                    html = hl.codeToHtml(cleanContent, { 
                        lang, 
                        theme: themeName,
                    });
                } catch {
                    // 语言不支持，降级为纯文本
                    html = `<pre class="shiki"><code>${escapeHtml(cleanContent)}</code></pre>`;
                }
                
                // 添加行号
                const htmlWithLines = renderWithLineNumbers(cleanContent, html, startLine);
                
                if (mounted) {
                    setHighlightedHtml(htmlWithLines);
                    setIsLoading(false);
                }
            } catch (err) {
                console.error('Highlight error:', err);
                if (mounted) {
                    setHighlightedHtml(`<pre><code>${escapeHtml(cleanContent)}</code></pre>`);
                    setIsLoading(false);
                }
            }
        }
        
        highlight();
        
        return () => { mounted = false; };
    }, [cleanContent, language, themeMode, startLine]);
    
    // Markdown 预览 HTML
    const markdownHtml = useMemo(() => {
        if (!isMarkdown || viewMode !== 'preview') return '';
        return renderMarkdown(cleanContent, themeMode);
    }, [isMarkdown, viewMode, cleanContent, themeMode]);
    
    // For markdown files, show toggle
    if (isMarkdown) {
        return (
            <div className="file-content-display">
                <div className="view-toggle">
                    <button 
                        className={viewMode === 'code' ? 'active' : ''} 
                        onClick={() => setViewMode('code')}
                    >
                        源码
                    </button>
                    <button 
                        className={viewMode === 'preview' ? 'active' : ''} 
                        onClick={() => setViewMode('preview')}
                    >
                        预览
                    </button>
                </div>
                
                {viewMode === 'preview' ? (
                    <div className="markdown-preview vc-markdown" dangerouslySetInnerHTML={{ __html: markdownHtml }} />
                ) : (
                    <div 
                        className="syntax-highlighted-code"
                        dangerouslySetInnerHTML={{ __html: highlightedHtml }} 
                    />
                )}
            </div>
        );
    }
    
    // For other files, show syntax highlighted code
    return (
        <div className="file-content-display">
            {isLoading ? (
                <div className="code-loading">
                    <pre><code>{cleanContent}</code></pre>
                </div>
            ) : (
                <div 
                    className="syntax-highlighted-code"
                    dangerouslySetInnerHTML={{ __html: highlightedHtml }} 
                />
            )}
        </div>
    );
}

/**
 * HTML 转义
 */
function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
