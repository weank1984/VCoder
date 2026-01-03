/**
 * useThemeMode Hook
 * Detects VSCode theme mode (light/dark) by observing body class changes
 */

import { useState, useEffect } from 'react';

export type ThemeMode = 'light' | 'dark';

function getModeFromBodyClass(classList: DOMTokenList): ThemeMode {
    if (classList.contains('vscode-light') || classList.contains('vscode-high-contrast-light')) {
        return 'light';
    }
    return 'dark';
}

export function useThemeMode(): ThemeMode {
    const [mode, setMode] = useState<ThemeMode>(() => getModeFromBodyClass(document.body.classList));

    useEffect(() => {
        const observer = new MutationObserver(() => {
            setMode(getModeFromBodyClass(document.body.classList));
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    return mode;
}
