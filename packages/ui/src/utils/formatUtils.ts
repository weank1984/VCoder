/**
 * Shared formatting utilities.
 * Used across SmartToolInput, ToolResultDisplay, McpToolDisplay, and other components.
 */

/**
 * Safely stringify a value for display.
 * Returns the string as-is, or JSON-stringifies objects/arrays.
 */
export function safeStringify(value: unknown, pretty = true): string {
    if (value === undefined) return '';
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value, null, pretty ? 2 : 0);
    } catch {
        return String(value);
    }
}
