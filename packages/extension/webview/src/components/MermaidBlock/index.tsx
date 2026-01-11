/**
 * MermaidBlock Component
 * Renders Mermaid diagrams with proper theming
 */

import { useEffect, useLayoutEffect, useRef, useState, useId } from 'react';
import mermaid from 'mermaid';
import { useThemeMode } from '../../hooks/useThemeMode';
import './index.scss';

interface MermaidBlockProps {
    code: string;
}

// Initialize mermaid once
let mermaidInitialized = false;
let mermaidTheme: 'dark' | 'light' | null = null;

function initMermaid(theme: 'dark' | 'light') {
    mermaid.initialize({
        startOnLoad: false,
        theme: theme === 'dark' ? 'dark' : 'default',
        securityLevel: 'loose',
        fontFamily: 'var(--vscode-font-family)',
        flowchart: {
            useMaxWidth: true,
            htmlLabels: true,
        },
    });
    mermaidInitialized = true;
    mermaidTheme = theme;
}

export function MermaidBlock({ code }: MermaidBlockProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [svg, setSvg] = useState<string>('');
    const [error, setError] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const themeMode = useThemeMode();
    const uniqueId = useId().replace(/:/g, '_');
    const prevHeightRef = useRef<number | null>(null);

    useEffect(() => {
        let isMounted = true;

        async function renderDiagram() {
            if (!code.trim()) {
                setIsLoading(false);
                return;
            }

            try {
                // Re-initialize if theme changed
                if (!mermaidInitialized || mermaidTheme !== themeMode) {
                    initMermaid(themeMode);
                }

                const el = containerRef.current;
                if (el) {
                    prevHeightRef.current = el.getBoundingClientRect().height;
                }

                const id = `mermaid-${uniqueId}`;
                const { svg: renderedSvg } = await mermaid.render(id, code.trim());
                
                if (isMounted) {
                    setSvg(renderedSvg);
                    setError('');
                    setIsLoading(false);
                }
            } catch (err) {
                if (isMounted) {
                    setError(err instanceof Error ? err.message : 'Failed to render diagram');
                    setIsLoading(false);
                }
            }
        }

        renderDiagram();

        return () => {
            isMounted = false;
        };
    }, [code, themeMode, uniqueId]);

    useLayoutEffect(() => {
        const el = containerRef.current;
        const prevHeight = prevHeightRef.current;
        if (!el || prevHeight == null) return;
        if (isLoading) return;

        const nextHeight = el.getBoundingClientRect().height;
        const delta = nextHeight - prevHeight;
        if (delta === 0) return;

        const scroller = el.closest('.messages-container') as HTMLElement | null;
        if (!scroller) return;

        const scrollerRect = scroller.getBoundingClientRect();
        const rect = el.getBoundingClientRect();

        // If the user is pinned to the bottom, don't fight that behavior.
        const distFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
        const isPinnedToBottom = distFromBottom < 4;
        if (isPinnedToBottom) return;

        // If any part of this block is above the visible viewport, compensate scrollTop
        // so the user's view doesn't "jump" when the diagram expands.
        if (rect.top < scrollerRect.top + 1) {
            scroller.scrollTop += delta;
        }

        prevHeightRef.current = null;
    }, [svg, isLoading]);

    const wrapperClassName = [
        'vc-mermaid-block',
        isLoading ? 'vc-mermaid-block--loading' : '',
        error ? 'vc-mermaid-block--error' : '',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <div className={wrapperClassName} ref={containerRef}>
            {isLoading ? (
                <div className="mermaid-loading">
                    <span className="mermaid-loading-icon" />
                    <span>Rendering diagram...</span>
                </div>
            ) : error ? (
                <div className="mermaid-error">
                    <span className="mermaid-error-title">⚠️ Diagram Error</span>
                    <pre className="mermaid-error-message">{error}</pre>
                    <details className="mermaid-error-code">
                        <summary>Show code</summary>
                        <pre>{code}</pre>
                    </details>
                </div>
            ) : (
                <div className="vc-mermaid-block__svg" dangerouslySetInnerHTML={{ __html: svg }} />
            )}
        </div>
    );
}

export default MermaidBlock;
