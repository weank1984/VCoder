# 现有设计问题与功能缺陷清单

> 说明：本文件基于当前仓库实现的静态代码审阅整理，便于后续逐项修复与规划迭代。

## 主要设计问题

### 1) 多会话“名义支持、实际未隔离”
- Webview `handleUpdate` 大多不按 `sessionId` 过滤，仅 `file_change` 做了例外处理，跨会话流式内容/工具状态容易串台。
  - 参考：`packages/extension/webview/src/store/useStore.ts:689`
- `setCurrentSession` 只切换 `currentSessionId`，并不会清空/切换消息集合，导致 UI 与真实会话边界不一致。
  - 参考：`packages/extension/webview/src/store/useStore.ts:601`

### 2) ACP 传输层生命周期管理不完整（潜在重复监听/泄漏）
- `ACPClient.updateTransport()` 会重新 `setupMessageHandler()`，但未显式关闭旧的 readline/监听器，可能导致重复消费消息或内存泄漏。
  - 参考：`packages/extension/src/acp/client.ts:62`、`packages/extension/src/acp/client.ts:69`

### 3) 能力/组件堆叠但缺少闭环编排
- `SessionStore`、`AuditLogger`、`BuiltinMcpServer` 在激活阶段初始化/启动，但与会话/工具流缺少系统性串联与一致的数据来源（例如：会话恢复、审计事件落地、MCP 注入策略）。
  - 参考：`packages/extension/src/extension.ts:106`、`packages/extension/src/extension.ts:112`、`packages/extension/src/extension.ts:118`

### 4) 权限体系割裂且规则持久化未完成
- 同时存在 `session/request_permission`（Webview PermissionDialog）与 `tool/confirm`（Claude CLI can_use_tool 流）两套确认路径，且“始终允许/规则持久化”未实现。
  - 参考：`packages/extension/src/services/permissionProvider.ts:84`
- Agent 列表/状态展示目前与 `AgentProcessManager` 未打通，展示为离线并默认首个为 active，属于占位实现。
  - 参考：`packages/extension/src/providers/chatViewProvider.ts:522`

## 明显功能缺陷 / 未完成点

### 1) 切换会话不刷新上下文
- `switchSession` 仅发送 `session/switch` 并回传 `currentSession`，未拉取/切换对应消息与工具状态；Webview 侧也未按会话分桶。
  - 参考：`packages/extension/src/providers/chatViewProvider.ts:115`、`packages/extension/webview/src/store/useStore.ts:601`

### 2) Diff/文件变更链路不一致（可见≠可应用）
- Diff 预览的 “proposed” 侧可能展示 `diff` 字符串而非完整文件内容；是否可应用取决于 `change.content` 是否为字符串，容易出现“看得到但无法应用/应用结果不符合预期”的体验。
  - 参考：`packages/extension/src/services/diffManager.ts:44`、`packages/extension/src/services/diffManager.ts:130`

### 3) 内置 MCP Server 存在越权接口形态与未完成能力
- `workspace/openFile` 支持绝对路径，可能打开 workspace 外文件（应至少限制在 workspace 或走额外授权）。
  - 参考：`packages/extension/src/services/builtinMcpServer.ts:470`
- server 监听未显式绑定 `127.0.0.1`（虽然返回的 URL 是 `127.0.0.1`），建议明确绑定以降低暴露面。
  - 参考：`packages/extension/src/services/builtinMcpServer.ts:75`
- `git/*` 工具目前为占位返回，不具备真实能力。
  - 参考：`packages/extension/src/services/builtinMcpServer.ts:499`

### 4) VSIX 打包策略可能导致运行时依赖缺失
- `.vscodeignore` 排除了 `node_modules/**`（仅白名单 `@vcoder/shared`），同时 CI/Release 使用 `vsce package --no-dependencies`，会把 `node-pty` 等运行时依赖排除出 VSIX，安装后可能报 `Cannot find module`。
  - 参考：`packages/extension/.vscodeignore:9`、`.github/workflows/ci.yml:42`

## 建议修复优先级（面向可用性）

1. **多会话隔离最小闭环**：按 `sessionId` 分桶存储消息/工具/任务/文件变更，并在 `switchSession` 时切换整套视图状态（否则 multi-session 体验不可靠）。
2. **修复 VSIX 打包依赖**：要么取消 `--no-dependencies` 并确保依赖被包含，要么引入 bundling（webpack/esbuild）把运行时依赖打进产物，确保用户安装即用。
3. **收敛权限确认路径**：明确主路径（建议统一走 `tool/confirm`），补齐“始终信任/规则持久化”，避免重复弹窗与状态不一致。

