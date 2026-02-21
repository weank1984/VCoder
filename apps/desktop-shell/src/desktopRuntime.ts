import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { dialog, shell } from 'electron';
import {
  ACPMethods,
  type FsReadTextFileParams,
  type FsReadTextFileResult,
  type FsWriteTextFileParams,
  type FsWriteTextFileResult,
  type PermissionRule,
  type TerminalCreateParams,
  type TerminalCreateResult,
  type TerminalKillParams,
  type TerminalOutputParams,
  type TerminalOutputResult,
  type TerminalReleaseParams,
  type TerminalWaitForExitParams,
  type TerminalWaitForExitResult,
  type UpdateNotificationParams,
} from '@vcoder/shared';
import { AcpClient } from './acpClient.js';

type WebviewMessage = {
  type?: string;
  [key: string]: unknown;
};

type PendingFileChangePayload = {
  type: 'created' | 'modified' | 'deleted';
  path: string;
  diff?: string;
  content?: string;
  proposed: boolean;
};

type TerminalHandle = {
  id: string;
  process: ChildProcessWithoutNullStreams;
  outputBuffer: string;
  lastReadOffset: number;
  exitCode: number | null;
  signal: string | null;
  isComplete: boolean;
  waiters: Array<(result: TerminalWaitForExitResult) => void>;
};

type RuntimeOptions = {
  rootDir: string;
  stateDir: string;
  workspaceRoot: string;
  postMessage: (payload: unknown) => void;
  onWorkspaceRootChanged?: (workspaceRoot: string) => Promise<void> | void;
};

const MAX_WORKSPACE_FILES = 8000;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'out', '.turbo']);

export class DesktopRuntime {
  private serverProcess: ChildProcess | null = null;
  private acpClient: AcpClient | null = null;
  private promptMode: 'oneshot' | 'persistent' = 'persistent';
  private terminalCounter = 0;
  private workspaceRoot: string;
  private readonly permissionRulesPath: string;
  private readonly previewDir: string;
  private readonly terminals = new Map<string, TerminalHandle>();
  private readonly permissionRules = new Map<string, PermissionRule>();
  private readonly pendingFileChanges = new Map<string, Set<string>>();
  private readonly pendingChangeDetails = new Map<string, Map<string, PendingFileChangePayload>>();

  constructor(private readonly options: RuntimeOptions) {
    this.workspaceRoot = path.resolve(options.workspaceRoot);
    this.permissionRulesPath = path.join(options.stateDir, 'permission-rules.json');
    this.previewDir = path.join(options.stateDir, 'pending-previews');
  }

  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  async start(): Promise<void> {
    if (this.acpClient) {
      return;
    }

    await this.ensureStateReady();
    await this.loadPermissionRules();

    const serverPath = await this.findServerPath();
    this.serverProcess = spawn('node', [serverPath], {
      cwd: this.workspaceRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });

    if (!this.serverProcess.stdin || !this.serverProcess.stdout) {
      throw new Error('Failed to create stdio pipes for server process.');
    }

    this.serverProcess.stderr?.on('data', (chunk) => {
      const line = String(chunk).trim();
      if (line.length > 0) {
        console.log('[Desktop Server]', line);
      }
    });

    this.serverProcess.on('exit', (code) => {
      this.postError('Server process exited', `Code: ${String(code)}`);
      this.serverProcess = null;
      this.acpClient = null;
    });

    this.acpClient = new AcpClient({
      stdin: this.serverProcess.stdin,
      stdout: this.serverProcess.stdout,
    });

    this.registerAcpHandlers(this.acpClient);
    this.acpClient.on('session/update', (params: UpdateNotificationParams) => {
      this.trackPendingFileChanges(params);
      this.options.postMessage({
        type: 'update',
        data: params,
      });
    });
    this.acpClient.on('session/complete', (params: unknown) => {
      this.options.postMessage({
        type: 'complete',
        data: params,
      });
    });

    await this.acpClient.initialize({
      protocolVersion: 1,
      clientInfo: {
        name: 'vcoder-desktop',
        version: '0.1.0',
      },
      clientCapabilities: {
        terminal: true,
        fs: {
          readTextFile: true,
          writeTextFile: true,
        },
      },
      capabilities: {
        streaming: true,
        diffPreview: true,
        thought: true,
        toolCallList: true,
        taskList: true,
        multiSession: true,
      },
      workspaceFolders: [this.workspaceRoot],
    });

    this.postPermissionRules();
  }

  async shutdown(): Promise<void> {
    for (const [terminalId] of this.terminals) {
      await this.releaseTerminal({ terminalId });
    }
    this.terminals.clear();

    if (this.acpClient) {
      await this.acpClient.shutdown();
      this.acpClient = null;
    }

    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');
      this.serverProcess = null;
    }
  }

  async handleWebviewMessage(message: unknown): Promise<void> {
    const payload = message as WebviewMessage;
    const type = payload?.type;
    if (!type || typeof type !== 'string') {
      return;
    }

    try {
      switch (type) {
        case 'uiReady':
        case 'init':
        case 'init-complete':
        case 'highlight-complete':
          return;
        case 'send':
          await this.handleSend(payload);
          return;
        case 'newSession':
          await this.handleNewSession(typeof payload.title === 'string' ? payload.title : undefined);
          return;
        case 'listSessions':
          await this.postSessions();
          return;
        case 'switchSession':
          if (typeof payload.sessionId === 'string') {
            await this.requireClient().switchSession(payload.sessionId);
            this.options.postMessage({ type: 'currentSession', data: { sessionId: payload.sessionId } });
            await this.postSessions();
          }
          return;
        case 'deleteSession':
          if (typeof payload.sessionId === 'string') {
            await this.requireClient().deleteSession(payload.sessionId);
            this.pendingFileChanges.delete(payload.sessionId);
            this.pendingChangeDetails.delete(payload.sessionId);
            await this.postSessions();
          }
          return;
        case 'setModel':
          if (typeof payload.model === 'string') {
            await this.requireClient().changeSettings({ model: payload.model as never });
          }
          return;
        case 'setPlanMode':
          await this.requireClient().changeSettings({ planMode: Boolean(payload.enabled) });
          return;
        case 'setPermissionMode':
          if (typeof payload.mode === 'string') {
            await this.requireClient().changeSettings({ permissionMode: payload.mode as never });
          }
          return;
        case 'setPromptMode':
          this.promptMode = payload.mode === 'oneshot' ? 'oneshot' : 'persistent';
          return;
        case 'setThinking':
          await this.requireClient().changeSettings({
            maxThinkingTokens: payload.enabled ? Number(payload.maxThinkingTokens ?? 16000) : 0,
          });
          return;
        case 'getModeStatus':
          this.options.postMessage({
            type: 'modeStatus',
            data: await this.requireClient().getModeStatus(),
          });
          return;
        case 'confirmTool':
          if (typeof payload.toolCallId === 'string') {
            await this.requireClient().confirmTool(
              payload.toolCallId,
              Boolean(payload.confirmed),
              payload.options as { trustAlways?: boolean; editedContent?: string } | undefined,
            );
          }
          return;
        case 'cancel':
          await this.requireClient().cancelSession();
          return;
        case 'acceptChange':
          if (typeof payload.path === 'string') {
            const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : undefined;
            await this.requireClient().acceptFileChange(payload.path, sessionId);
            this.removePendingFileChange(sessionId, payload.path);
          }
          return;
        case 'rejectChange':
          if (typeof payload.path === 'string') {
            const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : undefined;
            await this.requireClient().rejectFileChange(payload.path, sessionId);
            this.removePendingFileChange(sessionId, payload.path);
          }
          return;
        case 'acceptAllChanges':
          await this.handleAllChanges(true, typeof payload.sessionId === 'string' ? payload.sessionId : undefined);
          return;
        case 'rejectAllChanges':
          await this.handleAllChanges(false, typeof payload.sessionId === 'string' ? payload.sessionId : undefined);
          return;
        case 'getWorkspaceFiles':
          this.options.postMessage({ type: 'workspaceFiles', data: await this.scanWorkspaceFiles() });
          return;
        case 'openFile':
          if (typeof payload.path === 'string') {
            await this.openFile(payload.path);
          }
          return;
        case 'openSettings':
          await this.selectWorkspaceFromUi();
          return;
        case 'executeCommand':
          if (
            payload.command === 'vcoder.openSettings' ||
            payload.command === 'desktop.selectWorkspace'
          ) {
            await this.selectWorkspaceFromUi();
          }
          return;
        case 'refreshAgents':
          this.postAgentStatus();
          return;
        case 'selectAgent':
          this.postAgentStatus();
          return;
        case 'listHistory':
          this.options.postMessage({
            type: 'historySessions',
            data: await this.requireClient().listHistory(this.workspaceRoot),
          });
          return;
        case 'loadHistory':
          if (typeof payload.sessionId === 'string') {
            this.options.postMessage({
              type: 'historyMessages',
              data: await this.requireClient().loadHistory(payload.sessionId, this.workspaceRoot),
              sessionId: payload.sessionId,
            });
          }
          return;
        case 'deleteHistory':
          if (typeof payload.sessionId === 'string') {
            await this.requireClient().deleteHistory(payload.sessionId, this.workspaceRoot);
            this.options.postMessage({
              type: 'historySessions',
              data: await this.requireClient().listHistory(this.workspaceRoot),
            });
          }
          return;
        case 'resumeHistory':
          if (typeof payload.sessionId === 'string') {
            const session = await this.requireClient().resumeSession(payload.sessionId, {
              title: typeof payload.title === 'string' ? payload.title : undefined,
              cwd: this.workspaceRoot,
            });
            this.options.postMessage({ type: 'currentSession', data: { sessionId: session.id } });
            await this.postSessions();
          }
          return;
        case 'getPermissionRules':
          this.postPermissionRules();
          return;
        case 'addPermissionRule':
          await this.addPermissionRule(payload.rule as Partial<PermissionRule>);
          return;
        case 'updatePermissionRule':
          await this.updatePermissionRule(
            typeof payload.ruleId === 'string' ? payload.ruleId : '',
            (payload.updates ?? {}) as Partial<PermissionRule>,
          );
          return;
        case 'deletePermissionRule':
          if (typeof payload.ruleId === 'string') {
            this.permissionRules.delete(payload.ruleId);
            await this.savePermissionRules();
            this.postPermissionRules();
          }
          return;
        case 'clearPermissionRules':
          this.permissionRules.clear();
          await this.savePermissionRules();
          this.postPermissionRules();
          return;
        default:
          return;
      }
    } catch (error) {
      this.postError(`Failed to handle message: ${type}`, error instanceof Error ? error.message : String(error));
    }
  }

  private requireClient(): AcpClient {
    if (!this.acpClient) {
      throw new Error('ACP client is not initialized.');
    }
    return this.acpClient;
  }

  private async handleSend(payload: WebviewMessage): Promise<void> {
    const client = this.requireClient();
    let currentSession = client.getCurrentSession();
    if (!currentSession) {
      currentSession = await client.newSession(undefined, { cwd: this.workspaceRoot });
      this.options.postMessage({ type: 'currentSession', data: { sessionId: currentSession.id } });
      await this.postSessions();
    }

    const content = typeof payload.content === 'string' ? payload.content : '';
    const attachments = Array.isArray(payload.attachments) ? payload.attachments : undefined;

    if (this.promptMode === 'persistent') {
      await client.promptPersistent(content, attachments as never);
    } else {
      await client.prompt(content, attachments as never);
    }
  }

  private async handleNewSession(title?: string): Promise<void> {
    const session = await this.requireClient().newSession(title, { cwd: this.workspaceRoot });
    this.options.postMessage({ type: 'currentSession', data: { sessionId: session.id } });
    await this.postSessions();
  }

  private async selectWorkspaceFromUi(): Promise<void> {
    const result = await dialog.showOpenDialog({
      title: 'Select Workspace Root',
      defaultPath: this.workspaceRoot,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return;
    }
    const selectedPath = path.resolve(result.filePaths[0]);
    await this.switchWorkspaceRoot(selectedPath);
  }

  private async switchWorkspaceRoot(nextWorkspaceRoot: string): Promise<void> {
    if (nextWorkspaceRoot === this.workspaceRoot) {
      return;
    }

    await this.shutdown();
    this.workspaceRoot = nextWorkspaceRoot;
    await this.options.onWorkspaceRootChanged?.(nextWorkspaceRoot);
    await this.start();

    this.pendingFileChanges.clear();
    this.pendingChangeDetails.clear();
    this.options.postMessage({ type: 'currentSession', data: { sessionId: null } });
    await this.postSessions();
    this.options.postMessage({ type: 'workspaceFiles', data: await this.scanWorkspaceFiles() });
  }

  private async handleAllChanges(accept: boolean, sessionId?: string): Promise<void> {
    const client = this.requireClient();
    const sid = sessionId ?? client.getCurrentSession()?.id;
    if (!sid) {
      return;
    }
    const files = Array.from(this.pendingFileChanges.get(sid) ?? []);
    for (const filePath of files) {
      if (accept) {
        await client.acceptFileChange(filePath, sid);
      } else {
        await client.rejectFileChange(filePath, sid);
      }
      this.removePendingFileChange(sid, filePath);
    }
  }

  private postPermissionRules(): void {
    this.options.postMessage({
      type: 'permissionRules',
      data: Array.from(this.permissionRules.values()),
    });
  }

  private async ensureStateReady(): Promise<void> {
    await fs.mkdir(this.options.stateDir, { recursive: true });
    await fs.mkdir(this.previewDir, { recursive: true });
  }

  private async loadPermissionRules(): Promise<void> {
    try {
      const raw = await fs.readFile(this.permissionRulesPath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return;
      }
      this.permissionRules.clear();
      for (const item of parsed) {
        if (!item || typeof item !== 'object') {
          continue;
        }
        const rule = item as PermissionRule;
        if (typeof rule.id !== 'string' || (rule.action !== 'allow' && rule.action !== 'deny')) {
          continue;
        }
        this.permissionRules.set(rule.id, rule);
      }
    } catch {
      // No persisted file yet or invalid content.
    }
  }

  private async savePermissionRules(): Promise<void> {
    const serialized = JSON.stringify(Array.from(this.permissionRules.values()), null, 2);
    await fs.writeFile(this.permissionRulesPath, serialized, 'utf-8');
  }

  private async addPermissionRule(rule: Partial<PermissionRule>): Promise<void> {
    const now = new Date().toISOString();
    const id = `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const finalRule: PermissionRule = {
      id,
      action: rule.action === 'deny' ? 'deny' : 'allow',
      createdAt: now,
      updatedAt: now,
      toolName: rule.toolName,
      pattern: rule.pattern,
      description: rule.description,
      expiresAt: rule.expiresAt,
    };
    this.permissionRules.set(id, finalRule);
    await this.savePermissionRules();
    this.postPermissionRules();
  }

  private async updatePermissionRule(ruleId: string, updates: Partial<PermissionRule>): Promise<void> {
    const current = this.permissionRules.get(ruleId);
    if (!current) {
      return;
    }
    const updated: PermissionRule = {
      ...current,
      ...updates,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.permissionRules.set(ruleId, updated);
    await this.savePermissionRules();
    this.postPermissionRules();
  }

  private trackPendingFileChanges(params: UpdateNotificationParams): void {
    if (params.type !== 'file_change') {
      return;
    }
    const content = params.content as Partial<PendingFileChangePayload>;
    if (typeof content.path !== 'string') {
      return;
    }
    const set = this.pendingFileChanges.get(params.sessionId) ?? new Set<string>();
    const detailMap = this.pendingChangeDetails.get(params.sessionId) ?? new Map<string, PendingFileChangePayload>();
    if (content.proposed) {
      set.add(content.path);
      this.pendingFileChanges.set(params.sessionId, set);
      if (content.type && (content.type === 'created' || content.type === 'modified' || content.type === 'deleted')) {
        detailMap.set(content.path, {
          type: content.type,
          path: content.path,
          diff: typeof content.diff === 'string' ? content.diff : undefined,
          content: typeof content.content === 'string' ? content.content : undefined,
          proposed: true,
        });
        this.pendingChangeDetails.set(params.sessionId, detailMap);
      }
    } else {
      set.delete(content.path);
      if (set.size === 0) {
        this.pendingFileChanges.delete(params.sessionId);
      }
      detailMap.delete(content.path);
      if (detailMap.size === 0) {
        this.pendingChangeDetails.delete(params.sessionId);
      } else {
        this.pendingChangeDetails.set(params.sessionId, detailMap);
      }
    }
  }

  private removePendingFileChange(sessionId: string | undefined, filePath: string): void {
    if (!sessionId) {
      return;
    }
    const set = this.pendingFileChanges.get(sessionId);
    if (!set) {
      return;
    }
    set.delete(filePath);
    if (set.size === 0) {
      this.pendingFileChanges.delete(sessionId);
    }
    const detailMap = this.pendingChangeDetails.get(sessionId);
    if (detailMap) {
      detailMap.delete(filePath);
      if (detailMap.size === 0) {
        this.pendingChangeDetails.delete(sessionId);
      }
    }
  }

  private async postSessions(): Promise<void> {
    this.options.postMessage({
      type: 'sessions',
      data: await this.requireClient().listSessions(),
    });
  }

  private postAgentStatus(): void {
    const agent = {
      profile: {
        id: 'claude-code',
        name: 'Claude Code',
        command: 'node',
      },
      status: this.acpClient ? 'online' : 'offline',
      isActive: true,
    };
    this.options.postMessage({ type: 'agents', data: [agent] });
    this.options.postMessage({ type: 'currentAgent', data: { agentId: 'claude-code' } });
  }

  private async openFile(filePath: string): Promise<void> {
    const sessionId = this.acpClient?.getCurrentSession()?.id;
    const pendingPreviewPath = await this.getPendingPreviewPath(sessionId, filePath);
    if (pendingPreviewPath) {
      await shell.openPath(pendingPreviewPath);
      return;
    }

    const resolved = this.resolveWorkspacePath(filePath);
    await shell.openPath(resolved);
  }

  private async getPendingPreviewPath(sessionId: string | undefined, filePath: string): Promise<string | null> {
    if (!sessionId) {
      return null;
    }
    const detail = this.pendingChangeDetails.get(sessionId)?.get(filePath);
    if (!detail) {
      return null;
    }
    return this.writePendingPreviewFile(detail);
  }

  private async writePendingPreviewFile(change: PendingFileChangePayload): Promise<string> {
    const safeName = change.path.replace(/[^a-zA-Z0-9._-]/g, '_');
    const outputPath = path.join(this.previewDir, `${safeName}.proposed.txt`);
    const header = [
      'VCoder Desktop Pending Change Preview',
      `Path: ${change.path}`,
      `Type: ${change.type}`,
      '',
    ].join('\n');

    const body =
      typeof change.content === 'string' && change.content.length > 0
        ? change.content
        : typeof change.diff === 'string'
          ? change.diff
          : '[No proposed content was provided by the agent.]';

    await fs.writeFile(outputPath, `${header}\n${body}\n`, 'utf-8');
    return outputPath;
  }

  private async scanWorkspaceFiles(): Promise<string[]> {
    const results: string[] = [];
    const queue: string[] = [this.workspaceRoot];

    while (queue.length > 0 && results.length < MAX_WORKSPACE_FILES) {
      const currentDir = queue.pop()!;
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name)) {
            continue;
          }
          queue.push(fullPath);
          continue;
        }
        if (!entry.isFile()) {
          continue;
        }
        const relative = path.relative(this.workspaceRoot, fullPath).replace(/\\/g, '/');
        if (relative.length > 0) {
          results.push(relative);
        }
        if (results.length >= MAX_WORKSPACE_FILES) {
          break;
        }
      }
    }

    return results;
  }

  private registerAcpHandlers(client: AcpClient): void {
    client.registerRequestHandler(ACPMethods.FS_READ_TEXT_FILE, async (params) =>
      this.readTextFile(params as FsReadTextFileParams),
    );
    client.registerRequestHandler(ACPMethods.FS_WRITE_TEXT_FILE, async (params) =>
      this.writeTextFile(params as FsWriteTextFileParams),
    );

    client.registerRequestHandler(ACPMethods.TERMINAL_CREATE, async (params) =>
      this.createTerminal(params as TerminalCreateParams),
    );
    client.registerRequestHandler(ACPMethods.TERMINAL_OUTPUT, async (params) =>
      this.getTerminalOutput(params as TerminalOutputParams),
    );
    client.registerRequestHandler(ACPMethods.TERMINAL_WAIT_FOR_EXIT, async (params) =>
      this.waitForTerminalExit(params as TerminalWaitForExitParams),
    );
    client.registerRequestHandler(ACPMethods.TERMINAL_KILL, async (params) =>
      this.killTerminal(params as TerminalKillParams),
    );
    client.registerRequestHandler(ACPMethods.TERMINAL_RELEASE, async (params) =>
      this.releaseTerminal(params as TerminalReleaseParams),
    );

    client.registerRequestHandler(ACPMethods.LSP_GO_TO_DEFINITION, async () => ({}));
    client.registerRequestHandler(ACPMethods.LSP_FIND_REFERENCES, async () => ({ references: [] }));
    client.registerRequestHandler(ACPMethods.LSP_HOVER, async () => ({}));
    client.registerRequestHandler(ACPMethods.LSP_GET_DIAGNOSTICS, async () => ({ diagnostics: [] }));

    client.registerRequestHandler(ACPMethods.PERMISSION_RULES_LIST, async () => ({
      rules: Array.from(this.permissionRules.values()),
    }));
    client.registerRequestHandler(ACPMethods.PERMISSION_RULE_ADD, async (params) => {
      const payload = params as { rule?: Partial<PermissionRule> };
      await this.addPermissionRule(payload.rule ?? {});
      return { rules: Array.from(this.permissionRules.values()) };
    });
    client.registerRequestHandler(ACPMethods.PERMISSION_RULE_UPDATE, async (params) => {
      const payload = params as { ruleId?: string; updates?: Partial<PermissionRule> };
      if (typeof payload.ruleId === 'string') {
        await this.updatePermissionRule(payload.ruleId, payload.updates ?? {});
      }
      return { rules: Array.from(this.permissionRules.values()) };
    });
    client.registerRequestHandler(ACPMethods.PERMISSION_RULE_DELETE, async (params) => {
      const payload = params as { ruleId?: string };
      if (typeof payload.ruleId === 'string') {
        this.permissionRules.delete(payload.ruleId);
        await this.savePermissionRules();
      }
      this.postPermissionRules();
      return { rules: Array.from(this.permissionRules.values()) };
    });
  }

  private resolveWorkspacePath(inputPath: string): string {
    const resolved = path.isAbsolute(inputPath)
      ? path.normalize(inputPath)
      : path.resolve(this.workspaceRoot, inputPath);

    const relative = path.relative(this.workspaceRoot, resolved);
    if (
      relative === '' ||
      (!relative.startsWith('..') && relative !== '..' && !path.isAbsolute(relative))
    ) {
      return resolved;
    }
    throw new Error(`Path outside workspace is not allowed: ${inputPath}`);
  }

  private async readTextFile(params: FsReadTextFileParams): Promise<FsReadTextFileResult> {
    const fullPath = this.resolveWorkspacePath(params.path);
    const content = await fs.readFile(fullPath, 'utf-8');
    if (params.line === undefined && params.limit === undefined) {
      return { content };
    }

    const startLine = Math.max(0, (params.line ?? 1) - 1);
    const lines = content.split('\n');
    const endLine = params.limit ? startLine + params.limit : lines.length;
    return {
      content: lines.slice(startLine, endLine).join('\n'),
    };
  }

  private async writeTextFile(params: FsWriteTextFileParams): Promise<FsWriteTextFileResult> {
    const fullPath = this.resolveWorkspacePath(params.path);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, params.content, 'utf-8');
    return { success: true };
  }

  private async createTerminal(params: TerminalCreateParams): Promise<TerminalCreateResult> {
    const terminalId = `term_${Date.now()}_${++this.terminalCounter}`;
    const cwd = params.cwd ? this.resolveWorkspacePath(params.cwd) : this.workspaceRoot;
    const child = spawn(params.command, params.args ?? [], {
      cwd,
      env: { ...process.env, ...(params.env ?? {}) },
      stdio: 'pipe',
      shell: false,
    });

    const handle: TerminalHandle = {
      id: terminalId,
      process: child,
      outputBuffer: '',
      lastReadOffset: 0,
      exitCode: null,
      signal: null,
      isComplete: false,
      waiters: [],
    };

    child.stdout.on('data', (chunk) => {
      handle.outputBuffer += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      handle.outputBuffer += String(chunk);
    });
    child.on('exit', (code, signal) => {
      handle.exitCode = code ?? -1;
      handle.signal = signal ? String(signal) : null;
      handle.isComplete = true;
      const result: TerminalWaitForExitResult = {
        exitCode: handle.exitCode,
        ...(handle.signal ? { signal: handle.signal } : {}),
      };
      for (const waiter of handle.waiters) {
        waiter(result);
      }
      handle.waiters = [];
    });

    this.terminals.set(terminalId, handle);
    return { terminalId };
  }

  private async getTerminalOutput(params: TerminalOutputParams): Promise<TerminalOutputResult> {
    const handle = this.terminals.get(params.terminalId);
    if (!handle) {
      throw new Error(`Terminal not found: ${params.terminalId}`);
    }

    const output = handle.outputBuffer.slice(handle.lastReadOffset);
    handle.lastReadOffset = handle.outputBuffer.length;

    const limit = params.outputByteLimit ?? Number.MAX_SAFE_INTEGER;
    let finalOutput = output;
    let truncated = false;
    if (Buffer.byteLength(finalOutput, 'utf-8') > limit) {
      finalOutput = Buffer.from(finalOutput, 'utf-8').subarray(0, limit).toString('utf-8');
      truncated = true;
    }

    return {
      output: finalOutput,
      ...(handle.isComplete ? { exitCode: handle.exitCode ?? -1 } : {}),
      ...(handle.signal ? { signal: handle.signal } : {}),
      ...(truncated ? { truncated: true } : {}),
    };
  }

  private async waitForTerminalExit(params: TerminalWaitForExitParams): Promise<TerminalWaitForExitResult> {
    const handle = this.terminals.get(params.terminalId);
    if (!handle) {
      throw new Error(`Terminal not found: ${params.terminalId}`);
    }
    if (handle.isComplete) {
      return {
        exitCode: handle.exitCode ?? -1,
        ...(handle.signal ? { signal: handle.signal } : {}),
      };
    }
    return new Promise((resolve) => {
      handle.waiters.push(resolve);
    });
  }

  private async killTerminal(params: TerminalKillParams): Promise<void> {
    const handle = this.terminals.get(params.terminalId);
    if (!handle) {
      return;
    }
    if (!handle.isComplete) {
      handle.process.kill((params.signal ?? 'SIGTERM') as NodeJS.Signals);
    }
  }

  private async releaseTerminal(params: TerminalReleaseParams): Promise<void> {
    const handle = this.terminals.get(params.terminalId);
    if (!handle) {
      return;
    }
    if (!handle.isComplete) {
      handle.process.kill('SIGTERM');
    }
    this.terminals.delete(params.terminalId);
  }

  private async findServerPath(): Promise<string> {
    const candidates = [
      path.join(this.options.rootDir, 'packages', 'server', 'dist', 'index.js'),
      path.join(this.options.rootDir, 'apps', 'vscode-extension', 'server', 'index.js'),
    ];

    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        continue;
      }
    }
    throw new Error(
      'Cannot find server entry. Build server first with `pnpm -C packages/server build`.',
    );
  }

  private postError(title: string, message: string): void {
    this.options.postMessage({
      type: 'error',
      data: {
        title,
        message,
      },
    });
  }
}
