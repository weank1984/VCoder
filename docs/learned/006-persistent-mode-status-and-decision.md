# Persistent 模式现状与决策记录

> 日期: 2026-02-22
> 状态: 已决策 — 默认使用 oneshot 模式，persistent 模式暂不启用

## 1. 背景

VCoder 实现了两种与 Claude CLI 交互的模式：

| 模式 | 内部名称 | UI 显示 | 原理 |
|------|----------|---------|------|
| **Single** | `oneshot` | Single | 每轮对话 spawn 一个 CLI 进程，完成后退出，靠 `--resume <session_id>` 恢复上下文 |
| **Multi** | `persistent` | Multi | 首次 spawn CLI 后进程常驻，通过 stdin/stdout 双向 stream-json 通信，多轮复用同一进程 |

## 2. Persistent 模式的工作原理

```
[spawn CLI, 进程常驻]
  启动参数: claude -p '' --input-format stream-json --output-format stream-json
            --verbose --include-partial-messages --permission-prompt-tool stdio

用户消息1 → stdin 写入 JSON → stdout 流式读取 → 回复
用户消息2 → stdin 写入 JSON → stdout 流式读取 → 回复
用户消息3 → stdin 写入 JSON → stdout 流式读取 → 回复
           ... 直到 idle 超时(30min) / 手动停止 → [进程退出]
```

VCoder 中的实现: `packages/server/src/claude/persistentSession.ts`

## 3. Oneshot 模式的工作原理（当前默认）

```
用户消息1: claude -p "你好" --output-format stream-json ...
           → CLI 输出 session_id=abc123 → 进程退出
           → wrapper 记住 abc123

用户消息2: claude -p "继续" --resume abc123 --output-format stream-json ...
           → CLI 恢复上下文 → 回复 → 进程退出

用户消息3: claude -p "再改下" --resume abc123 --output-format stream-json ...
           → 同上
```

VCoder 中的实现: `packages/server/src/claude/wrapper.ts` 的 `prompt()` 方法

## 4. 官方 Agent SDK 的做法

官方 Claude Agent SDK（Python/TypeScript）的多轮对话使用的就是 **oneshot + resume** 模式：

```python
# 第1轮：拿到 session_id
async for message in query(prompt="Read the auth module", ...):
    if message.subtype == "init":
        session_id = message.session_id

# 第2轮：resume 恢复上下文
async for message in query(
    prompt="Now find all places that call it",
    options=ClaudeAgentOptions(resume=session_id)
):
    ...
```

**官方 SDK 没有使用 persistent 进程常驻模式**，而是每次 `query()` 调用都 spawn 一个新进程。

参考文档:
- [Agent SDK overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Run Claude Code programmatically](https://code.claude.com/docs/en/headless)

## 5. `--input-format stream-json` 的已知问题

虽然 `--input-format stream-json` 在 [CLI 官方文档](https://code.claude.com/docs/en/cli-reference) 中已列出，但存在多个已知 bug：

| Issue | 问题描述 | 状态 |
|-------|----------|------|
| [#3187](https://github.com/anthropics/claude-code/issues/3187) | 第2条消息通过 stdin 发送后 CLI 挂起，无响应 | Closed（报告者自称解决，未提供方案） |
| [#25629](https://github.com/anthropics/claude-code/issues/25629) | CLI 发送 `result` 事件后进程不退出，stdout 不关闭，阻塞消费端 | Closed（重复 #21099） |
| [#5034](https://github.com/anthropics/claude-code/issues/5034) | 多轮时 session .jsonl 文件出现重复条目 | Open |
| [#16712](https://github.com/anthropics/claude-code/issues/16712) | 无法通过 stdin 提供 `tool_result`（resume 带 pending tool_use 时） | Open |

## 6. VCoder 中遇到的问题

### 6.1 `session/modeStatus` 无限循环

**根因**:
1. `modeStatus` 后端响应 → WebView 调用 `setPromptMode()`
2. `setPromptMode()` 内部又发送 `getModeStatus` 请求
3. 形成 `modeStatus → setPromptMode → getModeStatus → modeStatus` 死循环

**修复**: 给 `setPromptMode` 加 `source` 参数，后端同步传 `'extension'` 跳过重新请求。

### 6.2 默认 persistent 模式导致对话卡住

**根因**: UI 默认 `promptMode: 'persistent'`，所有消息走 `promptPersistent()` → `PersistentSession.start()` 等待 CLI 的 `init` 事件。如果 CLI 版本不支持双向流或环境有问题，`init` 永远不到达 → 30 秒超时 → 对话卡住。

**修复**: 将所有默认值改为 `'oneshot'`：
- `packages/ui/src/store/useStore.ts` — initialState
- `packages/ui/src/store/slices/updateSlice.ts` — reset state
- `apps/vscode-extension/src/providers/chatViewProvider.ts` — promptMode 默认值
- `apps/desktop-shell/src/desktopRuntime.ts` — promptMode 默认值

## 7. 决策

| 决策项 | 结论 |
|--------|------|
| 默认模式 | `oneshot`（与官方 Agent SDK 一致） |
| UI 切换按钮 | 已移除（Multi/Single toggle） |
| Persistent 模式代码 | 保留，不删除，待上游 bug 修复后可重新启用 |
| 未来方向 | 关注 Claude CLI 双向流 bug 修复进展，择机重新启用 persistent 模式以获得更低延迟 |

## 8. 相关文件

- `packages/server/src/claude/persistentSession.ts` — Persistent 模式实现
- `packages/server/src/claude/wrapper.ts` — Oneshot 模式实现 + persistent 管理
- `packages/shared/src/acpClient.ts` — `prompt()` / `promptPersistent()` 客户端方法
- `packages/ui/src/store/slices/uiSlice.ts` — `setPromptMode()` 状态管理
- `docs/learned/bidirectional_streaming_analysis.md` — 早期双向流架构分析（已归档）
