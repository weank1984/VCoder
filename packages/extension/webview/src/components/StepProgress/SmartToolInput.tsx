/**
 * Smart Tool Input Display Component
 * Provides specialized rendering for different tool input types
 */

import { useMemo } from 'react';
import { formatPath, getFileName, getDirPath } from '../../utils/pathUtils';
import { FileIcon, TerminalIcon, SearchIcon, CopyIcon } from '../Icon';

interface SmartToolInputProps {
    input: unknown;
    toolName: string;
}

/**
 * Safe stringify for JSON display
 */
function safeStringify(value: unknown, pretty = true): string {
    if (value === undefined) return '';
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value, null, pretty ? 2 : 0);
    } catch {
        return String(value);
    }
}

/**
 * Copy to clipboard helper
 */
function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).catch(err => {
        console.error('Failed to copy:', err);
    });
}

/**
 * File Read Tool Input Display
 */
function ReadToolInput({ input }: { input: Record<string, unknown> }) {
    const filePath = String(input.file_path || input.target_file || '');
    const offset = input.offset as number | undefined;
    const limit = input.limit as number | undefined;
    
    const fileName = getFileName(filePath);
    const dirPath = getDirPath(filePath);
    
    return (
        <div className="input-file-read">
            <FileIcon />
            <div className="file-info">
                <span className="file-name">{fileName}</span>
                <span className="file-dir" title={filePath}>{formatPath(dirPath, 30, 2)}</span>
            </div>
            {(offset !== undefined || limit !== undefined) && (
                <span className="line-range">
                    L{offset || 1}-{(offset || 0) + (limit || 0)}
                </span>
            )}
        </div>
    );
}

/**
 * Command Execution Tool Input Display
 */
function CommandInput({ input }: { input: Record<string, unknown> }) {
    const command = String(input.command || '');
    
    return (
        <div className="command-input">
            <TerminalIcon />
            <code className="command-text">{command}</code>
            <button 
                className="copy-btn" 
                onClick={(e) => {
                    e.stopPropagation();
                    copyToClipboard(command);
                }}
                title="复制命令"
            >
                <CopyIcon />
            </button>
        </div>
    );
}

/**
 * Search Tool Input Display
 */
function SearchInput({ input }: { input: Record<string, unknown> }) {
    const pattern = String(input.pattern || input.query || '');
    const path = input.path as string | undefined;
    
    return (
        <div className="search-input">
            <SearchIcon />
            <code className="search-pattern">{pattern}</code>
            {path && <span className="search-scope">in {formatPath(path, 25, 2)}</span>}
        </div>
    );
}

/**
 * File Write/Edit Tool Input Display
 */
function WriteToolInput({ input }: { input: Record<string, unknown> }) {
    const filePath = String(input.file_path || input.target_file || '');
    const fileName = getFileName(filePath);
    const dirPath = getDirPath(filePath);
    
    return (
        <div className="input-file-write">
            <FileIcon />
            <div className="file-info">
                <span className="file-name">{fileName}</span>
                <span className="file-dir" title={filePath}>{formatPath(dirPath, 30, 2)}</span>
            </div>
        </div>
    );
}

/**
 * Main Smart Tool Input Component
 */
export function SmartToolInput({ input, toolName }: SmartToolInputProps) {
    // Determine if we should use specialized rendering
    const shouldUseSpecializedView = useMemo(() => {
        if (!input || typeof input !== 'object') return false;
        
        const inputObj = input as Record<string, unknown>;
        
        // File read operations
        if (toolName === 'Read' || toolName === 'read_file') {
            return !!(inputObj.file_path || inputObj.target_file);
        }
        
        // Command execution
        if (toolName === 'Bash' || toolName === 'run_command' || toolName === 'run_terminal_cmd') {
            return !!inputObj.command;
        }
        
        // Search operations
        if (toolName === 'Grep' || toolName === 'codebase_search' || toolName === 'grep_search') {
            return !!(inputObj.pattern || inputObj.query);
        }
        
        // File write/edit operations
        if (toolName === 'Write' || toolName === 'write' || toolName === 'search_replace') {
            return !!(inputObj.file_path || inputObj.target_file);
        }
        
        return false;
    }, [input, toolName]);
    
    // If not an object, show as plain text
    if (!input || typeof input !== 'object') {
        return (
            <div className="input-simple">
                <pre>{safeStringify(input, false)}</pre>
            </div>
        );
    }
    
    const inputObj = input as Record<string, unknown>;
    
    // Use specialized views
    if (shouldUseSpecializedView) {
        // File read
        if (toolName === 'Read' || toolName === 'read_file') {
            return <ReadToolInput input={inputObj} />;
        }
        
        // Command execution
        if (toolName === 'Bash' || toolName === 'run_command' || toolName === 'run_terminal_cmd') {
            return <CommandInput input={inputObj} />;
        }
        
        // Search
        if (toolName === 'Grep' || toolName === 'codebase_search' || toolName === 'grep_search') {
            return <SearchInput input={inputObj} />;
        }
        
        // File write/edit
        if (toolName === 'Write' || toolName === 'write' || toolName === 'search_replace') {
            return <WriteToolInput input={inputObj} />;
        }
    }
    
    // Fallback to JSON display
    return (
        <div className="input-json">
            <pre>{safeStringify(input, true)}</pre>
        </div>
    );
}
