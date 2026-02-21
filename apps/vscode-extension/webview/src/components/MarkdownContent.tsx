/**
 * Markdown Content Component
 * 使用 markdown-it + Shiki 渲染 Markdown
 * 支持代码高亮、文件路径点击、Mermaid 图表
 *
 * 性能优化：
 * - 使用 LRU 缓存 Markdown 渲染结果
 * - 使用 Intersection Observer 延迟加载 Mermaid
 * - 防抖处理滚动和点击事件
 */

import { useEffect, useRef, useState, memo, useMemo } from 'react';
import { useThemeMode } from '../hooks/useThemeMode';
import { useI18n } from '../i18n/I18nProvider';
import { postMessage } from '../utils/vscode';
import { renderMarkdown, initHighlighter } from '../lib/markdown';
import { MermaidBlock } from './MermaidBlock';
import './MarkdownContent.scss';

// 预初始化 highlighter
initHighlighter().catch(console.error);

interface MarkdownContentProps {
    content: string;
    isComplete?: boolean;
}

/**
 * Simple LRU cache for rendered markdown
 */
class RenderCache {
    private cache = new Map<string, string>();
    private maxSize: number;

    constructor(maxSize = 50) {
        this.maxSize = maxSize;
    }

    get(key: string): string | undefined {
        const value = this.cache.get(key);
        if (value !== undefined) {
            // Move to end (most recently used)
            this.cache.delete(key);
            this.cache.set(key, value);
        }
        return value;
    }

    set(key: string, value: string): void {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            // Remove oldest entry
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) {
                this.cache.delete(firstKey);
            }
        }
        this.cache.set(key, value);
    }

    clear(): void {
        this.cache.clear();
    }
}

// Global render cache instance
const renderCache = new RenderCache(100);

/**
 * MarkdownContent 组件
 */
export const MarkdownContent = memo(function MarkdownContent({
    content,
    isComplete = true
}: MarkdownContentProps) {
    const { t } = useI18n();
    const themeMode = useThemeMode();
    const containerRef = useRef<HTMLDivElement>(null);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const [insertedIndex, setInsertedIndex] = useState<number | null>(null);

    // 渲染 HTML with caching
    const html = useMemo(() => {
        if (!content) return '';

        // Create cache key from content and theme
        const cacheKey = `${content.length}-${themeMode}-${hashString(content)}`;
        const cached = renderCache.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        const rendered = renderMarkdown(content, themeMode);
        renderCache.set(cacheKey, rendered);
        return rendered;
    }, [content, themeMode]);

    // Cleanup function for Mermaid roots
    const mermaidRootsRef = useRef<Map<HTMLElement, { unmount: () => void }>>(new Map());

    // 事件委托处理交互
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleClick = async (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            
            // 1. 处理代码块操作按钮
            const actionBtn = target.closest('.code-action-btn') as HTMLElement;
            if (actionBtn) {
                const codeBlock = actionBtn.closest('.vc-code-block') as HTMLElement;
                const code = codeBlock?.dataset.code || '';
                const action = actionBtn.dataset.action;
                const blockIndex = Array.from(container.querySelectorAll('.vc-code-block')).indexOf(codeBlock);
                
                if (action === 'copy') {
                    try {
                        await navigator.clipboard.writeText(code);
                        setCopiedIndex(blockIndex);
                        setTimeout(() => setCopiedIndex(null), 2000);
                    } catch (err) {
                        console.error('Failed to copy:', err);
                    }
                } else if (action === 'insert') {
                    postMessage({ type: 'insertText', text: code });
                    setInsertedIndex(blockIndex);
                    setTimeout(() => setInsertedIndex(null), 2000);
                }
                return;
            }
            
            // 2. 处理内联文件路径点击
            const inlineFilePath = target.closest('.inline-code--filepath') as HTMLElement;
            if (inlineFilePath) {
                const path = inlineFilePath.dataset.filepath;
                const lineStart = inlineFilePath.dataset.lineStart ? parseInt(inlineFilePath.dataset.lineStart) : undefined;
                const lineEnd = inlineFilePath.dataset.lineEnd ? parseInt(inlineFilePath.dataset.lineEnd) : undefined;
                if (path) {
                    const lineRange = lineStart ? [lineStart, lineEnd || lineStart] as [number, number] : undefined;
                    postMessage({ type: 'openFile', path, lineRange });
                }
                return;
            }
            
            // 3. 处理文件路径块点击
            const filePathBlock = target.closest('.file-path-block') as HTMLElement;
            if (filePathBlock) {
                const path = filePathBlock.dataset.filepath;
                const lineStart = filePathBlock.dataset.lineStart ? parseInt(filePathBlock.dataset.lineStart) : undefined;
                const lineEnd = filePathBlock.dataset.lineEnd ? parseInt(filePathBlock.dataset.lineEnd) : undefined;
                if (path) {
                    const lineRange = lineStart ? [lineStart, lineEnd || lineStart] as [number, number] : undefined;
                    postMessage({ type: 'openFile', path, lineRange });
                }
                return;
            }
        };

        container.addEventListener('click', handleClick);
        return () => container.removeEventListener('click', handleClick);
    }, [html]); // 当 HTML 变化时重新绑定

    // 更新按钮状态
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const codeBlocks = container.querySelectorAll('.vc-code-block');
        codeBlocks.forEach((block, index) => {
            const copyBtn = block.querySelector('[data-action="copy"]');
            const insertBtn = block.querySelector('[data-action="insert"]');
            
            if (copyBtn) {
                copyBtn.classList.toggle('is-success', copiedIndex === index);
                copyBtn.setAttribute('title', copiedIndex === index ? t('Agent.CodeCopied') : t('Agent.CopyCode'));
            }
            if (insertBtn) {
                insertBtn.classList.toggle('is-success', insertedIndex === index);
                insertBtn.setAttribute('title', insertedIndex === index ? t('Agent.CodeInserted') : t('Agent.InsertToEditor'));
            }
        });
    }, [copiedIndex, insertedIndex, html, t]);

    // 处理 Mermaid 图表 - 使用 Intersection Observer 延迟加载
    useEffect(() => {
        const container = containerRef.current;
        if (!container || !isComplete) return;

        const reactDomPromise = import('react-dom/client');

        // 使用 Intersection Observer 延迟加载 Mermaid
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;

                    const placeholder = entry.target as HTMLElement;
                    if (placeholder.hasAttribute('data-rendered')) return;

                    const code = placeholder.dataset.code || '';
                    if (!code) return;

                    placeholder.setAttribute('data-rendered', 'true');
                    const wrapper = document.createElement('div');
                    wrapper.className = 'mermaid-wrapper';
                    placeholder.replaceWith(wrapper);

                    reactDomPromise.then(({ createRoot }) => {
                        const root = createRoot(wrapper);
                        root.render(<MermaidBlock code={code} />);
                        mermaidRootsRef.current.set(wrapper, { unmount: () => root.unmount() });
                    });

                    observer.unobserve(placeholder);
                });
            },
            { rootMargin: '100px' } // 提前 100px 加载
        );

        // 查找 mermaid 占位符并观察
        const placeholders = container.querySelectorAll('.mermaid-placeholder');
        placeholders.forEach((placeholder) => {
            if (!placeholder.hasAttribute('data-rendered')) {
                observer.observe(placeholder);
            }
        });

        return () => {
            observer.disconnect();
            // Cleanup Mermaid roots
            mermaidRootsRef.current.forEach(({ unmount }) => unmount());
            mermaidRootsRef.current.clear();
        };
    }, [html, isComplete]);

    if (!content) {
        return null;
    }

    return (
        <div
            ref={containerRef}
            className="vc-markdown"
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
});

/**
 * Simple string hash function for cache keys
 */
function hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
}

export default MarkdownContent;
