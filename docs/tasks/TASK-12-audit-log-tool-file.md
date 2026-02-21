# TASK-12: 审计日志 — 工具调用与文件变更集成

## 基本信息

- 优先级：P1
- 预估工时：1 day
- 所属需求：PRD 14.2 — 审计日志闭环
- 关联 FR：NFR-004, FR-402, FR-403
- 前置依赖：TASK-09（Diff 审阅接入后可获取文件变更事件）
- 后续任务：TASK-13

## 1. 任务目标

扩展 AuditLogger 的集成覆盖面，将工具调用事件和文件变更事件纳入审计日志，实现关键操作的完整审计轨迹。

## 2. 背景

当前状态：
- `AuditLogger` 功能完善（JSONL 格式、日志轮转、敏感数据脱敏、查询导出）
- 已集成：用户输入（`logUserPrompt`）、权限决策（`logPermission`）
- 未集成：工具调用（`logToolCall`）、文件操作（`logFileOperation`）、终端命令（`logTerminalCommand`）

## 3. 具体工作内容

### 3.1 工具调用审计集成

- [ ] 在 `session/update` 处理中，检测 `tool_use` 类型事件
- [ ] 调用 `auditLogger.logToolCall()` 记录：
  - sessionId
  - toolName（如 Read, Write, Bash, Grep, Glob 等）
  - input（工具参数，经脱敏处理）
  - 时间戳
- [ ] 在 `tool_result` 事件到达时，补充记录：
  - result（工具返回值摘要，截断到 1000 字符）
  - error（如果有）
  - durationMs（tool_use → tool_result 时间差）

### 3.2 文件变更审计集成

- [ ] 在 `file_change` 事件处理时调用 `auditLogger.logFileOperation()` 记录：
  - sessionId
  - filePath
  - operation（create/modify/delete）
  - size（文件大小）
  - diffHash（变更内容的 SHA256 摘要）
- [ ] 在 Diff 审阅完成后补充记录用户决策：
  - accepted/rejected
  - 决策时间

### 3.3 终端命令审计集成

- [ ] 在 `terminal/create` 请求处理时记录：
  - command
  - cwd（工作目录）
- [ ] 在终端输出完成后补充记录：
  - exitCode
  - outputLength（输出长度，不记录完整输出以节省空间）
  - durationMs

### 3.4 脱敏增强

- [ ] 工具参数中的文件路径：保留相对路径，替换用户主目录
- [ ] Bash 命令中的环境变量值：脱敏（如 `API_KEY=sk-xxx...` → `API_KEY=[REDACTED]`）
- [ ] 文件内容：不记录完整内容，仅记录 hash 和大小

### 3.5 日志关联

- [ ] 每个 tool_use 的审计记录包含 `toolCallId`，与 tool_result 关联
- [ ] 文件变更的审计记录包含触发它的 `toolCallId`（如 Write 工具导致的 file_change）
- [ ] 支持按 `toolCallId` 查询完整操作链（工具调用 → 文件变更 → 用户决策）

## 4. 验收标准

| # | 验收项 | 验证方式 |
|---|--------|----------|
| 1 | 每次工具调用（tool_use）生成审计记录 | 检查 JSONL 日志文件 |
| 2 | 工具结果（tool_result）补充到对应记录 | 检查日志 toolCallId 关联 |
| 3 | 文件变更（create/modify/delete）生成审计记录 | 检查 JSONL |
| 4 | Diff 审阅决策（accept/reject）记录到日志 | 检查 JSONL |
| 5 | 终端命令执行生成审计记录 | 检查 JSONL |
| 6 | 敏感信息正确脱敏 | 检查日志中无 API key 等明文 |
| 7 | 可按 toolCallId 查询完整操作链 | 调用 auditLogger.query() 验证 |
| 8 | `pnpm build` 和 `pnpm test` 通过 | CI |

## 5. 边界条件

| 场景 | 预期行为 |
|------|----------|
| 工具调用失败（无 tool_result） | 标记为 error，记录超时或异常信息 |
| 极长的工具参数/结果 | 截断到 1000 字符并标记 [truncated] |
| 高频工具调用（如循环中多次 Read） | 正常记录，依赖 AuditLogger 的异步队列处理 |
| 日志文件达到轮转阈值（10MB） | 自动轮转，不丢失记录 |
| AuditLogger 写入失败 | 记录错误到 console，不影响主流程 |

## 6. 风险

| 风险 | 影响 | 应对 |
|------|------|------|
| 审计记录量大导致磁盘增长快 | 空间占用 | 依赖现有轮转机制（10MB * 5 = 50MB 上限） |
| 审计写入延迟影响主流程性能 | UI 卡顿 | AuditLogger 已为异步写入，验证无阻塞 |

## 7. 关键文件

- `packages/extension/src/services/auditLogger.ts` — 审计日志核心（已实现，本任务为集成）
- `packages/extension/src/providers/chatViewProvider.ts` — tool_use/tool_result/file_change 事件处理
- `packages/extension/src/services/diffManager.ts` — Accept/Reject 决策点
- `packages/extension/src/acp/client.ts` — terminal 事件处理
