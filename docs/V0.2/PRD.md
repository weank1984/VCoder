# PRD：ACP/MCP 驱动的 VSCode 智能编程插件（类 zcode 体验）

## 0. 文档信息

**覆盖版本**: V0.2（核心方案） → V0.5（Beta 实现） → V1.0（发布质量）  
**最后更新**: 2026-01-11

### 当前进度摘要（截至 V0.5.0 Beta）
- 核心能力已闭环：ACP 双向通信、`session/request_permission`、`fs/*`、`terminal/*`、Diff 审阅、会话持久化、审计日志、内置 MCP Server（基础工具集）。
- 仍需补齐的“发布前体验/能力”：Agent 选择器 UI、权限规则管理 UI、长会话/大文件性能、部分 MCP/LSP 工具补全、最小 E2E 回归与文档体系。

## 1. 背景与问题
团队希望在 VSCode 内获得类似 zcode 的“对话式编程 + 可审阅改动 + 可控执行 + 可插拔工具(MCP)”体验，提升研发效率并保持可控性（权限、审计、可回滚）。

当前痛点：
- 现有插件/脚本能力分散，缺少统一的会话编排与可视化工具执行轨迹。
- AI 生成改动难以做到“先审阅再落盘”，且缺少稳定的权限与审计边界。
- 外部工具（浏览器、内部系统、知识库）集成成本高，缺少统一协议。
- **V0.1 方案的关键阻塞**：在无头/流式 JSON（`stream-json`）集成模式下，Claude Code CLI 无法像 TTY 一样阻塞等待 `y/n`，导致“用户审批/拒绝后继续执行”无法可靠实现；向 `--input-format stream-json` 的 stdin 写入 `y\n` 还会破坏协议。

V0.2 的目标是在最大化复用现有代码（Webview UI、会话/时间线、diff 预览等）的前提下，借鉴 zcode 的实现：把“审批”升级为**结构化权限协议**（agent 主动发起 `session/request_permission`，IDE 返回结构化 outcome），从而在无 TTY 场景也能可靠交互。

## 2. 目标与非目标

### 2.1 目标（Must）
- 在 VSCode 中提供一个侧边栏 Chat 体验：支持流式回复、工具调用时间线、引用文件位置、展示 diff 与终端输出。
- 以 ACP（Agent Client Protocol）作为编辑器与 agent 的标准通信协议（stdio NDJSON JSON-RPC），并支持 agent→client 的请求（尤其是权限请求）。
- 实现“结构化权限审批”：任何敏感操作（写文件/执行命令/网络工具）都必须先由 agent 发起 `session/request_permission`，再由 VSCode 侧返回 outcome，保证无头模式可交互。
- 实现宿主侧能力（按能力协商逐步落地）：文件读写（支持审阅/确认后写入）、终端执行（可获取增量输出）、权限弹窗与规则。
- 支持 MCP：插件可注入内置 MCP server（暴露 VSCode/工程相关工具），并允许用户配置外部 MCP server（http/sse/stdio）；新会话时注入给 agent。
- 支持多 Agent（至少 1 个默认 agent，可扩展配置多个 agent 运行时），优先复用 `@zed-industries/claude-code-acp` / `@zed-industries/codex-acp` 这类 ACP agent。

### 2.2 非目标（Not now）
- 不做“全自动无人值守改代码并提交”的强自动化模式（保留但默认关闭）。
- 不实现复杂的企业权限中心/多租户（可通过配置与后续版本迭代）。
- 不在 V1 内实现完整的知识库/RAG 平台（可通过 MCP 对接外部服务）。

## 3. 用户与使用场景

### 3.1 目标用户
- 日常开发工程师（主要）：需求实现、重构、排错、脚手架生成。
- 团队负责人/平台工程（次要）：统一工具入口、规范化权限与审计。

### 3.2 核心场景（User Stories）
1) 作为开发者，我在侧边栏描述任务，插件能分析工程并提出计划，逐步生成可审阅的代码改动。
2) 作为开发者，我希望每次写文件/执行命令都需要明确授权，并能设置“仅本会话允许/总是允许”。
3) 作为开发者，我希望看到每个工具调用（读文件、写文件、执行命令、MCP 工具）的时间线与输出。
4) 作为开发者，我希望能一键回滚到某条消息前的工作区状态（V2）。
5) 作为平台工程，我希望能通过配置注入内部 MCP 工具（工单、代码检索、知识库、浏览器自动化）。

## 4. 产品形态与交互

### 4.1 入口
- Activity Bar 侧边栏视图：`V-Coder`（可配置名称）。
- 命令面板：
  - `V-Coder: Open Chat`
  - `V-Coder: New Session`
  - `V-Coder: Switch Agent`
  - `V-Coder: Add MCP Server`
  - `V-Coder: Export Session Logs`

### 4.2 会话 UI（Webview）
- 消息流：用户消息、agent 流式输出（chunk）。
- 工具时间线卡片：
  - Read File（含文件路径与定位）
  - Edit/Write（展示 diff，提供 Accept/Reject）
  - Terminal（展示终端输出，支持 kill）
  - MCP Tool（展示工具名、入参摘要、输出摘要）
- 权限弹窗（Modal 或 Webview 内弹窗）：
  - Allow once / Always allow / Reject
  - 对“写文件”“执行命令”“访问网络工具”等分级提示

### 4.3 关键交互规则
- 默认“审阅后写入”：agent 发起写文件时，先生成 diff 预览，用户确认后才写入工作区。
- 终端输出采用“增量抓取”：长任务可持续拉取 output。
- Workspace Trust：不受信任工作区默认禁用写入与终端执行；用户显式启用后才开放。

## 5. 功能需求（MVP）

### 5.1 会话与 agent
- 创建/销毁会话：`session/new`、`session/cancel`。
- 发送 prompt：`session/prompt` 支持流式更新。
- 支持切换 agent（重建连接/新会话）。

### 5.2 文件系统能力（ACP client methods）
- `fs/readTextFile`：
  - 支持按 `line/limit` 分段读取，返回纯文本。
  - 支持读取当前工作区内任意文件；工作区外需权限提示（可配置）。
- `fs/writeTextFile`：
  - 默认进入审阅流程：diff 预览 -> 用户确认 -> `workspace.applyEdit()` 写入。
  - 失败时明确报错并保持工作区一致性。

### 5.3 终端能力（ACP client methods）
目标是可“取输出/等待退出/kill”：
- `terminal/create`：启动命令，返回 `terminalId`。
- `terminal/output`：返回增量输出与 exit status（如有）。
- `terminal/wait_for_exit`：等待结束。
- `terminal/kill`：终止。
- `terminal/release`：释放资源。

备注：VSCode 原生 `Terminal` 难以可靠获取输出，MVP 采用 `node-pty` 自建 pty，并可选镜像输出到 VSCode Terminal UI。

### 5.4 权限与模式
支持与 zcode 类似的权限体验：
- `session/request_permission`：所有敏感操作走该入口（agent→client 的 JSON-RPC request），避免依赖 TTY 的 `y/n`。
- 权限规则：
  - Allow once：仅本次工具调用
  - Always allow：本会话内对该工具名/类别放行（可选持久化到工作区设置）
  - Reject：拒绝并中断/让 agent 改用其他方案
- 模式（至少支持）：
  - Default：每次敏感操作弹窗
  - Accept Edits：自动允许写文件相关工具
  - Plan：只分析不执行
  - Bypass Permissions：仅限受控环境/开发调试（默认关闭，且在某些 agent/root 模式下不可用）

### 5.5 MCP 集成
内置本地 MCP server（由插件启动）提供：
- 工程搜索：ripgrep/TS server 辅助（不直接暴露任意 shell）
- Git 信息：状态、diff、最近提交（只读为主）
- 打开文件/定位：`openFile`、`revealRange`
并支持用户添加外部 MCP server（http/sse/stdio），在新会话时注入到 agent。

## 6. 配置项与可观测性

### 6.1 配置项（Settings）
- `vcoder.agentProfiles`：agent 启动配置（多 agent）
- `vcoder.security.workspaceTrustRequired`（默认 true）
- `vcoder.permissions.persistRules`（默认 false）
- `vcoder.mcpServers`：外部 MCP server 列表
- `vcoder.logging.level`：error/warn/info/debug
- `vcoder.logging.exportPath`：导出会话日志位置

### 6.2 日志与审计
- 会话级事件：prompt、tool_call、tool_call_update、权限结果、写入 diff 摘要、终端命令摘要。
- 支持导出为 JSONL（便于检索与回放）。

## 7. 约束与风险
- VSCode 运行时限制：扩展运行在 Node.js 环境，Webview 与扩展进程隔离，需要明确消息协议。
- 终端输出可读性/跨平台：`node-pty` 需适配 Windows/macOS/Linux。
- 网络访问：若 agent 或 MCP server 需要联网，必须清晰提示并提供开关（企业环境可能禁网）。
- 依赖体积：打包 `node-pty` 可能增加安装体积与平台构建复杂度。

## 8. 验收标准（Acceptance Criteria）
- 能在 VSCode 侧边栏完成一次完整回合：发送 prompt -> agent 流式回复 ->（触发工具调用）-> 弹出 `session/request_permission` 审批 -> 继续执行 -> UI 可视化结果。
- 能对“写文件/执行命令/网络工具”等敏感操作进行审批（Allow once/Always/Reject），且不依赖 TTY 输入。
- 文件改动支持审阅（diff）并在用户确认后写入工作区（实现可基于 `fs/writeTextFile` 或通过禁用内置 `Write/Edit`、改走 MCP/ACP 代理工具实现）。
- 终端能力支持增量输出与 kill（实现可基于 `terminal/*` 或等价的工具流式输出机制）。
- MCP：至少能配置并调用 1 个外部 MCP server（本地或远程），并在 UI 中展示其工具调用卡片。
- **能力协商验证**：当 `clientCapabilities.fs.writeTextFile=true` 时，Edit/Write 应走 `mcp__acp__*` 代理工具；当 `clientCapabilities.terminal=true` 时，命令执行应走 `mcp__acp__BashOutput`。

## 9. 里程碑（面向 MVP）
- M1：ACP client + 连接 agent + 基础 Chat UI
- M2：文件读写（含 diff 审阅流程）
- M3：终端能力（node-pty）+ 权限系统
- M4：内置 MCP server + 外部 MCP 配置
- M5：稳定性、可观测性、发布与文档

---

## 10. 后续版本目标（V0.6 RC → V1.0）

### V0.6 RC（Phase 3 收尾，进入对外测试）
**P0**
- Agent 选择器 UI（可见状态、可切换、失败可恢复）。
- 权限规则管理 UI（查看/删除/过滤；会话内生效为主，持久化可选）。
- 长会话稳定：Webview 消息批处理/降噪；滚动不跳、不卡顿。
- 大文件降级策略：读取/写入提示 + 分片读取；diff 展示不阻塞 UI。

**P1**
- 内置 MCP 工具补全：`git/diff`、`git/log`、`lsp/getDefinition`、`lsp/getReferences`。
- 批量权限审批（同类请求合并处理，带二次确认）。

### V1.0（正式发布质量）
**P0**
- 发布与兼容：安装体验、跨平台（尤其 `node-pty`）与升级策略。
- 可诊断性：错误提示 + 日志/审计导出足以定位问题。
- 测试与回归：关键路径单测/集成 + 最小 E2E。
- 文档：安装/配置/权限模型/安全边界/故障排查/FAQ。

**P1（可裁剪）**
- Phase 4 选择性实现：工作流自动化、上下文管理增强、协作与分享（明确可关闭/可配置）。
