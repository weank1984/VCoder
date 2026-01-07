/**
 * MermaidBlock Component
 * Renders Mermaid diagrams with proper theming
 */

import { useEffect, useRef, useState, useId } from 'react';
import mermaid from 'mermaid';
import { useThemeMode } from '../../hooks/useThemeMode';
import './index.scss';

interface MermaidBlockProps {
    code: string;
}

// Initialize mermaid once
let mermaidInitialized = false;

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
}

export function MermaidBlock({ code }: MermaidBlockProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [svg, setSvg] = useState<string>('');
    const [error, setError] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const themeMode = useThemeMode();
    const uniqueId = useId().replace(/:/g, '_');

    useEffect(() => {
        let isMounted = true;

        async function renderDiagram() {
            if (!code.trim()) {
                setIsLoading(false);
                return;
            }

            try {
                // Re-initialize if theme changed
                if (!mermaidInitialized || themeMode) {
                    initMermaid(themeMode);
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

    if (isLoading) {
        return (
            <div className="vc-mermaid-block vc-mermaid-block--loading">
                <div className="mermaid-loading">
                    <span className="mermaid-loading-icon" />
                    <span>Rendering diagram...</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="vc-mermaid-block vc-mermaid-block--error">
                <div className="mermaid-error">
                    <span className="mermaid-error-title">⚠️ Diagram Error</span>
                    <pre className="mermaid-error-message">{error}</pre>
                    <details className="mermaid-error-code">
                        <summary>Show code</summary>
                        <pre>{code}</pre>
                    </details>
                </div>
            </div>
        );
    }

    return (
        <div 
            className="vc-mermaid-block"
            ref={containerRef}
            dangerouslySetInnerHTML={{ __html: svg }}
        />
    );
}

export default MermaidBlock;
