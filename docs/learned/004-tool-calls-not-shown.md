# Issue #004: 现有对话不显示工具调用（Tool Calls）

**日期**: 2026-01-02  
**状态**: ✅ 已解决

## 问题描述

在 VSCode 插件 Webview 的对话气泡中，“工具调用（Finished working / Tool Calls）”区域经常不显示或为空。

例如发送「分析一下项目」这类会触发 `Bash`/`Read`/`mcp__*` 的任务时：
- AI 有正常回复
- 但工具调用列表为空，导致无法追踪执行了哪些工具、是否成功

## 症状

- `ToolCallList` 不出现或显示 0 条
- 同一轮对话里明显发生了工具动作（如 `ls`/`cat`），但 UI 不记录

## 排查方式（先确认真实数据格式）

用 Claude CLI 直接跑一次 `stream-json`，观察真实事件格式（关键：`--output-format=stream-json` 需要配 `--verbose`）：

```bash
claude -p --verbose --output-format stream-json --include-partial-messages \
  --allowedTools Bash --permission-mode dontAsk \
  "请用 Bash 只读取当前目录结构，然后结束。"
```

观察到的关键事实：

1) 工具调用不是顶层 `type:"tool"` 事件  
而是 **出现在 `type:"assistant"` 的 `message.content[]` 里，block `type:"tool_use"`**（包含 `id/name/input`）。

2) 工具结果不是顶层 `type:"tool_result"` 事件  
而是 **出现在 `type:"user"` 的 `message.content[]` 里，block `type:"tool_result"`**，并使用 `tool_use_id` 关联工具调用。

## 根本原因

### 1) Server 侧 Claude stream-json 解析模型用错

`packages/server/src/claude/wrapper.ts` 之前只解析：
- `assistant.message.content[].type === "text"/"thinking"`
- 并且把 `type:"user"` 全部忽略

导致：
- `tool_use`（位于 assistant content blocks）被漏掉
- `tool_result`（位于 user content blocks）也被漏掉

最终 Webview 从 ACP 收不到工具调用/结果，自然无法显示。

### 2) Webview 侧对部分更新类型不入库（增强项）

Webview Store 之前只把 `tool_use/tool_result` 写入 `message.toolCalls`，但会丢弃：
- `mcp_call`
- `bash_request`

以及 `tool_result` 只更新“最后一条消息”，跨消息回填时会失败。

## 解决方案

### 1) 修复 Claude stream-json 解析（核心修复）

在 `packages/server/src/claude/wrapper.ts`：
- 解析 `assistant.message.content[]` 中的 `tool_use` block，转换为 ACP `session/update (tool_use)`
- 解析 `user.message.content[]` 中的 `tool_result` block，转换为 ACP `session/update (tool_result)`（用 `tool_use_id` → `id`）
- 保留旧格式 `type:"tool"` / `type:"tool_result"` 的兼容处理（不影响老版本输出）

### 2) Webview Store：补齐工具更新写入逻辑（体验修复）

在 `apps/vscode-extension/webview/src/store/useStore.ts`：
- 将 `mcp_call`、`bash_request` 映射为 `toolCalls`
- `tool_result` 更新时，会在所有消息中按 `toolCall.id` 回填（不再只更新最后一条）

## 验证方式

1. 插件内发送「分析一下项目」或任何会触发工具调用的请求
2. 预期：对话气泡中出现工具调用列表，并且能看到工具状态从 running → completed/failed 的变化

## 相关文件

- `packages/server/src/claude/wrapper.ts`
- `apps/vscode-extension/webview/src/store/useStore.ts`
- `apps/vscode-extension/webview/src/types.ts`
- `tests/server/claude-wrapper-format.test.ts`
- `tests/extension/webview-toolcalls.test.ts`

