# TASK-01: 权限链路现状审计与统一方案设计

## 基本信息

- 优先级：P0
- 预估工时：1 day
- 所属需求：PRD 14.2 — 统一权限链路为单一路径
- 关联 FR：FR-302, FR-304
- 前置依赖：无
- 后续任务：TASK-02, TASK-03

## 1. 任务目标

全面审计当前权限链路的双轨实现，输出统一权限数据流设计文档，作为 TASK-02/03 的实施基线。

## 2. 背景与问题

当前存在两条并行的权限审批链路：

1. **链路 A（Extension 端）**：`session/requestPermission` — Extension 直接拦截并弹出 VSCode 弹窗处理。
   - 位置：`apps/vscode-extension/src/extension.ts` + `apps/vscode-extension/src/services/permissionProvider.ts`
2. **链路 B（Server 端）**：`confirmation_request` → `tool/confirm` — Server 解析 CLI 的 confirmation_request 事件，转发给 Client。
   - 位置：`packages/server/src/claude/wrapper.ts` + `packages/server/src/acp/server.ts`

两条链路同时存在导致：
- 部分工具走链路 A，部分走链路 B，用户体验不一致
- 可能出现重复弹窗
- 拒绝后恢复行为不统一

## 3. 具体工作内容

### 3.1 审计现有链路

- [ ] 绘制链路 A 的完整调用链（从 CLI 事件 → Extension 拦截 → 用户决策 → 回传 CLI）
- [ ] 绘制链路 B 的完整调用链（从 CLI confirmation_request → Server 解析 → ACP 通知 → Webview 展示 → tool/confirm 回传）
- [ ] 列举所有工具类型（bash/file_write/file_delete/mcp/dangerous/plan）在两条链路中的实际走向
- [ ] 记录已知问题（重复弹窗、拒绝后卡死、超时行为）

### 3.2 设计统一方案

- [ ] 确定目标链路：推荐统一为链路 B（结构化 ACP 协议路径），理由：
  - 符合 PRD 要求的"结构化权限协议"
  - 支持 Webview 内审批 UI 定制
  - 可审计、可测试
- [ ] 定义统一数据流：`CLI confirmation_request → Server 解析 → session/update(confirmation_request) → Webview 展示 → tool/confirm → Server → CLI stdin`
- [ ] 定义拒绝恢复协议：拒绝后 CLI 应收到明确 deny response，不阻塞后续交互
- [ ] 定义去重策略：同一 toolCallId 只弹一次审批

### 3.3 输出设计文档

- [ ] 统一权限数据流图
- [ ] 各工具类型的审批行为矩阵
- [ ] 链路 A 废弃方案（渐进式，保留兼容期）
- [ ] 接口变更清单（涉及 protocol.ts、wrapper.ts、server.ts、permissionProvider.ts）

## 4. 验收标准

| # | 验收项 | 验证方式 |
|---|--------|----------|
| 1 | 输出统一权限数据流设计文档 | 文档评审 |
| 2 | 文档包含所有工具类型的审批行为矩阵 | 文档检查 |
| 3 | 文档包含拒绝恢复协议定义 | 文档检查 |
| 4 | 文档包含 protocol.ts 接口变更清单 | 文档检查 |
| 5 | 文档包含链路 A 的废弃迁移方案 | 文档检查 |

## 5. 边界条件

- 设计阶段不修改代码，仅输出文档
- 如果发现 CLI 端 confirmation_request 事件存在未文档化的行为，需记录为风险项
- 需确认 `bypassPermissions` 模式下是否完全跳过两条链路

## 6. 风险

| 风险 | 影响 | 应对 |
|------|------|------|
| CLI 版本不同，confirmation_request 格式差异 | 统一方案需额外适配 | 记录版本差异，设计兼容层 |
| 某些工具类型只能走链路 A | 统一方案不完整 | 识别并标记为例外，设计降级策略 |

## 7. 关键文件

- `packages/shared/src/protocol.ts` — 协议定义
- `packages/server/src/claude/wrapper.ts` — CLI 事件解析与 confirmation 处理
- `packages/server/src/acp/server.ts` — ACP Server 方法分发
- `apps/vscode-extension/src/services/permissionProvider.ts` — Extension 端权限处理
- `apps/vscode-extension/src/extension.ts` — Extension 入口与 requestPermission 注册
