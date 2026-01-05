# Issue #002: Claude CLI 多轮对话未生效（无法续聊）

**日期**: 2026-01-02  
**状态**: ✅ 已解决

## 问题描述

在 VSCode 插件中连续发送第二轮问题（例如“总结一下我们刚才的对话”）时，Claude 经常回复类似：

> “我无法直接查看或总结我们之前的对话历史……”

表现为 **多轮对话上下文没有被续接**。

## 症状

- 同一个 Session 内第二轮开始像“新对话”，无法引用上一轮内容
- Extension Host 日志中可见 Claude CLI 正常运行并返回结果，但上下文未延续

## 根本原因

### 1) Headless/`-p` 模式续聊参数用错

Claude CLI 的 headless（`-p/--print`）续聊方式不是 `--session-id`，而是：

- `--continue`：继续最近一次会话
- `--resume <session_id>`：继续指定会话

此前实现使用了 `--session-id`，导致 CLI 不会把请求接到已有会话上。

### 2) `-p` 模式需要 stdin EOF 才会开始输出（参考 Issue #001）

Claude CLI 在 `-p` 模式下会等待 stdin EOF 才开始处理并输出（详见 `docs/issues/001-claude-cli-no-output.md`）。  
如果 `spawn()` 后不关闭 stdin，会出现“无输出/卡住”的问题，进一步影响续聊的行为验证与稳定性。

## 解决方案

### 1) 按官方 headless 约定切换为 `--resume/--continue`

- 每个本地 `sessionId` 缓存对应的 Claude CLI `session_id`
- 后续请求优先使用 `--resume <session_id>`；若还没有 `session_id` 则使用 `--continue`

实现位置：
- `packages/server/src/claude/wrapper.ts`

### 2) 保证 `-p` 模式下 stdin 及时 EOF

由于 prompt 已作为命令行参数传入，不通过 stdin 传输，因此在 `spawn()` 后立即：

- `child.stdin.end()`

实现位置：
- `packages/server/src/claude/wrapper.ts`

## 验证方式

1. 在插件里发起第一轮对话（任意问题）
2. 同一会话继续第二轮（例如“总结我们刚才讨论的点”）
3. 预期：Claude 能引用上一轮内容进行总结，而不是声称“无法看到之前对话”

## 相关文件

- `docs/issues/001-claude-cli-no-output.md`
- `packages/server/src/claude/wrapper.ts`

