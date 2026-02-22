# VCoder 对齐 Claude App + 后续功能规划

> 版本: v1.0 | 日期: 2026-02-22 | 状态: Approved

## Context

基于对 Claude Desktop v1.1.3363 和 Claude Code VSCode 插件 v2.1.49 的逆向分析，结合 VCoder 当前代码状态（V0.6），制定 App 和 Plugin 的后续开发路线图。核心原则：**CLI 子命令转发，不重造轮子；双端同步，共享 Server/Webview**。

---

## 逆向分析核心发现

| 维度 | Claude Code 实际做法 | VCoder 当前差距 |
|------|---------------------|----------------|
| CLI 集成 | 插件是 CLI 的 IDE 壳层，`spawn --output-format stream-json --input-format stream-json` | 已对齐，使用 stream-json |
| IDE MCP Bridge | 本地 WebSocket `127.0.0.1`，暴露 `openDiff/getDiagnostics/openFile` | **缺失** - 需新建 |
| 插件管理 | 通过 CLI 子命令 `plugin list/install/uninstall --json` | **缺失** - 需建 CLI 转发层 |
| Diff 审阅 | CLI 触发 `openDiff` → IDE 打开 → accept/reject 回流 | 有 DiffManager 但未接入主流程 |
| 权限链路 | `can_use_tool` → `control_request/response` 单链路 | **双链路并存**，需统一 |
| 持久会话 | 默认 persistent session，双向 NDJSON | Server 有实现，Webview 未接线 |
| 宿主桥接 | `contextBridge.exposeInMainWorld` + 能力协商 | **HostBridge 过于简陋** |
| 生态管理 | Skills/Plugins/Hooks/Marketplace 全通过 CLI | **完全缺失** |

---

## 执行计划（5 Phase, 10 Sprints, 20 周）

### Phase 0: 稳定性基座 (Sprint 1-2, 第 1-4 周)

#### Sprint 1: 权限统一 + 协议收敛

**任务 1.1: 统一权限为 Chain B（tool/confirm）单链路**
- 删除 Chain A (`session/requestPermission`) 处理器
- 文件: `apps/vscode-extension/src/extension.ts` - 移除 requestPermission handler
- 文件: `apps/vscode-extension/src/providers/chatViewProvider.ts` - 移除 confirmBash/skipBash/confirmPlan
- 文件: `packages/shared/src/protocol.ts` - 标记 BashConfirmParams 等为 @deprecated
- 文件: `packages/ui/src/store/slices/updateSlice.ts` - 按 toolCallId 去重防重复弹窗

**任务 1.2: 协议类型补全**
- 文件: `packages/shared/src/protocol.ts`
  - `UpdateType` 添加 `'session_switch'`（Server 已发送但类型未声明）
  - 新增 `CliSubcommandParams/Result` 类型（为 Sprint 3 铺路）
  - 新增 `'execution_summary'` 更新类型

**任务 1.3: 持久会话 Webview 接线**
- 文件: `packages/ui/src/store/slices/uiSlice.ts` - 添加 `promptMode: 'oneshot' | 'persistent'`
- 文件: `apps/vscode-extension/src/providers/chatViewProvider.ts` - send 消息路由到 `promptPersistent()`
- Desktop Shell 已有类似实现（`desktopRuntime.ts:541`），验证对齐

#### Sprint 2: HostBridge 抽象 + Desktop Shell 对齐

**任务 2.1: 扩展 HostBridge 为能力协商模型**
- 文件: `packages/shared/src/hostBridge.ts` - 新增 `HostCapabilities` 接口
  - `nativeDiff` / `nativeTerminal` / `nativeFileOpen` / `findInPage` / `globalShortcut`
- 文件: `packages/ui/src/bridge.ts` - 添加 `getCapabilities()` 读取宿主能力
- Plugin 发送: `{ nativeDiff: true, nativeTerminal: true, ... }`
- App 发送: `{ nativeDiff: false, nativeFileOpen: true, globalShortcut: true, ... }`
- **关键原则**: Webview 只读能力标志，永不检测宿主类型（NFR-006）

**任务 2.2: Desktop Shell IPC 系统性对齐**
- 对照 ChatViewProvider 的每个 message case，补全 DesktopRuntime
- 新建 `apps/desktop-shell/src/desktopDiffManager.ts` - 内存级 Diff 管理
- 文件: `apps/desktop-shell/src/desktopRuntime.ts` - 补全 Diff 审阅、权限审批等 handler

---

### Phase 1: CLI 核心对齐 (Sprint 3-4, 第 5-8 周)

#### Sprint 3: IDE MCP Bridge + CLI 子命令转发

**任务 3.1: IDE MCP Bridge（对齐 Claude Code 架构）**
- 新建 `apps/vscode-extension/src/services/ideMcpBridge.ts`
  - 启动本地 WebSocket 服务于 `127.0.0.1:0`
  - 写 lock 文件到 `~/.claude/ide/{workspace-hash}.json`
  - 注册 MCP 工具: `openDiff`, `getDiagnostics`, `openFile`, `getOpenEditors`
  - 鉴权: `x-claude-code-ide-authorization` header
  - 设 `CLAUDE_CODE_SSE_PORT` 环境变量传给 CLI
- Desktop Shell 不启动 IDE MCP Bridge（无 IDE 上下文）

**任务 3.2: CLI 子命令转发基础设施**
- 新建 `packages/server/src/claude/cliSubcommandRunner.ts`
- 文件: `packages/server/src/acp/server.ts` - 添加 `cli/subcommand` method handler
- 安全: 白名单允许的子命令
- 超时: 30 秒

#### Sprint 4: Diff 审阅闭环 + 执行摘要

**任务 4.1: DiffManager 接入主流程**
- `file_change` 事件自动触发 `diffManager.previewChange()`
- 大文件 (>1MB) 降级为 Webview 内嵌 Diff
- App 端使用内嵌 DiffViewer

**任务 4.2: 执行摘要**
- 新建 `packages/server/src/claude/executionSummary.ts` - 变更/工具/错误/token 统计
- 新建 `packages/ui/src/components/ExecutionSummary/index.tsx` - 折叠摘要卡片

---

### Phase 2: 生态管理 (Sprint 5-6, 第 9-12 周)

#### Sprint 5: Skills + Plugins 面板

- EcosystemPanel 重构为 Tab（MCP / Skills / Plugins / Hooks）
- Skills Tab: 名称、作用域、调用方式
- Plugin 管理: 通过 CLI 子命令 `plugin list --json` / `plugin install` / `plugin marketplace list`

#### Sprint 6: Hooks 可视化 + 历史搜索增强

- Hooks 只读查看器（所有来源）
- 历史面板添加筛选栏（文本搜索、工具名、文件路径、日期范围）

---

### Phase 3: 竞争力特性 (Sprint 7-8, 第 13-16 周)

#### Sprint 7: 权限建议 + 命令面板

- 将 CLI `permission_suggestions` 渲染为快捷按钮
- 命令面板 (Cmd+K): 新建会话、切换模型、Plan Mode、执行 Skill 等

#### Sprint 8: Agent Teams 实验 UI

- AgentTeamsPanel 接入真实数据（Feature Flag 控制）
- 展示: 团队成员、任务列表、消息流

---

### Phase 4: 打磨发布 (Sprint 9-10, 第 17-20 周)

#### Sprint 9: 性能 + 可观测性

- 长会话消息虚拟化（200 条上限 + 懒加载）
- 审计日志全事件覆盖

#### Sprint 10: 清理 + 发布门禁

- 删除所有 @deprecated 代码
- 双端构建门禁: `pnpm build:plugin && pnpm build:app && pnpm test`
- 宿主类型分支审计

---

## 关键架构决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 权限链路 | 统一为 Chain B (control_request/response) | 唯一完整的工作链路；与 CLI 协议一致 |
| 生态管理 | CLI 子命令转发 | 保证 CLI 版本兼容性；与 Claude Code 做法一致 |
| IDE 能力暴露 | IDE MCP Bridge (WebSocket) | 与 Claude Code 架构完全对齐 |
| 宿主差异处理 | 能力标志，非类型检测 | 强制 NFR-006 |
| 默认会话模式 | persistent session | 更好的 UX |

## 依赖关系

```
Sprint 1-2 (基座) → Sprint 3-4 (核心) → Sprint 5-6 (生态)
                                        → Sprint 7-8 (竞争力)
                                        → Sprint 9-10 (发布)
```

## 验证策略

- **Phase 0 完成**: 权限确认/拒绝双端一致；无重复弹窗
- **Phase 1 完成**: IDE MCP Bridge 可被 CLI 调用；Diff 审阅自动触发
- **Phase 2 完成**: Skills/Plugins/Hooks 可通过 CLI 子命令获取并展示
- **最终发布**: 双端构建全通过；共享代码无宿主类型检测
