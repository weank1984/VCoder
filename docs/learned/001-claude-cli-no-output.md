# Issue #001: Claude CLI 无输出问题

**日期**: 2026-01-02  
**状态**: ✅ 已解决

## 问题描述

通过 Node.js `child_process.spawn()` 启动 Claude Code CLI 时，进程成功 spawn 但 stdout/stderr 没有任何输出，30 秒后超时被 SIGTERM 杀死。

### 症状

```
[ClaudeCode] Process spawned, PID: 88408
[ClaudeCode] Process stdout: true
[ClaudeCode] EVENT: spawn - process started successfully
... 30 秒后 ...
CLI_NO_OUTPUT
CLI_EXIT_ERROR: exited with code null
```

### 对比

| 场景 | 结果 |
|------|------|
| 终端直接执行 `claude -p "hi"` | ✅ 正常输出 |
| `echo "" \| claude -p "hi"` | ✅ 正常输出 |
| Node.js `spawn(claude, [...])` | ❌ 无输出，超时 |
| Node.js `exec(claude ...)` | ❌ 无输出，超时 |

## 根本原因

**Claude CLI 在 `-p` (print/headless) 模式下会等待 stdin EOF（输入结束信号）才开始处理请求。**

当使用 `spawn()` 创建子进程时：
- `stdio: ['pipe', 'pipe', 'pipe']` 会为 stdin 创建一个管道
- 这个管道保持打开状态，不会自动发送 EOF
- Claude CLI 一直等待 stdin EOF，导致卡住

而在终端中：
- `echo "" | claude ...` 会自动在管道关闭时发送 EOF
- 直接执行时 stdin 是 TTY，行为不同

## 解决方案

在 `spawn()` 之后立即调用 `stdin.end()` 发送 EOF 信号：

```typescript
this.process = spawn(claudePath, claudeArgs, {
    cwd: this.options.workingDirectory,
    stdio: ['pipe', 'pipe', 'pipe'],
    // ...
});

// CRITICAL: Claude CLI in -p mode waits for stdin EOF before processing.
// We must close stdin immediately to unblock it.
if (this.process.stdin) {
    this.process.stdin.end();
}
```

## 相关文件

- `packages/server/src/claude/wrapper.ts` - `prompt()` 方法

## 排查过程

1. 添加诊断日志确认进程成功 spawn
2. 确认 stdout/stderr 监听器已注册
3. 尝试 `shell: true` 选项 - 无效
4. 尝试移除 zsh 包装 - 无效
5. 在纯 Node.js 环境测试 - 同样失败
6. 发现 `echo "" |` 管道方式成功 → 定位到 stdin EOF 问题

## 经验教训

1. 某些 CLI 工具可能依赖 stdin 状态来决定行为模式
2. 在 headless/pipe 模式下，确保正确处理 stdin 生命周期
3. 对于只读取参数不需要交互输入的命令，spawn 后立即关闭 stdin
