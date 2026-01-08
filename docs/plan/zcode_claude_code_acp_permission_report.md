# Z Code（Zed）Claude Code 交互式权限实现：技术研究报告

**日期**: 2026-01-08  
**范围**: 解释 Z Code/claude-code-acp 如何在“非 TTY / 流式 JSON”集成场景下实现“UI 批准/拒绝后继续执行”，并对 VCoder 当前实现给出对照分析与可落地建议。  

## 1. 结论（先说清楚“为什么它能交互”）

Z Code 的交互式权限并不是依赖 Claude Code CLI 读取终端里的 `y/n`，而是走了一条**专门为 IDE/SDK 集成设计的“结构化权限请求协议”**：

1. 通过 `@anthropic-ai/claude-agent-sdk` 启动 Claude Code（流式 JSON I/O）。
2. SDK 在需要用户审批时，不让 CLI 在 TTY 上阻塞等 `y/n`，而是让 CLI 发出 `control_request`（例如 `subtype: "can_use_tool"`）。
3. 代理进程（claude-code-acp）收到 `control_request` 后调用宿主 IDE（Z Code）的 `requestPermission` 弹 UI。
4. 用户选择 Allow/Reject 后，代理进程将结果以 `control_response`（结构化 JSON）写回 CLI stdin，CLI 才继续执行或中断。

因此它可以在**没有 TTY**、stdin 被当作 JSON 协议通道的情况下实现“等待 UI 决策”的交互。

## 2. 进程与通信架构（Z Code 的整体链路）

从代码与进程信息可以还原出如下链路：

- Z Code App 启动一个 Node 进程运行 `claude-code-acp`（ACP Agent）：
  - 入口：`/Users/kwean/.zcode/agents/claude-code/node_modules/@zed-industries/claude-code-acp/dist/index.js`
  - 核心逻辑：`/Users/kwean/.zcode/agents/claude-code/node_modules/@zed-industries/claude-code-acp/dist/acp-agent.js`
- `claude-code-acp` 通过 `@anthropic-ai/claude-agent-sdk` 启动 Claude Code CLI（流式 JSON）：
  - SDK：`/Users/kwean/.zcode/agents/claude-code/node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs`
  - 类型定义（便于理解权限回调）：`/Users/kwean/.zcode/agents/claude-code/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`

通信分两类：

1. **Claude Code CLI ↔ agent**：基于 NDJSON 的 stream-json 协议 + `control_request/control_response` 控制消息。
2. **agent ↔ Z Code（IDE）**：通过 ACP（Agent Client Protocol）调用 `client.requestPermission()` 等 RPC，IDE 负责 UI。

## 3. 关键实现点 A：用 SDK 启动 Claude Code（而不是“终端交互模式”）

Z Code 使用 `@anthropic-ai/claude-agent-sdk` 的 `query()` 来启动 Claude Code，并开启流式输入输出：

- SDK 启动参数构造（默认 stream-json）：`/Users/kwean/.zcode/agents/claude-code/node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs:6407`
- `query()` 默认选择自身打包的 `cli.js` 作为 Claude Code 可执行入口（除非显式指定）：`/Users/kwean/.zcode/agents/claude-code/node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs:14759`
- `query()` 会设置 `process.env.CLAUDE_CODE_ENTRYPOINT="sdk-ts"`（标识 SDK 入口）：`/Users/kwean/.zcode/agents/claude-code/node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs:14815`

Z Code 的 ACP agent 在加载/创建会话时调用：

- `query({ prompt: input, options })`：`/Users/kwean/.zcode/agents/claude-code/node_modules/@zed-industries/claude-code-acp/dist/acp-agent.js:354`

这里的 `prompt` 是一个可推送的流（Pushable），意味着它是长期运行、可持续收发消息的会话形态，而不是“一次性 print 输出”。

## 4. 关键实现点 B：权限交互不是 `y/n`，而是 `can_use_tool` 控制请求

### 4.1 SDK 的权限回调模型（类型定义是最清晰的“契约”）

SDK 定义了 `CanUseTool` 回调与返回类型 `PermissionResult`：

- `PermissionResult` 与 `CanUseTool`：`/Users/kwean/.zcode/agents/claude-code/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:76`
  - 允许：`{ behavior: "allow", updatedInput, updatedPermissions? }`
  - 拒绝：`{ behavior: "deny", message, interrupt? }`

这说明“批准/拒绝”不是字符输入，而是结构化对象。

### 4.2 SDK 如何让 Claude Code 走“可交互的非 TTY 流程”

当上层提供 `canUseTool` 回调时，SDK 会自动把 Claude Code 以“权限提示工具”为 `stdio` 的方式启动：

- `args.push("--permission-prompt-tool", "stdio")`：`/Users/kwean/.zcode/agents/claude-code/node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs:6430`

随后 Claude Code 在需要权限时会发出 `control_request`（`subtype: "can_use_tool"`），SDK 收到后调用 `canUseTool`，并将结果作为 `control_response` 写回：

- 控制请求处理入口：`/Users/kwean/.zcode/agents/claude-code/node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs:7611`
- `can_use_tool` 分支：`/Users/kwean/.zcode/agents/claude-code/node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs:7649`

### 4.3 Z Code 如何弹 UI 并返回“Allow/Reject”

Z Code 的 ACP agent 实现了 `canUseTool(sessionId)`，核心是：

1. 调用 `this.client.requestPermission(...)`（由 IDE 弹 UI）
2. 根据用户选择，返回 `behavior: "allow"` 或 `behavior: "deny"`
3. 对 “Always Allow” 还会返回 `updatedPermissions`（将某工具加入 allow rules 或切换 mode）

对应代码：

- 通用工具权限弹窗：`/Users/kwean/.zcode/agents/claude-code/node_modules/@zed-industries/claude-code-acp/dist/acp-agent.js:1004`
- 自动放行策略（bypassPermissions / acceptEdits 对 Edit/Write）：`/Users/kwean/.zcode/agents/claude-code/node_modules/@zed-industries/claude-code-acp/dist/acp-agent.js:1066`

### 4.4 “plan / default / acceptEdits / bypassPermissions”的含义（在 Z Code 里）

Z Code 暴露的模式与行为大致是：

- `plan`: 不修改文件/不执行命令（由 Claude Code 的 permissionMode 约束 + 工具 allow/deny 共同实现）
- `default`（Always Ask）: 首次使用某工具时询问权限
- `acceptEdits`: 对“编辑类工具”自动放行（见 4.3）
- `bypassPermissions`: 跳过所有权限提示（仅非 root 环境可用）

模式切换通过 Claude Code 的控制请求完成：

- `query.setPermissionMode(...)`：`/Users/kwean/.zcode/agents/claude-code/node_modules/@zed-industries/claude-code-acp/dist/acp-agent.js:981`

另外，Z Code 还对 `ExitPlanMode` 做了一个专门的交互（退出 plan 时询问是否自动接受 edits）：

- `toolName === "ExitPlanMode"` 分支：`/Users/kwean/.zcode/agents/claude-code/node_modules/@zed-industries/claude-code-acp/dist/acp-agent.js:1014`

## 5. 关键实现点 C：Z Code 代理了文件/终端工具，并显式禁用 Claude Code 内置工具

仅靠 `can_use_tool` 交互并不解释“为什么 IDE 能展示更友好的变更审阅”。Z Code 还做了工具层面的“代理/替换”：

1. 在 agent 内创建一个 MCP server（名为 `acp`），对外提供 `Read/Edit/Write/Bash...` 等工具。
2. 这些工具名带前缀 `mcp__acp__`，避免与 Claude Code 内置工具冲突。
3. 启动 Claude Code 时：
   - 允许 `mcp__acp__Read` 等工具
   - 禁用内置 `Read/Write/Edit/Bash...`

对应代码：

- MCP 工具命名与前缀：`/Users/kwean/.zcode/agents/claude-code/node_modules/@zed-industries/claude-code-acp/dist/mcp-server.js:70`
- `EDIT_TOOL_NAMES = [mcp__acp__Edit, mcp__acp__Write]`：`/Users/kwean/.zcode/agents/claude-code/node_modules/@zed-industries/claude-code-acp/dist/mcp-server.js:81`
- 创建 MCP server 并注入到 `mcpServers["acp"]`：`/Users/kwean/.zcode/agents/claude-code/node_modules/@zed-industries/claude-code-acp/dist/acp-agent.js:291`
- 禁用内置工具、改用 MCP 工具（allowed/disallowed）：`/Users/kwean/.zcode/agents/claude-code/node_modules/@zed-industries/claude-code-acp/dist/acp-agent.js:324`

这意味着 Z Code 实际上把“文件读写、终端执行”从 Claude Code 内置实现迁移到了 IDE 可控的通道（ACP → IDE），从而能实现：

- 用 IDE 的文件系统 API 读写（便于同步编辑器缓冲区）
- 在 IDE 层实现更一致的 diff/审阅体验
- 在 IDE 层统一展示权限确认 UI

## 6. 权限交互的消息时序（简化版）

以一次 `mcp__acp__Write` 为例，整体时序是：

1. Claude Code 决定调用工具 `mcp__acp__Write`。
2. Claude Code 通过 stdout 发出 `control_request`（`can_use_tool`，包含 `tool_name/tool_input/tool_use_id` 与 `permission_suggestions`）。
3. claude-code-acp 收到后调用 IDE：`client.requestPermission(...)`，弹出 UI（Allow/Always/Reject）。
4. 用户选择后：
   - Allow：返回 `behavior:"allow"`（可选携带 `updatedPermissions` 用于“Always Allow”规则）
   - Reject：返回 `behavior:"deny", interrupt:true`
5. 代理把决策作为 `control_response` 写回 Claude Code stdin。
6. Claude Code 执行工具或中断。

这条链路的关键是：**“交互”发生在 `control_request/control_response` 协议里，而不是 stdin 的 y/n 文本输入。**

## 7. 对照：为什么 VCoder 现有实现会出现“UI 闪现但无法批准”

VCoder 当前封装（`packages/server/src/claude/wrapper.ts`）有两个与 Z Code 根本不同的点：

1. 启动方式是 `-p` + `--input-format stream-json`，并把 stdin 当作 JSON 消息通道写入用户消息：
   - 参数构造：`packages/server/src/claude/wrapper.ts:131`
2. 当检测到权限请求时，仍尝试向 stdin 写入 `y\n`/`n\n` 来“确认”：
   - `confirmTool()`：`packages/server/src/claude/wrapper.ts:1166`

但在 `--input-format stream-json` 下，stdin 必须是 JSON 行；写入 `y\n` 会破坏协议，导致 CLI 直接失败或提前返回 `permission_denials`。

此外，VCoder 目前主要通过 stderr 文本做“权限请求检测”：

- 解析/匹配 `Claude requested permissions...`：`packages/server/src/claude/wrapper.ts:760`

这种方式对 CLI 版本变化、语言、输出格式非常敏感，也无法提供“真正的阻塞式等待确认”，因为在非 TTY 流程里 CLI 并不保证会以稳定的 stderr 文本提示来“等 y/n”。

## 8. 可落地建议（按改动量从小到大）

### 建议 1：不要再向 stream-json stdin 写 `y/n`

在 `--input-format stream-json` 协议下，`y/n` 不是有效输入；如果要支持 UI 交互，必须走 Claude Code 的结构化确认机制（见建议 2/3）。

### 建议 2：接入 Claude Agent SDK 的 `canUseTool` 机制（复用 Z Code 的做法）

优点：不需要自研 `control_request` 协议解析与回复；SDK 已定义 `PermissionResult` 等类型契约。  
缺点：引入依赖与适配工作（但这条路径最接近 Z Code 的“成熟实现”）。

### 建议 3：不引入 SDK，自行实现 `control_request/control_response` 协议

原则：当 stdout 解析到 `type:"control_request", request.subtype:"can_use_tool"` 时：

- 暂停队列推进、弹 UI
- 将用户选择编码为 `control_response` JSON 写回 stdin

这条路径的本质是“把当前基于 stderr 文本的权限检测，升级为协议级处理”。

### 建议 4：像 Z Code 一样，用 MCP 代理文件/终端工具（可选）

如果目标不仅是“能批准”，还希望做到：

- 与编辑器缓冲区一致（写入走 IDE API）
- 更好的 diff/审阅体验
- 更细粒度的工具级策略（例如 acceptEdits 只自动放行 Edit/Write）

那么可以参考 Z Code：禁用内置 `Read/Write/Edit/Bash`，改用自建 MCP server 提供 `mcp__<prefix>__*` 工具。

---

## 附：本次研究用到的关键文件索引

- Z Code claude-code-acp
  - `/Users/kwean/.zcode/agents/claude-code/node_modules/@zed-industries/claude-code-acp/dist/acp-agent.js`
  - `/Users/kwean/.zcode/agents/claude-code/node_modules/@zed-industries/claude-code-acp/dist/mcp-server.js`
- Claude Agent SDK
  - `/Users/kwean/.zcode/agents/claude-code/node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs`
  - `/Users/kwean/.zcode/agents/claude-code/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`
- VCoder（对照）
  - `packages/server/src/claude/wrapper.ts`

