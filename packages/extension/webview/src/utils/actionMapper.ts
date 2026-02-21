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
    'WebFetch': { actionKey: 'StepProgress.Fetched', type: 'browser' },
    'browser_subagent': { actionKey: 'StepProgress.Browsed', type: 'browser' },
    'read_url_content': { actionKey: 'StepProgress.Fetched', type: 'browser' },
    'read_browser_page': { actionKey: 'StepProgress.Browsed', type: 'browser' },

    // ========== Sub-agent/Task Operations ==========
    'Task': { actionKey: 'StepProgress.Delegated', type: 'task' },
    'TaskCreate': { actionKey: 'StepProgress.Created', type: 'task' },
    'TaskGet': { actionKey: 'StepProgress.Checked', type: 'task' },
    'TaskList': { actionKey: 'StepProgress.Checked', type: 'task' },
    'TaskOutput': { actionKey: 'StepProgress.Fetched', type: 'task' },
    'TaskUpdate': { actionKey: 'StepProgress.Edited', type: 'task' },
    'TaskStop': { actionKey: 'StepProgress.Stopped', type: 'task' },
    'task_boundary': { actionKey: 'StepProgress.Planned', type: 'task' },

    // ========== Planning/TODO Operations ==========
    'TodoWrite': { actionKey: 'StepProgress.Planned', type: 'plan' },
    'EnterPlanMode': { actionKey: 'StepProgress.Planned', type: 'plan' },
    'ExitPlanMode': { actionKey: 'StepProgress.Planned', type: 'plan' },

    // ========== Extension Tools ==========
    'Skill': { actionKey: 'StepProgress.Invoked', type: 'other' },
    'SlashCommand': { actionKey: 'StepProgress.Invoked', type: 'other' },

    // ========== Other Tools ==========
    'AskUserQuestion': { actionKey: 'StepProgress.Invoked', type: 'other' },
    'LSP': { actionKey: 'StepProgress.Analyzed', type: 'search' },
    'ToolSearch': { actionKey: 'StepProgress.Searched', type: 'search' },
    'MCPSearch': { actionKey: 'StepProgress.Searched', type: 'mcp' },
    'notify_user': { actionKey: 'StepProgress.Notified', type: 'other' },
    'generate_image': { actionKey: 'StepProgress.Generated', type: 'other' },
};

// MCP keyword -> actionKey mapping (order matters: first match wins)
const MCP_KEYWORD_MAP: [string[], string][] = [
    [['read', 'get', 'fetch'], 'StepProgress.Fetched'],
    [['write', 'create', 'post'], 'StepProgress.Created'],
    [['search', 'query', 'find'], 'StepProgress.Searched'],
    [['analyze', 'process'], 'StepProgress.Analyzed'],
    [['edit', 'update', 'modify'], 'StepProgress.Edited'],
    [['delete', 'remove'], 'StepProgress.Deleted'],
];

function getMcpActionInfo(toolName: string): ActionInfo {
    const parts = toolName.split('__');
    if (parts.length < 3) return { actionKey: 'StepProgress.Invoked', type: 'mcp' };

    const tool = parts.slice(2).join('__').toLowerCase();
    for (const [keywords, actionKey] of MCP_KEYWORD_MAP) {
        if (keywords.some(kw => tool.includes(kw))) {
            return { actionKey, type: 'mcp' };
        }
    }
    return { actionKey: 'StepProgress.Invoked', type: 'mcp' };
}

/**
 * Get action info for a tool name
 */
export function getActionInfo(toolName: string): ActionInfo {
    if (toolName.startsWith('mcp__')) {
        return getMcpActionInfo(toolName);
    }
    return ACTION_MAP[toolName] ?? { actionKey: 'StepProgress.Invoked', type: 'other' };
}

// --- Shared property resolution helpers ---

const FILE_PATH_TOOLS = new Set([
    'read_file', 'view_file', 'view_file_outline', 'Read', 'list_dir', 'view_code_item',
    'write_to_file', 'replace_file_content', 'multi_replace_file_content', 'Write', 'Edit',
]);

const COMMAND_TOOLS = new Set(['run_command', 'Bash']);

const SEARCH_TOOLS = new Set(['Glob', 'Grep', 'grep_search', 'find_by_name', 'codebase_search']);

function firstString(...values: unknown[]): string | undefined {
    for (const v of values) {
        if (typeof v === 'string') return v;
    }
    return undefined;
}

function resolveFilePath(obj: Record<string, unknown>): string | undefined {
    return firstString(
        obj.TargetFile, obj.targetFile, obj.target_file,
        obj.AbsolutePath, obj.absolutePath, obj.absolute_path,
        obj.path, obj.Path,
        obj.filePath, obj.file_path, obj.FilePath,
        obj.File, obj.file, obj.uri,
    );
}

function resolveLineRange(obj: Record<string, unknown>): [number, number] | undefined {
    const startLine = Number(obj.StartLine ?? obj.startLine ?? obj.start_line);
    const endLine = Number(obj.EndLine ?? obj.endLine ?? obj.end_line);
    if (Number.isFinite(startLine) && Number.isFinite(endLine) && startLine > 0 && endLine > 0) {
        return [startLine, endLine];
    }
    return undefined;
}

function resolveTaskId(obj: Record<string, unknown>): string | number | undefined {
    return (obj.task_id ?? obj.taskId ?? obj.id ?? obj.task) as string | number | undefined;
}

function resolveTaskTitle(obj: Record<string, unknown>): string | undefined {
    return firstString(obj.title, obj.name, obj.description);
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
        if (FILE_PATH_TOOLS.has(name)) return { name: extractFileName(raw), fullPath: raw };
        if (COMMAND_TOOLS.has(name)) return { name: truncateCommand(raw), fullPath: raw };
        if (SEARCH_TOOLS.has(name)) return { name: truncateText(raw, 40), fullPath: raw };
        return { name: raw };
    }

    if (!input || typeof input !== 'object') {
        return { name };
    }

    const obj = input as Record<string, unknown>;

    // File operations (Read, Write, Edit, list_dir, etc.) - unified path + line range extraction
    if (FILE_PATH_TOOLS.has(name)) {
        const path = resolveFilePath(obj);
        if (path) {
            const pagesRaw = obj.pages ?? obj.Pages;
            const pages = typeof pagesRaw === 'string' || typeof pagesRaw === 'number' ? String(pagesRaw) : undefined;
            const displayName = pages ? `${extractFileName(path)} [pages ${pages}]` : extractFileName(path);
            return {
                name: displayName,
                fullPath: path,
                lineRange: resolveLineRange(obj),
            };
        }
    }

    // NotebookEdit - extract path and cell index
    if (name === 'NotebookEdit') {
        const path = firstString(obj.path, obj.Path);
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
        const pattern = firstString(obj.pattern, obj.Pattern, obj.glob);
        const path = firstString(obj.path, obj.Path) ?? '.';
        if (pattern) {
            return { name: truncateText(pattern, 40), fullPath: `${pattern} in ${path}` };
        }
    }

    // Grep - extract pattern and path
    if (name === 'Grep') {
        const pattern = firstString(obj.pattern, obj.Pattern, obj.regex);
        const path = firstString(obj.path, obj.Path) ?? '.';
        if (pattern) {
            return {
                name: `"${truncateText(pattern, 30)}" in ${extractFileName(path)}`,
                fullPath: `${pattern} in ${path}`,
            };
        }
    }

    // Command operations (Bash)
    if (COMMAND_TOOLS.has(name)) {
        const command = firstString(obj.CommandLine, obj.command, obj.Command);
        if (command) {
            return { name: truncateCommand(command), fullPath: command };
        }
    }

    // BashOutput - extract pid or command id
    if (name === 'BashOutput') {
        const pid = (obj.pid ?? obj.commandId ?? obj.id) as string | number | undefined;
        return { name: pid ? `PID: ${pid}` : 'Background output' };
    }

    // KillShell - extract pid
    if (name === 'KillShell') {
        const pid = (obj.pid ?? obj.processId) as string | number | undefined;
        return { name: pid ? `Kill PID: ${pid}` : 'Kill shell' };
    }

    // Search operations (grep_search, find_by_name, codebase_search)
    if (name === 'grep_search' || name === 'find_by_name' || name === 'codebase_search') {
        const query = firstString(obj.Query, obj.Pattern, obj.query, obj.pattern);
        if (query) {
            return { name: truncateText(query, 40), fullPath: query };
        }
    }

    // WebSearch / MCPSearch / ToolSearch
    if (name === 'WebSearch' || name === 'MCPSearch' || name === 'ToolSearch') {
        const query = firstString(
            obj.query, obj.Query, obj.search, obj.pattern,
            obj.tool, obj.tool_name, obj.toolName, obj.text, obj.prompt,
        );
        if (query) {
            return { name: truncateText(query, 40), fullPath: query };
        }
    }

    // Browser operations
    if (name === 'read_url_content' || name === 'read_browser_page' || name === 'WebFetch') {
        const url = firstString(obj.Url, obj.url, obj.URL);
        if (url) {
            return { name: extractDomain(url), fullPath: url };
        }
    }

    // Task - extract description or subagent_type
    if (name === 'Task') {
        const desc = firstString(
            obj.TaskName, obj.task_name, obj.taskName,
            obj.description, obj.Description, obj.title, obj.Title,
        );
        const prompt = firstString(obj.prompt, obj.Prompt);
        const subagentType = firstString(
            obj.subagent_type, obj.subagentType, obj.SubagentType,
            obj.subagent_name, obj.subagentName,
            obj.agent_type, obj.agentType, obj.agent_name, obj.agentName,
        );
        return {
            name: desc ? truncateText(desc, 50) : (subagentType ?? 'Task'),
            fullPath: desc ?? prompt,
            subagentType,
        };
    }

    if (name === 'TaskCreate') {
        const title = resolveTaskTitle(obj);
        const taskId = resolveTaskId(obj);
        return {
            name: title ? truncateText(title, 50) : (taskId ? `Task ${taskId}` : 'Task create'),
            fullPath: title ?? (taskId ? String(taskId) : undefined),
        };
    }

    if (name === 'TaskGet') {
        const taskId = resolveTaskId(obj);
        return { name: taskId ? `Task ${taskId}` : 'Task details', fullPath: taskId ? String(taskId) : undefined };
    }

    if (name === 'TaskList') {
        return { name: 'Task list' };
    }

    if (name === 'TaskUpdate') {
        const taskId = resolveTaskId(obj);
        const title = resolveTaskTitle(obj);
        const status = firstString(obj.status, obj.state);
        const label = title
            ? truncateText(title, 50)
            : taskId
              ? `Task ${taskId}${status ? ` (${status})` : ''}`
              : status
                ? `Task (${status})`
                : 'Task update';
        return { name: label, fullPath: title ?? (taskId ? String(taskId) : status) };
    }

    if (name === 'TaskOutput') {
        const taskId = (obj.task_id ?? obj.taskId ?? obj.id ?? obj.task ?? obj.commandId ?? obj.pid) as string | number | undefined;
        return { name: taskId ? `Task ${taskId}` : 'Task output', fullPath: taskId ? String(taskId) : undefined };
    }

    if (name === 'TaskStop') {
        const taskId = resolveTaskId(obj);
        const description = firstString(obj.description, obj.title, obj.name);
        const command = firstString(obj.command, obj.cmd);
        const label = description
            ? truncateText(description, 50)
            : command
              ? truncateCommand(command)
              : taskId
                ? `Task ${taskId}`
                : 'Task stop';
        return { name: label, fullPath: description ?? command ?? (taskId ? String(taskId) : undefined) };
    }

    if (name === 'AskUserQuestion') {
        const question = firstString(obj.question, obj.prompt, obj.text);
        return { name: question ? truncateText(question, 50) : 'Question', fullPath: question };
    }

    if (name === 'LSP') {
        const method = firstString(obj.method, obj.action, obj.operation);
        const symbol = firstString(obj.symbol, obj.query, obj.name, obj.identifier);
        const filePath = firstString(obj.filePath, obj.file_path, obj.path, obj.uri);
        const line = (obj.line ?? obj.Line ?? obj.startLine) as number | undefined;
        const target = filePath ? `${extractFileName(filePath)}${typeof line === 'number' ? `:${line}` : ''}` : undefined;
        const label = symbol
            ? `${method ? `${method}: ` : ''}${truncateText(symbol, 40)}`
            : method ?? target ?? 'LSP';
        return { name: label, fullPath: filePath ?? symbol ?? method };
    }

    if (name === 'task_boundary') {
        const taskName = obj.TaskName as string | undefined;
        const taskStatus = obj.TaskStatus as string | undefined;
        return { name: taskName ?? taskStatus ?? 'Task' };
    }

    if (name === 'TodoWrite') {
        const tasks = (obj.tasks ?? obj.todos ?? obj.items) as unknown[];
        const count = Array.isArray(tasks) ? tasks.length : 0;
        return { name: count > 0 ? `${count} task${count !== 1 ? 's' : ''}` : 'Tasks' };
    }

    if (name === 'ExitPlanMode' || name === 'EnterPlanMode') {
        const plan = obj.plan as string | undefined;
        const label = name === 'EnterPlanMode' ? 'Enter plan mode' : 'Exit plan mode';
        return { name: plan ? truncateText(plan, 50) : label, fullPath: plan };
    }

    if (name === 'Skill') {
        const skillName = firstString(obj.skill, obj.name, obj.skillName);
        return { name: skillName ?? 'Skill' };
    }

    if (name === 'SlashCommand') {
        const command = firstString(obj.command, obj.cmd);
        return { name: command ? `/${command}` : 'Command' };
    }

    // MCP tools - extract server and tool name
    if (name.startsWith('mcp__')) {
        const parts = name.split('__');
        const server = parts[1] || 'unknown';
        const tool = parts.slice(2).join('__') || name;

        const url = firstString(obj.url, obj.Url, obj.URL);
        const path = firstString(obj.path, obj.Path);
        const query = firstString(obj.query, obj.Query);

        let target = `${server}:${tool}`;
        if (url) target = extractDomain(url);
        else if (path) target = extractFileName(path);
        else if (query) target = truncateText(query, 30);

        return { name: target, fullPath: url ?? path ?? query };
    }

    // Fallback
    return { name: toolCall.name };
}

function extractFileName(path: string): string {
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1] || path;
}

function truncateText(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '...';
}

function truncateCommand(command: string): string {
    const maxLen = 50;
    const singleLine = command.replace(/\n/g, ' ').trim();
    if (singleLine.length <= maxLen) return singleLine;
    return singleLine.slice(0, maxLen) + '...';
}

function extractDomain(url: string): string {
    try {
        const parsed = new URL(url);
        return parsed.hostname;
    } catch {
        return url.slice(0, 30) + (url.length > 30 ? '...' : '');
    }
}

export function isTaskBoundary(toolName: string): boolean {
    return toolName === 'task_boundary';
}
