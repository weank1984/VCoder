/**
 * Clipboard utilities for copying text.
 * Shared across StepEntry, DiffViewer, TerminalOutput, ChatBubble, and others.
 */

/**
 * Copy text to clipboard (fire-and-forget, logs errors).
 */
export function copyToClipboard(text: string): void {
    copyToClipboardAsync(text).catch(err => {
        console.error('Failed to copy:', err);
    });
}

/**
 * Copy text to clipboard with Promise result.
 * Falls back to legacy execCommand API if the Clipboard API is unavailable.
 */
export async function copyToClipboardAsync(text: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        // Fallback: legacy execCommand API
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (!success) {
            throw new Error('execCommand copy failed');
        }
    }
}
