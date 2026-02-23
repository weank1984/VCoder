# 009 VSCode 启动时环境变量缺失导致 CLI 无输出

## 问题

VCoder 插件启动后用户发消息无模型回复。CLI 在终端手动运行正常，但从 VSCode Extension Host spawn 时完全无输出（连 `system init` 都没有）。

## 根因（三层级联）

macOS 上从 Dock / Spotlight 启动 VSCode 时，不会加载 shell profile（`.zshrc` / `.bash_profile`），导致 **整条 spawn 链路** 都缺少环境变量：

```
VSCode ExtensionHost (无 shell env)
  → spawn ACP Server (process.env 已残缺)
    → spawn Claude CLI (PATH/ANTHROPIC_*/自定义变量全部缺失)
```

缺失的关键变量包括：
- `PATH`（无法找到 `claude` 二进制）
- `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL` / `ANTHROPIC_API_KEY`
- nvm/pyenv/rbenv 等版本管理器注入的路径
- 用户在 `.claude/settings*.json` `env` 块中配置的变量

## 修复（双层防御）

### 第一层：Extension Host 加载 shell 环境

`serverManager.ts` 新增 `resolveShellEnv()`：在 spawn ACP Server 之前，执行用户的 login shell（`$SHELL -ilc 'env -0'`）获取完整环境变量，注入到 server 进程。

结果缓存，Extension Host 生命周期内只执行一次。失败时降级到读取 `.claude/settings*.json`。

### 第二层：Server 补充 .claude settings env

`shared.ts` 新增 `loadClaudeEnv()`：`wrapper.ts` 和 `persistentSession.ts` 在 spawn CLI 之前，从 `.claude/settings*.json` 的 `env` 块读取并注入。

配置文件优先级（与 Claude CLI 一致）：
1. `~/.claude/settings.json` — 全局基础
2. `{cwd}/.claude/settings.json` — 项目共享
3. `{cwd}/.claude/settings.local.json` — 项目本地（最高优先级）

## 关键代码

- `apps/vscode-extension/src/services/serverManager.ts` → `resolveShellEnv()`
- `packages/server/src/claude/shared.ts` → `loadClaudeEnv()`

## 教训

- 永远不要假设 GUI 应用继承了终端环境变量
- 环境变量问题要从 spawn 链路的 **最上层** 修复，否则下游所有 `process.env` 扩展都是残缺的
- macOS Dock/Spotlight 启动是最容易出问题的场景，必须用 login shell 主动获取环境
