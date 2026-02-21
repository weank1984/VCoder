import fs from 'node:fs/promises';
import path from 'node:path';

export type AuditEventType =
  | 'user_prompt'
  | 'tool_call'
  | 'file_operation'
  | 'terminal_command'
  | 'error'
  | 'session_start'
  | 'session_end';

export interface AuditEntry {
  timestamp: string;
  sessionId: string;
  eventType: AuditEventType;
  data: Record<string, unknown>;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export class DesktopAuditLogger {
  private readonly logPath: string;
  private readonly rotatedPath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(stateDir: string) {
    this.logPath = path.join(stateDir, 'audit.jsonl');
    this.rotatedPath = path.join(stateDir, 'audit.1.jsonl');
  }

  log(entry: AuditEntry): void {
    this.writeQueue = this.writeQueue.then(() => this.append(entry)).catch(() => {
      // swallow write errors to never block the main flow
    });
  }

  logUserPrompt(sessionId: string, prompt: string): void {
    this.log({ timestamp: now(), sessionId, eventType: 'user_prompt', data: { prompt: truncate(prompt, 500) } });
  }

  logToolCall(sessionId: string, toolName: string, input: unknown, toolCallId?: string): void {
    this.log({ timestamp: now(), sessionId, eventType: 'tool_call', data: { toolName, toolCallId, input } });
  }

  logFileOperation(sessionId: string, filePath: string, op: 'write' | 'delete' | 'accept' | 'reject', decision?: string): void {
    this.log({ timestamp: now(), sessionId, eventType: 'file_operation', data: { path: filePath, op, decision } });
  }

  logTerminalCommand(sessionId: string, command: string, cwd: string, exitCode?: number | null, durationMs?: number): void {
    this.log({ timestamp: now(), sessionId, eventType: 'terminal_command', data: { command, cwd, exitCode, durationMs } });
  }

  logSessionStart(sessionId: string, source: string, title?: string): void {
    this.log({ timestamp: now(), sessionId, eventType: 'session_start', data: { source, title } });
  }

  logSessionEnd(sessionId: string, reason: string): void {
    this.log({ timestamp: now(), sessionId, eventType: 'session_end', data: { reason } });
  }

  logError(sessionId: string, errorType: string, message: string): void {
    this.log({ timestamp: now(), sessionId, eventType: 'error', data: { errorType, message: truncate(message, 300) } });
  }

  private async append(entry: AuditEntry): Promise<void> {
    const line = JSON.stringify(entry) + '\n';
    await this.rotateIfNeeded();
    await fs.appendFile(this.logPath, line, 'utf-8');
  }

  private async rotateIfNeeded(): Promise<void> {
    try {
      const stat = await fs.stat(this.logPath);
      if (stat.size >= MAX_FILE_BYTES) {
        await fs.rename(this.logPath, this.rotatedPath);
      }
    } catch {
      // file doesn't exist yet or stat failed — no rotation needed
    }
  }
}

function now(): string {
  return new Date().toISOString();
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + '…';
}
