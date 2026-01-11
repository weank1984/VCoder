# 技术方案：基于 ACP/MCP 复刻 zcode 体验的 VSCode 插件

## 0. 文档信息

**覆盖版本**: V0.2（方案基线）→ V0.5（Beta 实现）→ V1.0（发布质量）  
**最后更新**: 2026-01-11

### 0.1 当前实现现状（V0.5.0 Beta）
- ACP：双向 NDJSON JSON-RPC + `session/request_permission` 已落地（扩展侧 Provider + Webview Dialog）。
- Capabilities：`fs/readTextFile`、`fs/writeTextFile`、`terminal/*` 已落地（含 Diff 审阅与 node-pty）。
- 可观测性：会话导出 + 审计日志（JSONL）已落地。
- 内置 MCP Server：已实现 HTTP + SSE（`/mcp/health|tools|call|stream`）与基础工具集。
- 性能：已具备节流/批处理基础（但“长会话虚拟滚动/大文件 diff/通信批处理”仍需收尾）。

## 0. V0.2 修订说明（来自 ~/.zcode 的关键发现）
V0.1 方案在无头/流式 JSON（`stream-json`）模式下无法可靠实现“用户审批后继续执行”，根因是：
- Claude Code CLI 在非 TTY/`--input-format stream-json` 下不会阻塞等待 `y/n`，且向 stdin 写入 `y\n` 会破坏 JSON 行协议。

zcode 的解决方式不是“模拟 TTY”，而是把审批提升为**结构化权限协议**：
- agent 运行时使用 `@anthropic-ai/claude-agent-sdk`，在需要审批时通过 `control_request(can_use_tool)` 触发回调；
- ACP agent（如 `@zed-industries/claude-code-acp`）将其映射为 ACP 的 `session/request_permission`（agent→client request），由 IDE 弹 UI 返回 outcome；
- outcome 再被写回给 SDK/CLI（`control_response`），从而在无 TTY 场景也能可靠交互。

同时 zcode 采用“能力协商 + 工具代理”策略最大化兼容：
- 若 client 声明支持 `fs.readTextFile/writeTextFile/terminal`，agent 会禁用内置 `Read/Write/Edit/Bash` 等工具，改走 `mcp__acp__*` 代理工具（由 ACP agent 内置的 MCP server `acp` 提供），最终回调到 client；
- 若 client 不支持某能力，则保留内置工具作为 fallback，保证可用性。

本技术方案据此做两点调整：
1) 权限审批以 `session/request_permission` 为核心（而不是向 CLI stdin 写 `y/n`）。  
2) 按 zcode 的“能力协商”顺序逐步实现宿主能力，最大化复用现有 Webview/时间线/diff 预览代码。

## 1. 总体架构
目标：VSCode 插件作为 ACP Client，启动一个或多个 ACP Agent 进程（优先复用现成 ACP agent）；通过结构化权限与能力协商实现“可控执行/可审阅改动”；通过 MCP 注入可插拔工具生态；通过 Webview 呈现“对话 + 工具时间线”。

组件：
- VSCode Extension（Node.js 扩展进程）
  - ACP Client（建议基于 `@agentclientprotocol/sdk` 实现双向 JSON-RPC）
  - AgentProcessManager（多 agent 生命周期；优先直接 spawn ACP agent；也可复用现有 `ServerManager` 做代理）
  - PermissionProvider（处理 `session/request_permission` + 规则/模式）
  - CapabilityProvider（按能力协商提供 `fs/*`、`terminal/*` 等 client methods；逐步接入）
  - MCP Server（内置，本地 http/sse；作为“扩展工具注入”）
  - Session/Audit Store（会话状态与审计日志导出）
- Webview（侧边栏 UI）
  - Chat 渲染（流式 chunk）
  - Tool timeline（tool_call/tool_call_update）
  - Diff/Terminal/MCP 卡片
- ACP Agent（外部进程）
  - 推荐：复用现有 ACP agent（如 `@zed-industries/claude-code-acp`、`@zed-industries/codex-acp` 等）
  - agent 内部使用 `@anthropic-ai/claude-agent-sdk`（或对应模型 SDK），通过 `canUseTool` → `session/request_permission` 实现无头交互式审批
  - agent 可再连接外部 MCP server（由 client 在 `session/new` 时注入），并可内置一个 `acp` MCP server 用于代理宿主能力

数据流（简化）：
1) 扩展 spawn ACP agent 子进程（stdio，NDJSON JSON-RPC）。
2) ACP `initialize`：扩展声明 clientCapabilities（含 `fs/terminal` 支持与否）。
3) ACP `session/new`：扩展传入 `cwd` 与 `mcpServers`（含内置 MCP）。
4) 用户发送 prompt → ACP `session/prompt`。
5) agent 通过 `session/update` 流式回传消息、工具事件、计划/任务等。
6) 当 agent 需要执行工具时：
   - 先通过 ACP `session/request_permission` 向扩展请求批准；
   - 若扩展声明了对应能力，则 agent 会调用 `mcp__acp__*` 代理工具，最终回调 client methods（如 `readTextFile/writeTextFile/terminal*`）；
   - 否则使用内置工具作为 fallback。

## 2. 协议与关键接口

### 2.1 ACP 传输
- 传输层：stdio 上的 NDJSON（每行一条 JSON-RPC message）。
- 建议实现：`@agentclientprotocol/sdk` 的 `ndJsonStream` + `ClientSideConnection`。

### 2.2 ACP 关键交互
- `initialize({ protocolVersion, clientCapabilities })`
- `newSession({ cwd, mcpServers })`
- `prompt({ sessionId, prompt: ContentBlock[] })`
- 通知：`sessionUpdate({ sessionId, update })`
- 交互式权限请求（agent → client request）：
  - `session/request_permission`
- 回调（client methods，可按能力协商逐步实现）：
  - `readTextFile` / `writeTextFile`
  - `createTerminal` / `terminalOutput` / `terminalWaitForExit` / `terminalKill` / `terminalRelease`
- 扩展方法（可选）：`extMethod("_vcoder/xxx", params)` 用于非标准能力（如会话回滚、动态更新 MCP servers）。

### 2.3 MCP 注入策略
在 ACP `session/new` 中传 `mcpServers`（数组，支持 http/sse/stdio）：
- 内置 MCP server：由扩展启动，地址 `http://127.0.0.1:<port>/mcp` 或 `sse`。
- 外部 MCP servers：从用户配置读取，按需合并注入。
- agent 内置 `acp` MCP server（type: `sdk`）：用于提供 `mcp__acp__*` 代理工具（是否启用由 clientCapabilities 决定）。

## 2.4 能力协商与“渐进式落地”
为最大化复用 V0.1 代码并降低一次性改造风险，推荐按 zcode 的协商策略推进：
- **先做权限，再做能力**：先把审批链路改为 `session/request_permission`，让无头模式可交互；随后逐步把文件/终端能力从“内置工具”迁移到“宿主代理工具”。
- **能力为 true 时才接管工具**：
  - `clientCapabilities.fs.readTextFile=true`：agent 禁用内置 `Read`，改用 `mcp__acp__Read` → client `readTextFile`；
  - `clientCapabilities.fs.writeTextFile=true`：agent 禁用内置 `Write/Edit`，改用 `mcp__acp__Write/Edit` → client `writeTextFile`；
  - `clientCapabilities.terminal=true`：agent 禁用内置 `Bash/BashOutput/KillShell`，改用 `mcp__acp__BashOutput/KillShell`（并按协议流式输出）。
这允许我们在早期阶段先让系统“跑起来”，再逐块把关键能力迁移到 VSCode 宿主侧，从而实现更强的可控性与审计边界。

## 3. VSCode 扩展模块设计

### 2.4.1 完整的 clientCapabilities 结构（来自 .zcode 分析）
```typescript
interface ClientCapabilities {
  fs?: {
    readTextFile?: boolean;    // 是否接管文件读取
    writeTextFile?: boolean;   // 是否接管文件写入
  };
  terminal?: boolean;          // 是否接管终端执行
  editor?: {                   // 可选扩展
    openFile?: boolean;
    getSelection?: boolean;
  };
}
```

### 2.4.2 内置工具 → MCP 代理工具映射表
| Client 能力 | 禁用的内置工具 | 启用的 MCP 代理工具 | Client Method |
|------------|---------------|-------------------|---------------|
| `fs.readTextFile` | `Read` | `mcp__acp__Read` | `readTextFile` |
| `fs.writeTextFile` | `Write`, `Edit`, `MultiEdit` | `mcp__acp__Write`, `mcp__acp__Edit` | `writeTextFile` |
| `terminal` | `Bash`, `BashOutput`, `KillShell` | `mcp__acp__BashOutput`, `mcp__acp__KillShell` | `terminal/*` |

### 2.4.3 能力协商时序
```
Client                          Agent                           Claude Code
  │─── initialize ──────────────►│                                  │
  │    { clientCapabilities }    │                                  │
  │◄── initialized ─────────────-│                                  │
  │─── session/new ─────────────►│─── query(disabledTools) ────────►│
  │                              │◄── tool_use: mcp__acp__Read ─────│
  │◄── readTextFile callback ────│                                  │
  │─── content ─────────────────►│─── content ─────────────────────►│
```

## 2.5 control_request/control_response 协议

若接入 `@anthropic-ai/claude-agent-sdk`，权限交互通过 `canUseTool` 回调完成。若自研：

### 2.5.1 control_request 消息
```typescript
interface ControlRequest {
  type: "control_request";
  request: { id: string; subtype: "can_use_tool"; tool_name: string; tool_input: object; };
}
```

### 2.5.2 control_response 消息
```typescript
interface ControlResponse {
  type: "control_response";
  response: {
    id: string;
    result: {
      behavior: "allow" | "deny";
      updatedPermissions?: { allow_rules?: string[] };
      message?: string; interrupt?: boolean;
    };
  };
}
```

### 2.5.3 Claude Agent SDK 集成
```typescript
const session = query({
  prompt: userMessage,
  options: { cwd, disabledTools, mcpServers },
  canUseTool: async (toolCall) => {
    const d = await acpClient.requestPermission({ sessionId, ...toolCall });
    return d.outcome === 'allow' ? { behavior: 'allow' } : { behavior: 'deny', message: d.reason };
  },
});
```

## 3. VSCode 扩展模块设计（续）

### 3.1 目录建议
结合当前仓库（monorepo），建议落位：
- `packages/extension/src/extension.ts`：activate/deactivate、注册命令与 view
- `packages/extension/src/acp/*`：ACP 连接与生命周期（建议替换/升级现有自定义 ACPClient，实现双向 request/response）
- `packages/extension/src/services/serverManager.ts`：可复用为 AgentProcessManager（从“启动自研 server”演进为“启动 ACP agent / 或代理进程”）
- `packages/extension/src/services/diffManager.ts`：可复用为写入审阅组件（落地 `writeTextFile` 或代理工具的 diff 审阅）
- `packages/extension/src/providers/*`：Webview provider、装饰器等
- `packages/server/*`：可选保留为兼容层/代理层（例如：统一管理多 agent、做日志/审计聚合；或逐步淡出）

### 3.2 会话状态模型
每个会话（sessionId）维护：
- `agentId`、`cwd`、`mcpServers`（最终注入列表）
- `permissionMode`（default/acceptEdits/plan/bypass）
- `toolCalls`（按 toolCallId 索引：title/kind/status/locations/rawInput/content）
- `terminalHandles`（terminalId → pty handle + output ring buffer + status）
- `auditLog` 写入器（JSONL）

## 4. Capability 实现细节

### 4.1 文件读取：`fs/readTextFile`
实现要点：
- 输入：`{ sessionId, path, line?, limit? }`。
- 解析为工作区 URI：优先限制在 workspaceFolders；工作区外按策略处理（默认拒绝或弹窗授权）。
- 支持按行切片：读取全文后按 `\n` 分割并截取（MVP），后续可优化为流式/增量读取。
- 输出：`{ content: string }`。

### 4.2 文件写入：`fs/writeTextFile`（审阅后落盘）
建议流程：
1) 接到写入请求后，不直接写入。
2) 读取目标文件当前内容（如不存在则空）。
3) 生成 diff（推荐 `diff` npm 包或 VSCode `TextDocument` 对比），并通知 Webview 显示“待审阅”卡片。
4) Webview 提供 `Accept` / `Reject`：
   - Accept：使用 `WorkspaceEdit`/`applyEdit` 写入，并更新 toolCall 状态为 completed。
   - Reject：返回错误或标记 skipped（根据 ACP 语义选择）并提示 agent 另寻方案。
5) 审计记录：文件路径、hash、diff 摘要、用户选择。

注意：
- 若用户启用 `Accept Edits` 模式，可自动通过（仍建议展示 diff 但不阻塞）。
- 要确保幂等与一致性：写入前再校验文件是否在审阅期间被外部修改（可用 version/hash）。

### 4.3 终端能力：ACP `terminal/*`（node-pty）
原因：VSCode `Terminal` API 不保证可获取标准输出；zcode 类体验需要 `terminal/output` 拉取增量。

设计：
- `terminal/create`：
  - 使用 `node-pty` 启动（shell 或直接 command）。
  - 为每个 `terminalId` 维护 ring buffer（如 32KB~256KB）与“上次读取偏移”。
  - 可选：将输出镜像到 VSCode `Terminal` 供用户直观看到。
- `terminal/output`：
  - 返回从上次调用以来的增量输出；若超过 `outputByteLimit` 则截断并标记 truncated。
- `terminal/wait_for_exit`：
  - 返回 exitCode/signal。
- `terminal/kill`：发送 SIGTERM/SIGKILL（跨平台处理）。
- `terminal/release`：释放 pty 资源与缓存。

安全策略：
- 默认禁止任意命令执行；仅在 Workspace Trust + 用户授权后开放。
- 命令执行前走 `session/request_permission`，并展示命令与 cwd。

### 4.4 权限：`session/request_permission`
实现：
- 输入包括 toolCall（toolCallId/rawInput 等）与 options（allow_once/allow_always/reject）。
- 扩展侧弹窗或 Webview 内弹窗，返回用户选择。
- 规则引擎（最小实现）：
  - 以 `toolName` 或 `kind` 作为 key，作用域为 session。
  - `allow_always` 写入会话规则；可选持久化到工作区设置。
- 模式联动：
  - `Accept Edits`：对写文件相关自动 allow。
  - `Plan`：拒绝所有 destructive 工具，返回明确原因。
补充（来自 zcode 的关键点）：
- 对权限的“阻塞等待”发生在 agent SDK 的 `canUseTool` 回调里（`control_request/control_response`），而不是 CLI 的终端交互；因此只要我们实现 `session/request_permission`，就能在无头模式可靠审批。

## 5. Webview 方案

### 5.1 渲染模型
- Webview 只做展示与用户交互；所有 ACP、文件、pty 在扩展进程完成。
- 消息协议：
  - extension → webview：`agentMessageChunk`、`toolCall`、`toolCallUpdate`、`diffPreview`、`terminalOutput`、`permissionRequest`
  - webview → extension：`sendPrompt`、`acceptDiff`、`rejectDiff`、`killTerminal`、`setMode`、`exportLogs`

### 5.2 Diff 展示
- 方案 A（推荐）：Webview 内渲染 unified diff（只读），Accept 后写入。
- 方案 B：调用 VSCode diff editor（`vscode.diff`）打开审阅视图，Webview 同步显示状态。

## 6. MCP 内置 Server 设计

### 6.1 传输与位置
- 运行在扩展进程内，监听 `127.0.0.1` 随机端口。
- 同时提供 HTTP API 与 SSE（agent 侧可按需使用）。
- 端点（当前实现）：
  - `GET  /mcp/health`
  - `GET  /mcp/tools`
  - `POST /mcp/call`
  - `GET  /mcp/stream`（SSE）

### 6.2 工具集合（MVP）
只提供“安全、可控、可审计”的工具，避免等价于任意 shell：
- `workspace/searchText`：ripgrep 受限版（路径限制+大小限制+超时）
- `workspace/listFiles`：列出工作区文件（可加 ignore）
- `workspace/openFile`：让 VSCode 打开文件并定位
- `git/status`：只读
- `editor/getSelection`：读取当前选区与文件路径

每个工具都写审计日志（入参摘要、耗时、结果大小）。

## 7. 配置与发布

### 7.1 配置
- `vcoder.agentProfiles`：[{ id, title, command, args, env }]
- `vcoder.mcpServers`：外部 MCP 列表（http/sse/stdio）
- `vcoder.security.workspaceTrustRequired`：默认 true
- `vcoder.logging.level`：默认 info

### 7.2 打包注意
- `node-pty` 涉及原生构建，需为各平台准备 prebuild 或在 CI 上产物构建。
- Webview 静态资源建议用 `esbuild`/`vite` 打包，使用 `asWebviewUri` 加载。

## 8. 稳定性与性能
- 断线重连：agent 进程退出时 UI 提示并可一键重启。
- 背压与节流：`agent_message_chunk` 与 `terminal/output` 高速流式时要合并/节流 UI 更新（例如 50ms 批量刷新）。
- 输出限制：文件读取与终端输出都要 byte limit；超过则提示继续读取/继续拉取。

## 9. 安全边界
- Workspace Trust 默认开启。
- 文件访问默认仅限工作区根目录；越权访问必须弹窗。
- 终端命令默认禁用；启用需用户确认，并支持会话级/一次性授权。
- 网络能力通过 MCP 显式提供；对外网 MCP server 需显式配置并提示风险。

---

## 10. 待补齐设计（V0.6 RC 重点）

### 10.1 Agent 选择器 UI（Webview）
- 目标：把现有 “命令面板切换” 变成可发现的 UI（下拉/弹窗），并展示 Agent 状态与能力摘要。
- 行为约束：切换 Agent 默认创建新会话（避免跨 Agent 状态污染），历史会话保留只读回看即可。

### 10.2 权限规则管理 UI
- 目标：对 “Always allow（会话级）” 规则可视化（查看/删除/过滤），并能一键清空当前会话规则。
- 规则粒度建议：按 `toolName` + `scope(session)` 起步；如需要再扩展到 `category`（fs/terminal/mcp/network）。

### 10.3 Webview 通信批处理
- 目标：减少高频 `postMessage`，避免长会话下 UI 抖动/乱序。
- 策略建议：
  - 扩展侧维护队列（按 sessionId 分桶），固定节拍（例如 16-50ms）合并发送；
  - Webview 侧按时间戳/sequence 合并更新，避免“只更新最后一条消息”的假设；
  - 对大 payload（diff/日志）走“摘要 + 按需拉取/分页”而非一次性推送。

### 10.4 大文件读取与 diff 降级
- 目标：保证 >1MB 文件操作不把 Webview 卡死。
- 策略建议：
  - `readTextFile` 支持分片（offset/limit 或 line/limit），UI 提示“截断/继续读取”；
  - `writeTextFile` 对大文件优先走“确认写入 + 提示跳转到文件 diff 编辑器”，Webview DiffViewer 仅展示摘要；
  - diff 计算放在扩展侧并设置超时/大小上限，超限直接降级。

### 10.5 LSP 工具（Definition/References）
- 目标：让 Agent 能通过 MCP 安全调用 VSCode 的语言服务（只读）。
- 实现建议：在内置 MCP Server 中新增 `lsp/*` 工具，内部调用 `vscode.commands.executeCommand('vscode.executeDefinitionProvider', ...)` 等命令，并做结果裁剪（数量/字段/大小）。
