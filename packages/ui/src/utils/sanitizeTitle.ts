/**
 * Strip IDE editor context prefixes injected by the VSCode extension.
 *
 * The extension prepends lines like:
 *   [Active file: src/foo.ts, cursor at line 11]
 *   [Diagnostics:\nL5: [Error] ...]
 *
 * followed by a blank line before the actual user message.
 * This function removes those bracket-enclosed context lines.
 */
export function stripEditorContext(text: string): string {
    // Remove leading lines that are bracket-enclosed context blocks.
    // Pattern: lines starting with "[" and containing a closing "]", possibly multi-line for Diagnostics.
    let result = text;

    // Strip leading [Active file: ...] and [Diagnostics: ...] blocks (may span multiple lines)
    // Each block starts with "[" keyword and ends at the closing "]"
    while (result.length > 0) {
        const match = result.match(/^\[(?:Active file|Diagnostics)[^\]]*\]\s*/s);
        if (!match) break;
        result = result.slice(match[0].length);
    }

    return result.trim();
}

/**
 * Sanitize session titles by stripping XML/HTML tags and editor context
 * that may leak from transcript extraction or context injection.
 *
 * e.g. "<ide_opened_file>The user opened..." → "The user opened..."
 * e.g. "[Active file: foo.ts, cursor at line 11]\n\nhi" → "hi"
 */
export function sanitizeSessionTitle(title: string | undefined, fallback: string): string {
    if (!title) return fallback;
    // Strip all XML/HTML-like tags
    let cleaned = title.replace(/<[^>]+>/g, '');
    // Strip editor context prefixes
    cleaned = stripEditorContext(cleaned).trim();
    return cleaned || fallback;
}
