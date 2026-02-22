# Claude Code CLI Plan/Task/Subagent 与插件 UI 展示分析

## 信息来源
- https://docs.claude.com/en/docs/claude-code/common-workflows
- https://docs.claude.com/en/docs/claude-code/iam
- https://docs.claude.com/en/docs/claude-code/interactive-mode
- https://docs.claude.com/en/docs/claude-code/slash-commands
- https://docs.claude.com/en/docs/claude-code/sub-agents
- https://docs.claude.com/en/docs/claude-code/plugins
- https://docs.claude.com/en/docs/claude-code/plugins-reference
- https://docs.claude.com/en/docs/claude-code/plugin-marketplaces
- https://raw.githubusercontent.com/anthropics/claude-code/main/.claude-plugin/marketplace.json

## 关键术语澄清与更正
- **Plan Mode**：是权限模式（`permissionMode: plan`），仅允许分析与读取，不允许写入或执行命令。
  - 参考：https://docs.claude.com/en/docs/claude-code/iam
- **Task** 有两种含义，需区分：
  - **Task 工具**：用于启动子代理处理复杂多步任务，UI 里常显示为 `Task:xxx`（如 `subagent_type: Explore`）。
  - **后台任务**：Bash 后台命令（`Ctrl+B` 或让 Claude 在后台执行），通过 `/bashes` 管理。
  - 参考：https://docs.claude.com/en/docs/claude-code/settings、https://docs.claude.com/en/docs/claude-code/interactive-mode
- **TodoWrite**：工具名为 `TodoWrite`（不是 writetodo 或 toowrite），用于创建和维护结构化任务列表。
  - CLI 内建 `/todos` 用于查看当前 TODO 列表。
  - 参考：https://docs.claude.com/en/docs/claude-code/settings、https://docs.claude.com/en/docs/claude-code/slash-commands
- **EnterPlanMode/ExitPlanMode**：日志中可能出现对应工具名，但不保证可用；日志里出现 `ExitPlanMode` 调用失败案例（见下文日志分析）。

## Plan（Plan Mode）
- 定义：Plan Mode 是权限模式之一，仅允许分析，不允许修改文件或执行命令。
  - 参考：https://docs.claude.com/en/docs/claude-code/iam
- 会话内切换：`Shift+Tab` 循环切换到 Plan Mode（提示 `⏸ plan mode on`）。
  - 参考：https://docs.claude.com/en/docs/claude-code/common-workflows
- 启动即 Plan Mode：
  - `claude --permission-mode plan`
- 结合 headless 模式：
  - `claude --permission-mode plan -p "Analyze the auth system and suggest improvements"`
- 配置默认模式（项目级）：
  - `.claude/settings.json`:
    ```json
    {
      "permissions": { "defaultMode": "plan" }
    }
    ```

## Task（工具与后台任务）
- **Task 工具**：用于调用子代理处理复杂任务，日志与 UI 中常显示为 `Task:xxx`。
  - 参考：https://docs.claude.com/en/docs/claude-code/settings
- **后台任务**：Bash 命令后台执行（background bash commands）。
  - 参考：https://docs.claude.com/en/docs/claude-code/interactive-mode
- 触发方式：
  - 让 Claude 用 Bash 在后台运行命令
  - `Ctrl+B` 将当前 Bash 调用转入后台（tmux 下需按两次）
- 管理与查看：
  - `/bashes` 用于列出和管理后台任务
  - 参考：https://docs.claude.com/en/docs/claude-code/slash-commands
- 关键特性：
  - 任务有唯一 ID，输出可通过 BashOutput 获取
  - Claude Code 退出时自动清理

## Subagent（子代理）

### 工作机制
- **Subagent 在同一 CLI 进程内以独立上下文窗口运行**，不是独立子进程。
- Claude 通过 `Task` 工具 spawn subagent，subagent 拥有独立的上下文窗口、工具权限和系统提示，但共享同一 CLI 进程资源。
- Subagent 不能嵌套 spawn 子 subagent（即 subagent 内部无法调用 `Task` 工具）。
- 参考：https://code.claude.com/docs/en/sub-agents

### 内置 Subagent 类型

| 类型 | 模型 | 工具权限 | 用途 |
|---|---|---|---|
| `Explore` | Haiku（快速） | 只读（Glob/Grep/Read 等） | 快速搜索代码库、查找文件 |
| `Plan` | 继承父级 | 只读（不含 Edit/Write/NotebookEdit） | 设计实现方案、架构分析 |
| `general-purpose` | 继承父级 | 全工具 | 复杂多步任务、代码修改 |
| `Bash` | 继承父级 | 仅 Bash | 命令执行、git 操作 |
| `statusline-setup` | 继承父级 | Read/Edit | 配置状态栏 |
| `claude-code-guide` | 继承父级 | Glob/Grep/Read/WebFetch/WebSearch | Claude Code 使用指南查询 |
| `code-simplifier` | 继承父级 | 全工具 | 代码简化与重构 |

### 自定义 Subagent 配置
- 存放位置（Markdown + YAML frontmatter）：
  - 项目级：`.claude/agents/<name>.md`
  - 用户级：`~/.claude/agents/<name>.md`
- 支持的 frontmatter 字段：
  - `tools`：允许使用的工具列表
  - `model`：指定模型（sonnet/opus/haiku）
  - `permissionMode`：权限模式
  - `hooks`：subagent 级别的 hooks 配置
  - `memory`：是否加载 CLAUDE.md 等记忆
  - `isolation`：可设为 `worktree` 在独立 git worktree 中运行
- CLI 动态定义：`--agents` 传入 JSON。
  - 示例：
    ```bash
    claude --agents '{
      "code-reviewer": {
        "description": "Expert code reviewer",
        "prompt": "You are a senior reviewer...",
        "tools": ["Read","Grep","Glob","Bash"],
        "model": "sonnet"
      }
    }'
    ```
- 管理入口：`/agents` 交互式界面（创建/编辑/权限/删除）。
- 插件内子代理：插件 `agents/` 会出现在 `/agents` 中。

### 执行模式
- **前台（阻塞）**：默认模式，主 agent 等待 subagent 完成后继续。
- **后台（并发）**：通过 `run_in_background: true` 参数或 `Ctrl+B` 转入后台。后台 subagent 异步执行，主 agent 可继续其他工作。最多 10 个并发后台 subagent。
- 通过 `TaskOutput` 工具获取后台 subagent 输出，`TaskStop` 终止后台 subagent。

### Task 工具语法
- `Task(subagent_type)` 调用内置类型：`Task(subagent_type="Explore")`
- `Task(name="my-agent")` 调用自定义 agent
- `Task(isolation="worktree")` 在独立 worktree 中执行

### Subagent vs Agent Team 对比

| 维度 | Subagent（Task 工具） | Agent Team |
|---|---|---|
| 进程模型 | 同一 CLI 进程内的独立上下文窗口 | 每个 teammate 是独立的 `claude` CLI 进程 |
| 通信方式 | 直接函数调用（tool_use/tool_result） | 文件系统邮箱 + SendMessage 工具 |
| 并发能力 | 最多 10 个后台 subagent | 无硬性限制，取决于系统资源 |
| 嵌套能力 | 不支持嵌套 | 不支持嵌套 team，但 teammate 可使用 Task 工具 |
| 任务协调 | 无共享任务列表 | 共享任务列表（TaskCreate/TaskList/TaskUpdate） |
| 适用场景 | 单线程或受限并行任务 | 大规模并行探索、多方向推进 |
| 成本 | 较低（共享进程） | 较高（多进程、多上下文） |
| 状态 | 稳定特性 | 实验特性（需开关启用） |

- 参考：https://code.claude.com/docs/en/sub-agents

## 插件 UI 展示与可控字段
- 插件管理 UI（`/plugin`）展示字段主要来自：
  - 插件自身 `plugin.json` 元数据：`description`、`version`、`author`、`homepage`、`repository`、`license`、`keywords`。
    - 参考：https://docs.claude.com/en/docs/claude-code/plugins-reference
  - Marketplace 的 `marketplace.json`：`name`、`description`、`version`、`author`、`category`、`tags` 等字段用于发现和分类。
    - 参考：https://docs.claude.com/en/docs/claude-code/plugin-marketplaces
    - 示例：https://raw.githubusercontent.com/anthropics/claude-code/main/.claude-plugin/marketplace.json
- 插件 Agent 在 UI 中的展示：
  - 插件 `agents/` 会出现在 `/agents` 界面；可自动或手动调用。
  - 参考：https://docs.claude.com/en/docs/claude-code/plugins-reference

## 日志分析（claude -p --output-format stream-json --verbose --permission-mode plan）
- 日志文件：`plan/claude-code-verbose-plan.log`
- 格式：逐行 JSON（JSONL），包含 `system`、`stream_event`、`assistant`、`user` 四类记录。
- 关键统计（本次日志）：
  - 记录数：278 行
  - `stream_event` 为主，`content_block_delta` 占多数（适合做流式 UI 渲染）。
  - 工具调用统计：`Task`×1、`Read`×19、`Glob`×1、`Bash`×1、`ExitPlanMode`×1。
- Task 结构特征：
  - `Task` 事件会产生 `parent_tool_use_id`，其后续 `Read/Glob/Bash` 都绑定到该 ID，可用于 UI 串联 `Task:Explore` 的子步骤。
- Plan Mode 行为观察：
  - 即便 `permissionMode: plan`，日志中仍出现 `Bash` 执行（说明 UI 不应仅凭 plan mode 判断“无工具调用”）。
  - 出现 `ExitPlanMode` 调用，但返回 `<tool_use_error>Error: No such tool available: ExitPlanMode</tool_use_error>`。
  - `ExitPlanMode` 的 `input.plan` 字段包含完整计划文本，UI 需要在工具失败时仍提取该内容作为计划展示。
- 模型信息差异：
  - `system` 中 `model` 为 `claude-sonnet-4-5-20250929`，但 `assistant.message.model` 实际为 `glm-4.7` / `glm-4.5-air`。
  - UI 应以每条 message 的 `model` 字段为准，而非 `system` 里的默认值。

## 如何利用 TodoWrite / Task / Plan Mode
- **Plan Mode 用于“先规划后执行”**：
  - 建议用 `claude --permission-mode plan -p "<需求>"` 让 Claude 只读分析并产出计划。
  - UI 可将 `plan mode on` 作为“只读”状态提示，但仍应展示工具调用日志。
- **Task 工具用于子代理规划**：
  - 当发现 `Task` 事件时，将其视为“子任务”；用 `parent_tool_use_id` 聚合后续 Read/Glob/Bash 操作，形成任务时间线。
  - UI 可显示 `Task: <subagent_type>` 标题与其子步骤。
- **TodoWrite 用于结构化 TODO 列表**：
  - 由 Claude 使用 `TodoWrite` 生成/更新结构化任务清单，CLI 侧用 `/todos` 展示。
  - UI 可将 TodoWrite 的结构化结果持久化（如 `.claude/todos.json`）并按状态分组展示。
- **组合策略（Plan to Todo）**：
  1. 先用 Plan Mode 生成计划（计划输出或 `ExitPlanMode.input.plan`）。
  2. 将计划拆分为 TODO，并由 `TodoWrite` 写入结构化清单。
  3. 执行阶段用 `Task` 分派子代理，按 `parent_tool_use_id` 更新 TODO 进度。

## 备注
- 未发现独立的 `--task` CLI 标志或 `/task` 命令；官方文档“task”更多与后台 bash 任务相关。
