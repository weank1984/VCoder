/**
 * File Content Display Component
 * Displays file content with syntax highlighting and line numbers
 */

import { useMemo, useState } from 'react';
import { getFileExtension, detectLanguage } from '../../utils/pathUtils';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useThemeMode } from '../../hooks/useThemeMode';

interface FileContentDisplayProps {
    content: string;
    filePath?: string;
    startLine?: number;
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

export function FileContentDisplay({ content, filePath, startLine = 1 }: FileContentDisplayProps) {
    const cleanContent = useMemo(() => cleanLineNumbers(content), [content]);
    const ext = useMemo(() => filePath ? getFileExtension(filePath) : '', [filePath]);
    const language = useMemo(() => detectLanguage(ext), [ext]);
    const isMarkdown = useMemo(() => isMarkdownFile(filePath), [filePath]);
    const themeMode = useThemeMode();
    const syntaxTheme = themeMode === 'light' ? vs : vscDarkPlus;
	    
    const [viewMode, setViewMode] = useState<'code' | 'preview'>(isMarkdown ? 'preview' : 'code');
    
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
                    <div className="markdown-preview">
                        <div dangerouslySetInnerHTML={{ __html: cleanContent }} />
                    </div>
	                ) : (
	                    <SyntaxHighlighter
	                        style={syntaxTheme}
	                        language={language}
	                        showLineNumbers
	                        startingLineNumber={startLine}
	                        wrapLines
	                        customStyle={{ margin: 0 }}
	                    >
	                        {cleanContent}
	                    </SyntaxHighlighter>
	                )}
            </div>
        );
    }
    
    // For other files, show syntax highlighted code
	    return (
	        <div className="file-content-display">
	            <SyntaxHighlighter
	                style={syntaxTheme}
	                language={language}
	                showLineNumbers
	                startingLineNumber={startLine}
	                wrapLines
	                customStyle={{ margin: 0 }}
	            >
	                {cleanContent}
	            </SyntaxHighlighter>
	        </div>
	    );
}
