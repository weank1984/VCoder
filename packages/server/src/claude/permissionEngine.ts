/**
 * Permission Engine
 * Pure functions for building confirmation requests and detecting permission patterns.
 * Extracted from ClaudeCodeWrapper — zero state dependencies.
 */

import {
    ConfirmationRequestUpdate,
    ConfirmationType,
} from '@vcoder/shared';
import { computeFileChangeDiff } from './shared';

/**
 * Build a structured ConfirmationRequestUpdate for a tool that needs user approval.
 */
export function buildConfirmationRequestUpdate(
    toolCallId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
    workingDirectory: string,
): ConfirmationRequestUpdate {
    const lower = toolName.toLowerCase();

    if (lower === 'exitplanmode' || lower === 'enterplanmode') {
        const planSummary = typeof toolInput.plan === 'string' ? toolInput.plan : undefined;
        const tasks = Array.isArray(toolInput.tasks) ? toolInput.tasks : undefined;
        const isEnter = lower === 'enterplanmode';
        return {
            id: `confirm-${toolCallId}-${Date.now()}`,
            type: 'plan',
            toolCallId,
            summary: isEnter ? '进入规划模式' : '退出规划模式，开始执行',
            details: {
                ...(tasks ? { tasks } : {}),
                ...(planSummary ? { planSummary } : {}),
            },
        };
    }

    if (lower === 'bash' || lower.includes('bash')) {
        const command =
            (typeof toolInput.command === 'string' && toolInput.command) ||
            (typeof toolInput.cmd === 'string' && toolInput.cmd) ||
            '';
        return {
            id: `confirm-${toolCallId}-${Date.now()}`,
            type: 'bash',
            toolCallId,
            summary: `执行命令需要权限确认: ${command.slice(0, 60)}${command.length > 60 ? '...' : ''}`,
            details: {
                command,
                riskLevel: assessBashRisk(command),
                riskReasons: getBashRiskReasons(command),
            },
        };
    }

    if (lower === 'write' || lower === 'edit' || lower.includes('write') || lower.includes('edit')) {
        const filePath =
            (typeof toolInput.file_path === 'string' && toolInput.file_path) ||
            (typeof toolInput.path === 'string' && toolInput.path) ||
            '';

        let diff: string | undefined;
        const proposedContent = typeof toolInput.content === 'string' ? toolInput.content : undefined;
        if (filePath && typeof proposedContent === 'string' && Buffer.byteLength(proposedContent, 'utf8') <= 1 * 1024 * 1024) {
            const result = computeFileChangeDiff({
                workingDirectory,
                filePath,
                proposedContent,
            });
            diff = result.diff || undefined;
        }
        return {
            id: `confirm-${toolCallId}-${Date.now()}`,
            type: 'file_write',
            toolCallId,
            summary: filePath ? `写入文件需要权限确认: ${filePath}` : '写入文件需要权限确认',
            details: {
                filePath,
                diff,
                riskLevel: 'medium',
            },
        };
    }

    if (lower.includes('delete') || lower.includes('remove')) {
        const filePath =
            (typeof toolInput.file_path === 'string' && toolInput.file_path) ||
            (typeof toolInput.path === 'string' && toolInput.path) ||
            '';
        return {
            id: `confirm-${toolCallId}-${Date.now()}`,
            type: 'file_delete',
            toolCallId,
            summary: filePath ? `删除文件需要权限确认: ${filePath}` : '删除文件需要权限确认',
            details: {
                filePath,
                riskLevel: 'high',
            },
        };
    }

    if (lower.startsWith('mcp__') || lower.startsWith('mcp_')) {
        return {
            id: `confirm-${toolCallId}-${Date.now()}`,
            type: 'mcp',
            toolCallId,
            summary: `MCP 工具调用需要权限确认: ${toolName}`,
            details: {
                riskLevel: 'medium',
            },
        };
    }

    return {
        id: `confirm-${toolCallId}-${Date.now()}`,
        type: 'dangerous',
        toolCallId,
        summary: `工具调用需要权限确认: ${toolName}`,
        details: {
            riskLevel: 'medium',
        },
    };
}

/**
 * Detect if a tool result (or stderr text) indicates a permission request from Claude CLI.
 * Returns parsed permission info if detected, null otherwise.
 */
export function detectPermissionRequest(
    result: unknown,
    toolName?: string,
): { type: ConfirmationType; summary: string; details: ConfirmationRequestUpdate['details'] } | null {
    // Convert result to string for pattern matching
    let text: string;
    if (typeof result === 'string') {
        text = result;
    } else if (result && typeof result === 'object') {
        try {
            text = JSON.stringify(result);
        } catch {
            return null;
        }
    } else {
        return null;
    }

    // Pattern: "Claude requested permissions to write to <path>"
    const writeMatch = text.match(/Claude requested permissions? to write to ([^\n,]+)/i);
    if (writeMatch) {
        const filePath = writeMatch[1].trim().replace(/['"]/g, '');
        return {
            type: 'file_write',
            summary: `写入文件需要权限确认: ${filePath}`,
            details: {
                filePath,
                riskLevel: 'medium',
            },
        };
    }

    // Pattern: "Claude requested permissions to edit <path>"
    const editMatch = text.match(/Claude requested permissions? to edit ([^\n,]+)/i);
    if (editMatch) {
        const filePath = editMatch[1].trim().replace(/['"]/g, '');
        return {
            type: 'file_write',
            summary: `编辑文件需要权限确认: ${filePath}`,
            details: {
                filePath,
                riskLevel: 'medium',
            },
        };
    }

    // Pattern: "Claude requested permissions to delete <path>"
    const deleteMatch = text.match(/Claude requested permissions? to delete ([^\n,]+)/i);
    if (deleteMatch) {
        const filePath = deleteMatch[1].trim().replace(/['"]/g, '');
        return {
            type: 'file_delete',
            summary: `删除文件需要权限确认: ${filePath}`,
            details: {
                filePath,
                riskLevel: 'high',
            },
        };
    }

    // Pattern: "Claude requested permissions to run: <command>"
    const bashMatch = text.match(/Claude requested permissions? to run:?\s*([^\n]+)/i);
    if (bashMatch) {
        const command = bashMatch[1].trim();
        return {
            type: 'bash',
            summary: `执行命令需要权限确认: ${command.slice(0, 50)}${command.length > 50 ? '...' : ''}`,
            details: {
                command,
                riskLevel: assessBashRisk(command),
                riskReasons: getBashRiskReasons(command),
            },
        };
    }

    // Generic permission denial patterns
    if (text.includes("haven't granted it yet") ||
        text.includes("permission denied") ||
        text.includes("requires user permission") ||
        text.includes("waiting for user approval")) {
        // Infer type from tool name
        const inferredType = inferConfirmationType(toolName);
        return {
            type: inferredType,
            summary: '操作需要权限确认',
            details: {
                riskLevel: 'medium',
            },
        };
    }

    return null;
}

/**
 * Infer confirmation type from tool name
 */
export function inferConfirmationType(toolName?: string): ConfirmationType {
    if (!toolName) return 'dangerous';
    const name = toolName.toLowerCase();

    if (name === 'bash' || name === 'run_command' || name.includes('bash')) {
        return 'bash';
    }
    if (name === 'write' || name === 'edit' || name.includes('write') || name.includes('edit')) {
        return 'file_write';
    }
    if (name.includes('delete') || name.includes('remove')) {
        return 'file_delete';
    }
    if (name.startsWith('mcp__') || name.startsWith('mcp_')) {
        return 'mcp';
    }

    return 'dangerous';
}

/**
 * Assess risk level of a bash command
 */
export function assessBashRisk(command: string): 'low' | 'medium' | 'high' {
    const lowerCmd = command.toLowerCase();

    // High risk patterns
    if (lowerCmd.includes('sudo') ||
        lowerCmd.includes('rm -rf') ||
        lowerCmd.includes('rm -r') ||
        lowerCmd.includes('> /') ||
        lowerCmd.includes('chmod') ||
        lowerCmd.includes('chown') ||
        lowerCmd.includes('mkfs') ||
        lowerCmd.includes('dd if=')) {
        return 'high';
    }

    // Medium risk patterns
    if (lowerCmd.includes('npm publish') ||
        lowerCmd.includes('npm install') ||
        lowerCmd.includes('pip install') ||
        lowerCmd.includes('yarn add') ||
        lowerCmd.includes('curl') ||
        lowerCmd.includes('wget') ||
        lowerCmd.includes('git push')) {
        return 'medium';
    }

    return 'low';
}

/**
 * Get risk reasons for a bash command
 */
export function getBashRiskReasons(command: string): string[] {
    const reasons: string[] = [];
    const lowerCmd = command.toLowerCase();

    if (lowerCmd.includes('sudo')) reasons.push('命令包含 sudo 提权');
    if (lowerCmd.includes('rm ')) reasons.push('会删除文件');
    if (lowerCmd.includes('node_modules')) reasons.push('会修改 node_modules 目录');
    if (lowerCmd.includes('npm publish')) reasons.push('会发布包到 npm registry');
    if (lowerCmd.includes('|') || lowerCmd.includes('&&')) reasons.push('命令包含管道或链式操作');
    if (lowerCmd.includes('curl') || lowerCmd.includes('wget')) reasons.push('会访问网络');
    if (lowerCmd.includes('git push')) reasons.push('会推送代码到远程仓库');

    return reasons;
}
