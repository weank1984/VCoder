import { createHighlighter, type BundledLanguage } from 'shiki';

let highlighter: any = null;

async function initHighlighter() {
    try {
        highlighter = await createHighlighter({
            themes: ['one-light', 'one-dark-pro'],
            langs: ['typescript', 'javascript', 'tsx', 'jsx', 'python', 'java', 'go', 'rust', 'c', 'cpp', 'html', 'css', 'scss', 'json', 'yaml', 'bash', 'shell', 'powershell', 'sql', 'graphql', 'markdown', 'diff', 'dockerfile'] as BundledLanguage[],
        });
    } catch (error) {
        console.error('[HighlightWorker] Failed to initialize highlighter:', error);
    }
}

function normalizeLanguage(lang: string): string {
    const normalized = lang.toLowerCase();
    
    if (normalized === 'js') return 'javascript';
    if (normalized === 'ts') return 'typescript';
    if (normalized === 'jsx') return 'jsx';
    if (normalized === 'tsx') return 'tsx';
    if (normalized === 'py') return 'python';
    if (normalized === 'sh' || normalized === 'shellscript') return 'shell';
    if (normalized === 'dockerfile') return 'dockerfile';
    
    return normalized;
}

async function highlightCode(code: string, language: string, theme: 'light' | 'dark'): Promise<string> {
    if (!highlighter) {
        return `<pre class="shiki-pending"><code>${escapeHtml(code)}</code></pre>`;
    }
    
    const themeName = theme === 'dark' ? 'one-dark-pro' : 'one-light';
    const normalizedLang = normalizeLanguage(language);
    
    try {
        return highlighter.codeToHtml(code, { 
            lang: normalizedLang, 
            theme: themeName,
        });
    } catch (error) {
        console.error('[HighlightWorker] Highlighting failed:', error);
        return `<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`;
    }
}

function escapeHtml(text: string): string {
    const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m] || m);
}

self.addEventListener('message', async (event) => {
    const { type, data, messageId } = event.data;
    
    try {
        switch (type) {
            case 'init':
                await initHighlighter();
                self.postMessage({ type: 'init-complete', messageId });
                break;
                
            case 'highlight':
                const { code, language, theme } = data;
                const result = await highlightCode(code, language, theme);
                self.postMessage({ type: 'highlight-complete', messageId, result });
                break;
                
            default:
                console.warn('[HighlightWorker] Unknown message type:', type);
        }
    } catch (error) {
        console.error('[HighlightWorker] Error processing message:', error);
        self.postMessage({ 
            type: 'error', 
            messageId, 
            error: error instanceof Error ? error.message : String(error) 
        });
    }
});