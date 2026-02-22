# 测试文档

## 测试概览

本项目使用 Vitest 测试框架，测试文件统一放在根目录的 `tests/` 文件夹中。

### 测试结构

```
tests/
├── shared/          # @vcoder/shared 包测试
├── server/          # @vcoder/server 包测试
├── extension/       # vcoder extension 包测试
├── desktop-shell/   # desktop-shell 桌面应用测试
└── mocks/           # 共享 mock（vscode, electron）
```

## 运行测试

### 运行所有测试
```bash
npm run test
```

### 监听模式（开发时使用）
```bash
npm run test:watch
```

### 生成测试覆盖率报告
```bash
npm run test:coverage
```

## 测试结果

当前测试覆盖率：
- ✅ **@vcoder/shared**: 22/22 通过 (100%)
- ✅ **@vcoder/server**: 40/40 通过 (100%)
- ✅ **vcoder extension**: 108/108 通过 (100%) — 含 ACP 客户端、服务管理、能力编排、Agent 注册、消息队列等
- ✅ **desktop-shell**: 78/78 通过 (100%) — 含 DesktopRuntime、AuditLogger、ToastManager、WindowManager
- ⚠️ **webview store** (既有问题): 5 个测试文件因模块路径解析失败未运行

**总计: 343 tests 通过 (26/31 suites)**

## 测试内容

### @vcoder/shared
测试所有 ACP 协议类型定义：
- JSON-RPC 2.0 基础类型
- 初始化参数和结果
- 会话管理类型
- 提示和附件类型
- 更新通知类型
- 任务类型
- 设置类型

### @vcoder/server
测试 ACP 服务器实现：
- 服务器初始化
- 会话管理（创建、列表、切换、删除）
- 设置变更
- 文件操作
- Bash 命令确认
- 计划确认
- 错误处理

### vcoder extension
测试 ACP 客户端及扩展服务：
- 客户端初始化、会话管理、提示操作、设置变更
- 文件变更处理 (DiffManager)
- 能力编排 (CapabilityOrchestrator) — 依赖拓扑排序、冲突检测、生命周期管理
- 服务器管理 (ServerManager) — 进程生命周期、状态转换
- Agent 注册 (AgentRegistry) — 多 Agent 切换、内置 Agent 回退
- 消息队列 (MessageQueue) — 优先级排序、批量发送、溢出策略

### desktop-shell
测试桌面应用核心模块：
- **DesktopRuntime** — 消息路由分发、路径安全校验、文件变更追踪、权限规则 CRUD
- **DesktopAuditLogger** — JSONL 写入、日志轮转、字符串截断
- **ToastManager** — 各类型通知发送、异常窗口处理
- **WindowManager** — 窗口状态持久化、屏幕边界检测

## 编写新测试

### 1. 创建测试文件

在对应的 `tests/*/` 目录下创建 `*.test.ts` 文件。

### 2. 测试文件模板

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Feature Name', () => {
  beforeEach(() => {
    // Setup before each test
  });

  it('should do something', () => {
    // Test implementation
    expect(result).toBe(expected);
  });
});
```

### 3. 运行新测试

```bash
npm run test
```

## 注意事项

1. **Mock 使用**: 对于需要 mock 的依赖，使用 `vi.mock()` 和 `vi.fn()`
2. **异步测试**: 使用 `async/await` 处理异步操作
3. **流模拟**: 测试中使用 `process.nextTick()` 确保异步流正确处理
4. **测试隔离**: 每个测试应该独立，不依赖其他测试的状态

## CI/CD 集成

在 CI/CD 流程中运行：

```bash
npm install
npm run test
```

退出码为 0 表示测试通过，非 0 表示失败。
