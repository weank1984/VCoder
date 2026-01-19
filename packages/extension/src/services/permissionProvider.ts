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
        data?: RequestPermissionParams; // Store request data for trust always rules
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
            this.pendingRequests.set(requestId, { resolve, reject, data: params });

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
        if (data.trustAlways && data.outcome === 'allow' && pending.data) {
            result.updatedRules = this.createTrustAlwaysRule(pending.data, data.outcome);
            console.log('[PermissionProvider] Created trust always rule for:', pending.data.toolName);
        }

        pending.resolve(result);
    }

    /**
     * Create a trust always rule for the given permission request
     */
    private createTrustAlwaysRule(
        params: RequestPermissionParams, 
        outcome: 'allow' | 'deny'
    ): Array<{
        id: string;
        toolName?: string;
        pattern?: string;
        action: 'allow' | 'deny';
        createdAt: string;
        updatedAt: string;
        expiresAt?: string;
        description?: string;
        sessionId?: string;
    }> {
        const toolPattern = this.generateToolPattern(params.toolName, params.toolInput as Record<string, unknown>);
        const now = Date.now();
        const nowString = new Date(now).toISOString();
        
        return [{
            id: `trust_${now}_${Math.random().toString(36).substring(7)}`,
            toolName: params.toolName,
            pattern: toolPattern,
            action: outcome,
            createdAt: nowString,
            updatedAt: nowString,
            sessionId: params.sessionId,
            description: `Always ${outcome} ${params.toolName} operations`,
        }];
    }

    /**
     * Generate a safe pattern for tool matching
     */
    private generateToolPattern(toolName: string, toolInput?: Record<string, unknown>): string {
        // For file operations, create patterns based on file paths
        if (toolName === 'Read' || toolName === 'Write' || toolName === 'Edit') {
            const filePath = (toolInput?.['path'] as string) || (toolInput?.['filePath'] as string);
            if (filePath) {
                return `^${this.escapeRegExp(filePath)}`;
            }
            return '^[\\w\\-.\\/]+$';  // Match any word, dash, or slash
        }
        
        // For bash commands, detect common dangerous patterns
        if (toolName === 'Bash') {
            const command = toolInput?.['command'] as string;
            if (command) {
                // Don't auto-allow dangerous commands
                const dangerousPatterns = ['rm -rf', 'chmod +x', 'sudo', 'su ', 'dd if='];
                if (dangerousPatterns.some(pattern => command.includes(pattern))) {
                    return ''; // No pattern match for dangerous commands
                }
            }
            return '^\\s*echo\\s+.*$|^[\\w\\-.\\/]+$'; // Allow safe echo or basic commands
        }
        
        // Default: match exact tool name
        return `^${this.escapeRegExp(toolName)}$`;
    }

    /**
     * Categorize tool by type for better permission management
     */
    private categorizeTool(toolName: string): string {
        const lowerName = toolName.toLowerCase();
        
        if (['read', 'write', 'edit', 'glob', 'grep'].includes(lowerName)) {
            return 'file-operations';
        }
        
        if (['bash', 'shell', 'execute'].includes(lowerName)) {
            return 'commands';
        }
        
        if (lowerName.startsWith('mcp__')) {
            return 'mcp-tool';
        }
        
        return 'other';
    }

    /**
     * Escape special regex characters
     */
    private escapeRegExp(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}