/**
 * Permission Dialog Component
 * Modal dialog for handling session/request_permission from agent
 * Enhanced with keyboard shortcuts and better UX
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { postMessage } from '../utils/vscode';
import './PermissionDialog.scss';

export interface PermissionRequest {
    requestId: string;
    sessionId: string;
    toolCallId: string;
    toolName: string;
    toolInput: Record<string, unknown>;
    metadata?: {
        riskLevel?: 'low' | 'medium' | 'high';
        summary?: string;
        command?: string;
        filePath?: string;
    };
}

interface PermissionDialogProps {
    request: PermissionRequest | null;
    onClose: () => void;
}

export function PermissionDialog({ request, onClose }: PermissionDialogProps) {
    const [rememberChoice, setRememberChoice] = useState(false);
    const [focusedButton, setFocusedButton] = useState<'deny' | 'once' | 'always'>('once');
    const denyBtnRef = useRef<HTMLButtonElement>(null);
    const onceBtnRef = useRef<HTMLButtonElement>(null);
    const alwaysBtnRef = useRef<HTMLButtonElement>(null);

    const handleAllow = useCallback((trustAlways = false) => {
        if (!request) return;
        postMessage({
            type: 'permissionResponse',
            requestId: request.requestId,
            outcome: 'allow',
            trustAlways: trustAlways || rememberChoice,
        });
        onClose();
    }, [request, rememberChoice, onClose]);

    const handleDeny = useCallback(() => {
        if (!request) return;
        postMessage({
            type: 'permissionResponse',
            requestId: request.requestId,
            outcome: 'deny',
        });
        onClose();
    }, [request, onClose]);

    // Handle keyboard shortcuts and navigation
    useEffect(() => {
        if (!request) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Escape: Deny
            if (e.key === 'Escape') {
                e.preventDefault();
                handleDeny();
                return;
            }

            // Enter: Allow Once (default action)
            if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                handleAllow(rememberChoice);
                return;
            }

            // Cmd/Ctrl+Enter: Always Allow
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleAllow(true);
                return;
            }

            // Tab/Arrow keys: Navigate between buttons
            if (e.key === 'Tab' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                const buttons: Array<'deny' | 'once' | 'always'> = ['deny', 'once', 'always'];
                const currentIndex = buttons.indexOf(focusedButton);
                
                let nextIndex: number;
                if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
                    nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
                } else {
                    nextIndex = (currentIndex + 1) % buttons.length;
                }
                
                setFocusedButton(buttons[nextIndex]);
                return;
            }

            // Space: Toggle remember choice
            if (e.key === ' ' && e.target === document.body) {
                e.preventDefault();
                setRememberChoice(!rememberChoice);
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [request, rememberChoice, focusedButton, handleAllow, handleDeny]);

    // Auto-focus the appropriate button when focus changes
    useEffect(() => {
        if (!request) return;
        
        const buttonRef = 
            focusedButton === 'deny' ? denyBtnRef :
            focusedButton === 'always' ? alwaysBtnRef :
            onceBtnRef;
        
        buttonRef.current?.focus();
    }, [focusedButton, request]);

    if (!request) return null;

    const getRiskIcon = () => {
        switch (request.metadata?.riskLevel) {
            case 'high':
                return '🔴';
            case 'medium':
                return '🟡';
            case 'low':
            default:
                return '🟢';
        }
    };

    const getRiskText = () => {
        switch (request.metadata?.riskLevel) {
            case 'high':
                return 'High Risk';
            case 'medium':
                return 'Medium Risk';
            case 'low':
            default:
                return 'Low Risk';
        }
    };

    const formatToolInput = (input: Record<string, unknown>) => {
        try {
            return JSON.stringify(input, null, 2);
        } catch {
            return String(input);
        }
    };

    return (
        <div className="permission-dialog-overlay" onClick={handleDeny}>
            <div className="permission-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="permission-dialog__header">
                    <div className="permission-dialog__title">
                        <span className="permission-dialog__icon">{getRiskIcon()}</span>
                        <span>Permission Required</span>
                    </div>
                    <button className="permission-dialog__close" onClick={handleDeny}>
                        ×
                    </button>
                </div>

                <div className="permission-dialog__content">
                    <div className="permission-dialog__risk">
                        <span className="permission-dialog__risk-label">
                            Risk Level:
                        </span>
                        <span className="permission-dialog__risk-value">
                            {getRiskText()}
                        </span>
                    </div>

                    {request.metadata?.summary && (
                        <div className="permission-dialog__summary">
                            {request.metadata.summary}
                        </div>
                    )}

                    <div className="permission-dialog__details">
                        <div className="permission-dialog__detail-item">
                            <span className="permission-dialog__detail-label">
                                Tool:
                            </span>
                            <code className="permission-dialog__detail-value">
                                {request.toolName}
                            </code>
                        </div>

                        {request.metadata?.command && (
                            <div className="permission-dialog__detail-item">
                                <span className="permission-dialog__detail-label">
                                    Command:
                                </span>
                                <code className="permission-dialog__detail-value permission-dialog__detail-value--command">
                                    {request.metadata.command}
                                </code>
                            </div>
                        )}

                        {request.metadata?.filePath && (
                            <div className="permission-dialog__detail-item">
                                <span className="permission-dialog__detail-label">
                                    File:
                                </span>
                                <code className="permission-dialog__detail-value">
                                    {request.metadata.filePath}
                                </code>
                            </div>
                        )}

                        <details className="permission-dialog__detail-expandable">
                            <summary>
                                Show Tool Input
                            </summary>
                            <pre className="permission-dialog__detail-code">
                                {formatToolInput(request.toolInput)}
                            </pre>
                        </details>
                    </div>
                </div>

                <div className="permission-dialog__footer">
                    <label className="permission-dialog__remember">
                        <input 
                            type="checkbox" 
                            checked={rememberChoice}
                            onChange={(e) => setRememberChoice(e.target.checked)}
                        />
                        <span>Remember my choice</span>
                    </label>

                    <div className="permission-dialog__actions">
                        <button 
                            ref={denyBtnRef}
                            className={`permission-dialog__btn permission-dialog__btn--deny ${focusedButton === 'deny' ? 'focused' : ''}`}
                            onClick={handleDeny}
                            title="Deny (Esc)"
                        >
                            Deny
                        </button>
                        <button 
                            ref={onceBtnRef}
                            className={`permission-dialog__btn permission-dialog__btn--allow-once ${focusedButton === 'once' ? 'focused' : ''}`}
                            onClick={() => handleAllow(false)}
                            title="Allow Once (Enter)"
                        >
                            Allow Once
                        </button>
                        <button 
                            ref={alwaysBtnRef}
                            className={`permission-dialog__btn permission-dialog__btn--allow-always ${focusedButton === 'always' ? 'focused' : ''}`}
                            onClick={() => handleAllow(true)}
                            title="Always Allow (Cmd/Ctrl+Enter)"
                        >
                            Always Allow
                        </button>
                    </div>

                    <div className="permission-dialog__shortcuts">
                        <div className="shortcut-hint">
                            <kbd>Enter</kbd> Allow Once
                        </div>
                        <div className="shortcut-hint">
                            <kbd>⌘/Ctrl+Enter</kbd> Always Allow
                        </div>
                        <div className="shortcut-hint">
                            <kbd>Esc</kbd> Deny
                        </div>
                        <div className="shortcut-hint">
                            <kbd>Tab/Arrow</kbd> Navigate
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
