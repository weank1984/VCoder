/**
 * Type guard and type coercion utilities for safe access to unknown values.
 * Used across components that parse untyped tool call inputs/results.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
    return isRecord(value) ? value : undefined;
}

export function asString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

export function asNumber(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
}
