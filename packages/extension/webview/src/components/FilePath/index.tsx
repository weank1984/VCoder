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

/**
 * Check if text looks like a file/directory path
 * Matches patterns like:
 * - src/services/pr-agent/
 * - pr_agent/settings/pr_reviewer_prompts.toml
 * - ./config.json
 * - ../parent/file.ts
 * - file.py:14 (with line number)
 * - file.py:14-20 (with line range)
 * - file.py:14:5 (with line and column)
 */
export function isFilePath(text: string): boolean {
    const trimmed = text.trim();
    // Must be single line
    if (trimmed.includes('\n')) return false;
    // Must contain path separator
    if (!trimmed.includes('/') && !trimmed.includes('\\')) return false;
    // Should not be too long (likely not just a path)
    if (trimmed.length > 200) return false;
    // Should not contain spaces (unless escaped) - paths usually don't have spaces
    if (trimmed.includes(' ') && !trimmed.includes('\\ ')) return false;
    // Match common path patterns (with optional line number suffix like :14 or :14-20 or :14:5)
    const pathPattern = /^\.{0,2}[\/\\]?[\w\-_.@]+([\/\\][\w\-_.@]*)*(:\d+(-\d+)?(:\d+)?)?[\/\\]?$/;
    return pathPattern.test(trimmed);
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
