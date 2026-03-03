/**
 * TerminalBufferService
 * Ring buffer for terminal shell execution output (@terminal feature).
 */

import * as vscode from 'vscode';

export class TerminalBufferService implements vscode.Disposable {
    private buffer: string[] = [];
    private readonly MAX_LINES = 200;
    private disposable?: vscode.Disposable;

    /**
     * Register the terminal shell execution listener.
     * Returns a Disposable to unregister.
     */
    register(context: vscode.ExtensionContext): vscode.Disposable {
        if (vscode.window.onDidEndTerminalShellExecution) {
            this.disposable = vscode.window.onDidEndTerminalShellExecution(async (e) => {
                try {
                    const stream = e.execution.read();
                    const lines: string[] = [];
                    for await (const data of stream) {
                        lines.push(data);
                    }
                    // Truncate long lines before buffering
                    const truncatedLines = lines.map(line => line.length > 2000 ? line.slice(0, 2000) + '...[truncated]' : line);
                    // Append to ring buffer
                    this.buffer.push(...truncatedLines);
                    if (this.buffer.length > this.MAX_LINES) {
                        this.buffer = this.buffer.slice(-this.MAX_LINES);
                    }
                } catch {
                    // Shell integration may not be available
                }
            });
            context.subscriptions.push(this.disposable);
        }
        return this;
    }

    /**
     * Get all buffered terminal output as a single string.
     */
    getOutput(): string {
        return this.buffer.join('\n');
    }

    dispose(): void {
        this.disposable?.dispose();
    }
}
