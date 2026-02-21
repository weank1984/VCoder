# TASK-04: Server 端实现 permissionRules RPC 方法

## 基本信息

- 优先级：P0
- 预估工时：1 day
- 所属需求：PRD 14.2 — 打通权限规则协议闭环
- 关联 FR：FR-302, FR-303
- 前置依赖：TASK-02（Server 端权限统一）
- 后续任务：TASK-05

## 1. 任务目标

在 ACP Server 中实现 `permissionRules/*` 系列 RPC 方法（list/add/remove/update），使权限规则的增删改查可通过协议完成，而非仅依赖 Extension 本地存储。

## 2. 背景

当前状态：
- `packages/shared/src/protocol.ts` 已定义 `permissionRules/list`、`permissionRules/add`、`permissionRules/remove`、`permissionRules/update` 方法签名
- `packages/server/src/acp/server.ts` 未实现这些方法的处理逻辑
- 权限规则仅存储在 Extension 端的 `SessionStore`（VSCode Memento）

目标状态：
- Server 可接收并转发权限规则操作
- Extension 端作为规则的持久化层，Server 作为协议中转
- Webview 可通过标准 RPC 管理规则

## 3. 具体工作内容

### 3.1 协议类型确认

- [ ] 确认 `protocol.ts` 中 `permissionRules/*` 的请求/响应类型定义完整
- [ ] 如有缺失，补充 `PermissionRule` 类型定义：
  ```typescript
  interface PermissionRule {
    id: string;
    type: ConfirmationType;        // bash | file_write | file_delete | mcp | dangerous
    pattern: string;               // glob/regex 匹配模式
    decision: 'allow' | 'deny';
    scope: 'session' | 'global';
    createdAt: number;
    expiresAt?: number;
  }
  ```

### 3.2 Server 端方法实现

- [ ] `permissionRules/list` — 转发请求到 Client（Extension），Client 从 SessionStore 读取并返回
- [ ] `permissionRules/add` — 转发到 Client，Client 写入 SessionStore，返回创建结果
- [ ] `permissionRules/remove` — 转发到 Client，Client 从 SessionStore 删除
- [ ] `permissionRules/update` — 转发到 Client，Client 更新 SessionStore

### 3.3 Extension 端 Client 请求处理

- [ ] 在 `ACPClient` 中注册 `permissionRules/*` 的请求处理器
- [ ] 实现与 SessionStore 的 CRUD 对接
- [ ] 规则变更后触发通知，使 Webview 刷新规则列表

### 3.4 规则生效集成

- [ ] 新的 confirmation_request 到达时，先查询规则列表进行自动匹配
- [ ] 命中 allow 规则 → 自动批准，不弹审批
- [ ] 命中 deny 规则 → 自动拒绝，记录日志
- [ ] 未命中 → 正常弹出审批流程

### 3.5 测试

- [ ] 各 RPC 方法的单元测试（正常 CRUD + 边界情况）
- [ ] 规则自动匹配测试（glob 匹配、过期规则跳过、scope 隔离）

## 4. 验收标准

| # | 验收项 | 验证方式 |
|---|--------|----------|
| 1 | `permissionRules/list` 返回当前所有规则 | 单元测试 |
| 2 | `permissionRules/add` 成功添加规则并持久化 | 单元测试 + 重启验证 |
| 3 | `permissionRules/remove` 成功删除指定规则 | 单元测试 |
| 4 | `permissionRules/update` 成功更新规则属性 | 单元测试 |
| 5 | 新 confirmation_request 到达时自动匹配已有规则 | 集成测试 |
| 6 | 过期规则不参与匹配 | 单元测试 |
| 7 | `pnpm build` 和 `pnpm test` 通过 | CI |

## 5. 边界条件

| 场景 | 预期行为 |
|------|----------|
| 添加重复模式的规则 | 后添加的优先级更高（覆盖） |
| 规则已过期 | 自动匹配时跳过，list 时标记 expired |
| SessionStore 不可用 | 降级为无规则模式（每次都弹审批） |
| 规则 pattern 为空字符串 | 拒绝添加，返回参数错误 |
| 并发 add/remove 操作 | 保证最终一致性（SessionStore 是同步的） |

## 6. 风险

| 风险 | 影响 | 应对 |
|------|------|------|
| SessionStore 容量限制（VSCode Memento 有大小限制） | 规则数量上限 | 限制最大规则数（如 200 条），超出时提示清理 |
| 规则匹配性能 | 大量规则时确认延迟 | 规则按类型索引，先过滤类型再匹配 pattern |

## 7. 关键文件

- `packages/shared/src/protocol.ts` — permissionRules 类型定义
- `packages/server/src/acp/server.ts` — 新增方法处理
- `packages/extension/src/acp/client.ts` — 注册请求处理器
- `packages/extension/src/services/sessionStore.ts` — 规则 CRUD 实现
- `packages/extension/src/services/permissionProvider.ts` — 规则匹配逻辑
