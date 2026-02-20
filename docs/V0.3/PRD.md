# PRD：VCoder V0.3（协议收敛与发布稳定版）

## 0. 文档信息

- 版本：v0.3
- 日期：2026-02-20
- 目标读者：产品、研发、测试
- 对应技术方案：`docs/V0.3/TECH-SOLUTION.md`

## 1. 输入依据

### 1.1 规划文档输入

- `docs/V0.2/PRD.md`
- `docs/V0.2/TECH-SOLUTION.md`
- `docs/plan/claude-code-vscode-plugin-implementation-analysis.md`
- `docs/plan/zcode_claude_code_acp_permission_report.md`
- `docs/plan/permission_ui_analysis.md`
- `docs/plan/claude-desktop-replica-prd.md`（仅作为产品安全边界与权限体验参考）

### 1.2 代码基线输入（2026-02-20）

- 协议与核心链路：
  - `packages/shared/src/index.ts`
  - `packages/shared/src/protocol.ts`
  - `packages/extension/src/acp/client.ts`
  - `packages/server/src/acp/server.ts`
  - `packages/server/src/claude/wrapper.ts`
- UI 与权限：
  - `packages/extension/src/providers/chatViewProvider.ts`
  - `packages/extension/src/services/permissionProvider.ts`
  - `packages/extension/webview/src/store/useStore.ts`
  - `packages/extension/webview/src/components/PermissionRulesPanel.tsx`

### 1.3 基线质量结论

- `pnpm build` 当前失败（协议常量漂移、类型不一致等编译错误）。
- `pnpm test` 当前失败（6 个失败用例，集中在多会话与扩展激活测试）。

## 2. 背景与问题陈述

V0.2 已完成“可用链路”的大部分能力，但当前主问题不在功能数量，而在“协议一致性 + 多会话稳定性 + 权限路径收敛 + 可发布质量”。

核心矛盾：

- 协议常量存在双定义，方法名风格不一致（`/` 与 `.` 混用），导致编译与演进成本高。
- 多会话请求清理在切换/删除场景下仍有超时与未处理异常。
- Agent 选择器 UI 已有，但与实际进程生命周期尚未打通。
- 权限交互存在两条路径（`confirmation_request` 与 `session.requestPermission`），规则与体验未完全统一。

## 3. V0.3 版本目标

### 3.1 产品目标（Must）

1. 建立单一 ACP 协议规范与兼容层，消除方法常量漂移。
2. 多会话在切换、删除、并发请求场景下稳定可控，无悬挂请求。
3. 权限体验统一：用户只看到一致的审批语义和规则行为。
4. Agent 选择从“占位交互”升级为真实可切换运行时。
5. 达到“可发布工程线”：构建与测试可稳定通过。

### 3.2 非目标（Not in V0.3）

- 不引入桌面壳（Electron）能力。
- 不扩展新的模型供应商矩阵。
- 不做企业级策略中心（组织权限、SSO、租户策略）。

## 4. 目标用户与场景

### 4.1 目标用户

- 高频使用 VSCode AI 编程助手的开发者。
- 需要权限可控、审计可追踪的团队用户。

### 4.2 核心场景

1. 用户在两个会话间频繁切换，不出现串流或请求超时残留。
2. AI 请求写文件/执行命令，用户审批后流程可继续，拒绝后流程可恢复。
3. 用户切换 Agent 后，后续会话确实由新 Agent 进程处理。
4. 用户安装 VSIX 后可直接运行，不因打包/依赖缺失崩溃。

## 5. 功能需求（FR）

### 5.1 协议与会话

- FR-301：统一 ACP 方法常量来源，禁止重复定义。
- FR-302：对旧方法名保留兼容解析（至少一个小版本周期）。
- FR-303：`switchSession`/`deleteSession` 必须同步清理该会话挂起请求并返回明确错误原因。

### 5.2 权限体系

- FR-311：CLI `can_use_tool` 审批链路必须稳定阻塞等待用户决策，并支持继续执行。
- FR-312：`Always allow` 规则必须可持久化、可查询、可删除。
- FR-313：权限 UI 仅保留一套用户语义（Allow once / Always allow / Deny）。

### 5.3 Agent 管理

- FR-321：Agent 列表展示真实状态（running/offline/error）。
- FR-322：切换 Agent 后，消息发送链路切换到新进程，旧进程按策略回收或隔离。

### 5.4 发布质量

- FR-331：`pnpm build` 全量通过。
- FR-332：`pnpm test` 全量通过。
- FR-333：CI 打包 VSIX 后可在干净环境安装并完成首轮对话。

### 5.5 UI 一致性（收敛同步）

- FR-341：Webview 会话态必须按 `sessionId` 隔离，切换会话不串台。
- FR-342：权限 UI 动作语义统一为 `Allow once / Always allow / Deny`。
- FR-343：新增 UI 改动禁止引入硬编码主题色，统一使用 `--vscode-*`/`--vc-*` token。

## 6. 非功能需求（NFR）

- NFR-301 稳定性：会话切换后 1 秒内状态一致（UI 与运行时对齐）。
- NFR-302 安全性：权限拒绝路径不可导致进程卡死或无响应。
- NFR-303 可维护性：协议定义单源，新增方法只改一处即可被全链路消费。
- NFR-304 可观测性：关键错误（超时、协议解析、进程崩溃）可在日志中定位到 sessionId。
- NFR-305 一致性：UI 主题、间距、圆角、交互状态遵循统一设计规范。
- NFR-306 可回归性：会话切换、权限审批、Agent 切换具备可重复回归用例。

## 7. 验收标准

1. 构建通过：`pnpm build` 成功。
2. 测试通过：`pnpm test` 成功，且无 unhandled rejection。
3. 多会话用例通过：切换/删除/并发请求测试全部通过。
4. 权限闭环通过：触发 `can_use_tool` 后用户审批可继续执行，拒绝可返回明确结果。
5. Agent 切换通过：切换后可观测到新进程状态并成功响应请求。
6. UI 收敛通过：无会话串台、权限语义一致、主题变量使用符合规范。

## 8. 里程碑计划（建议 4 周）

### M1（第 1 周）：协议收敛与编译修复

- 协议常量统一、兼容层落地、基础编译错误清零。

### M2（第 2 周）：多会话与权限稳定性

- 修复 pending request 清理与超时问题。
- 权限规则链路与 UI 行为统一。

### M3（第 3 周）：Agent 可切换运行时

- 打通 AgentProcessManager 与 Chat/ACP 传输切换。
- 状态展示与异常恢复。

### M4（第 4 周）：测试与发布质量

- 补齐回归用例、修复 CI/VSIX 交付问题、形成 RC。

## 9. 风险与应对

- 风险：协议名改造导致兼容性回归。
  - 应对：引入方法名兼容映射与灰度开关。
- 风险：多会话并发逻辑修复引入新竞态。
  - 应对：增加并发与超时专项测试。
- 风险：Agent 切换影响现有会话行为。
  - 应对：明确“切换创建新会话”的默认策略，旧会话只读回看。

## 10. 文档收敛同步说明

本次已将 `docs` 根目录收敛后的内容并入 V0.3 主文档：

- 执行计划内容同步到本 PRD 的目标、里程碑、验收条目，以及技术方案的实施章节。
- 问题优先级内容同步到技术方案的问题矩阵与优先级映射。
- UI 规范与实施内容同步到本 PRD 的 UI FR/NFR 与技术方案的 UI 专项章节。

后续以 `docs/V0.3/PRD.md` 与 `docs/V0.3/TECH-SOLUTION.md` 作为 V0.3 唯一文档入口。

## 11. V0.3 优先级问题映射

### P0（阻塞发布）

1. ACP 方法常量双定义与命名风格混用。
2. 会话切换/删除场景 pending request 清理不完整。
3. Agent 选择器未接入真实运行时切换。
4. 构建与测试未形成稳定全绿基线。

### P1（V0.3 内完成）

1. 权限链路双栈导致审批语义不一致。
2. `clientCapabilities` 宣称能力与实现不一致。
3. 持久会话未完整覆盖 `control_request`。
4. 权限规则面板生命周期与刷新机制不稳。

### P2（可延后）

1. DiffManager 主链路闭环不足。
