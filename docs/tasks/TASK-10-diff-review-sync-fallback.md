# TASK-10: Diff 审阅状态同步与降级策略

## 基本信息

- 优先级：P1
- 预估工时：1 day
- 所属需求：PRD 14.2 — Diff 审阅闭环接线
- 关联 FR：FR-401, FR-403
- 前置依赖：TASK-09（Diff 主流程接入）
- 后续任务：TASK-11

## 1. 任务目标

完善 Diff 审阅的状态同步机制（多视图一致性、会话切换保持），实现大文件/二进制文件的降级策略，确保 Diff 审阅在各种场景下稳定可用。

## 2. 具体工作内容

### 2.1 状态同步

- [ ] 建立 pending file changes 状态管理：
  ```typescript
  interface PendingFileChange {
    id: string;               // file_change 事件 ID
    sessionId: string;
    filePath: string;
    type: 'created' | 'modified' | 'deleted';
    status: 'pending' | 'accepted' | 'rejected';
    content?: string;         // proposed 内容
    diff?: string;            // diff 文本
    timestamp: number;
  }
  ```
- [ ] Webview 聊天流中的文件变更卡片与 VSCode Diff 视图状态双向同步：
  - Diff 视图中 Accept → Webview 卡片更新为 "Accepted"
  - Webview 卡片中 Accept → Diff 视图自动关闭
- [ ] 会话切换时 pending changes 状态保持（不丢失）
- [ ] 会话删除时清理对应 pending changes

### 2.2 冲突检测

- [ ] Diff 视图打开期间，监听文件的 `onDidChangeTextDocument` 事件
- [ ] 检测到外部修改 → 提示用户：
  - "文件在审阅期间被修改，请选择：使用原始基线重新比较 / 取消审阅"
- [ ] Accept 操作执行前再次检查文件 mtime，如已变化则提示冲突

### 2.3 大文件降级

- [ ] 文件大小检查（阈值：1MB）：
  - < 1MB → 正常 Diff 视图
  - 1MB - 10MB → 提示用户"文件较大，是否打开 Diff 视图？"（带预估加载时间）
  - \> 10MB → 仅展示变更摘要（行数变化、文件大小），不打开 Diff 视图，提供"强制查看"按钮
- [ ] 二进制文件（图片、编译产物等）→ 不展示 Diff，仅显示"二进制文件变更"并提供 Accept/Reject

### 2.4 错误恢复

- [ ] DiffManager 操作失败（如文件被锁定、磁盘空间不足）时的处理：
  - 显示明确错误信息
  - 允许用户重试
  - 提供"跳过 Diff 直接写入"选项（需二次确认）
- [ ] vcoder-diff:// 内容提供者失败时的兜底
- [ ] Diff 视图相关资源在会话结束时正确释放

### 2.5 审阅统计

- [ ] 每轮 CLI 响应结束后，在 Webview 中展示审阅摘要：
  - X 个文件待审阅
  - Y 个文件已接受
  - Z 个文件已拒绝
- [ ] 提供 "全部接受" / "全部拒绝" 快捷操作

## 3. 验收标准

| # | 验收项 | 验证方式 |
|---|--------|----------|
| 1 | Diff 视图操作后 Webview 卡片状态同步更新 | 手动测试 |
| 2 | Webview 卡片操作后 Diff 视图正确关闭 | 手动测试 |
| 3 | 会话切换后 pending changes 状态保持 | 手动测试 |
| 4 | 大文件（> 1MB）展示降级提示 | 手动模拟 |
| 5 | 二进制文件展示"二进制变更"而非 Diff | 手动模拟 |
| 6 | 文件冲突时给出明确提示 | 手动编辑文件后验证 |
| 7 | 审阅摘要正确展示统计数据 | 手动测试 |
| 8 | `pnpm build` 和 `pnpm test` 通过 | CI |

## 4. 边界条件

| 场景 | 预期行为 |
|------|----------|
| Accept 时磁盘空间不足 | 错误提示，文件不被修改 |
| 多个 Diff 视图同时打开 | 各自独立，不相互影响 |
| Webview 被关闭再打开 | pending changes 从状态恢复 |
| 超长 diff（10000+ 行） | Diff 视图正常显示（VSCode 原生处理），Webview 摘要截断 |
| 文件路径包含特殊字符 | URI 编码正确处理 |

## 5. 风险

| 风险 | 影响 | 应对 |
|------|------|------|
| vcoder-diff:// 内容缓存导致内存增长 | 长会话内存泄漏 | 会话结束或变更完成后清理缓存 |
| VSCode Diff 编辑器 API 限制 | 某些操作无法实现 | 降级为 Webview 内展示简化 Diff |

## 6. 关键文件

- `apps/vscode-extension/src/services/diffManager.ts` — 核心逻辑扩展
- `apps/vscode-extension/src/providers/fileDecorationProvider.ts` — 状态标记
- `apps/vscode-extension/src/providers/chatViewProvider.ts` — 状态同步
- Webview React 组件 — 文件变更卡片、审阅摘要
- Webview Store — pendingFileChanges slice
