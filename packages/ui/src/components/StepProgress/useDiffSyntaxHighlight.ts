import { useMemo } from 'react';
import type { ThemedToken } from 'shiki';
import { getHighlighterSync, normalizeLanguage } from '../../lib/markdown';
import { isDiffLine } from './diffUtils';
import type { DiffItem, EnhancedDiffLine } from './diffUtils';

/**
 * Extract file extension from a path and map to a Shiki language.
 */
function getLanguageFromPath(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    // Map common extensions to language IDs
    const extMap: Record<string, string> = {
        'ts': 'typescript',
        'tsx': 'tsx',
        'js': 'javascript',
        'jsx': 'jsx',
        'py': 'python',
        'rb': 'ruby',
        'rs': 'rust',
        'go': 'go',
        'java': 'java',
        'c': 'c',
        'h': 'c',
        'cpp': 'cpp',
        'cc': 'cpp',
        'cxx': 'cpp',
        'hpp': 'cpp',
        'cs': 'csharp',
        'html': 'html',
        'htm': 'html',
        'css': 'css',
        'scss': 'scss',
        'sass': 'scss',
        'less': 'css',
        'json': 'json',
        'yaml': 'yaml',
        'yml': 'yaml',
        'md': 'markdown',
        'sh': 'bash',
        'bash': 'bash',
        'zsh': 'bash',
        'sql': 'sql',
        'graphql': 'graphql',
        'gql': 'graphql',
        'dockerfile': 'dockerfile',
        'toml': 'toml',
        'xml': 'xml',
        'svg': 'xml',
        'vue': 'vue',
        'svelte': 'svelte',
        'php': 'php',
        'swift': 'swift',
        'kt': 'kotlin',
        'scala': 'scala',
    };
    return extMap[ext] || ext;
}

/**
 * Detect current theme from VS Code CSS variables.
 */
function detectTheme(): 'one-dark-pro' | 'one-light' {
    if (typeof document === 'undefined') return 'one-dark-pro';
    const body = document.body;
    // VS Code sets data-vscode-theme-kind on <body>
    const kind = body.getAttribute('data-vscode-theme-kind');
    if (kind === 'vscode-light' || kind === 'vscode-high-contrast-light') {
        return 'one-light';
    }
    return 'one-dark-pro';
}

/**
 * Hook that provides syntax highlighting tokens for diff lines.
 * Returns a sparse record mapping item index → ThemedToken[] for EnhancedDiffLine items.
 * Returns null if the highlighter isn't ready.
 */
export function useDiffSyntaxHighlight(
    items: DiffItem[],
    filePath: string,
): Record<number, ThemedToken[]> | null {
    return useMemo(() => {
        const hl = getHighlighterSync();
        if (!hl) return null;

        const rawLang = getLanguageFromPath(filePath);
        if (!rawLang || rawLang === 'text') return null;

        const lang = normalizeLanguage(rawLang);
        const theme = detectTheme();
        const result: Record<number, ThemedToken[]> = {};

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!isDiffLine(item)) continue;

            const line = item as EnhancedDiffLine;
            if (!line.content) continue;

            try {
                const tokens = hl.codeToTokensBase(line.content, {
                    lang,
                    theme,
                });
                // codeToTokensBase returns ThemedToken[][] (one array per line),
                // since we pass a single line, take the first
                if (tokens.length > 0) {
                    result[i] = tokens[0];
                }
            } catch {
                // Language not loaded or other error — skip silently
            }
        }

        return result;
    }, [items, filePath]);
}
