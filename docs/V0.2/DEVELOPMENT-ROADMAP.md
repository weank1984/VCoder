# VCoder 进一步开发规划文档

**文档版本**: V1.0  
**创建日期**: 2026-01-11  
**项目阶段**: V0.2 核心功能完成，准备优化与发布

---

## 📊 项目现状总结

### 已完成功能（V0.2）✅

#### 核心架构（100%）
- ✅ ACP 协议集成（双向 JSON-RPC）
- ✅ Agent 进程管理（AgentProcessManager）
- ✅ 结构化权限系统（session/request_permission）
- ✅ 能力协商机制（clientCapabilities）

#### 核心能力（100%）
- ✅ 文件系统能力（fs/readTextFile, fs/writeTextFile）
- ✅ 终端能力（基于 node-pty 的完整实现）
- ✅ MCP 支持（外部服务器配置与注入）
- ✅ Workspace Trust 安全机制

#### UI 组件（100%）
- ✅ 权限审批对话框（PermissionDialog）
- ✅ 终端输出展示（TerminalOutput）
- ✅ Diff 审阅组件（DiffViewer）
- ✅ MCP 工具展示（McpToolDisplay）
- ✅ 思考过程可视化（ThoughtBlock）
- ✅ 任务计划展示（PlanBlock）
- ✅ 会话管理界面

#### 基础设施
- ✅ Toast 通知系统（已创建，待集成）
- ✅ 错误处理工具（智能分类与重试机制）
- ✅ 国际化支持（中英文）
- ✅ 类型定义完整

### 当前问题与技术债务

1. **UX 优化未完成**
   - Toast 系统未集成到主应用
   - 缺少加载状态骨架屏
   - 权限审批无快捷键支持

2. **性能待优化**
   - 长会话的虚拟滚动未完全优化
   - 流式输出节流机制待加强
   - 大文件处理性能待提升

3. **稳定性待加强**
   - Agent 崩溃恢复机制不完善
   - 会话状态持久化缺失
   - 错误恢复策略不完整

4. **功能缺失**
   - 内置 MCP Server 仅有框架
   - 审计日志系统未实现
   - 多 Agent 支持未完成

---

## 🎯 开发路线图

### Phase 1: 用户体验优化（优先级：🔴 最高）

**预计时间**: 1-2 周  
**目标**: 完成 UX 优化，达到可发布 Beta 版本的质量标准

#### 1.1 Toast 系统集成
**工作量**: 2-3 天

**任务清单**:
```typescript
// 文件: packages/extension/webview/src/App.tsx
- [ ] 将 ToastProvider 添加到应用根组件
- [ ] 在所有错误处理点使用 useToast hook

// 关键错误点：
- [ ] Agent 连接失败 (extension.ts)
- [ ] 文件读写错误 (fileSystemProvider.ts)
- [ ] 终端执行错误 (terminalProvider.ts)
- [ ] 权限拒绝提示 (permissionProvider.ts)
- [ ] 网络超时错误 (ACPClient)
- [ ] MCP 服务器连接失败
```

**验收标准**:
- 所有错误都有友好的 Toast 提示
- 错误 Toast 不自动关闭
- 成功/警告 Toast 3 秒后自动关闭
- 支持操作按钮（如"重试"）

#### 1.2 加载状态优化
**工作量**: 3-4 天

**任务清单**:
```typescript
// 新建文件: packages/extension/webview/src/components/Skeleton/
- [ ] MessageSkeleton.tsx - 消息加载骨架屏
- [ ] SessionSkeleton.tsx - 会话列表加载骨架屏
- [ ] AgentSkeleton.tsx - Agent 初始化骨架屏

// 集成点：
- [ ] 首次打开侧边栏时显示骨架屏
- [ ] Agent 初始化时显示加载状态
- [ ] 会话切换时的过渡动画
- [ ] 流式响应时的打字指示器优化
```

**设计要求**:
- 与 VSCode 主题完美融合
- 平滑的加载动画（shimmer effect）
- 避免布局抖动（占位符尺寸准确）

#### 1.3 权限审批体验优化
**工作量**: 2-3 天

**任务清单**:
```typescript
// 修改文件: packages/extension/webview/src/components/PermissionDialog.tsx
- [ ] 添加快捷键支持
  - Enter: 快速确认（Allow Once）
  - Cmd/Ctrl+Enter: Always Allow
  - Esc: 拒绝
  - Tab/Arrow: 切换选项
  
- [ ] 记忆用户选择功能
  - 会话级别的"记住此选择"复选框
  - 规则管理 UI（查看/编辑已保存的规则）
  
- [ ] 批量审批功能
  - 当有多个待审批请求时，显示批量操作按钮
  - "全部允许"/"全部拒绝"选项
  - 按工具类型分组展示
  
- [ ] 审批历史
  - 在侧边栏显示本会话的审批历史
  - 快速撤销最近的审批决定
```

**验收标准**:
- 键盘操作流畅，无需鼠标即可完成审批
- 记忆的规则在会话内生效
- 批量操作不会误操作（需要二次确认）

#### 1.4 错误处理增强
**工作量**: 2 天

**任务清单**:
```typescript
// 文件: packages/extension/webview/src/utils/errorHandling.ts
- [ ] 完善错误分类逻辑
- [ ] 添加更多用户友好的错误提示文案
- [ ] 实现自动重试机制（网络错误、超时错误）
- [ ] 错误上报（可选，用于收集反馈）

// 文件: packages/extension/webview/src/components/ErrorBoundary.tsx
- [ ] 增强 Error Boundary 显示
- [ ] 添加"重启会话"按钮
- [ ] 显示错误诊断信息
- [ ] 提供错误报告导出
```

---

### Phase 2: 稳定性与可靠性（优先级：🟠 高）

**预计时间**: 2-3 周  
**目标**: 提升系统稳定性，保证生产环境可用

#### 2.1 Agent 进程管理增强
**工作量**: 3-4 天

**任务清单**:
```typescript
// 文件: packages/extension/src/services/agentProcessManager.ts
- [ ] Agent 崩溃检测与自动重启
  - 监听进程 exit 事件
  - 记录崩溃原因和频率
  - 指数退避重启策略
  - 最大重试次数限制（防止无限重启）
  
- [ ] 进程健康检查
  - 定期发送心跳请求
  - 超时检测（30秒无响应则认为假死）
  - 假死进程的清理与重启
  
- [ ] 断线重连机制
  - 网络波动时的优雅重连
  - 重连时保持会话状态
  - 重连期间的用户提示
  
- [ ] 优雅降级
  - Agent 不可用时，显示只读模式
  - 部分功能失败不影响整体使用
  - 降级状态的明确提示
```

**技术方案**:
```typescript
interface RestartPolicy {
  maxRetries: 5,
  backoffMs: [1000, 2000, 5000, 10000, 30000],
  resetAfterMs: 300000 // 5分钟无崩溃则重置计数
}

// 崩溃检测
process.on('exit', (code, signal) => {
  if (code !== 0 || signal) {
    this.handleCrash({ code, signal, timestamp: Date.now() });
  }
});
```

#### 2.2 会话状态持久化
**工作量**: 3-4 天

**任务清单**:
```typescript
// 新建文件: packages/extension/src/services/sessionStore.ts
- [ ] 会话自动保存
  - 每次状态变更后异步保存
  - 使用 VSCode Memento API（workspaceState）
  - 保存内容：消息历史、工具调用、权限规则
  
- [ ] 会话恢复
  - VSCode 重启后自动恢复上次会话
  - 恢复到上次的执行点
  - 恢复权限规则和模式设置
  
- [ ] 草稿自动保存
  - 输入框内容自动保存
  - 未发送的消息不丢失
  - 切换会话后草稿保留
  
- [ ] 会话导出与导入
  - 导出为 JSON 格式
  - 支持导入历史会话
  - 选择性导出（排除敏感信息）
```

**数据结构**:
```typescript
interface SessionState {
  id: string;
  createdAt: number;
  updatedAt: number;
  agentId: string;
  messages: Message[];
  toolCalls: ToolCall[];
  permissionRules: PermissionRule[];
  draft?: string;
  metadata: {
    workspaceRoot: string;
    agentVersion: string;
  };
}
```

#### 2.3 数据一致性保证
**工作量**: 2-3 天

**任务清单**:
```typescript
// 文件: packages/extension/src/services/fileSystemProvider.ts
- [ ] 文件写入的原子性
  - 使用临时文件 + 原子性重命名
  - 写入失败时不破坏原文件
  - 磁盘空间检查
  
- [ ] 并发操作保护
  - 文件级别的互斥锁
  - 防止同时写入同一文件
  - 等待队列与超时处理
  
- [ ] 版本冲突检测
  - 写入前校验文件 hash/mtime
  - 检测到冲突时提示用户
  - 提供 diff 三方合并 UI
  
- [ ] 失败回滚机制
  - 记录操作历史（用于回滚）
  - "撤销上次写入"功能
  - 批量操作的事务性保证
```

**技术实现**:
```typescript
// 原子性写入
async atomicWrite(path: string, content: string) {
  const tempPath = `${path}.tmp.${Date.now()}`;
  try {
    await fs.writeFile(tempPath, content);
    await fs.rename(tempPath, path); // 原子性操作
  } catch (err) {
    await fs.unlink(tempPath).catch(() => {});
    throw err;
  }
}
```

#### 2.4 审计日志系统
**工作量**: 4-5 天

**任务清单**:
```typescript
// 新建文件: packages/extension/src/services/auditLogger.ts
- [ ] 日志记录器实现
  - 结构化日志格式（JSONL）
  - 异步写入（不阻塞主流程）
  - 日志轮转（按大小/时间分割）
  - 敏感信息自动脱敏
  
- [ ] 记录内容
  - 用户 prompt（脱敏后）
  - Agent 响应与执行时间
  - 工具调用详情（名称、参数摘要、结果、耗时）
  - 权限审批记录（请求内容、用户决定、时间戳）
  - 文件操作（路径、操作类型、diff hash）
  - 终端命令（命令、cwd、exitCode、输出摘要）
  - 错误与异常（类型、消息、堆栈）
  
- [ ] JSONL 导出功能
  - 按会话导出
  - 按时间范围导出
  - 选择性导出（按事件类型过滤）
  - 导出前脱敏确认
  
- [ ] 日志查询与分析
  - 基础搜索功能（时间、事件类型）
  - 统计报告（工具使用频率、成功率等）
  - 可视化展示（可选）
```

**日志格式**:
```json
{
  "timestamp": "2026-01-11T10:30:00.000Z",
  "sessionId": "sess_abc123",
  "eventType": "tool_call",
  "toolName": "mcp__acp__Write",
  "params": { "path": "src/app.ts", "size": 1234 },
  "result": "success",
  "durationMs": 150,
  "userId": "user_xxx"
}
```

---

### Phase 3: 功能增强（优先级：🟡 中）

**预计时间**: 3-4 周  
**目标**: 补齐缺失功能，提升易用性

#### 3.1 内置 MCP Server 完整实现
**工作量**: 5-6 天

**任务清单**:
```typescript
// 新建文件: packages/extension/src/services/builtinMcpServer/
- [ ] HTTP/SSE 服务器基础设施
  - 使用 express 框架
  - SSE 端点实现（/mcp/stream）
  - 工具列表端点（/mcp/tools）
  - 健康检查（/mcp/health）
  - 随机端口 + 端口冲突检测
  
- [ ] 核心工具实现
  ├── workspace/
  │   ├── searchText - ripgrep 集成
  │   ├── listFiles - 文件列表（支持 .gitignore）
  │   ├── openFile - 打开文件并定位
  │   └── revealInExplorer - 在资源管理器中显示
  ├── git/
  │   ├── status - Git 状态（只读）
  │   ├── diff - Git diff（只读）
  │   ├── log - Git 历史（只读）
  │   └── branch - 当前分支信息
  ├── editor/
  │   ├── getSelection - 获取当前选区
  │   ├── getActiveFile - 获取当前文件
  │   ├── insertText - 插入文本（需权限）
  │   └── replaceText - 替换文本（需权限）
  └── lsp/
      ├── getDefinition - 跳转到定义
      ├── getReferences - 查找引用
      ├── getHover - 获取悬停信息
      └── getCompletions - 获取代码补全
      
- [ ] 安全与权限控制
  - 每个工具的权限级别定义
  - 路径访问限制（仅 workspace 内）
  - 输出大小限制（防止 OOM）
  - 超时控制（5-30秒）
  - 速率限制（防止滥用）
```

**技术实现**:
```typescript
// 服务器启动
class BuiltinMcpServer {
  private app = express();
  private port?: number;
  
  async start() {
    this.app.post('/mcp', this.handleJsonRpc);
    this.app.get('/mcp/stream', this.handleSSE);
    
    this.port = await this.findAvailablePort(3000, 4000);
    this.app.listen(this.port);
    
    return { type: 'http', url: `http://127.0.0.1:${this.port}/mcp` };
  }
}
```

#### 3.2 性能优化
**工作量**: 4-5 天

**任务清单**:
```typescript
// 1. 虚拟滚动优化
// 文件: packages/extension/webview/src/components/VirtualMessageList.tsx
- [ ] 使用 react-window 或 react-virtual
- [ ] 动态高度消息的精确测量
- [ ] 滚动位置保持（新消息时不跳动）
- [ ] 滚动到底部的平滑动画
- [ ] 大量消息（1000+）的性能测试

// 2. 流式输出节流
// 文件: packages/extension/webview/src/hooks/useThrottledUpdate.ts
- [ ] 创建节流 hook
- [ ] 应用到 Agent 消息流（50-100ms 批处理）
- [ ] 应用到终端输出（100ms 批处理）
- [ ] 背压处理（缓冲区满时的策略）

// 3. 大文件处理优化
// 文件: packages/extension/src/services/fileSystemProvider.ts
- [ ] 大文件检测（>1MB 提示）
- [ ] 分片读取（readTextFile 支持 offset/limit）
- [ ] 流式 diff 计算（大文件 diff 不阻塞）
- [ ] Diff 展示虚拟化（仅渲染可见行）

// 4. Webview 通信优化
// 文件: packages/extension/src/providers/chatViewProvider.ts
- [ ] 消息批量发送（减少跨进程通信次数）
- [ ] 消息压缩（对大消息使用 gzip）
- [ ] 增量更新（避免发送完整状态）
```

**性能目标**:
- 消息列表滚动 60fps
- 1000 条消息加载时间 < 2s
- 大文件（10MB）diff 计算 < 3s
- 终端输出（100KB/s）不卡顿

#### 3.3 多 Agent 支持
**工作量**: 4-5 天

**任务清单**:
```typescript
// 1. Agent Profile 管理
// 文件: packages/extension/src/services/agentProfileManager.ts
- [ ] Profile 配置加载
- [ ] Profile 验证与测试
- [ ] 默认 Profile 选择
- [ ] Profile 切换（保持会话隔离）

// 2. UI 支持
// 文件: packages/extension/webview/src/components/AgentSelector.tsx
- [ ] Agent 选择下拉菜单
- [ ] 显示 Agent 能力徽章
- [ ] Agent 状态指示（在线/离线/错误）
- [ ] 快速切换快捷键

// 3. 会话与 Agent 绑定
- [ ] 每个会话记录使用的 Agent
- [ ] 切换 Agent 时创建新会话
- [ ] 跨 Agent 会话隔离
- [ ] Agent 配置独立管理
```

**配置示例**:
```json
{
  "vcoder.agentProfiles": [
    {
      "id": "claude-code",
      "name": "Claude Code",
      "command": "npx",
      "args": ["@zed-industries/claude-code-acp"],
      "env": {},
      "capabilities": {
        "coding": true,
        "planning": true,
        "refactoring": true
      },
      "icon": "robot",
      "default": true
    }
  ]
}
```

---

### Phase 4: 高级特性（优先级：🟢 低）

**预计时间**: 4-6 周  
**目标**: 提供差异化功能，提升用户体验

#### 4.1 上下文管理增强
**工作量**: 5-6 天

**任务清单**:
```typescript
// 1. @ 引用功能增强
// 文件: packages/extension/webview/src/components/FilePicker.tsx
- [ ] @file - 引用单个文件（已有）
- [ ] @folder - 引用整个文件夹
- [ ] @symbol - 引用函数/类（基于 LSP）
- [ ] @line - 引用文件特定行
- [ ] @commit - 引用 Git commit
- [ ] @url - 引用网页内容
- [ ] 智能搜索与模糊匹配

// 2. 上下文预览
// 新建: packages/extension/webview/src/components/ContextPanel.tsx
- [ ] 当前上下文列表展示
- [ ] 上下文大小估算（token 数）
- [ ] 手动移除不需要的上下文
- [ ] 上下文重要性排序

// 3. 智能上下文选择
// 文件: packages/extension/src/services/contextManager.ts
- [ ] 基于依赖关系的自动扩展
- [ ] 最近编辑文件优先
- [ ] 基于 Git diff 的智能上下文
- [ ] 上下文大小自动控制（避免超限）
```

#### 4.2 工作流自动化
**工作量**: 4-5 天

**任务清单**:
```typescript
// 1. 任务模板
// 文件: packages/extension/src/templates/taskTemplates.ts
const templates = [
  { id: 'fix-bug', prompt: '修复此 bug：@selection', icon: 'bug' },
  { id: 'add-test', prompt: '为 @file 添加单元测试', icon: 'test' },
  { id: 'refactor', prompt: '重构 @symbol 以提高可读性', icon: 'refactor' },
  { id: 'optimize', prompt: '优化 @file 的性能', icon: 'speed' },
  { id: 'document', prompt: '为 @symbol 添加详细文档', icon: 'doc' }
];

// 2. 快捷命令
// 文件: package.json (contributes.commands)
- [ ] 右键菜单：VCoder: Fix This
- [ ] 右键菜单：VCoder: Explain This
- [ ] 右键菜单：VCoder: Refactor This
- [ ] 右键菜单：VCoder: Test This
- [ ] 快捷键绑定支持

// 3. 自定义命令
// 文件: packages/extension/src/services/customCommandManager.ts
- [ ] 用户自定义 prompt 模板
- [ ] 模板变量支持（${file}, ${selection}, ${symbol}）
- [ ] 模板分享与导入
```

#### 4.3 协作与分享
**工作量**: 3-4 天

**任务清单**:
```typescript
// 1. 会话导出
// 文件: packages/extension/src/services/sessionExporter.ts
- [ ] 导出为 Markdown（包含代码变更）
- [ ] 导出为 HTML（可在浏览器查看）
- [ ] 导出为 PDF（可选，需要额外依赖）
- [ ] 生成会话摘要

// 2. 配置共享
// 新建: packages/extension/src/services/configSharing.ts
- [ ] 导出团队配置（Agent profiles, MCP servers）
- [ ] 导入团队配置
- [ ] 配置版本管理
- [ ] 配置冲突解决

// 3. 代码审查辅助
- [ ] 生成 PR 描述
- [ ] 生成 Commit 消息
- [ ] 代码变更摘要
```

---

## 📅 发布计划

### V0.2 Beta（当前）- 2026年1月中旬
**目标**: 内部测试与早期用户反馈

**发布内容**:
- ✅ 核心功能完整（ACP/MCP/权限/文件/终端）
- ✅ 基础 UI 组件完整
- 🔄 UX 优化进行中

**发布渠道**:
- GitHub Releases（标记为 Pre-release）
- 小范围内部测试
- 收集问题清单

### V0.3 RC（候选版）- 2026年2月
**目标**: 公开测试，准备正式发布

**完成内容**:
- ✅ UX 优化全部完成
- ✅ 稳定性增强完成
- ✅ 审计日志系统完成
- ✅ 内置 MCP Server 完成
- ✅ 性能优化完成
- ✅ 文档完善

**发布渠道**:
- VSCode Marketplace（Beta 标签）
- GitHub Discussions 开放
- 博客文章发布
- 社交媒体推广

### V1.0 正式版 - 2026年3-4月
**目标**: 稳定可靠的生产版本

**完成内容**:
- ✅ 所有已知 bug 修复
- ✅ 多 Agent 支持
- ✅ 高级特性完成
- ✅ 完整文档与教程
- ✅ 示例项目与最佳实践

**发布渠道**:
- VSCode Marketplace（正式版）
- Product Hunt 发布
- Hacker News 发布
- 技术博客推广
- 视频教程发布

### V1.x 迭代版本 - 2026年下半年
**目标**: 企业功能与生态建设

**计划内容**:
- 企业级权限与审计
- 私有部署支持
- 更多 Agent 支持
- 社区 MCP Server 市场
- 插件生态建设

---

## 🎯 关键质量指标（KPI）

### 性能指标
- **响应时间**: 首字节 < 1s, 完整响应 < 5s
- **UI 流畅度**: 滚动/动画 60fps
- **内存占用**: 插件进程 < 200MB（正常使用）
- **启动时间**: 侧边栏打开 < 2s

### 稳定性指标
- **Agent 连接成功率**: > 99%
- **崩溃率**: < 0.1% 会话
- **数据丢失**: 0 次（会话持久化）
- **错误恢复率**: > 95%（可自动恢复的错误）

### 可用性指标
- **新用户上手时间**: < 5 分钟（完成首次对话）
- **帮助文档覆盖**: 100%（所有功能有文档）
- **错误信息友好度**: 100%（无技术术语）
- **快捷键覆盖**: > 80%（常用操作）

### 用户满意度
- **NPS 分数**: > 50
- **用户留存**: 7 天留存 > 60%
- **日活用户**: > 1000（V1.0 后 3 个月）
- **社区反馈**: 平均 4+ 星评价

---

## 🔧 技术选型建议

### 依赖管理
- **保持轻量**: 避免引入过大的依赖
- **版本锁定**: 使用 lockfile 确保一致性
- **安全审计**: 定期运行 `npm audit`
- **Tree Shaking**: 仅打包使用的代码

### 测试策略
```typescript
// 1. 单元测试（Vitest）
- packages/extension/src/**/*.test.ts
- packages/shared/src/**/*.test.ts
- 覆盖率目标: > 70%

// 2. 集成测试
- Agent 连接测试
- 文件操作测试
- 权限流程测试
- 覆盖率目标: > 50%

// 3. E2E 测试（@vscode/test-electron）
- 完整对话流程
- 文件写入审批流程
- 终端执行流程
- 关键场景覆盖: > 80%
```

### CI/CD 流程
```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    - 运行单元测试
    - 运行 lint 检查
    - 构建所有 packages
    - 运行 E2E 测试（可选）
    
  release:
    - 版本号自动递增
    - 打包 .vsix 文件
    - 上传到 GitHub Releases
    - 发布到 VSCode Marketplace（tag 触发）
```

---

## 📚 文档计划

### 用户文档
```
docs/
├── README.md - 项目介绍与快速开始
├── user-guide/
│   ├── installation.md - 安装指南
│   ├── getting-started.md - 入门教程（带截图）
│   ├── features.md - 功能详解
│   ├── shortcuts.md - 快捷键列表
│   └── troubleshooting.md - 故障排除
├── tutorials/
│   ├── first-conversation.md - 第一次对话
│   ├── file-editing.md - 文件编辑工作流
│   ├── permission-management.md - 权限管理
│   └── advanced-usage.md - 高级用法
└── faq.md - 常见问题
```

### 开发者文档
```
docs/dev/
├── architecture.md - 架构设计
├── acp-protocol.md - ACP 协议说明
├── mcp-integration.md - MCP 集成指南
├── contributing.md - 贡献指南
├── building.md - 构建与调试
└── api-reference.md - API 文档
```

### 视频教程（可选）
- 5 分钟快速上手
- 权限管理详解
- 自定义 MCP Server
- 最佳实践分享

---

## 💡 创新点与差异化

### vs Cursor
- ✅ 基于开放协议（ACP/MCP）
- ✅ 更精细的权限控制
- ✅ 完整的审计日志
- ✅ 可插拔 Agent（不绑定特定模型）

### vs GitHub Copilot Chat
- ✅ 结构化权限审批
- ✅ 终端输出可控
- ✅ MCP 生态集成
- ✅ 本地 Agent 支持

### vs Codeium
- ✅ 企业级审计能力
- ✅ 多 Agent 支持
- ✅ 完全开源（可自部署）

---

## 🚨 风险与应对

### 技术风险
**风险**: Agent 稳定性问题  
**应对**: 完善崩溃恢复机制，提供降级方案

**风险**: 性能瓶颈（大型项目）  
**应对**: 虚拟滚动、分片加载、上下文智能裁剪

**风险**: 跨平台兼容性（node-pty）  
**应对**: 多平台 CI 测试，提供 fallback 方案

### 产品风险
**风险**: 用户学习成本高  
**应对**: 详细文档、视频教程、交互式引导

**风险**: 竞品压力大  
**应对**: 强调开放性、可控性、审计能力

### 运营风险
**风险**: 社区支持不足  
**应对**: 建立 Discord/Discussions，及时响应反馈

---

## 📞 后续支持

### 社区建设
- GitHub Discussions（问答、讨论）
- Discord Server（实时沟通）
- 月度 AMA（与用户面对面）
- 贡献者激励计划

### 企业支持（可选）
- 付费技术支持
- 私有部署协助
- 定制开发服务
- SLA 保证

---

## ✅ 总结

VCoder 项目已经完成了坚实的技术基础（V0.2），现在需要：

1. **短期（1-2周）**: 完成 UX 优化，准备 Beta 发布
2. **中期（2-3周）**: 提升稳定性，完善审计日志
3. **长期（3-6周）**: 补齐高级特性，建设生态

**立即行动**（本周）：
- ✅ 集成 Toast 系统
- ✅ 实现骨架屏
- ✅ 添加快捷键支持
- ✅ 端到端测试
- ✅ 准备 Beta 发布

**核心优势**：
- 开放协议（ACP/MCP）
- 精细权限控制
- 完整审计能力
- 可插拔架构

**目标**：成为最可控、最透明、最可信的 AI 编程助手！

---

**文档结束**
