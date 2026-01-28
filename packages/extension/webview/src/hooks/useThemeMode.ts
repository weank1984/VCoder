/**
 * useThemeMode Hook
 * Detects VSCode theme mode (light/dark) with performance optimizations
 *
 * Optimizations:
 * - Uses CSS custom property for efficient theme detection
 * - Debounced state updates to prevent excessive re-renders
 * - Passive event listeners where possible
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export type ThemeMode = 'light' | 'dark';

// CSS custom property name for theme detection
const THEME_CSS_PROPERTY = '--vc-vscode-theme-type';

function getModeFromBodyClass(classList: DOMTokenList): ThemeMode {
    if (classList.contains('vscode-light') || classList.contains('vscode-high-contrast-light')) {
        return 'light';
    }
    return 'dark';
}

/**
 * Debounce function to limit state update frequency
 */
function debounce(
    fn: (mode: ThemeMode) => void,
    delay: number
): (mode: ThemeMode) => void {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    return (mode: ThemeMode) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            fn(mode);
            timeoutId = null;
        }, delay);
    };
}

export function useThemeMode(): ThemeMode {
    const [mode, setMode] = useState<ThemeMode>(() => getModeFromBodyClass(document.body.classList));

    // Use ref to track last mode to avoid unnecessary state updates
    const lastModeRef = useRef<ThemeMode>(mode);

    // Debounced state setter to prevent excessive re-renders
    const debouncedSetMode = useCallback(
        debounce((newMode: ThemeMode) => {
            if (newMode !== lastModeRef.current) {
                lastModeRef.current = newMode;
                setMode(newMode);
            }
        }, 100), // 100ms debounce
        []
    );

    useEffect(() => {
        // Check if we can use CSS custom property (more efficient)
        const computedStyle = getComputedStyle(document.documentElement);
        const cssTheme = computedStyle.getPropertyValue(THEME_CSS_PROPERTY).trim();

        if (cssTheme === 'light' || cssTheme === 'dark') {
            // Use CSS custom property - no need for observer
            setMode(cssTheme);
            return;
        }

        // Fallback to MutationObserver with optimizations
        const observer = new MutationObserver((mutations) => {
            // Only process if class attribute actually changed
            const hasClassChange = mutations.some(
                (mutation) => mutation.attributeName === 'class'
            );
            if (!hasClassChange) return;

            const newMode = getModeFromBodyClass(document.body.classList);
            debouncedSetMode(newMode);
        });

        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['class'],
        });

        // Also listen to prefers-color-scheme as a backup
        const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
        const handleMediaChange = (e: MediaQueryListEvent | MediaQueryList) => {
            // Only use as fallback if body class doesn't indicate VSCode theme
            const bodyHasThemeClass =
                document.body.classList.contains('vscode-light') ||
                document.body.classList.contains('vscode-dark') ||
                document.body.classList.contains('vscode-high-contrast');

            if (!bodyHasThemeClass) {
                debouncedSetMode(e.matches ? 'light' : 'dark');
            }
        };

        mediaQuery.addEventListener('change', handleMediaChange);

        return () => {
            observer.disconnect();
            mediaQuery.removeEventListener('change', handleMediaChange);
        };
    }, [debouncedSetMode]);

    return mode;
}

/**
 * Utility to set theme CSS custom property (call during initialization)
 */
export function initThemeDetection(): void {
    const mode = getModeFromBodyClass(document.body.classList);
    document.documentElement.style.setProperty(THEME_CSS_PROPERTY, mode);
}
