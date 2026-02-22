# PRD：VCoder 长期目标（统一 UI 集成 CLI Agents）

## 0. 文档信息

- 版本：v1.3
- 日期：2026-02-21
- 状态：Draft
- 规划周期：12-18 个月
- 目标读者：产品、研发、设计、测试

## 1. 北极星目标

VCoder 的长期目标是：开发一套统一 UI，同时以 **VSCode 插件（Plugin）** 和 **独立桌面应用（App）** 两种形态，稳定集成 CLI Agent 工具（优先 Claude Code CLI），把 CLI 的能力以可控、可视、可审阅的方式交付给开发者。

两种形态共享同一套 Server 与 Webview，区别仅在宿主层（Host）的集成方式。

## 2. 核心定位（修正后）

1. 我们做的是统一集成层（UI + 协议 + 宿主能力），不是重造 Agent Runtime。
2. 需求以 Claude Code CLI 的真实能力为基线，不做"能力超前 PRD"。
3. 所有"新增体验"必须映射到 CLI 已有能力或明确标注为实验扩展。
4. App 与 Plugin 同步开发，共用 `packages/server` 与 `webview`；宿主差异仅在 Host 层收敛，不下沉到共享层。

## 3. 问题定位（修正后）

当前主要问题不是"功能不够多"，而是三件事：

1. 集成碎片化：CLI 能力存在，但在 IDE/App 中缺少统一交互与一致语义。
2. 能力错位：部分需求未严格对齐 Claude Code CLI，可实现性与优先级失真。
3. 双端分叉风险：App（Desktop Shell）与 Plugin（VSCode Extension）目前共享 Server/Webview，但宿主层 IPC 桥接路径尚未稳定对齐，存在功能在一端实现而另一端缺失的风险。

## 4. 产品边界

### 4.1 In Scope

1. Claude Code CLI 的统一 UI 集成与能力可视化。
2. 基于 ACP/MCP 的权限、审阅、工具调用与会话管理。
3. CLI 生态能力（skills/plugins/hooks/history）的 IDE 化管理与展示。
4. **双端并行交付**：VSCode Extension（Plugin）与 Desktop Shell（App）同步开发，共享核心，差异仅在宿主层。
5. 宿主无关（Host-Agnostic）的 ACP 协议层，确保 Server/Webview 不感知宿主类型。

### 4.2 Out of Scope（当前周期）

1. 自研模型推理循环或替代 Claude Runtime。
2. 与 CLI 无对应能力的重型"平台幻想型"功能。
3. 企业级 IAM/SSO/多租户策略中心。
4. App 与 Plugin 的差异化 UI（两端共享同一套 Webview，不做分叉设计）。

## 5. 目标用户

| 用户 | 主要诉求 | 主要使用形态 |
|---|---|---|
| 开发者 | 在 IDE 内直接使用 CLI Agent，少切换、可审阅 | Plugin（VSCode Extension） |
| 非 VSCode 用户 / 独立用户 | 脱离 IDE 独立运行 Agent，保持相同体验 | App（Desktop Shell） |
| 资深工程师 | 长任务可跟踪、工具行为可解释、失败可定位 | Plugin / App 均适用 |
| 团队维护者 | 权限与执行有审计，规则可治理 | Plugin / App 均适用 |

## 6. 双端开发策略（App + Plugin）

### 6.1 架构分层

```
┌─────────────────────────────────┐  ┌─────────────────────────────────┐
│  Plugin（VSCode Extension）      │  │  App（Desktop Shell / Electron）│
│  apps/vscode-extension/src/     │  │  apps/desktop-shell/src/        │
│  - Extension Host               │  │  - Electron Main Process        │
│  - VSCode API 集成              │  │  - IPC 桥接                     │
└────────────────┬────────────────┘  └────────────────┬────────────────┘
                 │ Host 层（宿主差异收敛在此）          │
                 └─────────────┬──────────────────────┘
                               │ ACP JSON-RPC（stdio）
              ┌────────────────┴────────────────────┐
              │  共享 Server（packages/server）       │
              │  - ACP Server                        │
              │  - Claude Code CLI Wrapper            │
              │  - History / Session 管理            │
              └────────────────┬────────────────────┘
              ┌────────────────┴────────────────────┐
              │  共享 Webview（vscode-extension/webview）│
              │  - React UI（会话/工具/权限/历史）    │
              │  - 通过 Host Bridge 与宿主通信        │
              └─────────────────────────────────────┘
              ┌─────────────────────────────────────┐
              │  共享协议（packages/shared）          │
              │  - ACP 协议类型（单一来源）           │
              │  - ACPClient 实现                    │
              └─────────────────────────────────────┘
```

### 6.2 宿主差异对照

| 能力域 | Plugin（VSCode Extension） | App（Desktop Shell） | 共享层 |
|---|---|---|---|
| Webview 宿主 | `vscode.WebviewPanel` | Electron `BrowserWindow` | 同一 React 应用 |
| IPC 桥接 | `vscode.postMessage` ↔ `onMessage` | Electron `ipcRenderer` / `contextBridge` | Host Bridge 接口抽象 |
| 文件系统 | VSCode `workspace.fs` API | Node.js `fs` / Electron dialog | Server 统一提供（`file/*` ACP 方法） |
| 终端 | VSCode Terminal API | `node-pty` 直接 spawn | Server 统一提供（`terminal/*` ACP 方法） |
| 权限弹窗 | VSCode `window.showWarningMessage` | Electron `dialog` | ACP `can_use_tool` 结构化协议统一 |
| 文件 Diff 审阅 | VSCode Diff Editor | Electron 内嵌 Diff 视图 | Diff 数据由 Server 提供，UI 在 Webview 渲染 |
| 构建产物 | `.vsix` | Electron 安装包 | 独立构建，共享 Server/Webview 构建缓存 |

### 6.3 功能对等原则

1. **核心功能双端必须对等**：凡是 Plugin 已发布的 P0/P1 功能，App 同期或最迟下一 Phase 跟进。
2. **宿主差异不下沉**：Webview 与 Server 不得包含 `if (isVSCode)` / `if (isElectron)` 分支；宿主差异只在 Host 层处理。
3. **IPC 协议统一**：Webview 对外只使用 `HostBridge` 接口（`postMessage` / `ipcRenderer` 在 Host 层适配），不直接调用宿主 API。
4. **构建门禁双端覆盖**：`pnpm build:plugin` 与 `pnpm build:app` 同时必须通过，不接受单端绿灯。

## 7. Claude Code CLI 能力对齐矩阵（基线）

| 能力域 | Claude Code CLI 现状 | VCoder 需求定义 |
|---|---|---|
| 流式会话 | `--output-format stream-json` + 增量事件 | 必须作为统一消息源（FR-101） |
| 双向输入 | `--input-format stream-json` NDJSON | 必须支持持久会话输入（FR-102） |
| 多轮续聊 | `--resume/--continue` | 必须稳定续聊，不依赖错误参数（FR-103） |
| Thinking | `MAX_THINKING_TOKENS` + `--include-partial-messages` | UI 支持 thinking/thinking_delta 展示（FR-104） |
| 工具事件 | `tool_use/tool_result`（assistant/user content blocks） | 必须正确解析并关联 `tool_use_id`（FR-201） |
| 权限模式 | `default/plan/acceptEdits/bypassPermissions` | UI 模式与 CLI 权限模式一一映射（FR-301） |
| 结构化审批 | `can_use_tool` 控制请求链路 | 禁止 `y/n` 伪交互，走结构化权限（FR-302） |
| Todo/Task | `TodoWrite`、`Task` | UI 分别呈现 Task List 与 Task Runs（FR-202） |
| 后台 Bash | 后台任务与 BashOutput/KillShell | 提供任务查看与终止能力（FR-203） |
| 历史会话 | `~/.claude/projects/*.jsonl` | 独立 History API 与回放（FR-401） |
| MCP | CLI 注入/调用 MCP servers | 提供 MCP 配置、连通、错误可视化（FR-501） |
| Skills | `.claude/skills` 体系 | 提供 Skills 列表、来源与调用入口（FR-502） |
| Plugins | CLI plugin/marketplace 子命令 | 提供插件安装/启停/版本视图（FR-503） |
| Hooks | 多来源 hooks 配置 | 提供可见性与审计（FR-504） |
| Agent Teams | 实验能力（开关启用） | 仅实验通道，不作为主路径承诺（FR-601） |

## 8. 功能需求（FR，按对齐后范围）

### 8.1 会话与流式渲染

- FR-101：统一会话渲染必须基于 stream-json 事件流。
- FR-102：支持持久会话的双向消息输入（非一次性 spawn-only）。
- FR-103：同会话多轮必须通过 `--resume/--continue` 正确续接。
- FR-104：支持文本、thinking、tool、result 的实时增量渲染。

### 8.2 工具调用可视化

- FR-201：正确解析 `tool_use/tool_result`，并以 `tool_use_id` 关联。
- FR-202：`TodoWrite` 与 `Task` 分离展示：Task List / Task Runs。
- FR-203：支持 Bash/Terminal 输出增量查看、等待退出、终止。
- FR-204：支持工具调用分组汇总与展开详情。

### 8.3 权限与安全

- FR-301：UI 权限模式必须映射 CLI 权限模式（default/plan/acceptEdits/bypassPermissions）。
- FR-302：审批链路必须基于结构化权限协议，不得向 stream-json stdin 写 `y/n`。
- FR-303：敏感操作（写文件/命令执行/网络工具）默认需审批或策略显式放行。
- FR-304：拒绝路径必须可恢复，不允许会话卡死。

### 8.4 审阅与产物

- FR-401：写文件默认走 Diff 审阅（Accept/Reject）再落盘。
- FR-402：每轮生成执行摘要（做了什么、改了什么、结果如何）。
- FR-403：失败调用必须提供可定位信息（错误、参数摘要、相关文件）。

### 8.5 历史与检索

- FR-501：支持历史会话列表与消息回放（与在线会话隔离）。
- FR-502：支持按会话/文件/工具类型检索历史记录。
- FR-503：支持 projectKey 异常场景兜底解析（history.jsonl 反查）。 `[P3 降级]`

### 8.6 CLI 生态集成

- FR-601：提供 MCP Server 管理（添加、健康检查、失败展示）。
- FR-602：提供 Skills 统一视图（个人/项目/插件来源与优先级）。
- FR-603：提供 Plugins/Marketplace 基础管理视图（列表、安装、启停、版本）。 `[观望]`
- FR-604：提供 Hooks 配置来源可视化与执行审计。

### 8.7 实验能力（Feature Flag）

- FR-701：Agent Teams 仅在实验开关下显示并可用。
- FR-702：实验能力默认不影响主流程稳定性与发布门禁。

## 9. 非功能需求（NFR）

- NFR-001：`pnpm build`、`pnpm test`、`package` 持续可通过；`pnpm build:plugin` 与 `pnpm build:app` 双端同时通过。
- NFR-002：长会话下 UI 不出现明显卡顿或滚动错乱。
- NFR-003：会话切换/删除无 pending request 泄漏。
- NFR-004：日志可定位到 `sessionId`/`toolCallId`，可导出 JSONL 审计。
- NFR-005：协议定义单源，兼容别名可观测并可下线。
- NFR-006：Webview 与 Server 代码中不存在宿主类型判断分支（`isVSCode` / `isElectron`）；宿主差异只在 Host 层隔离。
- NFR-007：新 FR 交付时，必须同时在 Plugin 与 App 两端完成验收，不接受单端验收。

## 10. 里程碑（按 CLI 对齐优先级）

| 阶段 | 时间 | 目标 | 关键交付（Plugin） | 关键交付（App） |
|---|---|---|---|---|
| Phase 1 | 0-3 个月 | CLI 核心能力对齐 + 双端基线打通 | 流式会话、工具解析、权限链路、续聊稳定 | Desktop Shell IPC 桥接稳定；与 Plugin 功能对等 |
| Phase 2 | 3-6 个月 | 统一审阅体验 | Diff 审阅闭环、执行摘要、历史回放与检索 | App 内 Diff 审阅可用；宿主无关 HostBridge 接口完成 |
| Phase 3 | 6-12 个月 | 生态管理能力 | MCP/Skills/Plugins/Hooks 统一管理 UI | App 同步上线相同管理面板 |
| Phase 4 | 12-18 个月 | 实验编排能力 | Task Manager 增强、Agent Teams 实验化 | App 同步支持实验能力 |

## 11. 验收标准（长期 DoD）

1. 用户可在单一 UI 内完成：提问 -> 工具执行 -> 权限决策 -> 结果审阅。
2. CLI 原生能力在 UI 中语义一致，不出现"模式名存在但行为不一致"。
3. 关键高风险动作全部可审计，拒绝路径稳定可恢复。
4. 历史会话可回放，且不污染在线会话状态。
5. 生态能力（MCP/Skills/Plugins/Hooks）至少具备基础可用管理面板。
6. **Plugin 与 App 在所有已发布 FR 上功能对等，无单端缺失项。**
7. **Webview/Server 代码通过 lint/review 检查，确认无宿主类型分支。**

## 12. 非目标

1. 不重写 Claude Code Runtime。
2. 不在当前周期承诺"完全自动、零审批"的执行策略。
3. 不承诺与 CLI 无能力映射的大而全功能。
4. 不为 Plugin 与 App 分别设计差异化 UI（两端共享同一 Webview）。

## 13. 风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| CLI 版本行为变化 | 解析与交互回归 | 契约测试 + 版本兼容层 |
| 权限语义不一致 | 用户不信任 | 单一语义模型 + 审计 |
| 长会话性能问题 | 体验下降 | 批处理、虚拟化、分页 |
| 生态功能复杂度 | 延期风险 | 先核心后生态，分阶段上线 |
| App/Plugin 功能分叉 | 维护成本翻倍、用户预期不一致 | NFR-006/007 + HostBridge 抽象强制隔离宿主差异 |
| Desktop Shell IPC 不稳定 | App 端体验降级 | Phase 1 优先完成 IPC 桥接稳定化，纳入 P0 门禁 |

## 14. 依赖与前置

1. 稳定 ACP/MCP 协议层。
2. Claude Code CLI 可用与版本策略。
3. Extension Host 与 Webview 的稳定消息总线（Plugin）。
4. Electron IPC 桥接（`contextBridge` / `preload`）的稳定实现（App）。
5. 审计日志与导出能力。
6. HostBridge 接口定义（统一 Webview 与宿主通信的抽象层）。

## 15. 代码对照后的任务分层（Baseline vs Expansion）

本节基于当前仓库代码（`packages/server`、`apps/vscode-extension`、`apps/desktop-shell`、`packages/shared`）与本 PRD 对照，作为后续执行的优先级基线。

### 15.1 对照结论

1. 核心链路已具备骨架：流式会话、thinking 增量、`tool_use/tool_result` 解析、`TodoWrite/Task` 展示、History API 已可用。
2. 当前主要问题不是"功能数量不足"，而是"统一语义尚未闭环"：
   - 权限链路存在双轨；
   - 部分协议定义未实现；
   - 部分体验（Diff/持久会话）有实现但未接线。
3. App（Desktop Shell）目前处于 POC 状态，IPC 桥接路径（`apps/desktop-shell/src/preload.ts`、`ipc.ts`）尚未与 Plugin 功能对齐，存在双端分叉风险。

### 15.2 基线任务（P0/P1）

| 优先级 | 任务 | 当前代码状态 | 验收标准（DoD） | 适用端 |
|---|---|---|---|---|
| P0 | 统一权限链路为单一路径 | 既有 `session/requestPermission`（`apps/vscode-extension/src/extension.ts`）也有 `confirmation_request + tool/confirm`（`packages/server/src/claude/wrapper.ts`、`packages/server/src/acp/server.ts`） | 所有工具审批只走一条结构化链路；拒绝后可恢复；无重复弹窗 | Plugin + App |
| P0 | 打通权限规则协议闭环 | 协议定义了 `permissionRules/*`（`packages/shared/src/protocol.ts`），但 Server 未实现对应方法分发（`packages/server/src/acp/server.ts`），当前主要在 Extension 本地存储（`apps/vscode-extension/src/services/sessionStore.ts`） | Webview/Extension/Server 三端统一走 ACP RPC；规则增删改查可回归测试 | Plugin + App |
| P0 | 持久会话模式端到端接线 | Server/Wrapper 已有 `promptPersistent/modeStatus/stopPersistent`，但 Client/Webview 发送路径仍以 `session/prompt` 为主（`apps/vscode-extension/src/acp/client.ts`、`apps/vscode-extension/src/providers/chatViewProvider.ts`） | UI 可切换一次性/持久模式；多轮延续稳定；可查询模式状态并可停止 | Plugin + App |
| P0 | Desktop Shell IPC 桥接稳定化 | `apps/desktop-shell/src/preload.ts` 已有基础桥接，但缺乏与 Plugin 侧功能的系统性对齐（权限审批、文件变更、会话事件均未在 App 端验证） | App 端与 Plugin 端在权限链路、会话事件、Diff 审阅上行为一致；IPC 通道覆盖所有 ACP 方法 | App |
| P1 | Diff 审阅闭环接线 | Server 已发 `file_change`，但 `DiffManager.previewChange()` 与文件装饰器未进入主流程（`apps/vscode-extension/src/services/diffManager.ts`、`apps/vscode-extension/src/providers/fileDecorationProvider.ts`） | 写文件默认进入 Diff 审阅；Accept/Reject 后状态一致；大文件降级策略可用 | Plugin（App 端 Webview 内嵌 Diff 跟进） |
| P1 | 协议事件类型收敛 | Server 发送 `session_switch`（`packages/server/src/acp/server.ts`），但 `UpdateType` 未声明该类型（`packages/shared/src/protocol.ts`） | 协议定义与实现一致；不存在未声明事件类型 | Plugin + App |
| P1 | 审计日志闭环 | `AuditLogger` 能力较完整，但实际调用集中在用户输入与权限决策（`apps/vscode-extension/src/services/auditLogger.ts`、`apps/vscode-extension/src/providers/chatViewProvider.ts`） | 工具调用、文件变更、错误、会话生命周期均有结构化审计记录 | Plugin + App |
| P1 | HostBridge 接口抽象 | Webview 目前通过 `vscode.acquireVsCodeApi().postMessage` 直接调用，App 端通过 `window.electronAPI` 调用，两套接口未统一 | 提取 `HostBridge` 接口层；Webview 代码只调用 `HostBridge`，不感知宿主类型；Plugin/App 各自实现适配 | Plugin + App |

### 15.3 拓展任务（P2+）

| 优先级 | 任务 | 说明 | 适用端 |
|---|---|---|---|
| P2 | CLI 生态管理 UI（MCP/Skills/Plugins/Hooks） | 在基线稳定后上线统一管理面板；能力命名与行为严格对齐 CLI | Plugin + App 同步 |
| P2 | 历史检索增强 | 在现有 `history/list/load/delete` 基础上增加按会话/文件/工具类型检索 | Plugin + App 同步 |
| P3 | Agent Teams（实验能力） | 仅通过 Feature Flag 开启，不纳入主路径 SLA | Plugin + App |
| P3 | ~~多后端能力对齐（如 Codex CLI）~~ `[已移除]` | ~~先做能力探测与差异展示，再决定统一交互抽象~~ | ~~Plugin + App~~ |

### 15.4 执行顺序约束

1. 先做 P0（权限单轨、权限规则协议、持久会话接线、Desktop Shell IPC 稳定化），再进入 P1（Diff/协议收敛/审计/HostBridge 抽象）。
2. P2/P3 不得阻塞 P0/P1 的发布门禁。
3. 所有"拓展任务"必须满足第 2 章定位：不重写 Runtime，且有 CLI 能力映射。
4. Plugin 与 App 的 P0 任务并行推进，不互相阻塞；但双端必须同时完成才算该 Phase 交付。
