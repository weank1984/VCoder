/**
 * Markdown Rendering Library
 * 使用 markdown-it + Shiki 实现高性能 markdown 渲染
 */

import MarkdownIt from 'markdown-it';
import { createHighlighter, type Highlighter } from 'shiki';
import type { BundledLanguage } from 'shiki';
import DOMPurify from 'dompurify';
import { isFilePath, parseFilePathWithLine } from '../components/FilePath';
import { highlightCodeAsync } from './highlightWorker';

const byteLength = (str: string): number => {
    const encoder = new TextEncoder();
    const encoded = encoder.encode(str);
    return encoded.byteLength;
}

// ============ Shiki Highlighter ============

let highlighter: Highlighter | null = null;
let highlighterPromise: Promise<Highlighter> | null = null;

// 常用语言列表 - 按需加载
const COMMON_LANGUAGES: BundledLanguage[] = [
    'typescript', 'javascript', 'tsx', 'jsx',
    'python', 'java', 'go', 'rust', 'c', 'cpp',
    'html', 'css', 'scss', 'json', 'yaml',
    'bash', 'shell', 'powershell',
    'sql', 'graphql', 'markdown',
    'diff', 'dockerfile',
];

/**
 * 获取或创建 Shiki highlighter 实例（单例）
 */
async function getHighlighter(): Promise<Highlighter> {
    if (highlighter) return highlighter;
    
    if (!highlighterPromise) {
        highlighterPromise = createHighlighter({
            themes: ['one-dark-pro', 'one-light'],
            langs: COMMON_LANGUAGES,
        });
    }
    
    highlighter = await highlighterPromise;
    return highlighter;
}

/**
 * 同步获取 highlighter（如果已初始化）
 */
function getHighlighterSync(): Highlighter | null {
    return highlighter;
}

/**
 * 预初始化 highlighter（应用启动时调用）
 */
export async function initHighlighter(): Promise<void> {
    await getHighlighter();
}

// ============ Markdown-it Instance ============

/**
 * 创建配置好的 markdown-it 实例
 */
function createMarkdownIt(theme: 'dark' | 'light'): MarkdownIt {
    const md = new MarkdownIt({
        html: false,        // 禁用 HTML 标签（安全考虑）
        linkify: true,      // 自动识别链接
        typographer: true,  // 智能引号等排版优化
        breaks: false,      // 不将换行转为 <br>
        highlight: (code, lang) => {
            const hl = getHighlighterSync();
            const codeSize = byteLength(code);
            
            if (codeSize > 1024) {
                return `<pre class="shiki-large-code" data-worker-highlight="true" data-lang="${escapeAttr(lang)}" data-theme="${theme}">${escapeHtml(code)}</pre>`;
            }
            
            if (!hl) {
                return `<pre class="shiki-pending"><code>${escapeHtml(code)}</code></pre>`;
            }
            
            const themeName = theme === 'dark' ? 'one-dark-pro' : 'one-light';
            const language = normalizeLanguage(lang);
            
            try {
                return hl.codeToHtml(code, { 
                    lang: language, 
                    theme: themeName,
                });
            } catch {
                return `<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`;
            }
        },
    });

    // 自定义内联代码渲染
    md.renderer.rules.code_inline = (tokens, idx) => {
        const token = tokens[idx];
        const content = token.content;
        
        // 检测文件路径
        if (isFilePath(content)) {
            const { path, lineRange } = parseFilePathWithLine(content);
            const lineAttr = lineRange ? ` data-line-start="${lineRange[0]}" data-line-end="${lineRange[1]}"` : '';
            return `<code class="inline-code inline-code--filepath" data-filepath="${escapeAttr(path)}"${lineAttr}>${escapeHtml(content)}</code>`;
        }
        
        // 检测环境变量 (全大写+下划线)
        if (/^[A-Z][A-Z0-9_]+$/.test(content)) {
            return `<code class="inline-code inline-code--env">${escapeHtml(content)}</code>`;
        }
        
        // 检测命令
        if (/^(npm|pnpm|yarn|git|docker|kubectl|cargo|pip|brew)\s/.test(content)) {
            return `<code class="inline-code inline-code--command">${escapeHtml(content)}</code>`;
        }
        
        return `<code class="inline-code">${escapeHtml(content)}</code>`;
    };

    // 自定义代码块渲染 - 添加包装器和操作按钮
    const defaultFence = md.renderer.rules.fence!;
    md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx];
        const lang = token.info.trim().split(/\s+/)[0] || '';
        const code = token.content;
        
        // Mermaid 图表特殊处理
        if (lang === 'mermaid') {
            return `<div class="mermaid-placeholder" data-code="${escapeAttr(code)}"></div>`;
        }
        
        // 单行文件路径代码块
        if (!lang && !code.includes('\n') && isFilePath(code.trim())) {
            const { path, lineRange } = parseFilePathWithLine(code.trim());
            const lineAttr = lineRange ? ` data-line-start="${lineRange[0]}" data-line-end="${lineRange[1]}"` : '';
            return `<div class="file-path-block" data-filepath="${escapeAttr(path)}"${lineAttr}>${escapeHtml(code.trim())}</div>`;
        }
        
        // 获取语法高亮的 HTML
        const highlightedCode = defaultFence(tokens, idx, options, env, self);
        
        // 包装代码块
        const langBadge = lang
            ? `<span class="code-language-badge">${escapeHtml(lang.toLowerCase())}</span>`
            : '';
            
        return `
            <div class="vc-code-block" data-lang="${escapeAttr(lang)}" data-code="${escapeAttr(code)}">
                <div class="code-block-header">
                    ${langBadge}
                    <div class="code-block-actions">
                        <button class="code-action-btn" data-action="insert" title="插入到编辑器">
                            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M14 3H7V2h7a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H7v-1h7V3z"/><path d="M5.5 13H1.035l2.5-2.5-2.5-2.5H5.5V6.5H0v7h5.5V13z"/></svg>
                        </button>
                        <button class="code-action-btn" data-action="copy" title="复制代码">
                            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 4h8v8H4V4zm0-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H4z"/><path d="M2 2v9h1V3h8V2H2z"/></svg>
                        </button>
                    </div>
                </div>
                <div class="code-block-content">
                    ${highlightedCode}
                </div>
            </div>
        `.trim();
    };

    return md;
}

// ============ 工具函数 ============

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

/**
 * 属性值转义
 */
function escapeAttr(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * 标准化语言名称
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

async function processLargeCodeBlocks(html: string, theme: 'dark' | 'light' = 'dark'): Promise<string> {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    const largeCodeBlocks = tempDiv.querySelectorAll('pre[data-worker-highlight="true"]');
    
    const promises = Array.from(largeCodeBlocks).map(async (pre) => {
        const code = pre.textContent || '';
        const lang = pre.getAttribute('data-lang') || '';
        
        try {
            const highlighted = await highlightCodeAsync(code, lang, theme);
            const replacementDiv = document.createElement('div');
            replacementDiv.innerHTML = highlighted;
            pre.replaceWith(replacementDiv.firstElementChild || pre);
        } catch (error) {
            console.warn('[Markdown] Failed to highlight large code block:', error);
        }
    });
    
    await Promise.all(promises);
    return tempDiv.innerHTML;
}

/**
 * 预处理 markdown 内容
 */
function preprocessMarkdown(content: string): string {
    // 修复: `A` > `B` 模式中的 > 被误解析为 blockquote
    return content.replace(
        /(`[^`]+`)\s*>\s*(`[^`]+`)/g,
        '$1 &gt; $2'
    );
}

// ============ 主渲染函数 ============

// 缓存 markdown-it 实例
const mdCache = new Map<string, MarkdownIt>();

/**
 * 渲染 Markdown 为 HTML
 * @param content - Markdown 内容
 * @param theme - 主题 ('dark' | 'light')
 * @returns 安全的 HTML 字符串
 */
export function renderMarkdown(content: string, theme: 'dark' | 'light' = 'dark'): string {
    if (!content) return '';
    
    // 获取或创建 markdown-it 实例
    let md = mdCache.get(theme);
    if (!md) {
        md = createMarkdownIt(theme);
        mdCache.set(theme, md);
    }
    
    // 预处理
    const processed = preprocessMarkdown(content);
    
    // 渲染
    const rawHtml = md.render(processed);
    
    // XSS 防护
    const safeHtml = DOMPurify.sanitize(rawHtml, {
        ADD_TAGS: ['svg', 'path'],
        ADD_ATTR: ['data-filepath', 'data-line-start', 'data-line-end', 'data-code', 'data-lang', 'data-action', 'viewBox', 'fill', 'd'],
        ALLOW_DATA_ATTR: true,
    });
    
    return safeHtml;
}

export async function renderMarkdownAsync(content: string, theme: 'dark' | 'light' = 'dark'): Promise<string> {
    if (!content) return '';
    
    await getHighlighter();
    
    const baseHtml = renderMarkdown(content, theme);
    
    if (typeof window === 'undefined') {
        return baseHtml;
    }
    
    return await processLargeCodeBlocks(baseHtml, theme);
}

// ============ 导出 ============

export type { BundledLanguage };
