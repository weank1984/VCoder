/**
 * Sanitize session titles by stripping XML/HTML tags
 * that may leak from transcript extraction.
 *
 * e.g. "<ide_opened_file>The user opened..." → "The user opened..."
 */
export function sanitizeSessionTitle(title: string | undefined, fallback: string): string {
    if (!title) return fallback;
    // Strip all XML/HTML-like tags
    const cleaned = title.replace(/<[^>]+>/g, '').trim();
    return cleaned || fallback;
}
