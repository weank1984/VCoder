/**
 * Permission Provider
 * Handles session/request_permission from agent
 */

import { RequestPermissionParams, RequestPermissionResult } from '@vcoder/shared';
import { ChatViewProvider } from '../providers/chatViewProvider';

export class PermissionProvider {
    private pendingRequests: Map<string, {
        resolve: (result: RequestPermissionResult) => void;
        reject: (error: Error) => void;
    }> = new Map();

    constructor(private chatProvider: ChatViewProvider) {
        // Listen for permission responses from webview
        this.chatProvider.on('permissionResponse', (data: {
            requestId: string;
            outcome: 'allow' | 'deny';
            trustAlways?: boolean;
        }) => {
            this.handlePermissionResponse(data);
        });
    }

    /**
     * Handle permission request from agent.
     * Returns a promise that resolves when user makes a choice in webview.
     */
    async handlePermissionRequest(params: RequestPermissionParams): Promise<RequestPermissionResult> {
        console.log('[PermissionProvider] Permission request:', params);

        // Generate unique request ID
        const requestId = `perm_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        // Send permission request to webview
        this.chatProvider.postMessage({
            type: 'permissionRequest',
            data: {
                requestId,
                sessionId: params.sessionId,
                toolCallId: params.toolCallId,
                toolName: params.toolName,
                toolInput: params.toolInput,
                metadata: params.metadata,
            },
        });

        // Wait for user response
        return new Promise<RequestPermissionResult>((resolve, reject) => {
            this.pendingRequests.set(requestId, { resolve, reject });

            // Timeout after 5 minutes
            setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                    this.pendingRequests.delete(requestId);
                    reject(new Error('Permission request timed out'));
                }
            }, 5 * 60 * 1000);
        });
    }

    /**
     * Handle permission response from webview.
     */
    private handlePermissionResponse(data: {
        requestId: string;
        outcome: 'allow' | 'deny';
        trustAlways?: boolean;
    }): void {
        const pending = this.pendingRequests.get(data.requestId);
        if (!pending) {
            console.warn('[PermissionProvider] No pending request for:', data.requestId);
            return;
        }

        this.pendingRequests.delete(data.requestId);

        const result: RequestPermissionResult = {
            outcome: data.outcome,
        };

        // Handle "Always allow" option
        if (data.trustAlways && data.outcome === 'allow') {
            result.updatedRules = [];
            console.log('[PermissionProvider] Always allow requested but rule persistence not yet implemented');
        }

        pending.resolve(result);
    }
}
