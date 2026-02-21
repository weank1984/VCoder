# Claude Code CLI 权限交互问题分析

**日期**: 2026-01-08  
**状态**: 🔍 分析中

## 问题现象

在 VCoder 插件中使用 "plan" 或 "normal" 模式时：
1. Claude Code CLI 请求文件修改权限（Write/Edit）
2. UI 短暂闪现"批准/拒绝"界面
3. 但界面没有等待用户确认，操作直接失败
4. 用户无法通过 UI 批准操作

## 根本原因

### 1. Stream-JSON 模式的限制

Claude Code CLI 在 `--output-format stream-json` 模式下（IDE 集成必须）会**自动禁用交互式权限确认**：

```
# 测试命令
claude -p "" --output-format stream-json --input-format stream-json

# 输出结果
{
  "type": "result",
  "permission_denials": [{
    "tool_name": "Write",
    "tool_use_id": "call_xxx",
    "tool_input": {"file_path": "...", "content": "..."}
  }]
}
```

CLI 不会暂停等待用户输入，而是直接返回 `permission_denials` 并结束。

### 2. 非 TTY 环境

当进程通过 `spawn()` 启动时，`stdin` 不是 TTY，CLI 会跳过交互式提示。即使使用 Python PTY 包装也无法完全模拟终端行为。

### 3. 输入格式约束

- `--input-format stream-json` 模式下，所有输入必须是 JSON 格式
- 发送 `y` 或 `n` 会导致 JSON 解析错误
- 没有已知的 JSON 格式"确认"消息

## 复现脚本

以下脚本可复现问题：

```javascript
// packages/server/src/claude/repro_permission.js
const { spawn } = require('child_process');

const child = spawn('claude', [
    '-p', '',
    '--output-format', 'stream-json',
    '--input-format', 'stream-json',
    '--verbose'
], { stdio: ['pipe', 'pipe', 'pipe'] });

child.stdout.on('data', (data) => console.log(`[STDOUT]: ${data}`));
child.stderr.on('data', (data) => console.error(`[STDERR]: ${data}`));

// 发送请求
child.stdin.write(JSON.stringify({
    type: 'user',
    message: { role: 'user', content: "Create file test.txt with content 'hello'" }
}) + '\n');

// 尝试发送确认（失败）
setTimeout(() => {
    child.stdin.write('y\n'); // 报错: not valid JSON
}, 5000);
```

## 可能的解决方案

### 方案 A: 自动批准模式 (acceptEdits)

**原理**: 配置 CLI 使用 `--permission-mode acceptEdits`

**实现**:
```typescript
// wrapper.ts
const permissionMode = 'acceptEdits'; // 而非 'default' 或 'plan'
args.push('--permission-mode', permissionMode);
```

**优点**:
- ✅ 立即修复问题
- ✅ 实现简单（只需改一行）

**缺点**:
- ❌ 用户失去对文件修改的审批控制
- ❌ 所有 Write/Edit 操作将自动执行

**适用场景**: 信任环境，快速原型开发

---

### 方案 B: MCP 代理工具

**原理**: 用内部 MCP 服务器接管所有文件操作

**实现**:
1. 创建 MCP Server，注册 `vcoder_write`, `vcoder_edit` 等代理工具
2. 配置 CLI 禁用原生 Write/Edit: `--disallowed-tools Write Edit`
3. 配置 CLI 连接内部 MCP Server
4. Claude 调用代理工具时，插件弹出 UI 等待用户确认
5. 用户批准后，插件执行实际文件操作

**优点**:
- ✅ 完整保留交互式权限控制
- ✅ 可扩展（可代理任何工具）

**缺点**:
- ❌ 工程量大（需实现完整 MCP Server）
- ❌ 引入额外的进程间通信开销

**适用场景**: 需要严格权限控制的生产环境

---

### 方案 C: 事后重试机制

**原理**: 检测 `permission_denials`，用户批准后手动执行

**实现**:
1. 监听 `result` 事件中的 `permission_denials` 字段
2. 如果有被拒绝的操作，展示"批准/拒绝"UI
3. 用户批准后，用 Node.js `fs` 模块执行被拒绝的操作
4. 向 Claude 发送"操作已完成"的 tool_result，继续对话

```typescript
// 伪代码
if (result.permission_denials?.length > 0) {
    for (const denial of result.permission_denials) {
        // 展示 UI
        const approved = await showApprovalUI(denial);
        if (approved && denial.tool_name === 'Write') {
            // 手动执行
            fs.writeFileSync(denial.tool_input.file_path, denial.tool_input.content);
            // 继续对话，告诉 Claude 文件已创建
            sendToolResult(denial.tool_use_id, 'File created successfully');
        }
    }
}
```

**优点**:
- ✅ 保留 stream-json 模式
- ✅ 保留用户审批能力
- ✅ 实现复杂度适中

**缺点**:
- ❌ 有 1-2 秒的"失败-重试"延迟
- ❌ 需要在插件端实现 Write/Edit 逻辑
- ❌ 对话上下文可能需要特殊处理

**适用场景**: 折中方案，保持功能和安全性平衡

---

## 相关文件

- `packages/server/src/claude/wrapper.ts` - CLI 封装层
- `packages/server/src/claude/persistentSession.ts` - 持久会话
- `apps/vscode-extension/webview/src/components/StepProgress/StepEntry.tsx` - 权限 UI 组件
- `packages/server/src/claude/repro_*.js` - 复现脚本

## 参考资料

- [docs/learned/001-claude-cli-no-output.md](../learned/001-claude-cli-no-output.md) - stdin EOF 问题
- Claude Code CLI `--help` 输出（见测试日志）
