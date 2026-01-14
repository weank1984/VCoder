/**
 * Action Mapper - Maps tool names to semantic actions and types
 * Used by Step Progress View for human-readable action labels
 * 
 * Covers all Claude Code CLI built-in tools:
 * - File: Read, Write, Edit, NotebookEdit
 * - Search: Glob, Grep
 * - Command: Bash, BashOutput, KillShell
 * - Web: WebSearch
 * - Agent: Task
 * - Planning: TodoWrite, ExitPlanMode
 * - Extensions: Skill, SlashCommand
 * - MCP: mcp__<server>__<tool>
 */

import type { ToolCall } from '../types';

/** Entry type categories */
export type StepEntryType = 
    | 'file'      // File operations
    | 'command'   // Shell commands
    | 'search'    // Search operations
    | 'browser'   // Web/browser
    | 'task'      // Sub-agent/task
    | 'plan'      // Planning/TODO
    | 'mcp'       // MCP tools
    | 'notebook'  // Notebook operations
    | 'other';    // Other tools

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
    /** Sub-agent type for Task tools */
    subagentType?: string;
}

/**
 * Action mapping table: tool name -> action info
 * Complete mapping for all Claude Code CLI tools
 */
const ACTION_MAP: Record<string, ActionInfo> = {
    // ========== File Operations ==========
    'Read': { actionKey: 'StepProgress.Analyzed', type: 'file' },
    'read_file': { actionKey: 'StepProgress.Analyzed', type: 'file' },
    'view_file': { actionKey: 'StepProgress.Analyzed', type: 'file' },
    'view_file_outline': { actionKey: 'StepProgress.Explored', type: 'file' },
    'view_code_item': { actionKey: 'StepProgress.Analyzed', type: 'file' },
    
    'Write': { actionKey: 'StepProgress.Created', type: 'file' },
    'write_to_file': { actionKey: 'StepProgress.Created', type: 'file' },
    
    'Edit': { actionKey: 'StepProgress.Edited', type: 'file' },
    'replace_file_content': { actionKey: 'StepProgress.Edited', type: 'file' },
    'multi_replace_file_content': { actionKey: 'StepProgress.Edited', type: 'file' },
    
    'list_dir': { actionKey: 'StepProgress.Listed', type: 'file' },
    
    // ========== Notebook Operations ==========
    'NotebookEdit': { actionKey: 'StepProgress.Edited', type: 'notebook' },
    
    // ========== Search Operations ==========
    'Glob': { actionKey: 'StepProgress.Located', type: 'search' },
    'Grep': { actionKey: 'StepProgress.Searched', type: 'search' },
    'grep_search': { actionKey: 'StepProgress.Searched', type: 'search' },
    'find_by_name': { actionKey: 'StepProgress.Located', type: 'search' },
    'codebase_search': { actionKey: 'StepProgress.Searched', type: 'search' },
    
    // ========== Shell Commands ==========
    'Bash': { actionKey: 'StepProgress.Executed', type: 'command' },
    'run_command': { actionKey: 'StepProgress.Executed', type: 'command' },
    'BashOutput': { actionKey: 'StepProgress.Fetched', type: 'command' },
    'KillShell': { actionKey: 'StepProgress.Stopped', type: 'command' },
    'command_status': { actionKey: 'StepProgress.Checked', type: 'command' },
    'send_command_input': { actionKey: 'StepProgress.Executed', type: 'command' },
    
    // ========== Web/Browser Operations ==========
    'WebSearch': { actionKey: 'StepProgress.Searched', type: 'browser' },
    'browser_subagent': { actionKey: 'StepProgress.Browsed', type: 'browser' },
    'read_url_content': { actionKey: 'StepProgress.Fetched', type: 'browser' },
    'read_browser_page': { actionKey: 'StepProgress.Browsed', type: 'browser' },
    
    // ========== Sub-agent/Task Operations ==========
    'Task': { actionKey: 'StepProgress.Delegated', type: 'task' },
    'task_boundary': { actionKey: 'StepProgress.Planned', type: 'task' },
    
    // ========== Planning/TODO Operations ==========
    'TodoWrite': { actionKey: 'StepProgress.Planned', type: 'plan' },
    'ExitPlanMode': { actionKey: 'StepProgress.Planned', type: 'plan' },
    
    // ========== Extension Tools ==========
    'Skill': { actionKey: 'StepProgress.Invoked', type: 'other' },
    'SlashCommand': { actionKey: 'StepProgress.Invoked', type: 'other' },
    
    // ========== Other Tools ==========
    'notify_user': { actionKey: 'StepProgress.Notified', type: 'other' },
    'generate_image': { actionKey: 'StepProgress.Generated', type: 'other' },
};

/**
 * Get action info for MCP tools
 * Format: mcp__<server>__<tool>
 */
function getMcpActionInfo(toolName: string): ActionInfo {
    const parts = toolName.split('__');
    if (parts.length < 3) return { actionKey: 'StepProgress.Invoked', type: 'mcp' };
    
    const tool = parts.slice(2).join('__').toLowerCase();
    
    // Infer action from tool name keywords
    if (tool.includes('read') || tool.includes('get') || tool.includes('fetch')) {
        return { actionKey: 'StepProgress.Fetched', type: 'mcp' };
    }
    if (tool.includes('write') || tool.includes('create') || tool.includes('post')) {
        return { actionKey: 'StepProgress.Created', type: 'mcp' };
    }
    if (tool.includes('search') || tool.includes('query') || tool.includes('find')) {
        return { actionKey: 'StepProgress.Searched', type: 'mcp' };
    }
    if (tool.includes('analyze') || tool.includes('process')) {
        return { actionKey: 'StepProgress.Analyzed', type: 'mcp' };
    }
    if (tool.includes('edit') || tool.includes('update') || tool.includes('modify')) {
        return { actionKey: 'StepProgress.Edited', type: 'mcp' };
    }
    if (tool.includes('delete') || tool.includes('remove')) {
        return { actionKey: 'StepProgress.Deleted', type: 'mcp' };
    }
    
    return { actionKey: 'StepProgress.Invoked', type: 'mcp' };
}

/**
 * Get action info for a tool name
 */
export function getActionInfo(toolName: string): ActionInfo {
    // Handle MCP tools dynamically
    if (toolName.startsWith('mcp__')) {
        return getMcpActionInfo(toolName);
    }
    
    return ACTION_MAP[toolName] ?? { actionKey: 'StepProgress.Invoked', type: 'other' };
}

/**
 * Extract target info from tool call input
 */
export function extractTargetInfo(toolCall: ToolCall): TargetInfo {
    const input = toolCall.input;
    const name = toolCall.name;

    // Some backends send primitive inputs (e.g. a file path or command string).
    if (typeof input === 'string') {
        const raw = input.trim();
        if (!raw) return { name };

        if (
            name === 'read_file' ||
            name === 'view_file' ||
            name === 'view_file_outline' ||
            name === 'Read' ||
            name === 'list_dir' ||
            name === 'view_code_item' ||
            name === 'write_to_file' ||
            name === 'replace_file_content' ||
            name === 'multi_replace_file_content' ||
            name === 'Write' ||
            name === 'Edit'
        ) {
            return { name: extractFileName(raw), fullPath: raw };
        }

        if (name === 'run_command' || name === 'Bash') {
            return { name: truncateCommand(raw), fullPath: raw };
        }

        if (name === 'Glob' || name === 'Grep' || name === 'grep_search' || name === 'find_by_name' || name === 'codebase_search') {
            return { name: truncateText(raw, 40), fullPath: raw };
        }

        return { name: raw };
    }

    if (!input || typeof input !== 'object') {
        return { name };
    }
    
    const obj = input as Record<string, unknown>;
    
    // File operations - extract path and line range
    if (name === 'read_file' || name === 'view_file' || name === 'view_file_outline' || 
        name === 'Read' || name === 'list_dir' || name === 'view_code_item') {
        const candidate =
            obj.AbsolutePath ??
            obj.absolutePath ??
            obj.absolute_path ??
            obj.path ??
            obj.Path ??
            obj.filePath ??
            obj.file_path ??
            obj.FilePath ??
            obj.File ??
            obj.file ??
            obj.uri;

        const path = typeof candidate === 'string' ? candidate : undefined;
        if (path) {
            const startLineRaw = obj.StartLine ?? obj.startLine ?? obj.start_line;
            const endLineRaw = obj.EndLine ?? obj.endLine ?? obj.end_line;
            const startLine = typeof startLineRaw === 'number' ? startLineRaw : Number(startLineRaw);
            const endLine = typeof endLineRaw === 'number' ? endLineRaw : Number(endLineRaw);
            return {
                name: extractFileName(path),
                fullPath: path,
                lineRange: Number.isFinite(startLine) && Number.isFinite(endLine) && startLine > 0 && endLine > 0 ? [startLine, endLine] : undefined,
            };
        }
    }
    
    // Write/Edit operations
    if (name === 'write_to_file' || name === 'replace_file_content' || 
        name === 'multi_replace_file_content' || name === 'Write' || name === 'Edit') {
        const candidate =
            obj.TargetFile ??
            obj.targetFile ??
            obj.target_file ??
            obj.path ??
            obj.Path ??
            obj.filePath ??
            obj.file_path ??
            obj.FilePath ??
            obj.AbsolutePath ??
            obj.absolutePath ??
            obj.absolute_path;
        const path = typeof candidate === 'string' ? candidate : undefined;
        if (path) {
            const startLineRaw = obj.StartLine ?? obj.startLine ?? obj.start_line;
            const endLineRaw = obj.EndLine ?? obj.endLine ?? obj.end_line;
            const startLine = typeof startLineRaw === 'number' ? startLineRaw : Number(startLineRaw);
            const endLine = typeof endLineRaw === 'number' ? endLineRaw : Number(endLineRaw);
            return {
                name: extractFileName(path),
                fullPath: path,
                lineRange: Number.isFinite(startLine) && Number.isFinite(endLine) && startLine > 0 && endLine > 0 ? [startLine, endLine] : undefined,
            };
        }
    }
    
    // NotebookEdit - extract path and cell index
    if (name === 'NotebookEdit') {
        const path = (obj.path ?? obj.Path) as string | undefined;
        const cellIndex = obj.cellIndex as number | undefined;
        if (path) {
            return {
                name: extractFileName(path) + (cellIndex !== undefined ? ` [cell ${cellIndex}]` : ''),
                fullPath: path,
            };
        }
    }
    
    // Glob - extract pattern
    if (name === 'Glob') {
        const pattern = (obj.pattern ?? obj.Pattern ?? obj.glob) as string | undefined;
        const path = (obj.path ?? obj.Path ?? '.') as string;
        if (pattern) {
            return {
                name: truncateText(pattern, 40),
                fullPath: `${pattern} in ${path}`,
            };
        }
    }
    
    // Grep - extract pattern and path
    if (name === 'Grep') {
        const pattern = (obj.pattern ?? obj.Pattern ?? obj.regex) as string | undefined;
        const path = (obj.path ?? obj.Path ?? '.') as string;
        if (pattern) {
            return {
                name: `"${truncateText(pattern, 30)}" in ${extractFileName(path)}`,
                fullPath: `${pattern} in ${path}`,
            };
        }
    }
    
    // Command operations (Bash)
    if (name === 'run_command' || name === 'Bash') {
        const command = (obj.CommandLine ?? obj.command ?? obj.Command) as string | undefined;
        if (command) {
            return {
                name: truncateCommand(command),
                fullPath: command,
            };
        }
    }
    
    // BashOutput - extract pid or command id
    if (name === 'BashOutput') {
        const pid = (obj.pid ?? obj.commandId ?? obj.id) as string | number | undefined;
        return {
            name: pid ? `PID: ${pid}` : 'Background output',
        };
    }
    
    // KillShell - extract pid
    if (name === 'KillShell') {
        const pid = (obj.pid ?? obj.processId) as string | number | undefined;
        return {
            name: pid ? `Kill PID: ${pid}` : 'Kill shell',
        };
    }
    
    // Search operations (grep_search, find_by_name, codebase_search)
    if (name === 'grep_search' || name === 'find_by_name' || name === 'codebase_search') {
        const query = (obj.Query ?? obj.Pattern ?? obj.query ?? obj.pattern) as string | undefined;
        if (query) {
            return {
                name: truncateText(query, 40),
                fullPath: query,
            };
        }
    }
    
    // WebSearch - extract query
    if (name === 'WebSearch') {
        const query = (obj.query ?? obj.Query ?? obj.search) as string | undefined;
        if (query) {
            return {
                name: truncateText(query, 40),
                fullPath: query,
            };
        }
    }
    
    // Browser operations
    if (name === 'read_url_content' || name === 'read_browser_page') {
        const url = (obj.Url ?? obj.url ?? obj.URL) as string | undefined;
        if (url) {
            return {
                name: extractDomain(url),
                fullPath: url,
            };
        }
    }
    
    // Task - extract description or subagent_type
    if (name === 'Task') {
        const desc = (obj.TaskName ?? obj.task_name ?? obj.taskName ?? obj.description ?? obj.Description ?? obj.title ?? obj.Title) as string | undefined;
        const prompt = (obj.prompt ?? obj.Prompt) as string | undefined;
        const subagentType = (
            obj.subagent_type ?? obj.subagentType ?? 
            obj.SubagentType ?? obj.subagent_name ?? obj.subagentName
        ) as string | undefined;
        
        return {
            name: desc ? truncateText(desc, 50) : (subagentType ?? 'Task'),
            fullPath: desc ?? prompt,
            subagentType,
        };
    }
    
    // Task boundary
    if (name === 'task_boundary') {
        const taskName = obj.TaskName as string | undefined;
        const taskStatus = obj.TaskStatus as string | undefined;
        return {
            name: taskName ?? taskStatus ?? 'Task',
        };
    }
    
    // TodoWrite - show task count
    if (name === 'TodoWrite') {
        const tasks = (obj.tasks ?? obj.todos ?? obj.items) as unknown[];
        const count = Array.isArray(tasks) ? tasks.length : 0;
        return {
            name: count > 0 ? `${count} task${count !== 1 ? 's' : ''}` : 'Tasks',
        };
    }
    
    // ExitPlanMode - extract plan summary
    if (name === 'ExitPlanMode') {
        const plan = obj.plan as string | undefined;
        return {
            name: plan ? truncateText(plan, 50) : 'Exit plan mode',
            fullPath: plan,
        };
    }
    
    // Skill - extract skill name
    if (name === 'Skill') {
        const skillName = (obj.skill ?? obj.name ?? obj.skillName) as string | undefined;
        return {
            name: skillName ?? 'Skill',
        };
    }
    
    // SlashCommand - extract command
    if (name === 'SlashCommand') {
        const command = (obj.command ?? obj.cmd) as string | undefined;
        return {
            name: command ? `/${command}` : 'Command',
        };
    }
    
    // MCP tools - extract server and tool name
    if (name.startsWith('mcp__')) {
        const parts = name.split('__');
        const server = parts[1] || 'unknown';
        const tool = parts.slice(2).join('__') || name;
        
        // Try to extract meaningful target from input
        const url = (obj.url ?? obj.Url ?? obj.URL) as string | undefined;
        const path = (obj.path ?? obj.Path) as string | undefined;
        const query = (obj.query ?? obj.Query) as string | undefined;
        
        let target = `${server}:${tool}`;
        if (url) target = extractDomain(url);
        else if (path) target = extractFileName(path);
        else if (query) target = truncateText(query, 30);
        
        return {
            name: target,
            fullPath: url ?? path ?? query,
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
 * Truncate text for display
 */
function truncateText(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '...';
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
