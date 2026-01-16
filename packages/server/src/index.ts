/**
 * VCoder Agent Server
 * Entry point - listens on stdin/stdout for ACP messages
 */

import { ClaudeCodeWrapper } from './claude/wrapper';
import { ACPServer } from './acp/server';

async function main() {
    console.error('[VCoder Server] Starting...');

    // Create Claude Code CLI wrapper
    const claudeCode = new ClaudeCodeWrapper({
        workingDirectory: process.cwd(),
    });

    // Create ACP Server, listening on stdin/stdout
    const server = new ACPServer(process.stdin, process.stdout, claudeCode);

    await server.start();

    console.error('[VCoder Server] Ready');

    // Handle shutdown signals
    process.on('SIGTERM', async () => {
        console.error('[VCoder Server] Shutting down...');
        await claudeCode.shutdown();
        await server.shutdown();
        process.exit(0);
    });

    process.on('SIGINT', async () => {
        console.error('[VCoder Server] Interrupted, shutting down...');
        await claudeCode.shutdown();
        await server.shutdown();
        process.exit(0);
    });
}

main().catch((err) => {
    console.error('[VCoder Server] Fatal error:', err);
    process.exit(1);
});
