# Claude Code CLI 历史对话读取与在 VCoder 中展示

**适用场景**：希望在 VCoder（VSCode 插件）中展示 Claude Code CLI 的历史对话（会话列表 + 会话内消息），并支持刷新/切换。

## 结论

- Claude Code CLI 的“历史”主要分两类：**输入历史**与**完整会话转录**；VCoder 要展示“历史对话”，应读取 **完整会话转录**。
- 在本机环境已确认：Claude Code CLI 会将会话按“项目/工作区”维度写入 `~/.claude/projects/<projectKey>/*.jsonl`（每个文件对应一个会话，JSONL 事件流包含 user/assistant 等）。
- `~/.claude/history.jsonl` 仅记录用户在 CLI 输入过的内容（类似命令历史），不包含 assistant 回复，通常不适合作为对话回放数据源。
- VCoder 当前会话列表为**内存态**（`packages/server/src/acp/server.ts`），无法跨重启持久化；因此“显示 CLI 历史”需要新增一层 **Transcript Store** 来读磁盘并向 Webview 提供会话/消息。

## 现状确认（已验证）

### 1) 输入历史（不含 assistant）

路径：

- `~/.claude/history.jsonl`

示例字段：

- `display`：用户输入的文本
- `timestamp`：毫秒时间戳
- `project`：工作区路径
- `sessionId`：对应的会话 ID（但该文件不含完整对话内容）

快速查看：

```bash
head -n 5 ~/.claude/history.jsonl
```

### 2) 完整会话转录（可回放）

路径（按项目聚合）：

- `~/.claude/projects/<projectKey>/*.jsonl`

快速查看某个会话文件：

```bash
ls -la ~/.claude/projects
ls -la ~/.claude/projects/<projectKey> | head
head -n 30 ~/.claude/projects/<projectKey>/<sessionId>.jsonl
```

常见事件（每行一个 JSON）：

- `type: "user"`：用户消息（`message.role === "user"`）
- `type: "assistant"`：模型输出（`message.role === "assistant"`，`message.content` 为 block 数组）
- `type: "queue-operation"`：队列/调度类事件（可忽略）

## 记录格式与解析要点

### 1) `message.content` 需要兼容两种形态

在转录文件中：

- `user.message.content` 可能是 **string**，也可能是 **block 数组**（例如 `[{ type: "text", text: "..." }]`）。
- `assistant.message.content` 通常是 **block 数组**，常见 block：
  - `type: "text"`：可见回复文本
  - `type: "thinking"`：思考内容（可映射到 UI 的 thought）
  - `type: "tool_use"` / `type: "tool_result"`：工具调用与结果（可映射到 UI 的 toolCalls）

解析策略（建议）：

- 将同一条 `assistant` 消息内的 `text` block 拼接为一条可见消息内容；
- 将 `thinking` block 拼接为 `thought`；
- `tool_use_id` 作为 tool call 的主键，用于关联后续 tool_result。

### 2) 会话列表（sessions）不应全量解析所有消息

生成 History Panel 所需的 `Session` 元数据建议来自：

- `id`：文件名（`<sessionId>.jsonl`）
- `title`：取首条 `user` 文本的前 N 个字符（或首条 `assistant` 文本兜底）
- `createdAt`：首条有效事件的 `timestamp`
- `updatedAt`：最后一条有效事件的 `timestamp`

这能避免读取大文件造成卡顿。

## 在 VCoder 中的接入方案（建议）

VCoder 当前的 ACP Session（`packages/shared/src/protocol.ts` 的 `Session`）与 Claude CLI 转录中的 `sessionId` 不一致，建议将“历史会话”作为**独立数据源**接入，避免与在线会话/流式交互耦合。

### 方案 A（推荐）：新增 History API（不影响现有 ACP session）

新增能力（ACP 或 Extension-Webview 通道均可）：

- `history/list`：返回当前工作区的历史会话列表（`Session[]`）
- `history/load`：根据 `sessionId` 返回会话消息列表（转换成 Webview 的 `ChatMessage[]` 或统一的 Update 事件序列）

优点：

- 不改变现有 `session/new|list|switch|prompt` 的语义；
- 历史与在线会话可并存，扩展更清晰。

### 方案 B：将历史会话 merge 进 `session/list`

做法：

- `session/list` 返回值中包含两类 session：
  - 在线会话：`id` 为 VCoder 内存 UUID
  - 历史会话：`id` 使用前缀避免冲突，例如 `claude:<sessionId>`

风险：

- Webview 的“切换会话”目前只切换 `currentSessionId`，不会加载对应 messages；
- 容易让“切换历史会话”与“继续对话（--resume）”的行为混在一起，边界不清。

## UI 展示与刷新策略

### 1) Webview 侧展示

- HistoryPanel 继续使用 `Session[]` 渲染列表；
- 点击历史会话时：先清空当前消息，再调用 `history/load` 回放该会话的 `ChatMessage[]`。

当前 Webview state 结构（`packages/extension/webview/src/store/useStore.ts`）为单一 `messages: ChatMessage[]`，若要“多会话快速切换”：

- 简单实现：每次切换历史会话就 `messages = []` 然后 load；
- 完整实现：将 store 改为 `messagesBySessionId`，但改动面更大。

### 2) 刷新

建议在 Extension Host/Server 侧监听目录变化：

- `fs.watch(~/.claude/projects/<projectKey>)` 或定时轮询
- 发现新增/变更 `.jsonl` 后，重新生成 sessions 列表并推送到 Webview（复用现有 `sessions` 消息类型或新增 `historySessions`）

## projectKey 推导（工作区路径 → 目录名）

Claude Code 的 `~/.claude/projects` 下目录通常由“工作区路径”派生（macOS 上常见将 `/` 转成 `-` 并去掉前导分隔符），例如：

- `/Users/weank/Documents/vcoder` → `-Users-weank-Documents-vcoder`

实现建议：

- 以实际目录存在为准：若推导目录不存在，可回退为遍历 `~/.claude/projects/*` 并从会话文件中的 `cwd` 字段匹配当前 workspace root。

## 备注（隐私与兼容性）

- `~/.claude/projects` 中的转录可能包含敏感信息（路径、代码片段、工具输入输出）；在 UI 中展示时建议提供“清除/隐藏历史”的入口，或至少提示该数据来自本机磁盘。
- 不同 Claude Code 版本可能在事件字段上有细微差异，解析需做容错（例如 `timestamp` 可能是 ISO 字符串或缺失；`message.content` 形态变化）。

