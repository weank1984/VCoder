/**
 * Smart Tool Input Display Component
 * Provides specialized rendering for different tool input types
 */

import { useMemo } from 'react';
import { formatPath } from '../../utils/pathUtils';
import { safeStringify } from '../../utils/formatUtils';
import { copyToClipboard } from '../../utils/clipboard';
import { TerminalIcon, SearchIcon, CopyIcon } from '../Icon';
import { FilePathWithDetails } from '../FilePath';

interface SmartToolInputProps {
    input: unknown;
    toolName: string;
}

/**
 * File Read Tool Input Display
 */
function ReadToolInput({ input }: { input: Record<string, unknown> }) {
    const filePath = String(input.file_path || input.target_file || '');
    const offset = input.offset as number | undefined;
    const limit = input.limit as number | undefined;
    
    const lineRange: [number, number] | undefined = offset 
        ? [offset, (offset || 0) + (limit || 0)] 
        : undefined;
    
    return (
        <FilePathWithDetails 
            path={filePath}
            lineRange={lineRange}
            className="input-file-read"
        />
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
    
    return (
        <FilePathWithDetails 
            path={filePath}
            className="input-file-write"
        />
    );
}

type InputViewType = 'read' | 'command' | 'search' | 'write' | 'plain' | 'json';

function resolveViewType(input: unknown, toolName: string): InputViewType {
    if (!input || typeof input !== 'object') return 'plain';

    const obj = input as Record<string, unknown>;

    if ((toolName === 'Read' || toolName === 'read_file') && (obj.file_path || obj.target_file)) {
        return 'read';
    }
    if ((toolName === 'Bash' || toolName === 'run_command' || toolName === 'run_terminal_cmd') && obj.command) {
        return 'command';
    }
    if ((toolName === 'Grep' || toolName === 'codebase_search' || toolName === 'grep_search') && (obj.pattern || obj.query)) {
        return 'search';
    }
    if ((toolName === 'Write' || toolName === 'write' || toolName === 'search_replace') && (obj.file_path || obj.target_file)) {
        return 'write';
    }

    return 'json';
}

/**
 * Main Smart Tool Input Component
 */
export function SmartToolInput({ input, toolName }: SmartToolInputProps) {
    const viewType = useMemo(() => resolveViewType(input, toolName), [input, toolName]);

    if (viewType === 'plain') {
        return (
            <div className="input-simple">
                <pre>{safeStringify(input, false)}</pre>
            </div>
        );
    }

    const inputObj = input as Record<string, unknown>;

    switch (viewType) {
        case 'read':
            return <ReadToolInput input={inputObj} />;
        case 'command':
            return <CommandInput input={inputObj} />;
        case 'search':
            return <SearchInput input={inputObj} />;
        case 'write':
            return <WriteToolInput input={inputObj} />;
        default:
            return (
                <div className="input-json">
                    <pre>{safeStringify(input, true)}</pre>
                </div>
            );
    }
}
