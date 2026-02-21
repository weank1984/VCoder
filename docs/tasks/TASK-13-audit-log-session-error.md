# TASK-13: 审计日志 — 会话生命周期与错误审计

## 基本信息

- 优先级：P1
- 预估工时：1 day
- 所属需求：PRD 14.2 — 审计日志闭环
- 关联 FR：NFR-004, FR-403
- 前置依赖：TASK-12（工具调用/文件变更审计集成）
- 后续任务：无（P0/P1 全部完成）

## 1. 任务目标

补全审计日志的最后一环：会话生命周期事件（创建/切换/删除/完成）和错误事件的审计集成，并实现审计日志的验证与导出功能。

## 2. 具体工作内容

### 2.1 会话生命周期审计

- [ ] `session/new` 处理时调用 `auditLogger.logEvent()` 记录 `session_start`：
  - sessionId
  - 会话配置（model、permissionMode、maxThinkingTokens）
  - 创建来源（用户新建/历史恢复/自动恢复）
- [ ] `session/complete` 事件到达时记录 `session_end`：
  - sessionId
  - 总 token usage（inputTokens、outputTokens）
  - 会话持续时间
  - 完成状态（normal/cancelled/error）
- [ ] `session/switch` 时记录会话切换：
  - fromSessionId → toSessionId
- [ ] `session/delete` 时记录会话删除：
  - sessionId
  - 删除原因（用户手动/自动清理）

### 2.2 错误事件审计

- [ ] CLI 进程异常退出时调用 `auditLogger.logError()` 记录 `agent_crash`：
  - sessionId
  - exitCode
  - stderr 输出（截断到 2000 字符）
  - 最后一次操作上下文
- [ ] RPC 调用失败时记录：
  - method（失败的 RPC 方法）
  - error code 和 message
  - 请求参数摘要
- [ ] Webview 渲染错误时记录（通过 Webview → Extension 消息）：
  - 错误类型
  - 组件栈
  - 相关 sessionId

### 2.3 审计日志完整性验证

- [ ] 编写验证脚本/函数：读取 JSONL 日志，检查完整性：
  - 每个 `session_start` 有对应 `session_end`（或 `agent_crash`）
  - 每个 `tool_call` 的 `tool_use` 有对应 `tool_result`（或超时标记）
  - 时间戳单调递增
  - 无格式损坏的行
- [ ] 验证函数集成到 `auditLogger.getStats()` 中
- [ ] 统计报告增加完整性评分

### 2.4 导出功能验证与增强

- [ ] 验证 `auditLogger.exportToFile()` 正确导出 JSONL 和 JSON 格式
- [ ] 添加导出过滤条件支持：
  - 按 sessionId 导出单个会话的完整审计轨迹
  - 按时间范围导出
  - 按事件类型导出
- [ ] 导出文件名包含时间戳和 sessionId（如 `audit_2026-02-21_session-abc123.jsonl`）

### 2.5 审计日志 UI 入口

- [ ] 在 Webview 设置面板或侧栏添加 "Audit Logs" 入口：
  - 显示最近 N 条审计事件（简洁视图）
  - 提供"导出"按钮
  - 显示统计摘要（事件总数、会话数、错误数）
- [ ] 提供 VSCode 命令 `vcoder.exportAuditLog`

## 3. 验收标准

| # | 验收项 | 验证方式 |
|---|--------|----------|
| 1 | 新建会话生成 `session_start` 审计记录 | 检查 JSONL |
| 2 | 会话完成生成 `session_end` 审计记录（含 token 统计） | 检查 JSONL |
| 3 | CLI 崩溃生成 `agent_crash` 审计记录 | 手动 kill 后检查 |
| 4 | RPC 失败生成错误审计记录 | 模拟 RPC 错误后检查 |
| 5 | 完整性验证函数可检测缺失的 session_end | 单元测试 |
| 6 | 导出功能按 sessionId 过滤正确 | 单元测试 |
| 7 | Webview 中可查看审计摘要和导出 | 手动测试 |
| 8 | `pnpm build` 和 `pnpm test` 通过 | CI |

## 4. 边界条件

| 场景 | 预期行为 |
|------|----------|
| Extension 异常退出（crash） | 下次启动时为上次未关闭的会话补录 session_end（标记为 unclean_shutdown） |
| 并发多个会话同时完成 | 各会话的 session_end 正确记录，不交错 |
| 审计日志文件被外部删除 | AuditLogger 检测后重建，不崩溃 |
| 导出期间有新事件写入 | 导出的是快照，新事件不影响本次导出 |
| 审计事件量巨大（10000+） | UI 分页显示，不一次性加载全部 |

## 5. 审计事件完整覆盖矩阵

完成 TASK-12 + TASK-13 后，审计覆盖：

| 事件类型 | 触发点 | TASK |
|---------|--------|------|
| user_prompt | 用户发送消息 | 已有 |
| agent_response | CLI 返回响应 | 已有 |
| tool_call | tool_use + tool_result | TASK-12 |
| permission_decision | 权限审批 | 已有 |
| file_operation | file_change + accept/reject | TASK-12 |
| terminal_command | terminal/create + 完成 | TASK-12 |
| session_start | session/new | TASK-13 |
| session_end | session/complete | TASK-13 |
| agent_crash | CLI 进程异常退出 | TASK-13 |
| error | RPC 失败、渲染错误 | TASK-13 |

## 6. 风险

| 风险 | 影响 | 应对 |
|------|------|------|
| 审计事件过多导致日志膨胀 | 磁盘占用 | 维持 50MB 上限（10MB * 5 轮转） |
| Extension crash 时审计数据丢失 | 不完整审计 | 异步写入队列 flush + 下次启动补录 |

## 7. 关键文件

- `apps/vscode-extension/src/services/auditLogger.ts` — 审计日志核心
- `apps/vscode-extension/src/providers/chatViewProvider.ts` — 会话事件处理
- `apps/vscode-extension/src/acp/client.ts` — session/complete、RPC 错误处理
- `packages/server/src/claude/wrapper.ts` — CLI 进程退出事件
- Webview React 组件 — 审计日志 UI 入口
