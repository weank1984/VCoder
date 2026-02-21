# VCoder 开发任务清单

> 基于 [PRD-LONG-TERM.md](../PRD-LONG-TERM.md) 第 14 节拆解，每个任务约 1 天工作量。

## 任务总览

### P0 — 统一权限链路（3 tasks, ~3 days）

| Task | 名称 | 前置依赖 | 关键文件 |
|------|------|----------|----------|
| [TASK-01](TASK-01-permission-audit-and-design.md) | 权限链路现状审计与统一方案设计 | 无 | protocol.ts, wrapper.ts, permissionProvider.ts |
| [TASK-02](TASK-02-server-permission-unify.md) | Server 端权限转发统一为结构化路径 | TASK-01 | wrapper.ts, server.ts |
| [TASK-03](TASK-03-extension-permission-unify.md) | Extension 端权限处理统一与拒绝恢复 | TASK-02 | extension.ts, permissionProvider.ts, chatViewProvider.ts |

### P0 — 权限规则协议闭环（2 tasks, ~2 days）

| Task | 名称 | 前置依赖 | 关键文件 |
|------|------|----------|----------|
| [TASK-04](TASK-04-permission-rules-server.md) | Server 端实现 permissionRules RPC 方法 | TASK-02 | server.ts, client.ts, sessionStore.ts |
| [TASK-05](TASK-05-permission-rules-webview-ui.md) | Webview 权限规则管理 UI | TASK-04 | Webview React 组件, Store |

### P0 — 持久会话端到端接线（3 tasks, ~3 days）

| Task | 名称 | 前置依赖 | 关键文件 |
|------|------|----------|----------|
| [TASK-06](TASK-06-persistent-session-client-wiring.md) | Client/Webview 持久会话发送路径接线 | TASK-03 | client.ts, chatViewProvider.ts |
| [TASK-07](TASK-07-persistent-session-multiturn.md) | 持久会话多轮续聊与模式状态管理 | TASK-06 | persistentSession.ts, wrapper.ts |
| [TASK-08](TASK-08-persistent-session-recovery.md) | 持久会话恢复与资源清理 | TASK-07 | persistentSession.ts, wrapper.ts, extension.ts |

### P1 — Diff 审阅闭环（2 tasks, ~2 days）

| Task | 名称 | 前置依赖 | 关键文件 |
|------|------|----------|----------|
| [TASK-09](TASK-09-diff-review-main-flow.md) | Diff 审阅主流程接入 | TASK-03 | diffManager.ts, chatViewProvider.ts |
| [TASK-10](TASK-10-diff-review-sync-fallback.md) | Diff 审阅状态同步与降级策略 | TASK-09 | diffManager.ts, fileDecorationProvider.ts |

### P1 — 协议事件类型收敛（1 task, ~1 day）

| Task | 名称 | 前置依赖 | 关键文件 |
|------|------|----------|----------|
| [TASK-11](TASK-11-protocol-event-convergence.md) | 协议事件类型收敛对齐 | TASK-02 | protocol.ts, server.ts, client.ts |

### P1 — 审计日志闭环（2 tasks, ~2 days）

| Task | 名称 | 前置依赖 | 关键文件 |
|------|------|----------|----------|
| [TASK-12](TASK-12-audit-log-tool-file.md) | 审计日志 — 工具调用与文件变更集成 | TASK-09 | auditLogger.ts, chatViewProvider.ts |
| [TASK-13](TASK-13-audit-log-session-error.md) | 审计日志 — 会话生命周期与错误审计 | TASK-12 | auditLogger.ts, client.ts, wrapper.ts |

## 依赖关系图

```
TASK-01 ──→ TASK-02 ──→ TASK-03 ──→ TASK-06 ──→ TASK-07 ──→ TASK-08
                │                       │
                ├──→ TASK-04 ──→ TASK-05│
                │                       │
                └──→ TASK-11            └──→ TASK-09 ──→ TASK-10
                                                │
                                                └──→ TASK-12 ──→ TASK-13
```

## 执行建议

1. **关键路径**：TASK-01 → 02 → 03 → 06 → 07 → 08（8 天，权限 + 持久会话主线）
2. **可并行**：TASK-04/05（权限规则）可在 TASK-02 完成后与 TASK-03 并行
3. **可并行**：TASK-11（协议收敛）可在 TASK-02 完成后与 TASK-03 并行
4. **可并行**：TASK-09/10（Diff 审阅）可在 TASK-03 完成后与 TASK-06 并行
5. **最短路径**（有 2 人）：约 8-9 天完成全部 P0+P1

## 统计

- **总任务数**：13
- **P0 任务**：8（TASK-01 ~ TASK-08）
- **P1 任务**：5（TASK-09 ~ TASK-13）
- **总预估工时**：13 天
