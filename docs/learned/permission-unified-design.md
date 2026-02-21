# VCoder 权限链路审计与统一方案设计

> 文档版本: 1.0
> 日期: 2026-02-21
> 作者: engineer-a (TASK-01)

---

## 1. 当前双轨权限链路概述

VCoder 当前存在两条并行的权限审批链路，各自独立处理用户审批，导致重复弹窗、行为不一致等问题。

### 1.1 链路 A: Extension 端 `session/requestPermission`

**触发条件**: ACP Server 作为 bidirectional JSON-RPC 的服务端，向 Client(Extension) 发送 `session/requestPermission` 请求。

**完整调用链**:

```
Claude Code CLI
  ↓ (未知的触发机制 — CLI 内部判定需要权限时)
ACP Server (server.ts)
  → (目前 server.ts 未主动发起 session/requestPermission，
     该方法仅在 Extension 端注册了 handler)
  ↓
ACP Client (client.ts:199) handleAgentRequest()
  → requestHandlers.get('session/requestPermission')
  ↓
Extension (extension.ts:182-185)
  → permissionProvider.handlePermissionRequest(params)
  ↓
PermissionProvider (permissionProvider.ts:43)
  → 1. 先检查 sessionStore 中的 PermissionRule 是否匹配（自动放行/拒绝）
  → 2. 若无匹配规则，发送 postMessage({ type: 'permissionRequest', ... }) 到 Webview
  → 3. 等待 Webview 用户响应（5 分钟超时）
  ↓
Webview
  → 用户点击 Allow / Deny
  → postMessage({ type: 'permissionResponse', requestId, outcome, trustAlways })
  ↓
ChatViewProvider (chatViewProvider.ts:466-475)
  → this.emit('permissionResponse', { requestId, outcome, trustAlways })
  ↓
PermissionProvider (permissionProvider.ts:90-123)
  → handlePermissionResponse()
  → 若 trustAlways，创建 PermissionRule 并存储
  → resolve(RequestPermissionResult { outcome, updatedRules? })
  ↓
ACP Client (client.ts:226-233) sendResponse()
  → 将 RequestPermissionResult 通过 JSON-RPC response 返回给 ACP Server
  ↓
ACP Server → (理论上转发回 CLI，但实际行为见下文分析)
```

**关键观察**:
- 链路 A 是标准的 bidirectional JSON-RPC 请求/响应模式
- Extension 注册了 `session/requestPermission` 的 handler（extension.ts:182-185）
- 但 **ACP Server (server.ts) 本身并没有发起 `session/requestPermission` 请求的代码**
- 这意味着链路 A 目前可能依赖某种 CLI 直接通过 ACP 协议发送请求的机制，或者尚未真正接线

### 1.2 链路 B: Server 端 `confirmation_request` → `tool/confirm`

**触发条件**: Claude Code CLI 在 `--permission-prompt-tool stdio` 模式下，通过 stdout 输出 `control_request` (subtype: `can_use_tool`) 事件。

**完整调用链**:

```
Claude Code CLI (stdout stream-json)
  → { type: "control_request", request_id: "xxx", request: { subtype: "can_use_tool", tool_name, input, tool_use_id, ... } }
  ↓
ClaudeCodeWrapper (wrapper.ts:431-435) handleClaudeCodeEvent() case 'control_request'
  → handleControlRequest(sessionId, event)
  ↓
ClaudeCodeWrapper (wrapper.ts:650-719) handleControlRequest()
  → 1. 解析 requestId, toolName, toolInput, toolCallId
  → 2. 记录到 pendingCanUseToolByToolCallKey Map
  → 3. emitToolUse() — 确保工具在 UI 中出现
  → 4. buildConfirmationRequestUpdate() — 构建 ConfirmationRequestUpdate
  → 5. this.emit('update', sessionId, confirmUpdate, 'confirmation_request')
  → 6. 创建 Promise 并阻塞等待（10 分钟超时）
  ↓
ACPServer (server.ts:72-77) — 监听 wrapper 的 'update' 事件
  → sendNotification(session/update, { sessionId, type: 'confirmation_request', content: ConfirmationRequestUpdate })
  ↓
ACP Client (client.ts:176-193) handleNotification()
  → this.emit('session/update', params)
  ↓
ChatViewProvider (chatViewProvider.ts:45-71)
  → this.postMessage({ type: 'update', data: params })
  ↓
Webview
  → 接收 type: 'confirmation_request' 的 update
  → 展示确认 UI (bash/file_write/file_delete/mcp/dangerous/plan)
  → 用户点击 Confirm / Deny
  → postMessage({ type: 'confirmTool', toolCallId, confirmed, options })
  ↓
ChatViewProvider (chatViewProvider.ts:207-211) case 'confirmTool'
  → acpClient.confirmTool(toolCallId, confirmed, options)
  ↓
ACPClient (client.ts:516-528) confirmTool()
  → sendRequest(ACPMethods.TOOL_CONFIRM, { sessionId, toolCallId, confirmed, options })
  ↓
ACPServer (server.ts:219-221) handleToolConfirm()
  → claudeCode.confirmTool(sessionId, toolCallId, confirmed, options)
  ↓
ClaudeCodeWrapper (wrapper.ts:1329-1382) confirmTool()
  → 1. 从 pendingCanUseToolByToolCallKey 获取 pending 请求
  → 2. 构建 control_response { behavior: 'allow'/'deny', updatedInput?, updatedPermissions? }
  → 3. sendControlResponse() — 写入 CLI stdin
  → 4. 清理 pending 状态
  → 5. resolve pendingConfirmationResolvers — 解除 handleControlRequest 的阻塞
  ↓
Claude Code CLI (stdin)
  → 接收 { type: "control_response", response: { subtype: "success", request_id, response: { behavior: "allow"/"deny", ... } } }
  → 继续执行或中断
```

**关键观察**:
- 链路 B 是完整的、可工作的权限审批链路
- 使用 `--permission-prompt-tool stdio` CLI 参数启用
- 基于 `control_request` / `control_response` 协议，通过 CLI 的 stdin/stdout 通信
- 支持 `updatedInput`（用户可编辑内容）和 `updatedPermissions`（信任规则）

### 1.3 辅助链路: stderr 启发式检测（Fallback）

**触发条件**: 当 CLI 不支持 `can_use_tool` 协议时，wrapper 会尝试从 stderr 输出和 tool_result 中检测权限请求模式。

```
Claude Code CLI (stderr 或 tool_result)
  → 包含 "Claude requested permissions to..." 等文本
  ↓
ClaudeCodeWrapper (wrapper.ts:346-369) setupProcessListeners() stderr handler
  或
ClaudeCodeWrapper (wrapper.ts:900-918) emitToolResult() — detectPermissionRequest()
  ↓
detectPermissionRequest() (wrapper.ts:954-1046)
  → 正则匹配: "Claude requested permissions to write/edit/delete/run..."
  → 或匹配: "haven't granted it yet", "permission denied" 等
  ↓
  → emit('update', sessionId, confirmUpdate, 'confirmation_request')
```

**关键观察**:
- 这是一个 **降级兼容** 机制，仅在 CLI 不支持 `can_use_tool` 时启用
- 一旦收到过 `can_use_tool`，`seenCanUseToolByLocalSessionId` 标记为 true，此后 stderr 启发式被禁用
- **但此链路只能检测到请求，无法将用户确认回传给 CLI**（因为没有 control_response 机制）

---

## 2. 各工具类型的审批行为矩阵

| 工具类型 | ConfirmationType | 链路 B (control_request) | 链路 A (requestPermission) | stderr 降级 | 备注 |
|---------|-----------------|------------------------|---------------------------|-------------|------|
| Bash | `bash` | buildConfirmationRequestUpdate: type='bash', 提取 command, assessBashRisk() | 依赖 CLI 发 requestPermission（当前未观察到） | 匹配 "requested permissions to run" | 包含风险评估 (low/medium/high) |
| Write/Edit | `file_write` | buildConfirmationRequestUpdate: type='file_write', 提取 filePath, 计算 diff | 同上 | 匹配 "requested permissions to write/edit" | 支持 computeFileChangeDiff |
| Delete | `file_delete` | buildConfirmationRequestUpdate: type='file_delete', riskLevel='high' | 同上 | 匹配 "requested permissions to delete" | 固定高风险 |
| MCP 工具 | `mcp` | buildConfirmationRequestUpdate: type='mcp', riskLevel='medium' | 同上 | 无特殊匹配 | 匹配 `mcp__`/`mcp_` 前缀 |
| Plan | `plan` | ConfirmationType 中定义但 buildConfirmationRequestUpdate 未处理 | 同上 | 无 | confirmPlan() 已标记 deprecated |
| 其他/危险 | `dangerous` | buildConfirmationRequestUpdate: 默认 fallback, riskLevel='medium' | 同上 | 通用匹配 "permission denied" 等 | 兜底类型 |

---

## 3. 已知问题

### 3.1 重复弹窗

**根因**: 链路 A 和链路 B 可能同时触发。

- 链路 B 的 `control_request` 通过 stdout 到达，触发 `confirmation_request` 通知
- 如果 CLI 同时通过 ACP 协议发送 `session/requestPermission`（链路 A），Extension 端会再次弹窗
- stderr 降级机制也可能产生额外的 `confirmation_request` 通知

**当前缓解**: wrapper.ts 中通过 `pendingCanUseToolByToolCallKey` 检查，在已有 `can_use_tool` 请求时跳过 stderr 检测（wrapper.ts:351）。但 **链路 A 与链路 B 之间无去重**。

### 3.2 拒绝后卡死

**根因**: 链路 A 的拒绝响应通过 `RequestPermissionResult { outcome: 'deny' }` 返回给 ACP Server，但 Server 如何将拒绝传达给 CLI 不明确。如果 CLI 等待的是 `control_response` 而非 `session/requestPermission` 的响应，则拒绝不会生效，CLI 会继续等待直到超时。

链路 B 的拒绝路径是清晰的：`confirmTool(confirmed=false)` → `sendControlResponse({ behavior: 'deny', interrupt: true })` → CLI stdin。

### 3.3 超时行为不一致

| 链路 | 超时时间 | 超时行为 |
|------|---------|---------|
| A (PermissionProvider) | 5 分钟 | reject(Error('Permission request timed out')) |
| B (handleControlRequest) | 10 分钟 | sendControlResponse({ behavior: 'deny', interrupt: true }), resolve() |
| B (confirmBash/skipBash) | 已废弃 | N/A |

链路 A 超时后 reject 会导致 ACP Client 返回 JSON-RPC error，而非正常的 deny 响应。
链路 B 超时后会主动发送 deny 给 CLI，行为更合理。

### 3.4 Legacy API 残留

以下方法在 wrapper.ts 中已标记 deprecated，但 server.ts 和 client.ts 中仍保留了完整的调用路径：

- `confirmBash()` / `skipBash()` — wrapper.ts:1307-1317
- `confirmPlan()` — wrapper.ts:1320-1323
- ACP Server 中 `BASH_CONFIRM`, `BASH_SKIP`, `PLAN_CONFIRM` 的 handler 仍存在（server.ts:188-196）
- ACP Client 中 `confirmBash()`, `skipBash()`, `confirmPlan()` 仍存在（client.ts:489-510）
- ChatViewProvider 中 `confirmBash`, `skipBash`, `confirmPlan` 消息处理仍存在（chatViewProvider.ts:198-206）

### 3.5 链路 A 的 `session/requestPermission` 实际触发情况不明

ACP Server (server.ts) 中 **没有发起 `session/requestPermission` 请求的代码**。该方法常量定义在 `ACPMethods.SESSION_REQUEST_PERMISSION` (protocol.ts:895)，且 Extension 注册了 handler (extension.ts:182-185)，但实际触发源不明。可能的情况：

1. CLI 通过某种尚未实现的 ACP 协议直接发送（当前不存在）
2. 预留的 V0.2 功能，尚未接线
3. 由第三方 agent 通过 ACP 协议发送

---

## 4. 统一方案设计

### 4.1 目标架构: 统一到链路 B

链路 B 是当前唯一完整可工作的权限链路，且具有以下优势：
- 与 CLI 的 `control_request`/`control_response` 协议对齐
- 支持 `updatedInput`（用户可修改工具输入）
- 支持 `updatedPermissions`（信任规则推送回 CLI）
- 超时处理行为合理（主动 deny + 不阻塞后续交互）

### 4.2 统一数据流

```
Claude Code CLI (stdout)
  → { type: "control_request", request: { subtype: "can_use_tool", tool_use_id, tool_name, input } }
  ↓
ClaudeCodeWrapper.handleControlRequest()
  → 解析 + 构建 ConfirmationRequestUpdate
  → emit('update', sessionId, confirmUpdate, 'confirmation_request')
  → 阻塞等待用户确认
  ↓
ACP Server — 监听 update 事件
  → sendNotification('session/update', { sessionId, type: 'confirmation_request', content })
  ↓
ACP Client — 接收 notification
  → emit('session/update', params)
  ↓
ChatViewProvider — 监听 session/update
  → postMessage({ type: 'update', data: params })
  ↓
Webview — 展示确认 UI
  → 用户操作: Confirm / Deny / Edit
  → postMessage({ type: 'confirmTool', toolCallId, confirmed, options })
  ↓
ChatViewProvider case 'confirmTool'
  → acpClient.confirmTool(toolCallId, confirmed, options)
  ↓
ACP Client.confirmTool()
  → sendRequest('tool/confirm', { sessionId, toolCallId, confirmed, options })
  ↓
ACP Server.handleToolConfirm()
  → claudeCode.confirmTool(sessionId, toolCallId, confirmed, options)
  ↓
ClaudeCodeWrapper.confirmTool()
  → sendControlResponse() → CLI stdin
  → { type: "control_response", response: { behavior: "allow"/"deny", updatedInput?, updatedPermissions? } }
  → resolve pendingConfirmationResolvers
  ↓
Claude Code CLI — 接收 control_response
  → behavior: "allow" → 继续执行工具
  → behavior: "deny", interrupt: true → 中断当前工具，继续对话
```

### 4.3 拒绝恢复协议

当用户点击 Deny 时：

1. `confirmTool(sessionId, toolCallId, confirmed=false)` 被调用
2. `sendControlResponse(sessionId, requestId, { behavior: 'deny', message: 'User denied', interrupt: true })`
3. CLI 收到 `{ behavior: 'deny', interrupt: true }`
4. CLI 中断当前工具执行，向 AI 报告用户拒绝
5. AI 可以选择重新规划（换方案）或询问用户
6. `pendingConfirmationResolvers` 的 Promise 被 resolve，`handleControlRequest` 返回
7. wrapper 继续处理后续 CLI 事件，不阻塞

**关键**: `interrupt: true` 告知 CLI 不仅拒绝当前工具，还应中断当前操作序列。这确保 CLI 不会在拒绝后继续尝试同一操作。

### 4.4 去重策略

目标: 同一 `toolCallId` 的确认请求只弹一次。

**当前已有机制**:
- `pendingCanUseToolByToolCallKey`: Map<`${sessionId}:${toolCallId}`, pending> — 防止同一 toolCallId 的重复处理
- `seenCanUseToolByLocalSessionId`: Set — 一旦收到 `can_use_tool`，禁用 stderr 启发式

**需要新增**:
- Webview 端去重: 对 `confirmation_request` 类型的 update，Webview 应基于 `toolCallId` 去重（忽略相同 toolCallId 的后续请求）
- wrapper 端: `buildConfirmationRequestUpdate()` 已使用 `confirm-${toolCallId}-${Date.now()}` 格式的 id，但 `toolCallId` 才是去重键

### 4.5 链路 A 废弃方案（渐进式）

#### Phase 1: 标记废弃（当前迭代）
- 在 `PermissionProvider` 类和 `session/requestPermission` handler 中添加 `@deprecated` JSDoc 注释
- 在 `PermissionProvider.handlePermissionRequest()` 入口打印 deprecation warning
- 不删除代码，保持兼容

#### Phase 2: 功能降级（下一迭代）
- `PermissionProvider.handlePermissionRequest()` 直接返回 `{ outcome: 'allow' }` 或委托给链路 B
- 将 PermissionProvider 中的 PermissionRule 匹配逻辑迁移到 wrapper.ts 的 `handleControlRequest()` 中
- 移除 Webview 中 `permissionRequest` 消息类型的 UI

#### Phase 3: 完全移除（V0.5+）
- 移除 `PermissionProvider` 类
- 移除 `extension.ts` 中 `session/requestPermission` handler 注册
- 移除 `ACPMethods.SESSION_REQUEST_PERMISSION`
- 移除 `RequestPermissionParams` / `RequestPermissionResult` 类型定义

同时，Legacy API 也应按相同节奏废弃：
- `confirmBash()`, `skipBash()`, `confirmPlan()` — wrapper/server/client 三端
- `BASH_CONFIRM`, `BASH_SKIP`, `PLAN_CONFIRM` — ACP 方法
- chatViewProvider 中对应的 message handler

---

## 5. 接口变更清单

### 5.1 需要修改的文件

| 文件 | 变更类型 | 详细说明 |
|------|---------|---------|
| `packages/server/src/claude/wrapper.ts` | **增强** | 在 `handleControlRequest` 中增加 PermissionRule 匹配（自动放行/拒绝），减少不必要弹窗 |
| `packages/server/src/claude/wrapper.ts` | **增强** | `confirmTool` 的 deny 路径需要增加 reject-recovery 事件通知，告知 UI 工具已被拒绝 |
| `packages/server/src/acp/server.ts` | **清理** | 标记 `handleBashConfirm`, `handleBashSkip`, `handlePlanConfirm` 为 deprecated |
| `apps/vscode-extension/src/services/permissionProvider.ts` | **废弃** | Phase 1: 添加 @deprecated；Phase 2: 降级为 passthrough；Phase 3: 移除 |
| `apps/vscode-extension/src/extension.ts` | **修改** | Phase 2: 移除 `session/requestPermission` handler 注册 |
| `apps/vscode-extension/src/providers/chatViewProvider.ts` | **修改** | 移除 `confirmBash`, `skipBash`, `confirmPlan` 处理；保留 `confirmTool` |
| `apps/vscode-extension/src/acp/client.ts` | **清理** | 标记 `confirmBash()`, `skipBash()`, `confirmPlan()` 为 deprecated |
| `packages/shared/src/protocol.ts` | **修改** | Phase 3: 移除 `BashConfirmParams`, `BashSkipParams`, `PlanConfirmParams`；移除 legacy ACPMethods |

### 5.2 涉及的接口

| 接口 | 当前状态 | 目标状态 |
|------|---------|---------|
| `tool/confirm` (ConfirmToolParams) | **活跃** — 链路 B 的统一确认方法 | 保留，作为唯一的权限确认接口 |
| `session/requestPermission` (RequestPermissionParams → RequestPermissionResult) | **活跃** — 链路 A | 废弃 → 移除 |
| `bash/confirm`, `bash/skip` | **废弃** — wrapper 内已打印 deprecation warning | 移除 |
| `plan/confirm` | **废弃** — wrapper 内已打印 deprecation warning | 移除 |
| `confirmation_request` (ConfirmationRequestUpdate) | **活跃** — 链路 B 的 session/update 通知类型 | 保留，增加 Webview 端去重 |
| `permissionRules/*` (PermissionRulesListParams 等) | **定义但未实现** — server.ts 无 handler | TASK-04 实现 |

---

## 6. 风险项

### 6.1 CLI 端 `control_response` 的 deny + interrupt 行为未文档化

`{ behavior: 'deny', interrupt: true }` 的 `interrupt` 字段含义来自代码推断，CLI 的具体行为（是否中断后续工具调用、是否向 AI 报告拒绝原因）未在 CLI 文档中明确说明。需要实际测试验证。

### 6.2 `updatedPermissions` 的 CLI 端处理

`confirmTool` 在 `options.trustAlways` 时会发送 `updatedPermissions: suggestions`（wrapper.ts:1361-1363），但 CLI 如何处理这些权限更新未知。可能 CLI 会在内存中缓存，也可能忽略。需要测试验证。

### 6.3 Persistent Session 模式的权限处理

`PersistentSession`（persistentSession.ts）的权限链路尚未审计。`wrapper.ts` 中 `forwardPersistentSessionEvents` 只转发 `update` 和 `complete` 事件（wrapper.ts:1500-1513），但 persistent session 的 control_request 处理可能与 one-shot 模式不同。

### 6.4 PermissionRule 存储位置分散

- 链路 A 的规则存储在 `SessionStore`（Extension 端，通过 `permissionProvider.ts`）
- 链路 B 的规则理论上应存储在 CLI 端（通过 `updatedPermissions`）
- 统一后需要决定单一存储源（建议: Extension 端 SessionStore，并在 wrapper 的 `handleControlRequest` 中查询）

### 6.5 `session/requestPermission` 的实际触发源不明

如果存在第三方 agent 通过 ACP 协议发送 `session/requestPermission`，废弃链路 A 可能导致这些 agent 无法正常工作。需要确认是否有外部依赖。

---

## 7. 总结

| 维度 | 链路 A (requestPermission) | 链路 B (control_request/tool_confirm) |
|------|---------------------------|--------------------------------------|
| 完整性 | 不完整（触发源不明） | 完整（CLI → wrapper → ACP → Webview → ACP → wrapper → CLI） |
| 拒绝恢复 | 返回 deny 结果，但 CLI 端处理不明 | 明确发送 `{ behavior: 'deny', interrupt: true }` 到 CLI stdin |
| 超时 | 5分钟, reject error | 10分钟, 主动 deny |
| 去重 | 无 | pendingCanUseToolByToolCallKey + seenCanUseToolByLocalSessionId |
| 用户编辑 | 不支持 | 支持 updatedInput |
| 信任规则 | PermissionProvider 本地规则 + updatedRules | updatedPermissions (suggestions) 推送回 CLI |

**结论**: 链路 B 是更成熟、更完整的权限链路，应作为统一目标。链路 A 应渐进式废弃。后续任务 TASK-02/03 将基于此设计执行具体代码变更。
