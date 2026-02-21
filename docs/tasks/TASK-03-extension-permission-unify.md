# TASK-03: Extension 端权限处理统一与拒绝恢复

## 基本信息

- 优先级：P0
- 预估工时：1 day
- 所属需求：PRD 14.2 — 统一权限链路为单一路径
- 关联 FR：FR-302, FR-304
- 前置依赖：TASK-02（Server 端统一完成）
- 后续任务：TASK-04

## 1. 任务目标

重构 Extension 端权限处理，废弃链路 A（session/requestPermission 直接弹窗），统一由 Webview 内 UI 处理所有审批请求。实现拒绝恢复机制，确保拒绝操作后会话不卡死。

## 2. 具体工作内容

### 2.1 废弃 Extension 端 session/requestPermission 处理

- [ ] 移除或禁用 `extension.ts` 中注册的 `session/requestPermission` handler
- [ ] 移除 `permissionProvider.ts` 中依赖 VSCode 原生弹窗（showInformationMessage）的审批逻辑
- [ ] 保留 `permissionProvider.ts` 中的权限规则匹配逻辑（供 Webview 调用）

### 2.2 Webview 审批 UI 对接

- [ ] 确保 Webview 正确接收 `session/update` 中的 `confirmation_request` 类型
- [ ] Webview 收到审批请求后，在聊天流中内联展示审批卡片（工具名、参数摘要、风险等级）
- [ ] 用户点击 Approve/Reject 后，Webview 通过 `tool/confirm` RPC 发送决策
- [ ] 支持 "Trust Always" 选项，将规则写入 SessionStore

### 2.3 拒绝恢复机制

- [ ] 拒绝后 Webview 显示 "操作已拒绝" 状态，而非空白等待
- [ ] 拒绝后用户可继续输入新消息（会话不阻塞）
- [ ] 拒绝信息记录到审计日志

### 2.4 去重保护

- [ ] Webview 端维护 pending confirmation 集合，同一 toolCallId 只展示一次
- [ ] 如果收到已处理的 toolCallId 的重复请求，静默忽略

### 2.5 兼容过渡

- [ ] 添加配置项 `vcoder.legacyPermissionPopup`（默认 false），允许用户暂时回退到旧弹窗模式
- [ ] 在下一个版本中移除该配置项

## 3. 验收标准

| # | 验收项 | 验证方式 |
|---|--------|----------|
| 1 | 所有工具审批在 Webview 聊天流内展示，不再弹出 VSCode 原生弹窗 | 手动测试 |
| 2 | Approve 后 CLI 正确执行工具 | 手动测试 |
| 3 | Reject 后 UI 显示拒绝状态，用户可继续输入 | 手动测试 |
| 4 | "Trust Always" 后同类工具不再弹出审批 | 手动测试 |
| 5 | 同一 toolCallId 不出现重复审批卡片 | 手动测试 |
| 6 | `pnpm build` 和 `pnpm test` 通过 | CI |

## 4. 边界条件

| 场景 | 预期行为 |
|------|----------|
| Webview 未初始化时收到审批请求 | 缓存请求，Webview 就绪后展示 |
| 用户切换会话期间有 pending 审批 | 切换回原会话时仍可见并可操作 |
| 多个审批请求同时到达 | 按到达顺序排队展示，每个独立处理 |
| 拒绝后 CLI 发送错误事件 | Webview 正确展示错误信息 |
| legacyPermissionPopup=true | 回退到 VSCode 原生弹窗（兼容期） |

## 5. 风险

| 风险 | 影响 | 应对 |
|------|------|------|
| 废弃链路 A 后部分边缘场景未覆盖 | 某些审批请求被丢弃 | 添加兜底日志，监控未处理的 confirmation_request |
| Webview 未加载时审批请求丢失 | 用户无法看到审批 | 实现请求缓存队列 |

## 6. 关键文件

- `packages/extension/src/extension.ts` — 移除 requestPermission 注册
- `packages/extension/src/services/permissionProvider.ts` — 重构
- `packages/extension/src/providers/chatViewProvider.ts` — Webview 消息分发
- Webview React 组件（审批卡片）
- `packages/extension/src/services/sessionStore.ts` — Trust Always 规则存储
