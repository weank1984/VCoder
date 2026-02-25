/**
 * Token formatting utilities
 */

/** Format token count: 245 → "245", 1234 → "1.2K", 12345 → "12K" */
export function formatTokens(count: number): string {
    if (count < 1000) return String(count);
    if (count < 10000) return `${(count / 1000).toFixed(1)}K`;
    return `${Math.round(count / 1000)}K`;
}
