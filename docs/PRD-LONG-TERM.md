# PRD：VCoder 长期目标（统一 UI 集成 CLI Agents）

## 0. 文档信息

- 版本：v1.2
- 日期：2026-02-21
- 状态：Draft
- 规划周期：12-18 个月
- 目标读者：产品、研发、设计、测试

## 1. 北极星目标

VCoder 的长期目标是：开发一套统一 UI，在 VSCode 内稳定集成 CLI Agent 工具（优先 Claude Code CLI），把 CLI 的能力以可控、可视、可审阅的方式交付给开发者。

## 2. 核心定位（修正后）

1. 我们做的是统一集成层（UI + 协议 + 宿主能力），不是重造 Agent Runtime。
2. 需求以 Claude Code CLI 的真实能力为基线，不做“能力超前 PRD”。
3. 所有“新增体验”必须映射到 CLI 已有能力或明确标注为实验扩展。

## 3. 问题定位（修正后）

当前主要问题不是“功能不够多”，而是两件事：

1. 集成碎片化：CLI 能力存在，但在 IDE 中缺少统一交互与一致语义。
2. 能力错位：部分需求未严格对齐 Claude Code CLI，可实现性与优先级失真。

## 4. 产品边界

## 4.1 In Scope

1. Claude Code CLI 的统一 UI 集成与能力可视化。
2. 基于 ACP/MCP 的权限、审阅、工具调用与会话管理。
3. CLI 生态能力（skills/plugins/hooks/history）的 IDE 化管理与展示。

## 4.2 Out of Scope（当前周期）

1. 自研模型推理循环或替代 Claude Runtime。
2. 与 CLI 无对应能力的重型“平台幻想型”功能。
3. 企业级 IAM/SSO/多租户策略中心（仅保留接口预留）。

## 5. 目标用户

| 用户 | 主要诉求 |
|---|---|
| 开发者 | 在 IDE 内直接使用 CLI Agent，少切换、可审阅 |
| 资深工程师 | 长任务可跟踪、工具行为可解释、失败可定位 |
| 团队维护者 | 权限与执行有审计，规则可治理 |

## 6. Claude Code CLI 能力对齐矩阵（基线）

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

## 7. 功能需求（FR，按对齐后范围）

### 7.1 会话与流式渲染

- FR-101：统一会话渲染必须基于 stream-json 事件流。
- FR-102：支持持久会话的双向消息输入（非一次性 spawn-only）。
- FR-103：同会话多轮必须通过 `--resume/--continue` 正确续接。
- FR-104：支持文本、thinking、tool、result 的实时增量渲染。

### 7.2 工具调用可视化

- FR-201：正确解析 `tool_use/tool_result`，并以 `tool_use_id` 关联。
- FR-202：`TodoWrite` 与 `Task` 分离展示：Task List / Task Runs。
- FR-203：支持 Bash/Terminal 输出增量查看、等待退出、终止。
- FR-204：支持工具调用分组汇总与展开详情。

### 7.3 权限与安全

- FR-301：UI 权限模式必须映射 CLI 权限模式（default/plan/acceptEdits/bypassPermissions）。
- FR-302：审批链路必须基于结构化权限协议，不得向 stream-json stdin 写 `y/n`。
- FR-303：敏感操作（写文件/命令执行/网络工具）默认需审批或策略显式放行。
- FR-304：拒绝路径必须可恢复，不允许会话卡死。

### 7.4 审阅与产物

- FR-401：写文件默认走 Diff 审阅（Accept/Reject）再落盘。
- FR-402：每轮生成执行摘要（做了什么、改了什么、结果如何）。
- FR-403：失败调用必须提供可定位信息（错误、参数摘要、相关文件）。

### 7.5 历史与检索

- FR-501：支持历史会话列表与消息回放（与在线会话隔离）。
- FR-502：支持按会话/文件/工具类型检索历史记录。
- FR-503：支持 projectKey 异常场景兜底解析（history.jsonl 反查）。

### 7.6 CLI 生态集成

- FR-601：提供 MCP Server 管理（添加、健康检查、失败展示）。
- FR-602：提供 Skills 统一视图（个人/项目/插件来源与优先级）。
- FR-603：提供 Plugins/Marketplace 基础管理视图（列表、安装、启停、版本）。
- FR-604：提供 Hooks 配置来源可视化与执行审计。

### 7.7 实验能力（Feature Flag）

- FR-701：Agent Teams 仅在实验开关下显示并可用。
- FR-702：实验能力默认不影响主流程稳定性与发布门禁。

## 8. 非功能需求（NFR）

- NFR-001：`pnpm build`、`pnpm test`、`package` 持续可通过。
- NFR-002：长会话下 UI 不出现明显卡顿或滚动错乱。
- NFR-003：会话切换/删除无 pending request 泄漏。
- NFR-004：日志可定位到 `sessionId`/`toolCallId`，可导出 JSONL 审计。
- NFR-005：协议定义单源，兼容别名可观测并可下线。

## 9. 里程碑（按 CLI 对齐优先级）

| 阶段 | 时间 | 目标 | 关键交付 |
|---|---|---|---|
| Phase 1 | 0-3 个月 | CLI 核心能力对齐 | 流式会话、工具解析、权限链路、续聊稳定 |
| Phase 2 | 3-6 个月 | 统一审阅体验 | Diff 审阅闭环、执行摘要、历史回放与检索 |
| Phase 3 | 6-12 个月 | 生态管理能力 | MCP/Skills/Plugins/Hooks 统一管理 UI |
| Phase 4 | 12-18 个月 | 实验编排能力 | Task Manager 增强、Agent Teams 实验化 |

## 10. 验收标准（长期 DoD）

1. 用户可在单一 UI 内完成：提问 -> 工具执行 -> 权限决策 -> 结果审阅。
2. CLI 原生能力在 UI 中语义一致，不出现“模式名存在但行为不一致”。
3. 关键高风险动作全部可审计，拒绝路径稳定可恢复。
4. 历史会话可回放，且不污染在线会话状态。
5. 生态能力（MCP/Skills/Plugins/Hooks）至少具备基础可用管理面板。

## 11. 非目标

1. 不重写 Claude Code Runtime。
2. 不在当前周期承诺“完全自动、零审批”的执行策略。
3. 不承诺与 CLI 无能力映射的大而全功能。

## 12. 风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| CLI 版本行为变化 | 解析与交互回归 | 契约测试 + 版本兼容层 |
| 权限语义不一致 | 用户不信任 | 单一语义模型 + 审计 |
| 长会话性能问题 | 体验下降 | 批处理、虚拟化、分页 |
| 生态功能复杂度 | 延期风险 | 先核心后生态，分阶段上线 |

## 13. 依赖与前置

1. 稳定 ACP/MCP 协议层。
2. Claude Code CLI 可用与版本策略。
3. Extension Host 与 Webview 的稳定消息总线。
4. 审计日志与导出能力。

## 14. 代码对照后的任务分层（Baseline vs Expansion）

本节基于当前仓库代码（`packages/server`、`packages/extension`、`packages/shared`）与本 PRD 对照，作为后续执行的优先级基线。

### 14.1 对照结论

1. 核心链路已具备骨架：流式会话、thinking 增量、`tool_use/tool_result` 解析、`TodoWrite/Task` 展示、History API 已可用。
2. 当前主要问题不是“功能数量不足”，而是“统一语义尚未闭环”：
   - 权限链路存在双轨；
   - 部分协议定义未实现；
   - 部分体验（Diff/持久会话）有实现但未接线。

### 14.2 基线任务（P0/P1）

| 优先级 | 任务 | 当前代码状态 | 验收标准（DoD） |
|---|---|---|---|
| P0 | 统一权限链路为单一路径 | 既有 `session/requestPermission`（`packages/extension/src/extension.ts`）也有 `confirmation_request + tool/confirm`（`packages/server/src/claude/wrapper.ts`、`packages/server/src/acp/server.ts`） | 所有工具审批只走一条结构化链路；拒绝后可恢复；无重复弹窗 |
| P0 | 打通权限规则协议闭环 | 协议定义了 `permissionRules/*`（`packages/shared/src/protocol.ts`），但 Server 未实现对应方法分发（`packages/server/src/acp/server.ts`），当前主要在 Extension 本地存储（`packages/extension/src/services/sessionStore.ts`） | Webview/Extension/Server 三端统一走 ACP RPC；规则增删改查可回归测试 |
| P0 | 持久会话模式端到端接线 | Server/Wrapper 已有 `promptPersistent/modeStatus/stopPersistent`，但 Client/Webview 发送路径仍以 `session/prompt` 为主（`packages/extension/src/acp/client.ts`、`packages/extension/src/providers/chatViewProvider.ts`） | UI 可切换一次性/持久模式；多轮延续稳定；可查询模式状态并可停止 |
| P1 | Diff 审阅闭环接线 | Server 已发 `file_change`，但 `DiffManager.previewChange()` 与文件装饰器未进入主流程（`packages/extension/src/services/diffManager.ts`、`packages/extension/src/providers/fileDecorationProvider.ts`） | 写文件默认进入 Diff 审阅；Accept/Reject 后状态一致；大文件降级策略可用 |
| P1 | 协议事件类型收敛 | Server 发送 `session_switch`（`packages/server/src/acp/server.ts`），但 `UpdateType` 未声明该类型（`packages/shared/src/protocol.ts`） | 协议定义与实现一致；不存在未声明事件类型 |
| P1 | 审计日志闭环 | `AuditLogger` 能力较完整，但实际调用集中在用户输入与权限决策（`packages/extension/src/services/auditLogger.ts`、`packages/extension/src/providers/chatViewProvider.ts`） | 工具调用、文件变更、错误、会话生命周期均有结构化审计记录 |

### 14.3 拓展任务（P2+）

| 优先级 | 任务 | 说明 |
|---|---|---|
| P2 | CLI 生态管理 UI（MCP/Skills/Plugins/Hooks） | 在基线稳定后上线统一管理面板；能力命名与行为严格对齐 CLI |
| P2 | 历史检索增强 | 在现有 `history/list/load/delete` 基础上增加按会话/文件/工具类型检索 |
| P3 | Agent Teams（实验能力） | 仅通过 Feature Flag 开启，不纳入主路径 SLA |
| P3 | 多后端能力对齐（如 Codex CLI） | 先做能力探测与差异展示，再决定统一交互抽象 |

### 14.4 执行顺序约束

1. 先做 P0（权限单轨、权限规则协议、持久会话接线），再进入 P1（Diff/协议收敛/审计）。
2. P2/P3 不得阻塞 P0/P1 的发布门禁。
3. 所有“拓展任务”必须满足第 2 章定位：不重写 Runtime，且有 CLI 能力映射。
