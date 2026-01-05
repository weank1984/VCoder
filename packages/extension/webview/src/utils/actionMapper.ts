/**
 * Action Mapper - Maps tool names to semantic actions and types
 * Used by Step Progress View for human-readable action labels
 */

import type { ToolCall } from '../types';

/** Entry type categories */
export type StepEntryType = 'file' | 'command' | 'search' | 'browser' | 'task' | 'other';

/** Action mapping result */
export interface ActionInfo {
    /** i18n key for action label (e.g., 'StepProgress.Analyzed') */
    actionKey: string;
    /** Entry type for icon selection */
    type: StepEntryType;
}

/** Target extraction result */
export interface TargetInfo {
    /** Display name (filename or command summary) */
    name: string;
    /** Full path for tooltip/navigation */
    fullPath?: string;
    /** Line range [start, end] if available */
    lineRange?: [number, number];
}

/**
 * Action mapping table: tool name -> action info
 */
const ACTION_MAP: Record<string, ActionInfo> = {
    // File operations
    'read_file': { actionKey: 'StepProgress.Analyzed', type: 'file' },
    'view_file': { actionKey: 'StepProgress.Analyzed', type: 'file' },
    'view_file_outline': { actionKey: 'StepProgress.Explored', type: 'file' },
    'write_to_file': { actionKey: 'StepProgress.Created', type: 'file' },
    'replace_file_content': { actionKey: 'StepProgress.Edited', type: 'file' },
    'multi_replace_file_content': { actionKey: 'StepProgress.Edited', type: 'file' },
    'Read': { actionKey: 'StepProgress.Analyzed', type: 'file' },
    'Write': { actionKey: 'StepProgress.Created', type: 'file' },
    'Edit': { actionKey: 'StepProgress.Edited', type: 'file' },
    
    // Search
    'grep_search': { actionKey: 'StepProgress.Searched', type: 'search' },
    'find_by_name': { actionKey: 'StepProgress.Located', type: 'search' },
    'codebase_search': { actionKey: 'StepProgress.Searched', type: 'search' },
    
    // Commands
    'run_command': { actionKey: 'StepProgress.Executed', type: 'command' },
    'Bash': { actionKey: 'StepProgress.Executed', type: 'command' },
    'command_status': { actionKey: 'StepProgress.Checked', type: 'command' },
    'send_command_input': { actionKey: 'StepProgress.Executed', type: 'command' },
    
    // Browser
    'browser_subagent': { actionKey: 'StepProgress.Browsed', type: 'browser' },
    'read_url_content': { actionKey: 'StepProgress.Fetched', type: 'browser' },
    'read_browser_page': { actionKey: 'StepProgress.Browsed', type: 'browser' },
    
    // Task/Planning
    'task_boundary': { actionKey: 'StepProgress.Planned', type: 'task' },
    'notify_user': { actionKey: 'StepProgress.Notified', type: 'other' },
    
    // Image/Media
    'generate_image': { actionKey: 'StepProgress.Generated', type: 'other' },
    
    // List/View
    'list_dir': { actionKey: 'StepProgress.Listed', type: 'file' },
    'view_code_item': { actionKey: 'StepProgress.Analyzed', type: 'file' },
};

/**
 * Get action info for a tool name
 */
export function getActionInfo(toolName: string): ActionInfo {
    return ACTION_MAP[toolName] ?? { actionKey: 'StepProgress.Invoked', type: 'other' };
}

/**
 * Extract target info from tool call input
 */
export function extractTargetInfo(toolCall: ToolCall): TargetInfo {
    const input = toolCall.input;
    if (!input || typeof input !== 'object') {
        return { name: toolCall.name };
    }
    
    const obj = input as Record<string, unknown>;
    const name = toolCall.name;
    
    // File operations - extract path and line range
    if (name === 'read_file' || name === 'view_file' || name === 'view_file_outline' || 
        name === 'Read' || name === 'list_dir' || name === 'view_code_item') {
        const path = (obj.AbsolutePath ?? obj.path ?? obj.File) as string | undefined;
        if (path) {
            const startLine = obj.StartLine as number | undefined;
            const endLine = obj.EndLine as number | undefined;
            return {
                name: extractFileName(path),
                fullPath: path,
                lineRange: startLine && endLine ? [startLine, endLine] : undefined,
            };
        }
    }
    
    // Write/Edit operations
    if (name === 'write_to_file' || name === 'replace_file_content' || 
        name === 'multi_replace_file_content' || name === 'Write' || name === 'Edit') {
        const path = (obj.TargetFile ?? obj.path) as string | undefined;
        if (path) {
            const startLine = obj.StartLine as number | undefined;
            const endLine = obj.EndLine as number | undefined;
            return {
                name: extractFileName(path),
                fullPath: path,
                lineRange: startLine && endLine ? [startLine, endLine] : undefined,
            };
        }
    }
    
    // Command operations
    if (name === 'run_command' || name === 'Bash') {
        const command = (obj.CommandLine ?? obj.command) as string | undefined;
        if (command) {
            return {
                name: truncateCommand(command),
                fullPath: command,
            };
        }
    }
    
    // Search operations
    if (name === 'grep_search' || name === 'find_by_name' || name === 'codebase_search') {
        const query = (obj.Query ?? obj.Pattern ?? obj.query) as string | undefined;
        if (query) {
            return {
                name: query.length > 40 ? query.slice(0, 40) + '...' : query,
                fullPath: query,
            };
        }
    }
    
    // Browser operations
    if (name === 'read_url_content' || name === 'read_browser_page') {
        const url = obj.Url as string | undefined;
        if (url) {
            return {
                name: extractDomain(url),
                fullPath: url,
            };
        }
    }
    
    // Task boundary
    if (name === 'task_boundary') {
        const taskName = obj.TaskName as string | undefined;
        const taskStatus = obj.TaskStatus as string | undefined;
        return {
            name: taskName ?? taskStatus ?? 'Task',
        };
    }
    
    // Fallback
    return { name: toolCall.name };
}

/**
 * Extract filename from path
 */
function extractFileName(path: string): string {
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1] || path;
}

/**
 * Truncate command for display
 */
function truncateCommand(command: string): string {
    const maxLen = 50;
    const singleLine = command.replace(/\n/g, ' ').trim();
    if (singleLine.length <= maxLen) return singleLine;
    return singleLine.slice(0, maxLen) + '...';
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
    try {
        const parsed = new URL(url);
        return parsed.hostname;
    } catch {
        return url.slice(0, 30) + (url.length > 30 ? '...' : '');
    }
}

/**
 * Get file extension for icon mapping
 */
export function getFileExtension(filename: string): string {
    const match = filename.match(/\.([^.]+)$/);
    return match ? `.${match[1].toLowerCase()}` : '';
}

/**
 * Check if the tool is a task boundary (used for step separation)
 */
export function isTaskBoundary(toolName: string): boolean {
    return toolName === 'task_boundary';
}
