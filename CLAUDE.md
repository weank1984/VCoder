# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VCoder is a VSCode extension (and experimental Electron desktop app) that provides an AI coding assistant UI powered by Claude Code CLI. It uses a custom **Agent Client Protocol (ACP)** over JSON-RPC 2.0 to communicate between the host environment and a Node.js agent server that spawns Claude CLI processes.

## Build & Development Commands

```bash
# Install dependencies
pnpm install

# Full monorepo build (shared → server → apps, via Turborepo)
pnpm build

# Dev mode (all packages in watch mode)
pnpm dev

# VSCode extension only
pnpm build:plugin          # Build
pnpm dev:plugin            # Watch mode
pnpm package:plugin        # Build + package → apps/vscode-extension/vcoder.vsix

# Desktop shell (Electron app)
pnpm build:app             # Build all deps + desktop
pnpm dev:app               # Dev mode
pnpm start:app             # Run built Electron app
```

## Testing

Tests use **Vitest** and live in the root `tests/` directory (not inside packages).

```bash
pnpm test                  # Run all tests once
pnpm test:watch            # Watch mode
pnpm test:coverage         # With v8 coverage

# Run a single test file
npx vitest run tests/server/acp.test.ts

# Run a directory of tests
npx vitest run tests/extension/
```

Mock aliases are configured in `vitest.config.ts`: `vscode` → `tests/mocks/vscode.ts`, `electron` → `tests/mocks/electron.ts`, and `@vcoder/*` → source TS files.

## Linting

```bash
pnpm lint                  # ESLint via Turborepo (all packages)
```

ESLint uses flat config (`eslint.config.js`). Unused vars prefixed with `_` are allowed. `@typescript-eslint/no-explicit-any` is disabled only for `transcriptStore.ts`.

## Monorepo Structure

This is a **pnpm workspace** with **Turborepo** orchestration. Build order is enforced via `^build` dependency in `turbo.json`.

| Package | Path | Description |
|---|---|---|
| `@vcoder/shared` | `packages/shared` | ACP protocol types, ACPClient, HostBridgeApi interface |
| `@vcoder/server` | `packages/server` | ACP server process; spawns Claude CLI via ClaudeCodeWrapper |
| `@vcoder/ui` | `packages/ui` | Shared React UI components, Zustand store, hooks, i18n (source-only, no build step) |
| VSCode extension | `apps/vscode-extension` | Extension host (CommonJS) + WebView (Vite + React) |
| Desktop shell | `apps/desktop-shell` | Electron main process + WebView (Vite + React, port 5174 in dev) |

**Dependency flow:** `@vcoder/shared` → `@vcoder/server` + `@vcoder/ui` → apps

## Architecture

### 3-Tier Communication

```
Host (VSCode Extension / Electron)
  ↕  postMessage (WebView IPC)
Shared WebView UI (@vcoder/ui — React 19 + Zustand)
  ↕  HostBridgeApi abstraction
Host → ACPClient (JSON-RPC 2.0 over stdio) → @vcoder/server
  ↕  spawn + JSON stream
Claude Code CLI (external process)
```

### Subagent Event Flow

Subagents run **within the same CLI process** as independent context windows (not separate child processes). The event flow through VCoder:

```
Claude CLI (same process)
  ├─ tool_use(Task) → wrapper emits subagent_run(running)
  ├─ subagent internal tool calls → tool_use events with parentToolUseId
  └─ tool_result(Task) → wrapper emits subagent_run(completed/failed)
```

The Server's responsibility is to **transparently forward** events, not to spawn subagent processes. The `ClaudeCodeWrapper` converts `Task` tool_use/tool_result into semantic `subagent_run` update events for the UI.

### Key Abstractions

- **HostBridgeApi** (`packages/shared/src/hostBridge.ts`): Unified interface that both VSCode and Electron hosts implement. The shared UI code in `@vcoder/ui` only talks through `bridge.ts`, never directly to host APIs.
- **ACPClient/ACPServer**: Custom JSON-RPC 2.0 over stdio. Methods include `initialize`, `session/*`, `prompt`, `settings/change`, `file/accept|reject`, `history/*`, `permission/rules/*`, `lsp/*`.
- **ClaudeCodeWrapper** (`packages/server/src/claude/wrapper.ts`): Manages per-session Claude CLI child processes. Each chat session maps to a separate process.
- **SubagentRunUpdate** (`packages/shared/src/protocol.ts`): Protocol type for subagent lifecycle events. Contains `subagentId`, `status` (running/completed/failed), `subagentType`, `description`, and nested tool call information. Emitted by `ClaudeCodeWrapper` when it detects `Task` tool usage in the CLI event stream.
- **CapabilityOrchestrator** (`apps/vscode-extension/src/services/capabilityOrchestrator.ts`): Dependency topology sort and lifecycle management of VS Code extension capabilities.
- **Zustand store** (`packages/ui/src/store/`): Slice-based architecture — `messagesSlice`, `sessionsSlice`, `uiSlice`, `updateSlice`, `historySlice`, `agentSlice`, `permissionRulesSlice`.

### TypeScript Configuration

- Root `tsconfig.json`: `ES2022`, `NodeNext`, `strict`, `composite` (project references)
- VSCode extension overrides to `module: "CommonJS"`, outputs to `out/`
- WebViews use `module: "ESNext"`, `moduleResolution: "bundler"` (Vite handles bundling, `noEmit: true`)
- Desktop shell uses `NodeNext` with `DOM` lib (Electron)

### WebView Build

Both webview apps (VSCode + Desktop) use Vite with identical patterns:
- Source aliases resolve `@vcoder/shared` and `@vcoder/ui` to TypeScript source (not built output)
- SCSS `loadPaths` include `packages/ui/src` for shared style imports
- Single-file bundle output (`cssCodeSplit: false`) for WebView CSP compliance

## Development Environment Notes

- **模型配置**：本项目使用本地 GLM 模型（如 `glm-4.6`）代替 Anthropic 官方模型进行开发和测试，这是预期配置。日志中出现 `--model glm-4.6` 或 `Preflight warning: api_key - No API key found` 均属正常，无需处理。

## UI Design Principles

### 信息分层：主对话流保持干净

主对话流（chat stream）只呈现用户**必须看到**的信息：用户消息、Claude 的文字回复、需要用户操作的权限确认（ApprovalUI）。

**不应出现在主对话流中的内容：**
- 子 agent（Task 工具）的内部工具调用——它们通过 `parentToolUseId` 识别并在 `StepEntry.tsx` 中过滤
- 子 agent 的执行进度、中间状态
- 团队成员（Agent Teams）的工作细节

原则：**主对话流是用户与 Claude 的对话记录，不是执行日志。**

### 工作流细节通过 MissionControl 展示

MissionControl（任务中心，`packages/ui/src/components/MissionControl/`）负责呈现所有工作流细节：

- **摘要视图**（默认）：Agents tab 显示每个子 agent 的一行摘要——状态图标、标题、类型徽章、耗时；仅在当前有活跃或等待确认的工具时，在 agent 行下方显示一行内联活动（`mc-agent-activity`）
- **详情视图**（页面跳转）：点击某个 agent 行后，MissionControl 进入详情模式——header 换为返回按钮 + agent 标题，body 显示 `AgentDetailView`，展示该 agent 的完整工具调用流、任务描述、执行结果/错误

### 导航规则

- MissionControl 始终只在**当前层级**显示摘要，不在列表中内联展开详情
- 详情通过**页面跳转**（`selectedRunId` 状态切换）进入，不用折叠/展开面板
- 返回按钮回到摘要列表，保持原来的 tab 和展开状态
- Team Members 暂时只显示成员状态摘要，未来可同样通过跳转查看每个成员的会话详情

### 用户交互使用底部浮动弹窗

所有需要用户操作的交互（审批、问答、模式切换等），应以**浮动弹窗**的形式呈现，锚定在输入框上方，而不是内嵌在对话流消息里。

**理由**：内嵌交互会把"需要操作的 UI"和"历史消息"混在同一个滚动流中，用户可能需要滚动才能找到待操作项，且历史消息上残留的交互组件会产生视觉噪音。浮动弹窗始终可见、位置固定，用户无需寻找。

**适用于此原则的交互类型：**

| 交互类型 | 当前实现 | 目标实现 |
|---|---|---|
| 工具审批（ApprovalUI）| 内嵌在 StepEntry（`packages/ui/src/components/StepProgress/`）| 输入框上方浮动卡片 |
| 用户问答（QuestionUI）| 内嵌在 StepEntry | 输入框上方浮动弹窗 |
| 模式切换（ModeSelector）| 工具栏 Portal 弹出 ✓ 已符合 | 保持现状 |
| 运行时权限（PermissionDialog）| Fixed 全屏居中 Modal ✓ 已符合 | 可改为底部锚定 |

**浮动弹窗的设计规范：**
- 位置：`position: fixed`，紧贴输入框上边缘，左右与输入框对齐
- 层级：z-index 高于消息流，低于全屏模态（建议 z-index: 200）
- 优先级：同时存在多个待审批项时，显示最新的一条，其余在 MissionControl 中排队
- 消失时机：用户操作后立即关闭；对应工具调用的状态变更为非 `awaiting_confirmation` 时自动关闭
- 对话流中的对应消息：保留工具调用条目（显示工具名称和状态），**不渲染**审批/问答的交互 UI，审批结果（approved/denied）可以作为静态标签显示

### awaiting_confirmation 状态处理

当子 agent 的工具调用需要用户确认时（工具调用状态 `awaiting_confirmation`），UI 必须主动提示用户：

1. MissionControl 自动展开并切换到 Agents tab
2. header 显示琥珀色"待确认"徽章，点击后滚动到输入框底部的审批弹窗
3. 相关 agent 行和内联活动行使用琥珀色高亮（区别于蓝色的"运行中"）
4. 整个 agent-block 边框切换为 `agent-block--waiting` 样式

## Conventions

- Language: Project docs and comments are primarily in Chinese (zh-CN), code identifiers in English
- i18n: `packages/ui/src/i18n/` with `en-US` and `zh-CN` locales
- Styles: SCSS modules with component-paired files (e.g., `ChatBubble.tsx` + `ChatBubble.scss`)
- Node.js: `>=20.19.0 || >=22.12.0`
- Package manager: `pnpm@9.0.0` (enforced via `packageManager` field)
