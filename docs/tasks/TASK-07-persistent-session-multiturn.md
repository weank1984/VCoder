# TASK-07: 持久会话多轮续聊与模式状态管理

## 基本信息

- 优先级：P0
- 预估工时：1 day
- 所属需求：PRD 14.2 — 持久会话模式端到端接线
- 关联 FR：FR-102, FR-103
- 前置依赖：TASK-06（Client 端持久会话接线）
- 后续任务：TASK-08

## 1. 任务目标

确保持久会话模式下多轮对话稳定续聊，正确使用 `--resume/--continue` 参数，并实现完整的模式状态查询与管理。

## 2. 具体工作内容

### 2.1 多轮续聊稳定性

- [ ] 确认 PersistentSession 在多轮对话时正确维护 CLI 进程状态
- [ ] 第二轮及后续消息发送时，确认使用同一 stdin 通道（不重新 spawn）
- [ ] 处理 CLI 的 `result` 事件后，确认 PersistentSession 进入"等待下一轮输入"状态
- [ ] 验证 CLI 端上下文（文件修改、工具调用历史）在多轮间正确保留

### 2.2 --resume/--continue 正确使用

- [ ] 首轮：创建新 PersistentSession，获取 CLI 返回的 `session_id`
- [ ] 后续轮：如果 PersistentSession 仍活跃，直接通过 stdin 发送（不需要 --resume）
- [ ] 如果 PersistentSession 异常退出后重建，使用 `--resume <session_id>` 恢复上下文
- [ ] 验证 `--continue` 参数行为（续接最后一个会话），确定是否需要在特定场景使用

### 2.3 模式状态管理

- [ ] `session/modeStatus` 返回准确状态：
  ```typescript
  {
    mode: 'persistent' | 'one-shot';
    sessionId: string;
    cliSessionId?: string;      // CLI 端的会话 ID
    processAlive: boolean;       // CLI 进程是否存活
    messageCount: number;        // 当前会话的消息轮次
  }
  ```
- [ ] 模式状态变化时主动推送 `session/update` 通知（如进程退出）
- [ ] Webview 状态栏显示当前模式与健康状态

### 2.4 会话标题与元数据

- [ ] 持久会话的标题从第一轮消息自动生成
- [ ] 多轮续聊时标题不重复更新（除非用户手动修改）
- [ ] 记录每轮的 token usage（从 `session/complete` 事件累加）

### 2.5 测试

- [ ] 多轮对话测试：连续 3+ 轮，验证上下文保持
- [ ] 续聊测试：PersistentSession 重建后 --resume 能恢复上下文
- [ ] 并发测试：两个会话同时处于持久模式，互不干扰

## 3. 验收标准

| # | 验收项 | 验证方式 |
|---|--------|----------|
| 1 | 持久模式下连续 3 轮对话，CLI 保持上下文 | 手动测试（问"之前说了什么"验证） |
| 2 | PersistentSession 重建后 --resume 恢复上下文 | 手动测试 |
| 3 | `session/modeStatus` 返回准确的 mode/processAlive 信息 | 单元测试 + 手动验证 |
| 4 | CLI 进程退出时 UI 收到状态通知 | 手动模拟 |
| 5 | 两个会话同时持久模式互不干扰 | 手动测试 |
| 6 | token usage 多轮累加展示 | 手动验证 |
| 7 | `pnpm build` 和 `pnpm test` 通过 | CI |

## 4. 边界条件

| 场景 | 预期行为 |
|------|----------|
| CLI 进程在等待输入时被 kill | 检测退出，通知 UI，自动切回一次性模式 |
| 发送消息时 CLI 仍在处理上一轮 | 排队等待，UI 显示"等待上一轮完成" |
| 消息包含附件（图片等） | 附件正确传递给 PersistentSession |
| --resume 的 session_id 无效（CLI 历史被清理） | 降级为新会话，通知用户 |
| 非常长的多轮对话（20+ 轮） | CLI 的 context window 管理由 CLI 自身处理，无需额外干预 |

## 5. 风险

| 风险 | 影响 | 应对 |
|------|------|------|
| CLI stdin 协议在多轮时行为不一致 | 消息发送失败或格式错乱 | 严格遵循 stream-json 输入格式，添加 NDJSON 验证 |
| 长会话 CLI 进程内存增长 | 性能下降 | 监控并在 UI 展示内存/轮次信息 |

## 6. 关键文件

- `packages/server/src/claude/persistentSession.ts` — 多轮逻辑核心
- `packages/server/src/claude/wrapper.ts` — --resume/--continue 参数管理
- `packages/server/src/acp/server.ts` — modeStatus 方法实现
- `packages/shared/src/protocol.ts` — ModeStatus 类型定义
