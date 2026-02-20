/**
 * Tool Call Partitioner
 * Splits tool calls into read-only "explored" operations and write/execute "action" operations.
 * Used to render ExploredSummary for reads and StepProgressList for actions.
 */

import type { ToolCall } from '../types';

/** Read-only / exploration tool names (case-insensitive match) */
const EXPLORED_TOOL_NAMES = new Set([
    'read',
    'glob',
    'grep',
    'list_dir',
    'view_file',
    'view_file_outline',
    'codebase_search',
    'search_files',
    'find_files',
    'list_files',
    'file_search',
    'read_file',
    // MCP variants
    'mcp__acp__read',
    'mcp__acp__glob',
    'mcp__acp__grep',
]);

/** MCP prefix patterns that indicate read-only operations */
const EXPLORED_MCP_SUFFIXES = [
    '__read',
    '__glob',
    '__grep',
    '__list_dir',
    '__view_file',
    '__search',
    '__find',
];

export interface PartitionResult {
    /** Read-only tool calls (Read, Glob, Grep, etc.) */
    exploredCalls: ToolCall[];
    /** Write/execute tool calls (Bash, Write, Edit, etc.) */
    actionCalls: ToolCall[];
}

/**
 * Check if a tool call is a read-only exploration operation.
 */
function isExploredTool(tc: ToolCall): boolean {
    const lower = tc.name.toLowerCase();

    // Direct name match
    if (EXPLORED_TOOL_NAMES.has(lower)) return true;

    // MCP tool suffix match
    if (lower.startsWith('mcp__')) {
        return EXPLORED_MCP_SUFFIXES.some(suffix => lower.endsWith(suffix));
    }

    return false;
}

/**
 * Partition tool calls into explored (read-only) and action (write/execute) groups.
 * Maintains original order within each group.
 */
export function partitionToolCalls(toolCalls: ToolCall[]): PartitionResult {
    const exploredCalls: ToolCall[] = [];
    const actionCalls: ToolCall[] = [];

    for (const tc of toolCalls) {
        if (isExploredTool(tc)) {
            exploredCalls.push(tc);
        } else {
            actionCalls.push(tc);
        }
    }

    return { exploredCalls, actionCalls };
}
