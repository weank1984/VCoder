/**
 * Error Boundary Component
 * Catches rendering errors and displays a fallback UI
 */

import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import I18n from '../i18n';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('VCoder UI Error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="vc-error-boundary">
                    <div className="vc-error-content">
                        <h2>{I18n.t('ErrorBoundary.Title')}</h2>
                        <p>{I18n.t('ErrorBoundary.Message')}</p>
                        <pre className="vc-error-details">
                            {this.state.error?.message}
                        </pre>
                        <button
                            className="vc-error-retry"
                            onClick={() => window.location.reload()}
                        >
                            {I18n.t('ErrorBoundary.Refresh')}
                        </button>
                    </div>
                    <style>{`
                        .vc-error-boundary {
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            height: 100vh;
                            padding: 20px;
                            background: var(--vscode-sideBar-background, #1e1e1e);
                            color: var(--vscode-foreground, #fff);
                            font-family: var(--vscode-font-family, sans-serif);
                        }
                        .vc-error-content {
                            text-align: center;
                            max-width: 400px;
                        }
                        .vc-error-content h2 {
                            margin: 0 0 12px;
                            font-size: 20px;
                        }
                        .vc-error-content p {
                            margin: 0 0 16px;
                            opacity: 0.8;
                        }
                        .vc-error-details {
                            padding: 12px;
                            margin: 0 0 16px;
                            background: rgba(255, 0, 0, 0.1);
                            border: 1px solid rgba(255, 0, 0, 0.3);
                            border-radius: 6px;
                            font-size: 12px;
                            text-align: left;
                            overflow: auto;
                            max-height: 100px;
                        }
                        .vc-error-retry {
                            padding: 8px 20px;
                            background: var(--vscode-button-background, #0e639c);
                            color: var(--vscode-button-foreground, #fff);
                            border: none;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 14px;
                        }
                        .vc-error-retry:hover {
                            background: var(--vscode-button-hoverBackground, #1177bb);
                        }
                    `}</style>
                </div>
            );
        }

        return this.props.children;
    }
}
