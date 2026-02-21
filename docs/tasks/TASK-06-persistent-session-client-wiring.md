# TASK-06: Client/Webview 持久会话发送路径接线

## 基本信息

- 优先级：P0
- 预估工时：1 day
- 所属需求：PRD 14.2 — 持久会话模式端到端接线
- 关联 FR：FR-102, FR-103
- 前置依赖：TASK-03（权限统一完成，避免冲突）
- 后续任务：TASK-07

## 1. 任务目标

将 Client 端（ACPClient）和 Webview 的消息发送路径从 `session/prompt`（一次性 spawn）切换到 `session/promptPersistent`（持久会话），实现 UI 可切换一次性/持久模式。

## 2. 背景

当前状态：
- Server 端已实现 `session/promptPersistent`、`session/modeStatus`、`session/stopPersistent`
- `PersistentSession` 类可维持长连接 CLI 进程
- 但 Client 端（`apps/vscode-extension/src/acp/client.ts`）和 Webview 仍以 `session/prompt` 为主要发送路径
- 用户无法在 UI 中选择持久模式

## 3. 具体工作内容

### 3.1 ACPClient 持久会话接口对接

- [ ] 在 `ACPClient` 中新增/启用 `promptPersistent()` 方法，调用 `session/promptPersistent` RPC
- [ ] 新增 `getModeStatus()` 方法，调用 `session/modeStatus` 查询当前会话模式
- [ ] 新增 `stopPersistent()` 方法，调用 `session/stopPersistent` 停止持久会话
- [ ] 确保 `promptPersistent` 返回的流式事件与 `prompt` 格式一致，复用现有事件处理逻辑

### 3.2 Webview 模式切换 UI

- [ ] 在输入区域添加模式切换按钮/开关：
  - 一次性模式（One-shot）：每次消息独立 spawn CLI 进程
  - 持久模式（Persistent）：保持 CLI 进程，多轮对话在同一进程内
- [ ] 默认模式：持久模式（推荐，因为多轮对话更自然）
- [ ] 模式切换时调用 `session/modeStatus` 确认后端状态
- [ ] 切换为一次性模式时，如有活跃持久会话，先调用 `session/stopPersistent`

### 3.3 发送路径路由

- [ ] 在 ChatViewProvider 中根据当前模式选择发送路径：
  - 持久模式 → `acpClient.promptPersistent(sessionId, message, attachments)`
  - 一次性模式 → `acpClient.prompt(sessionId, message, settings)`
- [ ] 确保两种模式下的响应事件（text/thinking/tool_use/tool_result）渲染一致

### 3.4 状态同步

- [ ] Webview 打开时查询当前模式状态
- [ ] 模式状态变化时通知 Webview 更新 UI
- [ ] 持久会话断开时（CLI 进程退出）自动切换回一次性模式并通知用户

## 4. 验收标准

| # | 验收项 | 验证方式 |
|---|--------|----------|
| 1 | UI 显示模式切换控件，默认为持久模式 | 手动测试 |
| 2 | 持久模式下发送消息走 `session/promptPersistent` | 日志验证 |
| 3 | 一次性模式下发送消息走 `session/prompt` | 日志验证 |
| 4 | 两种模式下消息渲染一致 | 手动对比测试 |
| 5 | 模式切换时正确停止/启动持久会话 | 手动测试 |
| 6 | 持久会话异常退出后 UI 正确回退 | 手动模拟 |
| 7 | `pnpm build` 和 `pnpm test` 通过 | CI |

## 5. 边界条件

| 场景 | 预期行为 |
|------|----------|
| 第一次发送消息（无会话） | 自动创建会话，按默认模式发送 |
| 持久模式下切换会话 | 原持久会话暂停（不停止），新会话可独立建立持久连接 |
| 一次性模式下连续发送 | 每次独立 spawn，前一次不阻塞后一次 |
| Server 重启 | 持久会话丢失，检测后自动回退到一次性模式 |
| 网络 RPC 调用超时 | 显示错误提示，保持当前模式不变 |

## 6. 风险

| 风险 | 影响 | 应对 |
|------|------|------|
| promptPersistent 和 prompt 的事件格式不完全一致 | 渲染异常 | 在事件处理层做格式归一化 |
| 持久模式下 CLI 进程内存泄漏 | 长时间使用后性能下降 | 监控进程内存，超阈值提示用户重启 |

## 7. 关键文件

- `apps/vscode-extension/src/acp/client.ts` — 新增持久会话方法
- `apps/vscode-extension/src/providers/chatViewProvider.ts` — 发送路径路由
- Webview React 组件 — 模式切换 UI
- Webview Store — 会话模式状态
- `packages/server/src/acp/server.ts` — 确认 promptPersistent 分发逻辑
- `packages/server/src/claude/persistentSession.ts` — 确认 PersistentSession 行为
