# TASK-09: Diff 审阅主流程接入

## 基本信息

- 优先级：P1
- 预估工时：1 day
- 所属需求：PRD 14.2 — Diff 审阅闭环接线
- 关联 FR：FR-401, FR-402, FR-403
- 前置依赖：TASK-03（权限统一完成）
- 后续任务：TASK-10

## 1. 任务目标

将已实现的 DiffManager 接入主流程，使 CLI 的文件写入操作默认进入 Diff 审阅流程（Accept/Reject），而非直接落盘。

## 2. 背景

当前状态：
- Server 端已能发送 `file_change` 事件（FileChangeUpdate）
- `DiffManager` 已实现完整的 Diff 预览（vcoder-diff:// 协议、VSCode 并排对比）
- `FileDecorationProvider` 已能标记变更文件
- 但 DiffManager 未被主流程自动触发：用户需要手动操作才能查看 Diff

目标状态：
- CLI 写入文件时自动进入 Diff 审阅
- 用户在 VSCode Diff 视图中 Accept 或 Reject
- Accept 后内容落盘，Reject 后丢弃变更

## 3. 具体工作内容

### 3.1 主流程触发集成

- [ ] 在 ChatViewProvider 的 `session/update` 处理中，检测 `file_change` 类型事件
- [ ] 当 `file_change.proposed === true` 时，自动调用 `DiffManager.previewChange()`
- [ ] 调用后 VSCode 打开并排 Diff 视图
- [ ] 同时在 Webview 聊天流中显示文件变更通知卡片（文件路径、变更类型、行数变化）

### 3.2 Accept/Reject 流程

- [ ] Diff 视图顶部或 Webview 中提供 Accept/Reject 按钮
- [ ] Accept → 调用 `DiffManager.acceptChange()` → 内容写入磁盘 → 通知 Server（`acpClient.acceptFileChange`）
- [ ] Reject → 调用 `DiffManager.rejectChange()` → 丢弃变更 → 通知 Server（`acpClient.rejectFileChange`）
- [ ] 操作后关闭 Diff 视图，更新 Webview 中的文件变更状态

### 3.3 与权限链路协调

- [ ] Diff 审阅是 file_write 权限审批的后续步骤：
  1. CLI 请求写文件 → 权限审批（TASK-02/03）
  2. 权限通过后 CLI 生成内容 → `file_change` 事件
  3. `file_change.proposed=true` → Diff 审阅
  4. Accept → 落盘
- [ ] 如果权限模式是 `acceptEdits`，则跳过权限审批但仍进入 Diff 审阅
- [ ] 如果权限模式是 `bypassPermissions`，则跳过权限审批也跳过 Diff 审阅，直接落盘

### 3.4 文件装饰器集成

- [ ] `file_change` 事件到达时更新 `FileDecorationProvider`
- [ ] Accept 后移除 "proposed" 标记，显示 "modified" 标记
- [ ] Reject 后移除所有标记

### 3.5 多文件批量处理

- [ ] 单次 CLI 响应可能包含多个 `file_change`
- [ ] 按文件逐个打开 Diff 视图，或提供 "Accept All / Reject All" 批量操作
- [ ] 批量状态在 Webview 中汇总展示

## 4. 验收标准

| # | 验收项 | 验证方式 |
|---|--------|----------|
| 1 | CLI 写文件时自动弹出 VSCode Diff 视图 | 手动测试（要求 CLI 写文件） |
| 2 | Accept 后文件正确写入磁盘 | 检查文件内容 |
| 3 | Reject 后文件未被修改 | 检查文件内容 |
| 4 | Webview 中显示文件变更状态（待审阅/已接受/已拒绝） | 手动测试 |
| 5 | acceptEdits 模式：跳过权限审批但有 Diff 审阅 | 手动测试 |
| 6 | bypassPermissions 模式：直接落盘无 Diff | 手动测试 |
| 7 | 多个文件变更可批量 Accept All | 手动测试 |
| 8 | `pnpm build` 和 `pnpm test` 通过 | CI |

## 5. 边界条件

| 场景 | 预期行为 |
|------|----------|
| 文件不在 workspace 内 | 警告用户并拒绝操作（安全边界） |
| 新建文件（无 original） | Diff 视图左侧为空，右侧为新内容 |
| 删除文件 | Diff 视图左侧为原内容，右侧为空；Accept 后删除到回收站 |
| Diff 视图打开期间用户手动编辑文件 | 检测冲突，提示用户处理 |
| 同一文件在一次响应中多次变更 | 合并为最终版本展示 Diff |
| 用户关闭 Diff 视图未做选择 | 视为 pending，在 Webview 中仍可操作 |

## 6. 风险

| 风险 | 影响 | 应对 |
|------|------|------|
| 大文件 Diff 渲染慢 | UI 卡顿 | 超过 1MB 的文件提示用户确认是否查看 Diff |
| 频繁文件变更导致大量 Diff 弹窗 | 用户体验差 | 批量模式默认开启，累积后统一展示 |

## 7. 关键文件

- `apps/vscode-extension/src/services/diffManager.ts` — Diff 预览核心
- `apps/vscode-extension/src/providers/fileDecorationProvider.ts` — 文件标记
- `apps/vscode-extension/src/providers/chatViewProvider.ts` — session/update 处理
- `apps/vscode-extension/src/acp/client.ts` — acceptFileChange/rejectFileChange
- Webview React 组件 — 文件变更卡片
