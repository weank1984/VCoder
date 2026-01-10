# V0.2 开发进度总结

## 总体进度

**当前状态**: 核心后端能力已完成 ✅

**完成时间**: 2026-01-10

## 已完成的工作

### ✅ M1: 结构化权限系统（已完成）

**目标**: 实现无头模式下的结构化权限审批，替代 TTY 的 `y/n` 交互。

**实现内容**:
- ✅ `AgentProcessManager`: 管理 ACP agent 进程生命周期
  - 支持 spawn agent 子进程
  - stdio NDJSON 通信
  - 进程状态管理与重启
  - 环境变量与 API key 管理

- ✅ `PermissionProvider`: 处理 `session/request_permission`
  - 接收 agent→client 的权限请求
  - 管理待审批请求队列
  - 与 Webview 通信完成审批流程
  - 支持 Allow once/Always allow/Reject

- ✅ `PermissionDialog`: 权限审批 UI 组件
  - 风险等级展示（Low/Medium/High）
  - 工具名称、参数展示
  - 命令/文件路径高亮显示
  - 可展开的详细输入参数
  - 完整的样式系统（PermissionDialog.scss）

- ✅ `ACPClient`: 双向 JSON-RPC 支持
  - 支持 agent→client 请求处理
  - `registerRequestHandler` 注册回调
  - `handleAgentRequest` 处理入站请求

**文件位置**:
- `packages/extension/src/services/agentProcessManager.ts`
- `packages/extension/src/services/permissionProvider.ts`
- `packages/extension/webview/src/components/PermissionDialog.tsx`
- `packages/extension/webview/src/components/PermissionDialog.scss`
- `packages/extension/src/acp/client.ts`

---

### ✅ M2: 终端能力（已完成）

**目标**: 基于 node-pty 实现可控的终端执行能力，支持增量输出与 kill 操作。

**实现内容**:
- ✅ 安装 `node-pty` 依赖（v1.1.0）

- ✅ `TerminalProvider`: 终端能力提供者
  - `terminal/create`: 创建 pty 进程
  - `terminal/output`: 增量输出流式拉取
  - `terminal/wait_for_exit`: 等待进程退出
  - `terminal/kill`: 终止进程（支持 SIGTERM/SIGKILL）
  - `terminal/release`: 释放资源
  - 可选镜像输出到 VSCode Terminal

- ✅ 启用 `clientCapabilities.terminal = true`

- ✅ 在 `extension.ts` 中注册 `terminal/*` handlers

- ✅ Workspace Trust 检查（禁用不受信任工作区的终端执行）

**文件位置**:
- `packages/extension/package.json` (dependencies)
- `packages/extension/src/services/terminalProvider.ts`
- `packages/extension/src/extension.ts`

**能力协商**:
- 当 `clientCapabilities.terminal=true` 时，agent 将禁用内置 `Bash/BashOutput/KillShell` 工具，改用 `mcp__acp__BashOutput/KillShell` 代理工具，最终回调到 client 的 `terminal/*` methods。

---

### ✅ M3: 文件系统能力（已完成）

**目标**: 实现文件读写能力，支持审阅后落盘和路径安全策略。

**实现内容**:
- ✅ `FileSystemProvider`: 文件系统能力提供者
  - `fs/readTextFile`: 读取文件（支持 line/limit 切片）
  - `fs/writeTextFile`: 写入文件（审阅流程）
  - 路径解析与安全检查（workspace-relative or absolute）
  - Workspace Trust 检查
  - 可选：允许工作区外文件访问（配置项）

- ✅ 启用 `clientCapabilities.fs.readTextFile = true`
- ✅ 启用 `clientCapabilities.fs.writeTextFile = true`

- ✅ 在 `extension.ts` 中注册 `fs/*` handlers

- ✅ 类型定义补充（`FsReadTextFileParams/Result`, `FsWriteTextFileParams/Result`）

**文件位置**:
- `packages/extension/src/services/fileSystemProvider.ts`
- `packages/extension/src/extension.ts`
- `packages/shared/src/protocol.ts`

**能力协商**:
- 当 `clientCapabilities.fs.readTextFile/writeTextFile=true` 时，agent 将禁用内置 `Read/Write/Edit/MultiEdit` 工具，改用 `mcp__acp__Read/Write/Edit` 代理工具，最终回调到 client 的 `fs/*` methods。

**安全策略**:
- 默认仅限工作区内文件访问
- 可通过配置 `vcoder.security.allowOutsideWorkspace` 放宽限制
- 读取前检查文件可读性，写入前检查目录可写性

---

### ✅ M4: MCP 支持（已完成）

**目标**: 支持外部 MCP server 配置与注入，可选提供内置 MCP server。

**实现内容**:
- ✅ 外部 MCP server 配置注入
  - 从 `vcoder.mcpServers` 读取配置
  - 在 `session/new` 时注入 `mcpServers` 参数
  - 支持 stdio/http/sse 三种传输类型
  - 在 `ACPClient.newSession()` 中传递配置

- ✅ `BuiltinMcpServer`: 内置 MCP server 基础框架
  - 提供工具实现参考（workspaceSearch, gitStatus, listWorkspaceFiles, openFile, getSelection）
  - 完整实现留待后续迭代（需要 HTTP/SSE 服务器基础设施）

**文件位置**:
- `packages/extension/src/extension.ts` (`getMcpServerConfig`)
- `packages/extension/src/providers/chatViewProvider.ts` (`getMcpServerConfig`)
- `packages/extension/src/services/builtinMcpServer.ts`
- `packages/extension/src/acp/client.ts` (`newSession` 方法更新）
- `packages/extension/package.json` (configuration: `vcoder.mcpServers`)

**配置示例**:
```json
{
  "vcoder.mcpServers": [
    {
      "name": "My MCP Server",
      "type": "http",
      "url": "http://localhost:3000/mcp"
    },
    {
      "name": "Local MCP",
      "type": "stdio",
      "command": "node",
      "args": ["mcp-server.js"],
      "env": { "API_KEY": "xxx" }
    }
  ]
}
```

---

## 待完成的工作

### 🔲 UI 组件优化（低优先级）

**M2: 终端输出 UI 组件**
- 在 Webview 中展示终端输出
- 支持 kill 按钮
- 支持实时增量输出展示

**M3: 文件 diff 审阅 UI 组件**
- 升级现有 `diffManager`
- 在 Webview 中展示 diff 预览
- 支持 Accept/Reject 审批
- 与 `FileSystemProvider` 集成

**M4: MCP 工具调用 UI 展示**
- 在时间线中展示 MCP 工具调用卡片
- 展示工具名、参数摘要、输出摘要

**实现建议**:
- 这些 UI 组件不影响核心功能，可在后续迭代中完成
- 当前已有基础的工具调用展示（ToolCall 组件）
- 可根据用户反馈优先级调整

---

## 技术债务与后续优化

### 1. 内置 MCP Server 完整实现
- **当前状态**: 仅有基础框架和工具实现参考
- **需要**: HTTP/SSE 服务器基础设施
- **优先级**: 中（用户可使用外部 MCP servers）

### 2. 文件写入审阅流程优化
- **当前状态**: 直接写入，未实现 diff 审阅
- **需要**: 集成 `diffManager`，实现审阅流程
- **优先级**: 中（权限系统已提供审批能力）

### 3. 终端输出 UI 可视化
- **当前状态**: 后端能力完整，UI 展示待优化
- **需要**: Webview 中的终端输出组件
- **优先级**: 低（终端已镜像到 VSCode Terminal）

### 4. 错误处理与用户体验
- 更详细的错误提示
- 网络超时处理
- Agent 崩溃恢复策略
- 更友好的权限拒绝提示

### 5. 审计日志与可观测性
- 会话级事件记录（prompt、tool_call、permission_result、file_write、terminal_exec）
- JSONL 导出功能
- 敏感信息脱敏

### 6. 性能优化
- 终端输出节流/背压处理
- 大文件读取优化
- Webview 更新批量化

---

## 验收情况

按照 PRD 第 8 节验收标准：

✅ **能在 VSCode 侧边栏完成一次完整回合**
- 发送 prompt → agent 流式回复 → 触发工具调用 → 弹出权限审批 → 继续执行 → UI 可视化结果
- **状态**: 后端能力完整，UI 需要优化

✅ **能对敏感操作进行审批（Allow once/Always/Reject）**
- 支持写文件/执行命令/网络工具等敏感操作审批
- 不依赖 TTY 输入
- **状态**: 完成

⚠️ **文件改动支持审阅（diff）并在用户确认后写入工作区**
- 后端 `fs/writeTextFile` 已实现
- 当前直接写入，未实现 diff 审阅 UI
- **状态**: 基础能力完成，UI 待优化

✅ **终端能力支持增量输出与 kill**
- 基于 `terminal/*` 或等价机制
- **状态**: 完成

⚠️ **MCP: 至少能配置并调用 1 个外部 MCP server**
- 配置系统已完成
- 注入机制已完成
- UI 展示待优化
- **状态**: 后端完成，UI 待优化

✅ **能力协商验证**
- 当 `clientCapabilities.fs.writeTextFile=true` 时，agent 使用 `mcp__acp__*` 代理工具
- 当 `clientCapabilities.terminal=true` 时，命令执行走 `mcp__acp__BashOutput`
- **状态**: 完成（由 agent 实现决定）

---

## 构建与部署

### 构建命令
```bash
# 安装依赖
pnpm install

# 构建全部
pnpm run build

# 仅构建 extension
cd packages/extension && pnpm run build

# 仅构建 webview
cd packages/extension/webview && pnpm run build
```

### 构建状态
- ✅ TypeScript 编译通过（无错误）
- ✅ Webview 构建成功
- ✅ Extension 打包成功

### 依赖说明
- `node-pty@1.1.0`: 终端能力
- `@agentclientprotocol/sdk@^0.12.0`: ACP 协议支持
- VSCode API: ^1.80.0

---

## 下一步计划

### 短期（1-2 周）
1. **UI 组件完善**
   - 实现终端输出展示组件
   - 实现 diff 审阅 UI
   - 优化 MCP 工具调用展示

2. **用户体验优化**
   - 错误提示改进
   - 加载状态优化
   - 权限审批体验优化

### 中期（2-4 周）
1. **内置 MCP Server**
   - HTTP/SSE 服务器实现
   - 基础工具集（workspace search, git, editor）

2. **审计与可观测性**
   - JSONL 日志导出
   - 会话回放能力
   - 敏感信息脱敏

### 长期
1. **多 Agent 支持**
   - Agent profile 切换
   - 多 agent 并行

2. **企业功能**
   - 权限规则持久化
   - 团队共享配置
   - 审计报告

---

## 总结

V0.2 的核心目标已基本达成：

✅ **结构化权限系统**: 完全替代 TTY 交互，支持无头模式
✅ **终端能力**: 基于 node-pty 的可控执行
✅ **文件系统能力**: 安全的读写操作
✅ **MCP 支持**: 外部 server 配置与注入
✅ **能力协商**: agent 按 clientCapabilities 禁用内置工具

**剩余工作**: 主要集中在 UI 优化和用户体验提升，不影响核心功能使用。

**推荐发布策略**: 
- 先发布 beta 版本收集用户反馈
- 根据反馈优先级完成 UI 优化
- 逐步完善内置 MCP server 和审计功能
