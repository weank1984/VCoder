/**
 * EcosystemService
 * Gathers CLI ecosystem data: MCP servers, skills, hooks, plugins.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { McpServerConfig } from '@vcoder/shared';
import { BuiltinMcpServer } from './builtinMcpServer';

export class EcosystemService {
    constructor(
        private context: vscode.ExtensionContext,
        private builtinMcpServer?: BuiltinMcpServer,
    ) {}

    /**
     * Gather all CLI ecosystem data: MCP servers, skills, hooks, plugins.
     */
    async gatherEcosystemData() {
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        const homeDir = os.homedir();
        const claudeDir = path.join(homeDir, '.claude');

        // MCP servers
        const mcpServers = this.getMcpServerConfig();
        const mcp = mcpServers.map((s, i) => ({
            id: `${i}:${s.name ?? ''}`,
            type: s.type,
            name: s.name,
            command: s.command,
            url: s.url,
            args: s.args,
            readonly: !!(this.builtinMcpServer && s.url && (() => {
                try { return this.builtinMcpServer?.getServerConfig().url === s.url; } catch { return false; }
            })()),
        }));

        // Skills: ~/.claude/skills/ and <workspace>/.claude/skills/
        const skills: { name: string; description?: string; source: 'global' | 'workspace'; path: string }[] = [];
        for (const [skillsDir, source] of [
            [path.join(claudeDir, 'skills'), 'global'],
            [path.join(workspacePath, '.claude', 'skills'), 'workspace'],
        ] as [string, 'global' | 'workspace'][]) {
            try {
                const entries = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'));
                for (const entry of entries) {
                    const fullPath = path.join(skillsDir, entry);
                    const name = entry.replace(/\.md$/, '');
                    let description: string | undefined;
                    try {
                        const content = fs.readFileSync(fullPath, 'utf-8');
                        const match = content.match(/^#\s+(.+)|description:\s*['""]?(.+?)['""]?\s*$/mi);
                        description = match ? (match[1] || match[2])?.trim() : undefined;
                    } catch { /* ignore */ }
                    skills.push({ name, description, source, path: fullPath });
                }
            } catch { /* dir doesn't exist */ }
        }

        // Hooks: ~/.claude/settings.json
        const hooks: { event: string; command: string; matcher?: string }[] = [];
        try {
            const settingsPath = path.join(claudeDir, 'settings.json');
            const raw = fs.readFileSync(settingsPath, 'utf-8');
            const settings = JSON.parse(raw);
            if (Array.isArray(settings.hooks)) {
                for (const hook of settings.hooks) {
                    if (typeof hook.event === 'string' && typeof hook.command === 'string') {
                        hooks.push({ event: hook.event, command: hook.command, matcher: hook.matcher });
                    }
                }
            }
        } catch { /* no settings or not parseable */ }

        // Plugins: ~/.claude/plugins/ and <workspace>/.claude/plugins/
        const plugins: { name: string; version?: string; path: string; source: 'global' | 'workspace' }[] = [];
        for (const [pluginsDir, source] of [
            [path.join(claudeDir, 'plugins'), 'global'],
            [path.join(workspacePath, '.claude', 'plugins'), 'workspace'],
        ] as [string, 'global' | 'workspace'][]) {
            try {
                const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
                for (const entry of entries) {
                    if (!entry.isDirectory()) continue;
                    const fullPath = path.join(pluginsDir, entry.name);
                    let version: string | undefined;
                    try {
                        const pkg = JSON.parse(fs.readFileSync(path.join(fullPath, 'package.json'), 'utf-8'));
                        version = pkg.version;
                    } catch { /* no package.json */ }
                    plugins.push({ name: entry.name, version, path: fullPath, source });
                }
            } catch { /* dir doesn't exist */ }
        }

        return { mcp, skills, hooks, plugins };
    }

    /**
     * Get MCP server configuration from VSCode settings.
     */
    getMcpServerConfig(): McpServerConfig[] {
        const config = vscode.workspace.getConfiguration('vcoder');
        const servers = config.get<McpServerConfig[]>('mcpServers', []);

        if (this.builtinMcpServer) {
            try {
                const builtinConfig = this.builtinMcpServer.getServerConfig();
                const exists = servers.some((server) => server.url && builtinConfig.url && server.url === builtinConfig.url);
                if (!exists) {
                    return [builtinConfig, ...servers];
                }
            } catch (err) {
                console.warn('[VCoder] Builtin MCP server not ready:', err);
            }
        }

        return servers;
    }
}
