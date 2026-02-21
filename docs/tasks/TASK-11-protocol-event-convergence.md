# TASK-11: 协议事件类型收敛对齐

## 基本信息

- 优先级：P1
- 预估工时：1 day
- 所属需求：PRD 14.2 — 协议事件类型收敛
- 关联 FR：NFR-005
- 前置依赖：TASK-02（Server 端重构完成，避免冲突）
- 后续任务：TASK-12

## 1. 任务目标

全面对齐 `protocol.ts` 中的事件类型定义与 Server 端实际发送的事件，消除未声明的事件类型，确保协议定义与实现严格一致。

## 2. 背景

已知问题：
- Server 端发送 `session_switch` 事件（`packages/server/src/acp/server.ts`），但 `UpdateType` 枚举中未声明该类型
- 可能存在其他类似的不一致（Server 发送的事件类型在协议定义中缺失，或协议定义了但未使用的类型）

## 3. 具体工作内容

### 3.1 审计所有事件类型

- [ ] 从 `protocol.ts` 中提取所有已声明的 `UpdateType` 枚举值
- [ ] 从 Server 代码中搜索所有 `session/update` 通知的发送点，提取实际发送的 type 值
- [ ] 从 Client/Webview 代码中搜索所有 `session/update` 的处理点，提取实际处理的 type 值
- [ ] 生成三端对照表：

| type 值 | protocol.ts 声明 | Server 发送 | Client/Webview 处理 | 状态 |
|---------|-----------------|------------|-------------------|------|
| text | Yes | Yes | Yes | OK |
| thinking | Yes | Yes | Yes | OK |
| session_switch | No | Yes | ? | 缺声明 |
| ... | | | | |

### 3.2 补充缺失的声明

- [ ] 将 Server 实际发送但协议未声明的事件类型添加到 `UpdateType`
- [ ] 为每个新增类型定义对应的 payload 接口
- [ ] 更新 `SessionUpdate` 联合类型

### 3.3 移除废弃类型

- [ ] 协议声明了但 Server 未发送、Client 未处理的类型，标记为 deprecated
- [ ] 添加 `@deprecated` JSDoc 注释，说明移除计划
- [ ] 不在本次任务中直接删除（留兼容窗口期）

### 3.4 统一事件命名规范

- [ ] 确认命名风格一致：snake_case（如 `file_change`、`tool_use`）
- [ ] 如存在混合命名（如 camelCase），统一迁移到 snake_case
- [ ] 旧名称添加别名映射（兼容期）

### 3.5 Client 端处理补全

- [ ] 对照表中 "Server 发送但 Client 未处理" 的类型，补充 Client 端处理逻辑
- [ ] 至少添加日志记录（`Unknown update type: xxx`）
- [ ] 关键事件（如 session_switch）添加完整处理逻辑

### 3.6 测试与文档

- [ ] 编写协议一致性测试：验证 UpdateType 枚举值与 Server 发送的类型集合一致
- [ ] 更新协议文档（如有）

## 4. 验收标准

| # | 验收项 | 验证方式 |
|---|--------|----------|
| 1 | Server 发送的所有事件类型在 `UpdateType` 中有声明 | 代码审查 + 静态检查 |
| 2 | 每个 UpdateType 值有对应的 payload 接口定义 | 代码审查 |
| 3 | Client 端处理所有已声明的事件类型（至少 log） | 代码审查 |
| 4 | 不存在 Server 发送未声明类型的情况 | 协议一致性测试 |
| 5 | 废弃类型标记 @deprecated | 代码审查 |
| 6 | 命名规范统一为 snake_case | 代码审查 |
| 7 | `pnpm build` 和 `pnpm test` 通过 | CI |

## 5. 边界条件

| 场景 | 预期行为 |
|------|----------|
| Client 收到未知事件类型 | 记录警告日志，不崩溃 |
| 旧版 Server 发送已废弃类型 | Client 正常处理（兼容期内） |
| 新增事件类型但 Webview 未更新 | Webview 侧添加 fallback 处理 |

## 6. 风险

| 风险 | 影响 | 应对 |
|------|------|------|
| 重命名事件类型导致兼容性问题 | 旧版 Client 无法处理新类型 | 添加别名映射，旧名称在兼容期内仍可用 |
| 审计遗漏某些动态生成的事件类型 | 不一致未完全消除 | 在 Server 发送层添加类型校验（运行时断言） |

## 7. 关键文件

- `packages/shared/src/protocol.ts` — 核心修改文件
- `packages/server/src/acp/server.ts` — 事件发送点
- `packages/server/src/claude/wrapper.ts` — 事件发送点
- `packages/server/src/claude/persistentSession.ts` — 事件发送点
- `apps/vscode-extension/src/acp/client.ts` — 事件接收处理
- `apps/vscode-extension/src/providers/chatViewProvider.ts` — Webview 事件分发
