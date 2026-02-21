/**
 * Audit Logger Service
 * Comprehensive logging system for VCoder operations
 * Features:
 * - Structured JSONL format logs
 * - Async non-blocking writes
 * - Log rotation by size/time
 * - Automatic sensitive data redaction
 * - Export and query capabilities
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

export type AuditEventType = 
    | 'user_prompt'
    | 'agent_response'
    | 'tool_call'
    | 'permission_request'
    | 'permission_decision'
    | 'file_operation'
    | 'terminal_command'
    | 'error'
    | 'session_start'
    | 'session_end'
    | 'agent_crash';

export interface AuditEvent {
    timestamp: string; // ISO 8601
    sessionId: string;
    eventType: AuditEventType;
    userId?: string;
    
    // Event-specific data
    data: {
        // User prompt
        prompt?: string;
        promptHash?: string; // Hash for privacy
        
        // Agent response
        response?: string;
        responseHash?: string;
        modelId?: string;
        durationMs?: number;
        
        // Tool call
        toolName?: string;
        toolInput?: Record<string, unknown>;
        toolResult?: unknown;
        toolError?: string;
        toolStatus?: 'pending' | 'running' | 'completed' | 'failed';
        
        // Permission
        permissionType?: string;
        permissionDecision?: 'allow' | 'deny';
        trustAlways?: boolean;
        
        // File operation
        filePath?: string;
        operation?: 'read' | 'write' | 'delete';
        diffHash?: string;
        fileSize?: number;
        
        // Terminal
        command?: string;
        commandHash?: string;
        cwd?: string;
        exitCode?: number;
        outputLength?: number;
        
        // Error
        errorType?: string;
        errorMessage?: string;
        errorStack?: string;
        
        // Metadata
        [key: string]: unknown;
    };
}

export interface IntegrityReport {
    sessionsWithoutEnd: string[];
    toolCallsWithoutResult: Array<{ sessionId: string; toolCallId: string }>;
    timestampMonotonic: boolean;
    corruptedLines: number;
    integrityScore: number; // 0-100
}

export interface AuditLogStats {
    totalEvents: number;
    eventsByType: Record<AuditEventType, number>;
    sessionCount: number;
    errorCount: number;
    dateRange: { start: string; end: string };
    fileSize: number;
    integrity?: IntegrityReport;
}

export interface AuditQueryOptions {
    sessionId?: string;
    eventTypes?: AuditEventType[];
    startTime?: number;
    endTime?: number;
    limit?: number;
}

const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB
const LOG_ROTATION_COUNT = 5;

/**
 * Audit Logger
 */
export class AuditLogger {
    private logFilePath: string;
    private writeQueue: AuditEvent[] = [];
    private isWriting: boolean = false;
    private writeTimer: NodeJS.Timeout | null = null;
    
    constructor(private context: vscode.ExtensionContext) {
        // Create logs directory in global storage
        const logsDir = path.join(context.globalStorageUri.fsPath, 'audit-logs');
        this.logFilePath = path.join(logsDir, 'audit.jsonl');
        
        // Ensure logs directory exists
        void this.ensureLogsDirectory();
    }

    /**
     * Log an audit event.
     */
    async log(event: Omit<AuditEvent, 'timestamp'>): Promise<void> {
        const fullEvent: AuditEvent = {
            ...event,
            timestamp: new Date().toISOString(),
        };
        
        // Redact sensitive data
        const redacted = this.redactSensitiveData(fullEvent);
        
        // Add to write queue
        this.writeQueue.push(redacted);
        
        // Schedule write (debounced)
        this.scheduleWrite();
    }

    /**
     * Log user prompt.
     */
    async logUserPrompt(sessionId: string, prompt: string): Promise<void> {
        await this.log({
            sessionId,
            eventType: 'user_prompt',
            data: {
                prompt: this.truncate(prompt, 1000),
                promptHash: this.hashContent(prompt),
            },
        });
    }

    /**
     * Log agent response.
     */
    async logAgentResponse(
        sessionId: string,
        response: string,
        modelId: string,
        durationMs: number
    ): Promise<void> {
        await this.log({
            sessionId,
            eventType: 'agent_response',
            data: {
                response: this.truncate(response, 1000),
                responseHash: this.hashContent(response),
                modelId,
                durationMs,
            },
        });
    }

    /**
     * Log tool call.
     */
    async logToolCall(
        sessionId: string,
        toolName: string,
        toolInput: Record<string, unknown>,
        toolResult?: unknown,
        toolError?: string,
        durationMs?: number,
        toolCallId?: string
    ): Promise<void> {
        await this.log({
            sessionId,
            eventType: 'tool_call',
            data: {
                toolName,
                toolCallId,
                toolInput: this.sanitizeObject(toolInput),
                toolResult: toolResult ? this.truncate(JSON.stringify(toolResult), 1000) : undefined,
                toolError,
                durationMs,
            },
        });
    }

    /**
     * Log permission request and decision.
     */
    async logPermission(
        sessionId: string,
        permissionType: string,
        decision: 'allow' | 'deny',
        trustAlways?: boolean
    ): Promise<void> {
        await this.log({
            sessionId,
            eventType: 'permission_decision',
            data: {
                permissionType,
                permissionDecision: decision,
                trustAlways,
            },
        });
    }

    /**
     * Log file operation.
     */
    async logFileOperation(
        sessionId: string,
        filePath: string,
        operation: 'read' | 'write' | 'delete',
        fileSize?: number,
        diffHash?: string,
        toolCallId?: string,
        decision?: 'accepted' | 'rejected'
    ): Promise<void> {
        await this.log({
            sessionId,
            eventType: 'file_operation',
            data: {
                filePath: this.sanitizePath(filePath),
                operation,
                fileSize,
                diffHash,
                toolCallId,
                decision,
            },
        });
    }

    /**
     * Log terminal command.
     */
    async logTerminalCommand(
        sessionId: string,
        command: string,
        cwd: string,
        exitCode?: number,
        outputLength?: number,
        durationMs?: number
    ): Promise<void> {
        await this.log({
            sessionId,
            eventType: 'terminal_command',
            data: {
                command: this.truncate(this.sanitizeCommand(command), 200),
                commandHash: this.hashContent(command),
                cwd: this.sanitizePath(cwd),
                exitCode,
                outputLength,
                durationMs,
            },
        });
    }

    /**
     * Log error.
     */
    async logError(
        sessionId: string,
        errorType: string,
        errorMessage: string,
        errorStack?: string
    ): Promise<void> {
        await this.log({
            sessionId,
            eventType: 'error',
            data: {
                errorType,
                errorMessage,
                errorStack: errorStack ? this.truncate(errorStack, 500) : undefined,
            },
        });
    }

    /**
     * Query audit logs.
     */
    async query(options: AuditQueryOptions = {}): Promise<AuditEvent[]> {
        try {
            // Flush pending writes first
            await this.flushQueue();
            
            // Read log file
            const content = await fs.readFile(this.logFilePath, 'utf-8');
            const lines = content.trim().split('\n');
            
            let events: AuditEvent[] = [];
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const event = JSON.parse(line) as AuditEvent;
                    events.push(event);
                } catch {
                    // Skip invalid lines
                }
            }
            
            // Apply filters
            if (options.sessionId) {
                events = events.filter(e => e.sessionId === options.sessionId);
            }
            
            if (options.eventTypes && options.eventTypes.length > 0) {
                events = events.filter(e => options.eventTypes!.includes(e.eventType));
            }
            
            if (options.startTime) {
                events = events.filter(e => new Date(e.timestamp).getTime() >= options.startTime!);
            }
            
            if (options.endTime) {
                events = events.filter(e => new Date(e.timestamp).getTime() <= options.endTime!);
            }
            
            // Apply limit
            if (options.limit) {
                events = events.slice(0, options.limit);
            }
            
            return events;
        } catch (error) {
            console.error('[AuditLogger] Query failed:', error);
            return [];
        }
    }

    /**
     * Get log statistics with optional integrity check.
     */
    async getStats(includeIntegrity = false): Promise<AuditLogStats> {
        try {
            const events = await this.query();

            const eventsByType: Record<string, number> = {};
            const sessions = new Set<string>();
            let errorCount = 0;
            let minTime = Infinity;
            let maxTime = -Infinity;

            for (const event of events) {
                eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;
                sessions.add(event.sessionId);
                if (event.eventType === 'error' || event.eventType === 'agent_crash') {
                    errorCount++;
                }

                const time = new Date(event.timestamp).getTime();
                minTime = Math.min(minTime, time);
                maxTime = Math.max(maxTime, time);
            }

            let fileSize = 0;
            try {
                const stats = await fs.stat(this.logFilePath);
                fileSize = stats.size;
            } catch {
                // File may not exist yet
            }

            const result: AuditLogStats = {
                totalEvents: events.length,
                eventsByType: eventsByType as Record<AuditEventType, number>,
                sessionCount: sessions.size,
                errorCount,
                dateRange: {
                    start: minTime === Infinity ? '' : new Date(minTime).toISOString(),
                    end: maxTime === -Infinity ? '' : new Date(maxTime).toISOString(),
                },
                fileSize,
            };

            if (includeIntegrity) {
                result.integrity = this.computeIntegrity(events);
            }

            return result;
        } catch (error) {
            console.error('[AuditLogger] Get stats failed:', error);
            return {
                totalEvents: 0,
                eventsByType: {} as Record<AuditEventType, number>,
                sessionCount: 0,
                errorCount: 0,
                dateRange: { start: '', end: '' },
                fileSize: 0,
            };
        }
    }

    /**
     * Compute integrity report from events.
     */
    private computeIntegrity(events: AuditEvent[]): IntegrityReport {
        const sessionStarts = new Set<string>();
        const sessionEnds = new Set<string>();
        const toolCalls = new Map<string, { sessionId: string; toolCallId: string }>();
        const toolResults = new Set<string>();
        let timestampMonotonic = true;
        let prevTime = 0;
        let corruptedLines = 0;
        let totalChecks = 0;
        let passedChecks = 0;

        for (const event of events) {
            const time = new Date(event.timestamp).getTime();
            if (time < prevTime) {
                timestampMonotonic = false;
            }
            prevTime = time;

            if (event.eventType === 'session_start') {
                sessionStarts.add(event.sessionId);
            }
            if (event.eventType === 'session_end') {
                sessionEnds.add(event.sessionId);
            }
            if (event.eventType === 'tool_call') {
                const toolCallId = event.data.toolCallId as string | undefined;
                if (toolCallId && !event.data.toolResult && !event.data.toolError) {
                    toolCalls.set(`${event.sessionId}:${toolCallId}`, {
                        sessionId: event.sessionId,
                        toolCallId,
                    });
                }
                if (toolCallId && (event.data.toolResult || event.data.toolError)) {
                    toolResults.add(`${event.sessionId}:${toolCallId}`);
                }
            }
        }

        // Check session start/end pairing
        const sessionsWithoutEnd: string[] = [];
        for (const sid of sessionStarts) {
            totalChecks++;
            if (sessionEnds.has(sid)) {
                passedChecks++;
            } else {
                sessionsWithoutEnd.push(sid);
            }
        }

        // Check tool call/result pairing
        const toolCallsWithoutResult: Array<{ sessionId: string; toolCallId: string }> = [];
        for (const [key, info] of toolCalls) {
            totalChecks++;
            if (toolResults.has(key)) {
                passedChecks++;
            } else {
                toolCallsWithoutResult.push(info);
            }
        }

        // Timestamp monotonicity check
        totalChecks++;
        if (timestampMonotonic) {
            passedChecks++;
        }

        const integrityScore = totalChecks > 0
            ? Math.round((passedChecks / totalChecks) * 100)
            : 100;

        return {
            sessionsWithoutEnd,
            toolCallsWithoutResult,
            timestampMonotonic,
            corruptedLines,
            integrityScore,
        };
    }

    /**
     * Log agent crash event.
     */
    async logAgentCrash(
        sessionId: string,
        exitCode: number | null,
        stderr?: string,
        lastOperation?: string
    ): Promise<void> {
        await this.log({
            sessionId,
            eventType: 'agent_crash',
            data: {
                exitCode: exitCode ?? undefined,
                stderr: stderr ? this.truncate(stderr, 2000) : undefined,
                lastOperation,
            },
        });
    }

    /**
     * Check for unclosed sessions from previous run and record unclean shutdown.
     * Call this on extension activation.
     */
    async checkUncleanShutdown(): Promise<void> {
        try {
            const events = await this.query();
            const sessionStarts = new Set<string>();
            const sessionEnds = new Set<string>();

            for (const event of events) {
                if (event.eventType === 'session_start') {
                    sessionStarts.add(event.sessionId);
                }
                if (event.eventType === 'session_end') {
                    sessionEnds.add(event.sessionId);
                }
            }

            for (const sid of sessionStarts) {
                if (!sessionEnds.has(sid)) {
                    await this.log({
                        sessionId: sid,
                        eventType: 'session_end',
                        data: { reason: 'unclean_shutdown' },
                    });
                    console.warn(`[AuditLogger] Recorded unclean shutdown for session: ${sid}`);
                }
            }
        } catch (error) {
            console.error('[AuditLogger] Failed to check unclean shutdown:', error);
        }
    }

    /**
     * Export logs to file.
     * Filename includes timestamp and optional sessionId for traceability.
     */
    async exportToFile(options: AuditQueryOptions = {}): Promise<void> {
        try {
            const events = await this.query(options);

            // Build descriptive filename
            const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
            const sessionSuffix = options.sessionId ? `-${options.sessionId.slice(0, 8)}` : '';
            const defaultName = `vcoder-audit-${ts}${sessionSuffix}.jsonl`;

            // Ask user for save location
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(defaultName),
                filters: {
                    'JSONL Files': ['jsonl'],
                    'JSON Files': ['json'],
                    'All Files': ['*'],
                },
            });

            if (!uri) {
                return; // User cancelled
            }

            // Write to file
            const content = events.map(e => JSON.stringify(e)).join('\n');
            await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));

            vscode.window.showInformationMessage(
                `Exported ${events.length} audit event(s) successfully`
            );
        } catch (error) {
            console.error('[AuditLogger] Export failed:', error);
            vscode.window.showErrorMessage(`Failed to export audit logs: ${error}`);
        }
    }

    /**
     * Ensure logs directory exists.
     */
    private async ensureLogsDirectory(): Promise<void> {
        try {
            const logsDir = path.dirname(this.logFilePath);
            await fs.mkdir(logsDir, { recursive: true });
        } catch (error) {
            console.error('[AuditLogger] Failed to create logs directory:', error);
        }
    }

    /**
     * Schedule write (debounced).
     */
    private scheduleWrite(): void {
        if (this.writeTimer) {
            clearTimeout(this.writeTimer);
        }
        
        this.writeTimer = setTimeout(() => {
            void this.flushQueue();
        }, 1000); // 1 second debounce
    }

    /**
     * Flush write queue to disk.
     */
    private async flushQueue(): Promise<void> {
        if (this.isWriting || this.writeQueue.length === 0) {
            return;
        }
        
        this.isWriting = true;
        const events = [...this.writeQueue];
        this.writeQueue = [];
        
        try {
            // Check if log rotation is needed
            await this.rotateIfNeeded();
            
            // Append events to log file
            const lines = events.map(e => JSON.stringify(e)).join('\n') + '\n';
            await fs.appendFile(this.logFilePath, lines, 'utf-8');
        } catch (error) {
            console.error('[AuditLogger] Failed to write logs:', error);
            // Put events back in queue
            this.writeQueue.unshift(...events);
        } finally {
            this.isWriting = false;
        }
    }

    /**
     * Rotate log file if needed.
     */
    private async rotateIfNeeded(): Promise<void> {
        try {
            const stats = await fs.stat(this.logFilePath);
            
            if (stats.size >= MAX_LOG_SIZE) {
                console.log('[AuditLogger] Rotating log file');
                
                // Shift existing rotated logs
                for (let i = LOG_ROTATION_COUNT - 1; i > 0; i--) {
                    const oldPath = `${this.logFilePath}.${i}`;
                    const newPath = `${this.logFilePath}.${i + 1}`;
                    
                    try {
                        await fs.rename(oldPath, newPath);
                    } catch {
                        // File doesn't exist, skip
                    }
                }
                
                // Move current log to .1
                await fs.rename(this.logFilePath, `${this.logFilePath}.1`);
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                console.error('[AuditLogger] Log rotation failed:', error);
            }
        }
    }

    /**
     * Redact sensitive data from event.
     */
    private redactSensitiveData(event: AuditEvent): AuditEvent {
        const redacted = { ...event };
        
        // Redact API keys, tokens, passwords
        const sensitivePatterns = [
            /api[_-]?key/i,
            /token/i,
            /password/i,
            /secret/i,
            /auth/i,
        ];
        
        function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
            const result: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(obj)) {
                if (sensitivePatterns.some(p => p.test(key))) {
                    result[key] = '[REDACTED]';
                } else if (typeof value === 'object' && value !== null) {
                    result[key] = redactObject(value as Record<string, unknown>);
                } else {
                    result[key] = value;
                }
            }
            return result;
        }
        
        redacted.data = redactObject(event.data);
        return redacted;
    }

    /**
     * Sanitize file path (remove user-specific parts).
     */
    private sanitizePath(filePath: string): string {
        // Replace home directory with ~
        const home = process.env.HOME || process.env.USERPROFILE || '';
        if (home && filePath.startsWith(home)) {
            return filePath.replace(home, '~');
        }
        return filePath;
    }

    /**
     * Sanitize a bash command by redacting env variable values and sensitive patterns.
     */
    private sanitizeCommand(command: string): string {
        let sanitized = command;

        // Redact inline env variable assignments (e.g., API_KEY=abc123 command)
        sanitized = sanitized.replace(
            /\b([A-Z_]+(?:KEY|TOKEN|SECRET|PASSWORD|PASS|AUTH|CREDENTIAL)[A-Z_]*)=(\S+)/gi,
            '$1=[REDACTED]'
        );

        // Redact common secret-passing patterns (e.g., --token=xxx, --password xxx)
        sanitized = sanitized.replace(
            /--(token|password|secret|api-key|auth|credentials?)\s*[=\s]\s*(\S+)/gi,
            '--$1=[REDACTED]'
        );

        return sanitized;
    }

    /**
     * Sanitize object (remove sensitive fields).
     */
    private sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string' && value.length > 200) {
                result[key] = this.truncate(value, 200);
            } else {
                result[key] = value;
            }
        }
        return result;
    }

    /**
     * Truncate string to max length.
     */
    private truncate(str: string, maxLength: number): string {
        if (str.length <= maxLength) {
            return str;
        }
        return str.substring(0, maxLength) + '... [truncated]';
    }

    /**
     * Hash content for privacy.
     */
    private hashContent(content: string): string {
        return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
    }

    /**
     * Dispose and cleanup.
     */
    async dispose(): Promise<void> {
        if (this.writeTimer) {
            clearTimeout(this.writeTimer);
        }
        await this.flushQueue();
    }
}
