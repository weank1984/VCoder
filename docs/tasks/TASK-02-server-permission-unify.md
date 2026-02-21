# TASK-02: Server 端权限转发统一为结构化路径

## 基本信息

- 优先级：P0
- 预估工时：1 day
- 所属需求：PRD 14.2 — 统一权限链路为单一路径
- 关联 FR：FR-302, FR-303
- 前置依赖：TASK-01（设计文档）
- 后续任务：TASK-03

## 1. 任务目标

按 TASK-01 的设计方案，重构 Server 端权限处理，确保所有 CLI confirmation_request 事件统一通过 ACP 结构化协议转发给 Client，不再依赖其他路径。

## 2. 具体工作内容

### 2.1 重构 ClaudeCodeWrapper 的 confirmation 处理

- [ ] 统一 `confirmTool()` 方法，确保所有工具类型（bash/file_write/file_delete/mcp/dangerous）都通过同一路径处理
- [ ] 确保 confirmation_request 解析后生成标准 `ConfirmationRequestUpdate` 并通过 ACP `session/update` 通知 Client
- [ ] 实现 `tool/confirm` 响应处理：Client 回传确认/拒绝后，通过 stdin 写入 CLI 的结构化控制响应
- [ ] 确保拒绝响应不阻塞 CLI 进程（CLI 应继续执行后续逻辑）

### 2.2 重构 ACP Server 的 tool/confirm 分发

- [ ] 确保 `tool/confirm` 方法正确路由到对应 session 的 ClaudeCodeWrapper
- [ ] 添加 toolCallId 校验：拒绝已过期或不存在的 toolCallId
- [ ] 添加超时机制：10 分钟无响应自动拒绝，并通知 Client

### 2.3 清理 Server 端旧逻辑

- [ ] 移除 Server 端直接处理 y/n 的遗留逻辑（如果存在）
- [ ] 移除与链路 A 重复的事件发射逻辑

### 2.4 补充测试

- [ ] 编写 confirmTool 单元测试：覆盖 approve/deny/timeout 三种场景
- [ ] 编写 tool/confirm RPC 方法测试：覆盖正常确认、拒绝、无效 toolCallId

## 3. 验收标准

| # | 验收项 | 验证方式 |
|---|--------|----------|
| 1 | 所有工具类型的 confirmation_request 统一通过 `session/update` 通知发送 | 日志验证 + 单元测试 |
| 2 | `tool/confirm` RPC 正确接收 Client 响应并写入 CLI stdin | 集成测试 |
| 3 | 拒绝操作后 CLI 不阻塞，会话可继续交互 | 手动测试 |
| 4 | 超时（10min）后自动拒绝并发送通知 | 单元测试 |
| 5 | 无效 toolCallId 返回明确错误 | 单元测试 |
| 6 | `pnpm build` 和 `pnpm test` 通过 | CI |

## 4. 边界条件

| 场景 | 预期行为 |
|------|----------|
| CLI 同时发出多个 confirmation_request | 每个独立通知、独立确认，互不阻塞 |
| Client 对同一 toolCallId 重复确认 | 第二次忽略，返回成功（幂等） |
| 确认/拒绝时 CLI 进程已退出 | 记录警告日志，不报错 |
| `bypassPermissions` 模式 | Server 端自动批准，不转发给 Client |
| `plan` 模式下的工具调用 | 按 plan 模式规则处理（仅展示计划，不执行） |

## 5. 风险

| 风险 | 影响 | 应对 |
|------|------|------|
| CLI stdin 写入格式不正确 | CLI 无法解析响应，会话卡死 | 参考 CLI 文档确认控制响应格式 |
| 并发 confirmation 导致 stdin 写入交错 | CLI 解析错乱 | 使用写入队列，确保单次完整写入 |

## 6. 关键文件

- `packages/server/src/claude/wrapper.ts` — 主要重构文件
- `packages/server/src/acp/server.ts` — tool/confirm 分发
- `packages/shared/src/protocol.ts` — ConfirmationRequestUpdate 类型
- `tests/` — 新增测试用例
