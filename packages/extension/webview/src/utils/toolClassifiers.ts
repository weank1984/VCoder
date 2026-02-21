/**
 * Tool name classification utilities.
 * Determines whether a tool call is a terminal command, file edit, etc.
 * Shared across StepEntry, StepItem, and stepAggregator.
 */

const TERMINAL_TOOL_NAMES = new Set([
    'bash',
    'bashoutput',
    'bash_output',
    'run_command',
    'mcp__acp__bashoutput',
]);

const FILE_EDIT_TOOL_NAMES = new Set([
    'write',
    'edit',
    'strreplace',
    'multiedit',
    'write_to_file',
    'replace_file_content',
    'multi_replace_file_content',
    'apply_patch',
    'str_replace',
    'mcp__acp__write',
    'mcp__acp__edit',
]);

export function isTerminalToolName(name: string): boolean {
    const lower = name.toLowerCase();
    return TERMINAL_TOOL_NAMES.has(lower) || lower.includes('terminal');
}

export function isFileEditToolName(name: string): boolean {
    return FILE_EDIT_TOOL_NAMES.has(name.toLowerCase());
}
