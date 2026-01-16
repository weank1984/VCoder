/**
 * Markdown Content Component
 * 使用 markdown-it + Shiki 渲染 Markdown
 * 支持代码高亮、文件路径点击、Mermaid 图表
 */

import { useEffect, useRef, useState, memo } from 'react';
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

    // 渲染 HTML
    const html = content ? renderMarkdown(content, themeMode) : '';

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

    // 处理 Mermaid 图表
    useEffect(() => {
        const container = containerRef.current;
        if (!container || !isComplete) return;

        // 查找 mermaid 占位符并渲染
        const placeholders = container.querySelectorAll('.mermaid-placeholder');
        placeholders.forEach((placeholder) => {
            const code = (placeholder as HTMLElement).dataset.code || '';
            if (code && !placeholder.hasAttribute('data-rendered')) {
                placeholder.setAttribute('data-rendered', 'true');
                // 创建一个临时容器来渲染 React 组件
                // 注意：这里使用的是原生 DOM 操作，因为我们使用 dangerouslySetInnerHTML
                const wrapper = document.createElement('div');
                wrapper.className = 'mermaid-wrapper';
                placeholder.replaceWith(wrapper);
                
                // 使用 React 18 的 createRoot
                import('react-dom/client').then(({ createRoot }) => {
                    const root = createRoot(wrapper);
                    root.render(<MermaidBlock code={code} />);
                });
            }
        });
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

export default MarkdownContent;
