/**
 * Permission Dialog Component
 * Modal dialog for handling session/request_permission from agent
 */

import { useEffect } from 'react';
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
    // Close on Escape key
    useEffect(() => {
        if (!request) return;

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                handleDeny();
            }
        };

        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [request]);

    if (!request) return null;

    const handleAllow = (trustAlways = false) => {
        postMessage({
            type: 'permissionResponse',
            requestId: request.requestId,
            outcome: 'allow',
            trustAlways,
        });
        onClose();
    };

    const handleDeny = () => {
        postMessage({
            type: 'permissionResponse',
            requestId: request.requestId,
            outcome: 'deny',
        });
        onClose();
    };

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

                <div className="permission-dialog__actions">
                    <button 
                        className="permission-dialog__btn permission-dialog__btn--deny"
                        onClick={handleDeny}
                    >
                        Deny
                    </button>
                    <button 
                        className="permission-dialog__btn permission-dialog__btn--allow-once"
                        onClick={() => handleAllow(false)}
                    >
                        Allow Once
                    </button>
                    <button 
                        className="permission-dialog__btn permission-dialog__btn--allow-always"
                        onClick={() => handleAllow(true)}
                    >
                        Always Allow
                    </button>
                </div>
            </div>
        </div>
    );
}
