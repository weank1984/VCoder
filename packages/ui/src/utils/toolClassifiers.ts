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

/** 白名单：这些工具在 Step 级别默认展开 */
const AUTO_EXPAND_TOOL_NAMES = new Set([
    // 文件编辑始终展开（用户需要看到修改）
    ...FILE_EDIT_TOOL_NAMES,
    // 需要审批的工具展开
    'todowrite',
]);

export function shouldAutoExpandTool(name: string): boolean {
    return AUTO_EXPAND_TOOL_NAMES.has(name.toLowerCase());
}
