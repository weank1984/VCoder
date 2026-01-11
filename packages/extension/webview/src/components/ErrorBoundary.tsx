/**
 * Error Boundary Component
 * Catches rendering errors and displays a fallback UI with enhanced error reporting
 */

import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { parseError, formatErrorForLogging } from '../utils/errorHandling';
import I18n from '../i18n';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('VCoder UI Error:', error, errorInfo);
        this.setState({ errorInfo });
        
        // Log formatted error for debugging
        console.error('[ErrorBoundary]', formatErrorForLogging(error));
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    handleReload = () => {
        window.location.reload();
    };

    handleCopyError = () => {
        if (!this.state.error) return;
        
        const errorReport = [
            'VCoder Error Report',
            '==================',
            `Error: ${this.state.error.message}`,
            '',
            'Stack Trace:',
            this.state.error.stack || 'N/A',
            '',
            'Component Stack:',
            this.state.errorInfo?.componentStack || 'N/A',
            '',
            `User Agent: ${navigator.userAgent}`,
            `Timestamp: ${new Date().toISOString()}`,
        ].join('\n');
        
        navigator.clipboard.writeText(errorReport).then(() => {
            alert('Error report copied to clipboard');
        });
    };

    render() {
        if (this.state.hasError) {
            const errorDetails = parseError(this.state.error);
            
            return (
                <div className="vc-error-boundary">
                    <div className="vc-error-content">
                        <div className="vc-error-icon">⚠️</div>
                        <h2>{errorDetails.title}</h2>
                        <p>{errorDetails.message}</p>
                        
                        <details className="vc-error-details">
                            <summary>View Error Details</summary>
                            <pre>{this.state.error?.message}</pre>
                            {this.state.error?.stack && (
                                <pre className="vc-error-stack">{this.state.error.stack}</pre>
                            )}
                        </details>

                        <div className="vc-error-actions">
                            <button
                                className="vc-error-btn vc-error-btn--primary"
                                onClick={this.handleReset}
                            >
                                {I18n.t('ErrorBoundary.TryAgain') || 'Try Again'}
                            </button>
                            <button
                                className="vc-error-btn vc-error-btn--secondary"
                                onClick={this.handleReload}
                            >
                                {I18n.t('ErrorBoundary.Refresh') || 'Reload Page'}
                            </button>
                            <button
                                className="vc-error-btn vc-error-btn--secondary"
                                onClick={this.handleCopyError}
                            >
                                Copy Error Report
                            </button>
                        </div>
                    </div>
                    <style>{`
                        .vc-error-boundary {
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            min-height: 100vh;
                            padding: 20px;
                            background: var(--vscode-sideBar-background, #1e1e1e);
                            color: var(--vscode-foreground, #fff);
                            font-family: var(--vscode-font-family, sans-serif);
                        }
                        .vc-error-content {
                            text-align: center;
                            max-width: 500px;
                            width: 100%;
                        }
                        .vc-error-icon {
                            font-size: 48px;
                            margin-bottom: 16px;
                            animation: shake 0.5s ease-in-out;
                        }
                        @keyframes shake {
                            0%, 100% { transform: translateX(0); }
                            25% { transform: translateX(-10px); }
                            75% { transform: translateX(10px); }
                        }
                        .vc-error-content h2 {
                            margin: 0 0 12px;
                            font-size: 20px;
                            font-weight: 600;
                        }
                        .vc-error-content p {
                            margin: 0 0 20px;
                            opacity: 0.9;
                            line-height: 1.6;
                        }
                        .vc-error-details {
                            margin: 0 0 20px;
                            text-align: left;
                            background: rgba(255, 0, 0, 0.05);
                            border: 1px solid rgba(255, 0, 0, 0.2);
                            border-radius: 6px;
                            overflow: hidden;
                        }
                        .vc-error-details summary {
                            padding: 12px;
                            cursor: pointer;
                            font-weight: 500;
                            user-select: none;
                            background: rgba(255, 0, 0, 0.1);
                        }
                        .vc-error-details summary:hover {
                            background: rgba(255, 0, 0, 0.15);
                        }
                        .vc-error-details pre {
                            padding: 12px;
                            margin: 0;
                            font-size: 12px;
                            font-family: var(--vscode-editor-font-family, monospace);
                            overflow: auto;
                            max-height: 150px;
                            white-space: pre-wrap;
                            word-break: break-all;
                        }
                        .vc-error-stack {
                            border-top: 1px solid rgba(255, 0, 0, 0.2);
                            opacity: 0.7;
                        }
                        .vc-error-actions {
                            display: flex;
                            gap: 10px;
                            justify-content: center;
                            flex-wrap: wrap;
                        }
                        .vc-error-btn {
                            padding: 10px 20px;
                            border: none;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 14px;
                            font-weight: 500;
                            transition: all 0.2s;
                        }
                        .vc-error-btn--primary {
                            background: var(--vscode-button-background, #0e639c);
                            color: var(--vscode-button-foreground, #fff);
                        }
                        .vc-error-btn--primary:hover {
                            background: var(--vscode-button-hoverBackground, #1177bb);
                            transform: translateY(-1px);
                        }
                        .vc-error-btn--secondary {
                            background: transparent;
                            color: var(--vscode-button-foreground, #fff);
                            border: 1px solid var(--vscode-button-border, #666);
                        }
                        .vc-error-btn--secondary:hover {
                            background: var(--vscode-button-secondaryHoverBackground, rgba(255,255,255,0.1));
                        }
                    `}</style>
                </div>
            );
        }

        return this.props.children;
    }
}
