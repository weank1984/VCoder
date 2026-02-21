/**
 * FilePath Component
 * Shared component for displaying clickable file/directory paths
 * Used across: MarkdownContent, ToolResultDisplay, SmartToolInput
 */

import { useCallback } from 'react';
import { postMessage } from '../../utils/vscode';
import { FileIcon, FolderIcon } from '../Icon';
import './index.scss';

export interface FilePathProps {
    /** File or directory path */
    path: string;
    /** Optional line range to jump to [startLine, endLine] */
    lineRange?: [number, number];
    /** Display variant */
    variant?: 'inline' | 'block' | 'compact';
    /** Show file/folder icon */
    showIcon?: boolean;
    /** Custom class name */
    className?: string;
    /** Click handler override (if not provided, uses default openFile behavior) */
    onClick?: (path: string) => void;
}

// Common file extensions for heuristic path detection
const COMMON_EXTENSIONS = new Set([
    'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'md', 'mdx',
    'py', 'pyw', 'pyi', 'go', 'rs', 'java', 'kt', 'kts', 'scala',
    'c', 'cpp', 'cc', 'cxx', 'h', 'hpp', 'hxx', 'cs', 'fs',
    'rb', 'php', 'swift', 'm', 'mm', 'pl', 'pm', 'lua',
    'html', 'htm', 'css', 'scss', 'sass', 'less', 'styl',
    'vue', 'svelte', 'astro', 'jsx', 'tsx',
    'yaml', 'yml', 'toml', 'xml', 'ini', 'cfg', 'conf',
    'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
    'txt', 'log', 'env', 'gitignore', 'dockerignore',
    'sql', 'graphql', 'gql', 'proto', 'thrift',
    'lock', 'sum', 'mod', 'gradle', 'cmake',
    'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp',
    'woff', 'woff2', 'ttf', 'eot', 'otf',
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
]);

/**
 * Check if text looks like a file path (not directory)
 * Uses heuristic rules to detect file paths in various formats:
 * - Absolute Unix paths: /Users/xxx/file.ts
 * - Absolute Windows paths: C:\Users\xxx\file.ts
 * - Relative paths: ./src/App.tsx, ../package.json
 * - Project paths with extensions: src/components/Button.tsx
 * - Paths with line numbers: file.py:14, file.py:14-20
 * 
 * NOTE: Only matches files (must have extension), not directories
 */
export function isFilePath(text: string): boolean {
    const trimmed = text.trim();
    
    // Basic exclusion checks
    if (trimmed.includes('\n')) return false;
    if (trimmed.length > 300 || trimmed.length < 2) return false;
    if (!trimmed.includes('/') && !trimmed.includes('\\')) return false;
    
    // Exclude URLs
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return false;
    
    // Remove optional line number suffix for validation
    const pathWithoutLine = trimmed.replace(/:\d+(-\d+)?$/, '');
    
    // Exclude directories (paths ending with / or \)
    if (pathWithoutLine.endsWith('/') || pathWithoutLine.endsWith('\\')) return false;
    
    // Must have a file extension
    const extMatch = pathWithoutLine.match(/\.([a-zA-Z0-9]+)$/);
    if (!extMatch) return false;
    
    const hasKnownExtension = COMMON_EXTENSIONS.has(extMatch[1].toLowerCase());
    
    // 1. Absolute Unix path (starts with /)
    if (pathWithoutLine.startsWith('/')) {
        if (pathWithoutLine === '/') return false;
        // Valid Unix path: no spaces, no invalid chars, must have extension
        return /^\/[^\s<>"|?*\0]+\.[a-zA-Z0-9]+$/.test(pathWithoutLine);
    }
    
    // 2. Absolute Windows path (C:\ or C:/)
    if (/^[A-Za-z]:[\\/]/.test(pathWithoutLine)) {
        return /^[A-Za-z]:[\\/][^\s<>"|?*\0]*\.[a-zA-Z0-9]+$/.test(pathWithoutLine);
    }
    
    // 3. Relative path starting with ./ or ../
    if (/^\.\.?[\\/]/.test(pathWithoutLine)) {
        return /^\.\.?[\\/][^\s<>"|?*\0]+\.[a-zA-Z0-9]+$/.test(pathWithoutLine);
    }
    
    // 4. Other cases: require known file extension
    if (!hasKnownExtension) return false;
    
    // No spaces allowed in implicit paths
    if (pathWithoutLine.includes(' ')) return false;
    
    // Validate characters: allow word chars, dots, dashes, underscores, @, path separators
    // Also allow some unicode for international filenames
    if (!/^[\w\u4e00-\u9fff\u00C0-\u024F\-_.@/\\]+$/.test(pathWithoutLine)) return false;
    
    return true;
}

/**
 * Parse file path with optional line number
 * Input: "file.py:14" or "file.py:14-20" or "file.py"
 * Output: { path: "file.py", lineRange?: [14, 14] or [14, 20] }
 */
export function parseFilePathWithLine(text: string): { 
    path: string; 
    lineRange?: [number, number];
} {
    const trimmed = text.trim();
    
    // Match path:line or path:start-end or path:line:col
    const match = trimmed.match(/^(.+?):(\d+)(?:-(\d+)|:(\d+))?$/);
    
    if (match) {
        const path = match[1];
        const startLine = parseInt(match[2], 10);
        const endLine = match[3] ? parseInt(match[3], 10) : startLine;
        // Ignore column number (match[4]) for now
        
        return {
            path,
            lineRange: [startLine, endLine],
        };
    }
    
    return { path: trimmed };
}

/**
 * Check if path is a directory (ends with /)
 */
export function isDirectory(path: string): boolean {
    return path.trim().endsWith('/') || path.trim().endsWith('\\');
}

/**
 * Extract file name from path
 */
export function getFileName(path: string): string {
    const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
    return parts[parts.length - 1] || path;
}

/**
 * Extract directory path from file path
 */
export function getDirPath(path: string): string {
    const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
    parts.pop();
    return parts.join('/');
}

/**
 * Shared FilePath component for displaying clickable file paths
 */
export function FilePath({
    path,
    lineRange: externalLineRange,
    variant = 'inline',
    showIcon = true,
    className = '',
    onClick,
}: FilePathProps) {
    // Parse path with optional embedded line number (e.g., "file.py:14")
    const parsed = parseFilePathWithLine(path.trim());
    const actualPath = parsed.path;
    // External lineRange takes precedence over parsed lineRange
    const lineRange = externalLineRange || parsed.lineRange;
    
    const isDir = isDirectory(actualPath);
    const canClick = !isDir; // Directories can't be "opened"
    
    const handleClick = useCallback(() => {
        if (!canClick) return;
        
        if (onClick) {
            onClick(actualPath);
        } else {
            postMessage({
                type: 'openFile',
                path: actualPath,
                lineRange,
            });
        }
    }, [actualPath, lineRange, onClick, canClick]);
    
    const variantClass = `file-path--${variant}`;
    const typeClass = isDir ? 'file-path--directory' : 'file-path--file';
    const clickableClass = canClick ? 'file-path--clickable' : '';
    
    // Display the original path (including line number if present)
    const displayPath = path.trim();
    
    return (
        <span 
            className={`file-path ${variantClass} ${typeClass} ${clickableClass} ${className}`.trim()}
            onClick={canClick ? handleClick : undefined}
            title={canClick ? `点击打开 ${actualPath}${lineRange ? `:${lineRange[0]}` : ''}` : displayPath}
        >
            {showIcon && (
                <span className="file-path__icon">
                    {isDir ? <FolderIcon /> : <FileIcon />}
                </span>
            )}
            <span className="file-path__text">{displayPath}</span>
        </span>
    );
}

/**
 * File path for use in file lists (with file name highlighted)
 */
export function FilePathWithDetails({
    path,
    lineRange: externalLineRange,
    showIcon = true,
    className = '',
}: Omit<FilePathProps, 'variant'>) {
    // Parse path with optional embedded line number
    const parsed = parseFilePathWithLine(path.trim());
    const actualPath = parsed.path;
    const lineRange = externalLineRange || parsed.lineRange;
    
    const isDir = isDirectory(actualPath);
    const fileName = getFileName(actualPath);
    const dirPath = getDirPath(actualPath);
    const canClick = !isDir;
    
    const handleClick = useCallback(() => {
        if (!canClick) return;
        postMessage({
            type: 'openFile',
            path: actualPath,
            lineRange,
        });
    }, [actualPath, lineRange, canClick]);
    
    return (
        <span 
            className={`file-path-details ${canClick ? 'file-path-details--clickable' : ''} ${className}`.trim()}
            onClick={canClick ? handleClick : undefined}
            title={canClick ? `点击打开 ${actualPath}${lineRange ? `:${lineRange[0]}` : ''}` : actualPath}
        >
            {showIcon && (
                <span className="file-path-details__icon">
                    {isDir ? <FolderIcon /> : <FileIcon />}
                </span>
            )}
            <span className="file-path-details__info">
                <span className="file-path-details__name">{fileName}</span>
                {dirPath && (
                    <span className="file-path-details__dir">{dirPath}</span>
                )}
            </span>
            {lineRange && (
                <span className="file-path-details__range">
                    L{lineRange[0]}{lineRange[1] !== lineRange[0] ? `-${lineRange[1]}` : ''}
                </span>
            )}
        </span>
    );
}

export default FilePath;
