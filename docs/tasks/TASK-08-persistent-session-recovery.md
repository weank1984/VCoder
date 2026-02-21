# TASK-08: 持久会话恢复与资源清理

## 基本信息

- 优先级：P0
- 预估工时：1 day
- 所属需求：PRD 14.2 — 持久会话模式端到端接线
- 关联 FR：FR-102, FR-103, FR-304
- 前置依赖：TASK-07（多轮续聊稳定）
- 后续任务：TASK-09

## 1. 任务目标

实现持久会话的健壮性保障：进程崩溃自动恢复、空闲会话清理、多会话资源管理，确保持久模式在实际使用中稳定可靠。

## 2. 具体工作内容

### 2.1 进程崩溃检测与恢复

- [ ] 监听 PersistentSession CLI 进程的 `exit`/`error`/`close` 事件
- [ ] 进程非正常退出时（exit code != 0）：
  1. 记录错误日志（exit code、stderr 输出、最后一次操作）
  2. 通知 Client（`session/update` type=`error`）
  3. 尝试自动恢复：使用 `--resume <cliSessionId>` 重新 spawn
  4. 恢复成功 → 通知用户"会话已自动恢复"
  5. 恢复失败 → 切换到一次性模式，通知用户
- [ ] 恢复重试策略：最多 2 次，间隔 2 秒，超过后放弃
- [ ] 恢复期间的新消息缓存到队列，恢复后自动发送

### 2.2 空闲会话清理

- [ ] 实现 idle timeout 机制：持久会话 30 分钟无消息 → 自动停止 CLI 进程释放资源
- [ ] 停止前发送 `session/update` 通知 Client（type=`mode_change`，从 persistent 切到 one-shot）
- [ ] 用户再次发送消息时自动重新建立持久会话
- [ ] 清理定时器在会话删除时正确销毁

### 2.3 多会话资源管理

- [ ] 限制同时活跃的持久会话数量（最大 3 个）
- [ ] 超出限制时，最久未使用的持久会话自动停止
- [ ] 提供全局资源视图：活跃持久会话列表 + 各自的资源占用（进程 PID、启动时间）
- [ ] `session/delete` 时确保对应的 PersistentSession 正确停止并释放

### 2.4 优雅关闭

- [ ] Extension deactivate 时，所有 PersistentSession 优雅关闭（SIGTERM → 等待 5s → SIGKILL）
- [ ] Server 进程退出时清理所有子进程
- [ ] 防止孤儿进程：定期检查已注册的 PID 是否仍存活

### 2.5 健康检查

- [ ] 定期（每 60s）检查 PersistentSession 进程存活性
- [ ] 进程假死检测：发送 ping 消息，5s 无响应视为假死
- [ ] 假死进程强制 kill 后按崩溃恢复流程处理

## 3. 验收标准

| # | 验收项 | 验证方式 |
|---|--------|----------|
| 1 | CLI 进程崩溃后自动恢复并通知用户 | 手动 kill CLI 进程验证 |
| 2 | 恢复失败后正确切换到一次性模式 | 删除 CLI 会话历史后模拟 |
| 3 | 30 分钟空闲后持久会话自动停止 | 加速计时器测试 |
| 4 | 超过 3 个持久会话时自动回收最久未用的 | 单元测试 |
| 5 | Extension 关闭后无孤儿 CLI 进程 | 手动验证（ps aux） |
| 6 | `pnpm build` 和 `pnpm test` 通过 | CI |

## 4. 边界条件

| 场景 | 预期行为 |
|------|----------|
| 恢复过程中用户发送新消息 | 消息缓存，恢复成功后自动发送 |
| 恢复期间用户切换会话 | 恢复继续进行（后台），切换不影响 |
| 空闲超时恰好在用户输入时触发 | 检测到用户输入取消超时 |
| Extension 被强制关闭（crash） | 依赖 OS 进程树清理；下次启动时检查并清理孤儿 |
| 同一会话连续崩溃 > 2 次 | 标记为 "unhealthy"，不再自动恢复，提示用户手动重试 |

## 5. 风险

| 风险 | 影响 | 应对 |
|------|------|------|
| --resume 恢复后上下文不完整 | 用户体验中断 | 恢复后提示用户可能需要重述上下文 |
| 孤儿进程残留 | 系统资源泄漏 | 启动时扫描并清理 `claude` 相关孤儿进程 |
| 健康检查 ping 消息干扰 CLI 正常流程 | CLI 输出异常 | 使用 CLI 支持的健康检查机制（如有），否则仅检查进程存活 |

## 6. 关键文件

- `packages/server/src/claude/persistentSession.ts` — 恢复/清理/健康检查核心
- `packages/server/src/claude/wrapper.ts` — 多会话管理
- `packages/server/src/acp/server.ts` — session/delete 与资源释放
- `packages/extension/src/extension.ts` — deactivate 清理
