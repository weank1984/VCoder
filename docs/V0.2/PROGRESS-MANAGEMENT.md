# 进度管理文档：VSCode ACP/MCP 智能编程插件（MVP）

## 1. 项目目标与交付物
目标：交付一个可在 VSCode 内运行的 MVP 插件，实现“对话式编程 + 工具时间线 + 审阅后写入 + 可控终端 + MCP 可插拔工具”，并重点解决 V0.1 的核心阻塞：**无头/stream-json 模式下的结构化权限审批**（不依赖 TTY 的 `y/n`）。

主要交付物：
- VSCode 插件（可安装/可运行）
- 内置 MCP server（最小工具集）
- 会话审计日志导出（JSONL）
- 文档：`docs/PRD.md`、`docs/TECH-SOLUTION.md`、本文件

## 2. 里程碑与阶段拆分

### M0：项目初始化（0.5 周）
- 建立仓库结构、CI（lint/build/package）、发布流程草案
- 确认 agent 选型（复用现成 ACP agent 或自研）
- 定义 webview ↔ extension 消息协议草案

验收：
- `Hello world`：能启动插件、打开侧边栏视图、发送一条本地假数据消息。

### M1：ACP Client 接入与基础会话（1 周）
- 接入现成 ACP agent（优先 `@zed-industries/claude-code-acp`/`@zed-industries/codex-acp`），spawn agent 进程（stdio）
- 建立 ACP 连接：initialize/session/new/session/prompt/session/cancel
- 处理 `session/update` 并在 UI 流式显示（文本/思考/工具调用/任务列表等）
- **打通结构化权限请求**：支持 agent→client 的 `session/request_permission`，在 VSCode 侧弹出 Allow/Always/Reject，并返回 outcome
- 会话管理：新建/取消/重连

验收：
- 从 UI 发送 prompt，能看到 agent 的流式输出（至少文本 chunk），且能对一次工具调用弹出权限审批并阻塞等待用户选择。

### M2：终端能力（能力协商接管）与输出流式（1.5 周）
按 zcode 的能力协商策略，优先把“执行命令/输出流”从 agent 内置工具迁移到宿主侧能力：
- 实现 `terminal/create/output/wait_for_exit/kill/release`（node-pty + ring buffer）
- 将 `clientCapabilities.terminal=true` 后，agent 将禁用内置 Bash 类工具，改走 `mcp__acp__BashOutput/KillShell` → client terminal methods
- UI 侧支持增量输出展示、kill、完成态

验收：
- 能执行一个命令并可拉取增量输出，支持 kill；每次执行前都会走 `session/request_permission`（除非模式自动放行）。

### M3：文件能力与“审阅后写入”（能力协商接管）（1.5 周）
在权限链路稳定后，把“写文件”从 agent 内置工具迁移到宿主侧，以获得更强的可控性与一致性：
- 实现 `fs/readTextFile`（含 line/limit、路径策略、Workspace Trust）
- 实现 `fs/writeTextFile`：默认“先审阅后落盘”（diff 预览、Accept/Reject、并发修改校验）
- 将 `clientCapabilities.fs.readTextFile/writeTextFile=true` 后，agent 将禁用内置 `Read/Write/Edit`，改走 `mcp__acp__Read/Write/Edit` → client fs methods
- UI 展示 read/write 工具卡片与 diff 审阅

验收：
- agent 发起一次写入：必须先触发 `session/request_permission`；用户 Accept 后文件内容更新；Reject 不落盘且能继续对话。

### M4：MCP（内置 + 外部配置）与多 Agent（1 周）
- 内置 MCP server（http 或 sse）并提供最小工具集（workspace/search、git/status 等）
- 从配置注入外部 MCP server（http/sse/stdio），在 `session/new` 注入到 agent
- 支持切换 agent（重建进程/新会话），并在 UI 显示 MCP 工具调用卡片与输出摘要

验收：
- 至少 1 个外部 MCP server 可配置并可被 agent 调用；调用过程可视化。

### M5：质量与发布（1 周）
- 稳定性：agent 崩溃重启、断线提示、节流与背压
- 可观测性：JSONL 导出、关键事件埋点（本地日志）
- 文档补齐：安装、配置、常见问题、已知限制
- 打包与多平台验证（至少 macOS + Windows 二选一）

验收：
- 通过一套端到端演示脚本（见第 6 节），可稳定复现。

## 3. WBS（工作分解）

### 3.1 扩展端
- ACP：
  - 连接管理（spawn、stdin/stdout、重连、关闭）
  - 会话管理（sessionId 映射、cancel）
  - 通知派发（sessionUpdate → UI）
- Capabilities：
  - FS read/write（审阅工作流）
  - Terminal（pty + ring buffer）
  - Permission（弹窗 + 规则 + 模式）
- MCP：
  - 内置 server（选择 http/sse）
  - 工具注册与审计
  - 外部 server 配置合并注入
- Observability：
  - JSONL 审计日志
  - 导出命令与脱敏策略（不记录密钥）

### 3.2 Webview 端
- Chat 渲染（流式 chunk）
- Tool timeline（pending/in_progress/completed）
- Diff 卡片（预览、Accept/Reject）
- Terminal 卡片（输出、kill）
- 设置页（agent profile、MCP servers、日志导出）

## 4. 角色与职责（RACI）
- 产品负责人（PO）：需求范围、验收标准、优先级
- 技术负责人（TL）：架构决策、关键风险把控、里程碑验收
- 插件工程师（Dev1/Dev2）：
  - Dev1：ACP/Capabilities（fs/terminal/permission）
  - Dev2：Webview UI/MCP/配置与发布
- QA（可选）：E2E 演示脚本、跨平台验证

## 5. 风险与缓解
- `node-pty` 多平台构建风险：优先选择有 prebuild 的版本；CI 构建并缓存产物；必要时提供降级（仅 VSCode Terminal 不取输出，标记为“受限模式”）。
- VSCode API 差异与限制：关键路径尽量走 `workspace.applyEdit`、`workspace.fs`；终端输出不依赖 VSCode Terminal API。
- 安全与企业环境：默认启用 Workspace Trust；对外部 MCP/联网工具给出显式开关与风险提示；审计日志脱敏。
- agent 依赖与体积：优先外置 agent（用户机器已有 node）；或采用按需下载/解包策略（后续迭代）。

## 6. 验收用例（E2E 脚本）
每次版本候选需通过：
1) 新建会话，发送 prompt，确认 UI 流式输出正常。
2) 触发读文件工具卡片（可通过引导 agent “读取某文件前 50 行”）。
3) 触发写文件：生成 diff → Reject → 确认未落盘；再次触发写文件 → Accept → 确认落盘。
4) 触发终端执行：运行 `node -v` 或 `git status`，拉取输出；运行长任务并 kill。
5) 配置外部 MCP server（本地 echo 工具即可），触发调用并展示输出。
6) 导出会话日志，检查 JSONL 完整、无敏感信息。
7) **能力协商验收**：确认启用 `clientCapabilities.fs.writeTextFile/terminal` 后，agent 的文件/终端调用走 `mcp__acp__*` 代理工具而非内置工具（可从日志/调试输出确认工具名）。

## 7. 进度跟踪机制
- 看板：Backlog / In Progress / Review / Done
- 节奏：
  - 每日 10 分钟站会（阻塞/风险/当日目标）
  - 每周一次里程碑检查（对照第 2 节验收）
- 度量：
  - 每个里程碑必须有可运行 demo
  - 缺陷关闭率与回归通过率
- 变更控制：
  - 需求变更必须更新 PRD 的“目标/非目标/验收标准”
  - 技术债记录在 `TECH-SOLUTION.md` 的“后续优化”小节（需要时补充）
