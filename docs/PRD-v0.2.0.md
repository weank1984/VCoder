# VCoder - 产品需求文档 (PRD v0.2.0)

> MVP 之后的增量开发规划

**版本**: v0.2.0  
**日期**: 2026-01-08 (更新)  
**状态**: 进行中

---

## 1. 背景与目标

VCoder v0.1.0 已完成基本 MVP 功能：对话交互、工具调用展示、Plan Mode、多会话管理等。本文档规划下一阶段的开发方向，分为**后端（CLI 能力集成）**和**前端（UI 体验优化）**两条主线。

> [!NOTE]
> **截至 2026-01-08**：后端 P0/P1 核心能力已完成，前端 P0/P1 大部分任务已完成。详见下方各节状态标记。

### 1.1 核心思路

1. **后端优先**：先摸清 Claude Code CLI 的完整能力边界，识别可集成但尚未利用的特性
2. **前端跟进**：基于后端能力规划 UI，确保功能与交互一致
3. **渐进增强**：按优先级分阶段交付，持续迭代

---

## 2. 后端：Claude Code CLI 能力集成

### 2.1 CLI 能力全景图

基于 `claude --help` 输出，Claude Code CLI 提供以下核心能力：

| 分类 | CLI 选项/命令 | 说明 | 当前集成状态 |
|------|--------------|------|:------------:|
| **基础对话** | `-p`/`--print` | 非交互模式（单次查询） | ✅ 已集成 |
| | `--output-format stream-json` | JSON 流式输出 | ✅ 已集成 |
| | `--model` | 模型选择 | ✅ 已集成 |
| **会话管理** | `-c`/`--continue` | 继续上次会话 | ✅ 已集成 |
| | `-r`/`--resume [sessionId]` | 恢复指定会话 | ✅ 已集成 |
| | `--session-id` | 指定会话 ID | ❌ 未集成 |
| | `--fork-session` | 分叉会话 | ❌ 未集成 |
| **权限控制** | `--permission-mode` | 权限模式（plan/default/acceptEdits/bypassPermissions） | ✅ 已集成 |
| | `--allowedTools` | 允许的工具列表 | ✅ 已集成 |
| | `--disallowedTools` | 禁止的工具列表 | ✅ 已集成 |
| | `--dangerously-skip-permissions` | 跳过所有权限检查 | ❌ 未集成 |
| **MCP 集成** | `--mcp-config` | 加载 MCP 服务器配置 | ✅ 已集成 |
| | `--strict-mcp-config` | 仅使用指定 MCP 配置 | ❌ 未集成 |
| | `mcp` 子命令 | MCP 服务器管理 | ❌ 未集成 |
| **自定义代理** | `--agents` | 定义自定义代理（JSON） | ❌ 未集成 |
| **系统提示** | `--system-prompt` | 自定义系统提示 | ❌ 未集成 |
| | `--append-system-prompt` | 追加系统提示 | ✅ 已集成 |
| **模型容错** | `--fallback-model` | 主模型过载时切换备用模型 | ✅ 已集成 |
| **工作目录** | `--add-dir` | 添加额外允许访问的目录 | ✅ 已集成 |
| **IDE 集成** | `--ide` | 自动连接 IDE | ❌ 未集成 |
| **交互输入** | `--input-format stream-json` | JSON 流式输入 | ❌ 未集成 |
| | `--replay-user-messages` | 回放用户消息确认 | ❌ 未集成 |
| **设置管理** | `--settings` | 加载设置文件 | ❌ 未集成 |
| | `--setting-sources` | 指定设置来源 | ❌ 未集成 |

---

### 2.2 后端增量开发计划

#### P0: 核心体验完善 ✅ 已完成

| 功能 | 描述 | 实现方案 | 涉及文件 | 状态 |
|------|------|----------|----------|:----:|
| **权限模式增强** | 支持 `acceptEdits`、`bypassPermissions` 模式 | 在 `ClaudeCodeSettings` 中新增 `permissionMode` 字段，映射到 CLI `--permission-mode` | `wrapper.ts` | ✅ |
| **工具白名单配置** | UI 可配置 `--allowedTools` | VSCode 设置项 + 传递给 CLI | `wrapper.ts`, Extension settings | ✅ |
| **备用模型** | 主模型过载时自动切换 | 新增 `fallbackModel` 设置，映射到 `--fallback-model` | `wrapper.ts`, `server.ts` | ✅ |

#### P1: 高级能力集成 ✅ 已完成

| 功能 | 描述 | 实现方案 | 涉及文件 | 状态 |
|------|------|----------|----------|:----:|
| **MCP 服务器配置** | 支持加载自定义 MCP 服务器 | 通过 `--mcp-config` 传入配置文件路径或 JSON | `wrapper.ts` | ✅ |
| **系统提示定制** | 用户可自定义项目级系统提示 | 通过 `--append-system-prompt` 传入 | `wrapper.ts` | ✅ |
| **多目录访问** | 支持添加额外允许访问的目录 | 通过 `--add-dir` 参数传入 | `wrapper.ts` | ✅ |

> [!TIP]
> 后端 CLI 参数传递已完成，但 **配置 UI**（VSCode 设置界面、MCP 管理面板）尚未实现。

#### P2: 进阶特性

| 功能 | 描述 | 实现方案 |
|------|------|----------|
| **自定义代理** | 定义专用代理（如 Reviewer、Debugger） | 通过 `--agents` JSON 配置 |
| **会话分叉** | 支持从任意节点分叉对话 | 使用 `--fork-session` |
| **双向流式通信** | 使用 `stream-json` 输入输出 | 改造为双向流式协议 |

---

## 3. 前端：UI 体验优化

### 3.1 UI 优化总览

> 详细技术方案见 [ui_optimization_technical_design.md](./refactor/ui_optimization_technical_design.md)

| 优先级 | 任务 | 说明 | 状态 |
|:------:|------|------|:----:|
| **P0** | 主题变量统一 | 使用 `--vcoder-*` 前缀定义变量，基于 VSCode 主题变量 | ✅ |
| **P0** | 滚动策略优化 | 底部吸附 + "跳到最新"按钮（`useSmartScroll` + `JumpToBottom`） | ✅ |
| **P0** | 代码高亮主题自适配 | 亮/暗切换时风格一致（`useThemeMode` + `vscDarkPlus`/`vs`） | ✅ |
| **P1** | GFM Markdown | 表格/任务列表/删除线支持（`remarkGfm`） | ✅ |
| **P1** | 代码块交互 | "复制" + "插入编辑器"功能 | ✅ |
| **P1** | 流式渲染优化 | 简化渲染模式避免频繁重渲染 | ✅ |
| **P1** | ErrorBoundary | 避免白屏 + 错误提示 | ✅ |
| **P1** | Mermaid 图表 | 支持渲染 Mermaid 流程图/序列图 | ✅ |
| **P2** | 虚拟列表 | 长会话性能优化（`useVirtualList`） | ✅ |
| **P2** | 历史对话管理 | `HistoryPanel` 侧边栏 + 加载/删除历史会话 | ✅ |
| **P2** | UI 状态持久化 | reload 后恢复模型/模式/草稿 | ❌ |

---

### 3.2 新增 UI 功能（配合后端）⏳ 待实现

| 功能 | 描述 | 后端依赖 | 状态 |
|------|------|----------|:----:|
| **权限模式选择器** | 在输入区显示当前权限模式，可切换 | `--permission-mode` | ❌ |
| **MCP 服务器管理面板** | 查看/添加/删除 MCP 服务器 | `--mcp-config`, `mcp` 命令 | ❌ |
| **工具权限配置** | 配置允许/禁止的工具列表 | `--allowedTools`, `--disallowedTools` | ❌ |
| **系统提示编辑器** | 编辑项目级系统提示 | `--append-system-prompt` | ❌ |
| **备用模型配置** | 配置 fallback 模型 | `--fallback-model` | ❌ |

> [!IMPORTANT]
> 上述功能的后端参数传递已完成，但缺少对应的 **VSCode 设置 UI** 和 **Webview 配置界面**。

---

## 4. 优先级与里程碑

### Phase 1: 后端核心能力 ✅ 已完成

- [x] 权限模式增强（plan/acceptEdits/bypassPermissions）
- [x] 工具白名单/黑名单配置（`allowedTools`/`disallowedTools`）
- [x] 备用模型支持（`fallbackModel`）
- [x] 系统提示定制（`appendSystemPrompt`）
- [x] MCP 配置路径（`mcpConfigPath`）
- [x] 多目录访问（`additionalDirs`）

### Phase 2: UI 优化 ✅ 大部分完成

- [x] P0: 主题变量统一（`--vcoder-*` 变量体系）
- [x] P0: 滚动策略（`useSmartScroll` + `JumpToBottom`）
- [x] P0: 代码高亮主题自适配（`useThemeMode`）
- [x] P1: GFM Markdown（`remarkGfm` + Mermaid）
- [x] P1: 代码块交互（复制 + 插入编辑器）
- [x] P1: 流式渲染优化（简化渲染模式）
- [x] P1: ErrorBoundary
- [x] P2: 虚拟列表（`useVirtualList`）
- [x] P2: 历史对话管理（`HistoryPanel`）
- [ ] P2: UI 状态持久化

### Phase 3: 配置 UI + 高级功能 ⏳ 下一阶段

- [ ] 权限模式选择器（Webview UI）
- [ ] MCP 服务器管理面板
- [ ] 工具权限配置界面
- [ ] 系统提示编辑器
- [ ] 备用模型配置
- [ ] 自定义代理支持（`--agents`）
- [ ] 会话分叉（`--fork-session`）
- [ ] UI 状态持久化

---

## 5. 技术约束

### 5.1 CLI 版本兼容性

| 依赖项 | 版本要求 |
|--------|---------|
| Claude Code CLI | 最新稳定版 |
| Node.js | ≥ 18.0.0 |
| VSCode | ≥ 1.80.0 |

### 5.2 安全考量

- 权限模式 `bypassPermissions` 仅在沙箱环境中启用
- MCP 服务器配置需验证来源可信
- 系统提示定制需防止注入攻击

---

## 6. 开放问题

| 问题 | 状态 | 备注 |
|------|------|------|
| 双向流式通信是否值得投入？ | 待评估 | 可提升交互流畅度，但复杂度高 |
| --ide 参数是否可用于 VCoder？ | 待调研 | 可能需要 Claude CLI 侧支持 |
| 自定义代理的 UX 如何设计？ | 待设计 | 预设模板 vs 完全自定义 |

---

## 附录

### 参考资料

- [Claude Code CLI 官方文档](https://docs.anthropic.com/claude-code)
- [VCoder PRD v0.1.0](./PRD.md)
- [UI 优化技术方案](./refactor/ui_optimization_technical_design.md)
