# TASK-05: Webview 权限规则管理 UI

## 基本信息

- 优先级：P0
- 预估工时：1 day
- 所属需求：PRD 14.2 — 打通权限规则协议闭环
- 关联 FR：FR-302, FR-303
- 前置依赖：TASK-04（Server 端 permissionRules 实现）
- 后续任务：TASK-06

## 1. 任务目标

在 Webview 中实现权限规则管理面板，用户可以查看、添加、编辑、删除权限规则，通过标准 ACP RPC 与后端交互。

## 2. 具体工作内容

### 2.1 规则列表视图

- [ ] 新增 "Permission Rules" 面板（可从设置或侧栏入口打开）
- [ ] 以表格/列表形式展示所有规则：
  - 类型图标（bash/file_write/mcp 等）
  - 匹配模式（pattern）
  - 决策（allow/deny，用颜色区分）
  - 作用域（session/global）
  - 创建时间
  - 过期状态
- [ ] 支持按类型筛选
- [ ] 过期规则灰显，标记 "Expired"

### 2.2 添加规则

- [ ] 提供 "Add Rule" 按钮，打开表单：
  - 类型选择（下拉：bash/file_write/file_delete/mcp/dangerous）
  - 匹配模式（输入框，支持 glob 语法提示）
  - 决策选择（allow/deny）
  - 作用域选择（session/global）
  - 可选过期时间
- [ ] 提交后调用 `permissionRules/add` RPC
- [ ] 成功后刷新列表

### 2.3 删除规则

- [ ] 每条规则提供删除按钮
- [ ] 确认对话框（"确定删除此规则？"）
- [ ] 调用 `permissionRules/remove` RPC
- [ ] 成功后刷新列表

### 2.4 快捷操作集成

- [ ] 在审批卡片的 "Trust Always" 操作后，自动在规则列表中添加对应规则
- [ ] 规则列表中可直接跳转查看该规则

### 2.5 状态管理

- [ ] 使用 Zustand store 管理规则列表状态
- [ ] 面板打开时自动加载规则（`permissionRules/list`）
- [ ] 规则变更后自动刷新

## 3. 验收标准

| # | 验收项 | 验证方式 |
|---|--------|----------|
| 1 | 规则列表正确展示所有已保存规则 | 手动测试 |
| 2 | 可成功添加新规则，列表实时更新 | 手动测试 |
| 3 | 可成功删除规则，列表实时更新 | 手动测试 |
| 4 | 审批卡片 "Trust Always" 后规则出现在列表中 | 手动测试 |
| 5 | 过期规则正确标记灰显 | 手动测试 |
| 6 | UI 样式与现有 Webview 设计语言一致 | 视觉检查 |
| 7 | `pnpm build` 通过 | CI |

## 4. 边界条件

| 场景 | 预期行为 |
|------|----------|
| 无规则时 | 显示空状态提示 "暂无权限规则" |
| 规则数量 > 50 | 列表可滚动，性能无明显卡顿 |
| 网络/RPC 调用失败 | 显示错误提示，不影响其他操作 |
| 添加无效 pattern | 表单验证提示，不提交 |
| 快速连续添加/删除 | 防抖处理，避免竞态 |

## 5. UI 设计参考

```
┌─ Permission Rules ─────────────────────────────┐
│ [+ Add Rule]                    Filter: [All ▼] │
│                                                  │
│ ┌──────────────────────────────────────────────┐│
│ │ 🔧 bash  | rm -rf *   | ❌ deny  | global  ││
│ │          | 2026-02-20 |          | [Delete] ││
│ ├──────────────────────────────────────────────┤│
│ │ 📄 file  | src/**     | ✅ allow | session  ││
│ │          | 2026-02-21 |          | [Delete] ││
│ ├──────────────────────────────────────────────┤│
│ │ 🔧 bash  | npm test   | ✅ allow | global   ││
│ │          | 2026-02-19 | Expired  | [Delete] ││
│ └──────────────────────────────────────────────┘│
└──────────────────────────────────────────────────┘
```

## 6. 风险

| 风险 | 影响 | 应对 |
|------|------|------|
| Webview ↔ Extension 消息延迟 | 操作后列表更新慢 | 乐观更新 + 后台同步 |
| 用户添加过宽泛的 allow 规则 | 安全风险（如 `*` allow bash） | 添加危险模式警告 |

## 7. 关键文件

- Webview React 组件目录 — 新增 PermissionRulesPanel 组件
- Webview Store — 新增 permissionRulesSlice
- `apps/vscode-extension/src/providers/chatViewProvider.ts` — 消息转发
- `packages/shared/src/protocol.ts` — RPC 类型引用
