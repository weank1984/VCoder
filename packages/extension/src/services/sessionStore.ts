/**
 * Session Store Service
 * Manages session state persistence using VSCode Memento API
 * Features:
 * - Auto-save session state on changes
 * - Session recovery on VSCode restart
 * - Draft auto-save (prevent message loss)
 * - Session export/import (JSON format)
 */

import * as vscode from 'vscode';
import { Session } from '@vcoder/shared';

export interface SessionState {
    id: string;
    createdAt: number;
    updatedAt: number;
    agentId: string;
    messages: SessionMessage[];
    toolCalls: SessionToolCall[];
    permissionRules: PermissionRule[];
    draft?: string;
    metadata: {
        workspaceRoot: string;
        agentVersion: string;
        model?: string;
        permissionMode?: string;
    };
}

export interface SessionMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    thought?: string;
    timestamp: number;
}

export interface SessionToolCall {
    id: string;
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    input?: unknown;
    result?: unknown;
    error?: string;
    timestamp: number;
}

export interface PermissionRule {
    toolName: string;
    pattern?: string;
    decision: 'allow' | 'deny';
    createdAt: number;
}

export interface SessionExportData {
    version: string;
    exportedAt: number;
    sessions: SessionState[];
}

const STORAGE_KEY_PREFIX = 'vcoder.session';
const CURRENT_SESSION_KEY = 'vcoder.currentSessionId';
const DRAFT_KEY_PREFIX = 'vcoder.draft';
const EXPORT_VERSION = '1.0';

/**
 * Session Store Manager
 */
export class SessionStore {
    private autoSaveDebounceTimer: NodeJS.Timeout | null = null;
    private readonly autoSaveDelay = 500; // 500ms debounce

    constructor(
        private context: vscode.ExtensionContext,
        private workspaceState: vscode.Memento,
        private globalState: vscode.Memento
    ) {}

    /**
     * Save session state (debounced).
     */
    async saveSession(state: SessionState): Promise<void> {
        // Clear existing debounce timer
        if (this.autoSaveDebounceTimer) {
            clearTimeout(this.autoSaveDebounceTimer);
        }

        // Debounce save to avoid excessive writes
        this.autoSaveDebounceTimer = setTimeout(async () => {
            try {
                state.updatedAt = Date.now();
                const key = `${STORAGE_KEY_PREFIX}.${state.id}`;
                await this.workspaceState.update(key, state);
                console.log(`[SessionStore] Saved session: ${state.id}`);
            } catch (error) {
                console.error('[SessionStore] Failed to save session:', error);
                vscode.window.showErrorMessage(`Failed to save session: ${error}`);
            }
        }, this.autoSaveDelay);
    }

    /**
     * Load session state by ID.
     */
    async loadSession(sessionId: string): Promise<SessionState | null> {
        try {
            const key = `${STORAGE_KEY_PREFIX}.${sessionId}`;
            const state = this.workspaceState.get<SessionState>(key);
            
            if (state) {
                console.log(`[SessionStore] Loaded session: ${sessionId}`);
                return state;
            }
            
            return null;
        } catch (error) {
            console.error('[SessionStore] Failed to load session:', error);
            return null;
        }
    }

    /**
     * Delete session state.
     */
    async deleteSession(sessionId: string): Promise<void> {
        try {
            const key = `${STORAGE_KEY_PREFIX}.${sessionId}`;
            await this.workspaceState.update(key, undefined);
            
            // Also delete draft
            await this.deleteDraft(sessionId);
            
            console.log(`[SessionStore] Deleted session: ${sessionId}`);
        } catch (error) {
            console.error('[SessionStore] Failed to delete session:', error);
        }
    }

    /**
     * List all saved sessions.
     */
    async listSessions(): Promise<string[]> {
        try {
            const keys = this.workspaceState.keys();
            const sessionKeys = keys.filter(k => k.startsWith(STORAGE_KEY_PREFIX + '.'));
            const sessionIds = sessionKeys.map(k => k.replace(STORAGE_KEY_PREFIX + '.', ''));
            
            return sessionIds;
        } catch (error) {
            console.error('[SessionStore] Failed to list sessions:', error);
            return [];
        }
    }

    /**
     * Save current session ID.
     */
    async saveCurrentSessionId(sessionId: string | null): Promise<void> {
        try {
            await this.workspaceState.update(CURRENT_SESSION_KEY, sessionId);
        } catch (error) {
            console.error('[SessionStore] Failed to save current session ID:', error);
        }
    }

    /**
     * Load current session ID.
     */
    async loadCurrentSessionId(): Promise<string | null> {
        try {
            return this.workspaceState.get<string>(CURRENT_SESSION_KEY) || null;
        } catch (error) {
            console.error('[SessionStore] Failed to load current session ID:', error);
            return null;
        }
    }

    /**
     * Save draft for a session.
     */
    async saveDraft(sessionId: string, draft: string): Promise<void> {
        try {
            const key = `${DRAFT_KEY_PREFIX}.${sessionId}`;
            await this.workspaceState.update(key, draft);
        } catch (error) {
            console.error('[SessionStore] Failed to save draft:', error);
        }
    }

    /**
     * Load draft for a session.
     */
    async loadDraft(sessionId: string): Promise<string | null> {
        try {
            const key = `${DRAFT_KEY_PREFIX}.${sessionId}`;
            return this.workspaceState.get<string>(key) || null;
        } catch (error) {
            console.error('[SessionStore] Failed to load draft:', error);
            return null;
        }
    }

    /**
     * Delete draft for a session.
     */
    async deleteDraft(sessionId: string): Promise<void> {
        try {
            const key = `${DRAFT_KEY_PREFIX}.${sessionId}`;
            await this.workspaceState.update(key, undefined);
        } catch (error) {
            console.error('[SessionStore] Failed to delete draft:', error);
        }
    }

    /**
     * Export sessions to JSON.
     */
    async exportSessions(sessionIds?: string[]): Promise<SessionExportData> {
        try {
            const idsToExport = sessionIds || await this.listSessions();
            const sessions: SessionState[] = [];

            for (const id of idsToExport) {
                const state = await this.loadSession(id);
                if (state) {
                    // Optionally sanitize sensitive data
                    const sanitized = this.sanitizeSessionForExport(state);
                    sessions.push(sanitized);
                }
            }

            const exportData: SessionExportData = {
                version: EXPORT_VERSION,
                exportedAt: Date.now(),
                sessions,
            };

            return exportData;
        } catch (error) {
            console.error('[SessionStore] Failed to export sessions:', error);
            throw error;
        }
    }

    /**
     * Import sessions from JSON.
     */
    async importSessions(exportData: SessionExportData): Promise<{ imported: number; skipped: number }> {
        try {
            let imported = 0;
            let skipped = 0;

            for (const session of exportData.sessions) {
                // Check if session already exists
                const existing = await this.loadSession(session.id);
                if (existing) {
                    // Ask user if they want to overwrite
                    const choice = await vscode.window.showWarningMessage(
                        `Session "${session.id}" already exists. Overwrite?`,
                        'Yes', 'No'
                    );
                    
                    if (choice !== 'Yes') {
                        skipped++;
                        continue;
                    }
                }

                await this.saveSession(session);
                imported++;
            }

            return { imported, skipped };
        } catch (error) {
            console.error('[SessionStore] Failed to import sessions:', error);
            throw error;
        }
    }

    /**
     * Export sessions to file.
     */
    async exportToFile(sessionIds?: string[]): Promise<void> {
        try {
            const exportData = await this.exportSessions(sessionIds);
            
            // Ask user for save location
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(`vcoder-sessions-${Date.now()}.json`),
                filters: {
                    'JSON Files': ['json'],
                    'All Files': ['*']
                }
            });

            if (!uri) {
                return; // User cancelled
            }

            // Write to file
            const content = JSON.stringify(exportData, null, 2);
            await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
            
            vscode.window.showInformationMessage(
                `Exported ${exportData.sessions.length} session(s) successfully`
            );
        } catch (error) {
            console.error('[SessionStore] Failed to export to file:', error);
            vscode.window.showErrorMessage(`Failed to export sessions: ${error}`);
        }
    }

    /**
     * Import sessions from file.
     */
    async importFromFile(): Promise<void> {
        try {
            // Ask user to select file
            const uris = await vscode.window.showOpenDialog({
                canSelectMany: false,
                filters: {
                    'JSON Files': ['json'],
                    'All Files': ['*']
                }
            });

            if (!uris || uris.length === 0) {
                return; // User cancelled
            }

            // Read file
            const content = await vscode.workspace.fs.readFile(uris[0]);
            const contentStr = Buffer.from(content).toString('utf-8');
            const exportData: SessionExportData = JSON.parse(contentStr);

            // Validate version
            if (exportData.version !== EXPORT_VERSION) {
                throw new Error(`Unsupported export version: ${exportData.version}`);
            }

            // Import
            const result = await this.importSessions(exportData);
            
            vscode.window.showInformationMessage(
                `Imported ${result.imported} session(s), skipped ${result.skipped}`
            );
        } catch (error) {
            console.error('[SessionStore] Failed to import from file:', error);
            vscode.window.showErrorMessage(`Failed to import sessions: ${error}`);
        }
    }

    /**
     * Sanitize session data for export (remove sensitive info).
     */
    private sanitizeSessionForExport(state: SessionState): SessionState {
        // Create a deep copy
        const sanitized = JSON.parse(JSON.stringify(state)) as SessionState;

        // Remove potentially sensitive data
        // - API keys from metadata
        // - Personal identifiable information
        // - File paths can be kept as they are workspace-relative

        // For now, we keep everything but this can be extended
        return sanitized;
    }

    /**
     * Clean up old sessions (older than retention period).
     */
    async cleanupOldSessions(retentionDays: number = 30): Promise<number> {
        try {
            const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
            const sessionIds = await this.listSessions();
            let deleted = 0;

            for (const id of sessionIds) {
                const state = await this.loadSession(id);
                if (state && state.updatedAt < cutoff) {
                    await this.deleteSession(id);
                    deleted++;
                }
            }

            console.log(`[SessionStore] Cleaned up ${deleted} old sessions`);
            return deleted;
        } catch (error) {
            console.error('[SessionStore] Failed to cleanup old sessions:', error);
            return 0;
        }
    }

    /**
     * Dispose and cleanup.
     */
    dispose(): void {
        if (this.autoSaveDebounceTimer) {
            clearTimeout(this.autoSaveDebounceTimer);
        }
    }
}
