/**
 * Time Formatting Utilities
 * Shared relative time display for session lists and history panels
 */

type TranslateFunc = (key: string, ...args: unknown[]) => string;

/**
 * Format a date string as a relative time description.
 * Returns strings like "Just now", "5 minutes ago", "2 hours ago", etc.
 */
export function getRelativeTime(
    dateStr: string | undefined,
    t: TranslateFunc,
    language: string,
): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) {
        return t('Common.JustNow');
    }

    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
        return t('Common.MinutesAgo', diffInMinutes);
    }

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
        return t('Common.HoursAgo', diffInHours);
    }

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) {
        return t('Common.DaysAgo', diffInDays);
    }

    if (diffInDays < 30) {
        const weeks = Math.floor(diffInDays / 7);
        return t('Common.WeeksAgo', weeks);
    }

    return date.toLocaleDateString(language === 'zh-CN' ? 'zh-CN' : 'en-US', {
        month: 'short',
        day: 'numeric',
    });
}

/**
 * Group items by date relative to today.
 * Returns groups: Today, Yesterday, Previous 7 days, Previous 30 days, older months.
 */
export function groupByDate<T>(
    items: T[],
    getDate: (item: T) => string | undefined,
    language: string,
): { label: string; items: T[] }[] {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const weekAgo = new Date(today.getTime() - 7 * 86400000);
    const monthAgo = new Date(today.getTime() - 30 * 86400000);

    const groups = new Map<string, T[]>();
    const order: string[] = [];

    const addToGroup = (label: string, item: T) => {
        if (!groups.has(label)) {
            groups.set(label, []);
            order.push(label);
        }
        groups.get(label)!.push(item);
    };

    const isZh = language === 'zh-CN';

    for (const item of items) {
        const dateStr = getDate(item);
        if (!dateStr) {
            addToGroup(isZh ? '更早' : 'Older', item);
            continue;
        }
        const date = new Date(dateStr);
        const itemDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

        if (itemDay.getTime() >= today.getTime()) {
            addToGroup(isZh ? '今天' : 'Today', item);
        } else if (itemDay.getTime() >= yesterday.getTime()) {
            addToGroup(isZh ? '昨天' : 'Yesterday', item);
        } else if (itemDay.getTime() >= weekAgo.getTime()) {
            addToGroup(isZh ? '过去 7 天' : 'Previous 7 days', item);
        } else if (itemDay.getTime() >= monthAgo.getTime()) {
            addToGroup(isZh ? '过去 30 天' : 'Previous 30 days', item);
        } else {
            const monthLabel = date.toLocaleDateString(isZh ? 'zh-CN' : 'en-US', {
                year: 'numeric',
                month: 'long',
            });
            addToGroup(monthLabel, item);
        }
    }

    return order.map((label) => ({ label, items: groups.get(label)! }));
}
