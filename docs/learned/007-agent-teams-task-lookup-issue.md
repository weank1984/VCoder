# Agent Teams 任务查找失败问题

> 日期: 2026-02-23
> 状态: 已解决（概念澄清）

## 1. 现象

使用 Agent Teams 功能时，通过 `TaskGet` 查找任务报错：

```
获取了 Task analyzer@readme-update-team
发生错误
No task found with ID: analyzer@readme-update-team
```

团队成员已启动，但无法通过 `agent@team-name` 格式查找到对应任务。

## 2. 根本原因：概念混淆

错误的根源是将 **agent 身份标识**（`analyzer@readme-update-team`）当作**任务 ID** 传给了 `TaskGet`。这两者是完全不同的概念。

`TaskGet` 期望的是 `TaskCreate` 返回的**数字 ID**（`"1"`, `"2"` ...），而 `analyzer@readme-update-team` 只是团队成员的名称，不是任务 ID。

---

## 3. Claude Code CLI 四个"任务"概念的区别

Claude Code CLI 中存在四个完全不同的"任务"层次，容易混淆：

### 3.1 `TodoWrite` / `TodoRead` — 会话内进度跟踪

**本质**：Claude 在单次对话中给**自己**记的待办事项，不涉及任何子 agent。

- **Schema**：`TodoWrite({ todos: [{ id, content, status, priority }] })`
- **状态**：`'pending' | 'in_progress' | 'completed'`
- **生命周期**：仅在当前会话内，Claude 自己维护、随时更新
- **触发时机**：复杂任务（>3步）、多个并行需求、需要规划时
- **类比**：Claude 在便签纸上记"要做的事"，完成一项划掉一项
- **在 VCoder 中**：`ClaudeCodeWrapper` 解析后发出 `TaskListUpdate`，显示在 MissionControl 的 Plan/Todos 面板

### 3.2 `Task` 工具 — 派生子 Agent（Subagent）

**本质**：Claude 调用 `Task` 工具来**启动一个子 agent**，子 agent 运行在独立的 context window（同一个 CLI 进程内，不是新进程）。

- **Schema**：`Task({ description, prompt, subagentType, ... })`
- **内置子 agent 类型**：`Explore`（只读探索）、`Plan`（计划模式）、`general-purpose`（通用）、`Bash` 等
- **自定义子 agent**：定义在 `.claude/agents/` 或 `~/.claude/agents/`
- **限制**：子 agent **不能再派生子 agent**（无嵌套）
- **在 VCoder 中**：`ClaudeCodeWrapper` 检测到 `tool_use name=Task` 时，发出 `SubagentRunUpdate` 事件（status: running/completed/failed）

### 3.3 `TaskCreate` / `TaskGet` / `TaskList` / `TaskUpdate` — Agent Teams 任务协调

**本质**：Agent Teams 功能的任务管理工具，用于**跨 agent 的任务分配和协调**，数据持久化在文件系统。

- **任务 ID**：由系统生成的**纯数字字符串**（`"1"`, `"2"` ...），不是 agent 名称
- **持久化位置**：`~/.claude/tasks/{team-name}/`
- **用法**：
  ```
  TaskCreate({ subject, description }) → 返回数字 ID（如 "1"）
  TaskList()                           → 列出所有任务，含 ID
  TaskGet({ taskId: "1" })             → 按数字 ID 查询
  TaskUpdate({ taskId: "1", status: "completed" })
  ```
- **协作方式**：多个 agent 可以查看同一任务列表、认领（设置 owner）、更新状态

### 3.4 `TeamCreate` / `TeamDelete` — Agent Teams 生命周期

**本质**：创建/销毁团队上下文。

- **持久化位置**：`~/.claude/teams/{team-name}/config.json`
- **与任务的关系**：`TeamCreate` 创建团队后，该团队的任务存储在 `~/.claude/tasks/{team-name}/`

---

## 4. 概念对照

```
Claude Code CLI 概念                  VCoder 协议层
──────────────────────────────────    ──────────────────────────────────
TodoWrite / TodoRead                  TaskListUpdate
  └─ 会话内 todo list（Claude 自己）    └─ planTasks（MissionControl Plan/Todos 面板）

Task 工具（spawn subagent）           SubagentRunUpdate
  └─ 独立 context window               └─ subagentRuns（MissionControl Agents 面板）

TeamCreate + TaskCreate/TaskList      activeTeams（server 层）
  └─ 跨 agent 任务协调                  └─ Agent Teams 相关状态
  └─ 任务 ID 是纯数字 "1","2"...
  └─ 存储在 ~/.claude/tasks/{team}/
```

---

## 5. 正确的 TaskGet 用法

**错误**（本次 bug 的原因）：
```
TaskGet({ taskId: "analyzer@readme-update-team" })  ❌
```

`analyzer@readme-update-team` 是团队成员的名称，不是任务 ID。

**正确流程**：
```
1. TaskList()       → 查看所有任务，获取数字 ID
2. TaskGet("1")     → 用数字 ID 查询具体任务
```

**如果 `TaskList()` 返回空**，说明团队创建后还没有通过 `TaskCreate` 添加任何任务，需要先由 team lead 创建任务再分配。

---

## 6. 其他可能原因排查

| # | 原因 | 排查方法 |
|---|------|---------|
| 1 | 团队未创建 | 确认 `~/.claude/teams/{team-name}/config.json` 是否存在 |
| 2 | 任务列表为空 | 先 `TaskList()` 查看，为空则需要先 `TaskCreate` |
| 3 | 团队名不匹配 | 检查 `~/.claude/tasks/{team-name}/` 目录是否存在 |
| 4 | 时序问题 | 成员刚启动时任务可能尚未创建，稍后重试 |

---

## 7. 相关代码

- 任务管理: Claude Code 内置 `TaskCreate` / `TaskGet` / `TaskList` / `TaskUpdate` 工具
- 团队管理: `TeamCreate` 工具，配置存储在 `~/.claude/teams/{team-name}/`
- VCoder 中 Agent Teams 相关:
  - `packages/server/src/claude/persistentSession.ts` — `teamToolPendingByToolId` 追踪 TeamCreate/TeamDelete
  - `packages/ui/src/store/agentSlice.ts` — UI 层团队状态管理
