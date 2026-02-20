# Claude Code CLI 最新能力分析（Skills / Plugins / Agent Teams）
日期：2026-02-13
范围：官方 Claude Code 文档中关于 Skills、Plugins、Plugin Marketplaces、Hooks、Agent Teams 的最新说明。

## 1) Skills（技能）

### Skills 是什么
- Skills 通过 `SKILL.md` 扩展 Claude 的能力。Claude 可自动触发技能，也支持用户手动 `/skill-name` 调用。
- 自定义 Slash Commands 已合并进 Skills：同名技能与命令统一为 `/name`。

### 作用域与优先级
- 作用域包括企业、个人、项目与插件。
- 路径：
  - 个人：`~/.claude/skills/<skill-name>/SKILL.md`
  - 项目：`.claude/skills/<skill-name>/SKILL.md`
  - 插件：`<plugin>/skills/<skill-name>/SKILL.md`
- 优先级：企业 > 个人 > 项目。插件技能强制命名空间 `plugin-name:skill-name`，避免冲突。

### 发现与结构
- Skill 是目录结构，以 `SKILL.md` 为入口，可包含模板、示例、脚本等支持文件。
- 支持在仓库内多级 `.claude/skills/` 自动发现，适配 monorepo。

### 调用控制与权限
- `disable-model-invocation: true` 禁止模型自动调用。
- `user-invocable` 只影响菜单可见性，不影响模型自动调用；要禁用自动调用需设置 `disable-model-invocation`。
- `allowed-tools` 可在技能执行期间授予工具权限。

### 分发方式
- 项目技能：随仓库 `.claude/skills/` 分发。
- 插件技能：随插件 `skills/` 分发。
- 组织级：通过管理配置统一下发。

## 2) Plugins（插件）

### 插件可包含的内容
- 插件清单：`.claude-plugin/plugin.json`
- 插件根目录可包含：
  - `commands/`（命令形式的技能）
  - `agents/`（自定义代理）
  - `skills/`（Agent Skills）
  - `hooks/`（hooks.json）
  - `.mcp.json`（MCP 配置）
  - `.lsp.json`（LSP 配置）

### 插件技能与命名空间
- 插件技能和命令自动发现并可被调用。
- 插件内容默认命名空间隔离，避免冲突。

## 3) Plugin Marketplaces（插件市场）

### 目的
- Marketplace 提供插件清单，用于发现、版本管理、团队分发与安装提示。

### 结构（概览）
- 必填字段：`name`, `owner`, `plugins`
- 每个插件条目包含：`name`, `source`（本地路径或 git/GitHub），以及可选描述信息。

## 4) Hooks（钩子）

### 配置来源
- `~/.claude/settings.json`（用户）
- `.claude/settings.json`（项目共享）
- `.claude/settings.local.json`（项目本地）
- 组织级管理配置
- 插件 hooks：`hooks/hooks.json`
- Skill/Agent frontmatter（作用域仅限组件生命周期）

### 核心 Hook 事件
- `UserPromptSubmit`、`PreToolUse`、`PermissionRequest`、`PostToolUse`、`PostToolUseFailure`、`Notification`、`SubagentStart`、`SubagentStop`、`SessionStart`、`SessionEnd` 等。
- 可按事件类型与工具名、通知类型等进行匹配。

### Agent Teams 相关 Hook
- `TeammateIdle` 与 `TaskCompleted` 可用于质量门禁与流程控制。

## 5) Agent Teams（代理团队，实验特性）

### 启用方式
- 默认关闭；需在环境变量或 settings 中设置 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`。

### 核心模型
- Team lead + 多个 teammate（彼此独立 session）。
- 共享任务列表与消息邮箱，可直接互发消息。
- 团队与任务存储路径：
  - `~/.claude/teams/{team-name}/config.json`
  - `~/.claude/tasks/{team-name}/`

### 与 Subagents 的差异
- 适合并行探索与多方向推进；成本高于 subagents，不适合单线程或同一文件连续编辑。

### 控制与模式
- 显示模式：in-process（默认）或 split panes（tmux/iTerm2）。
- `teammateMode` 设置决定显示模式；`--teammate-mode` 可按会话覆盖。
- Delegate 模式（Shift+Tab）下 lead 只负责调度与协调。
- Plan 审批：lead 可要求 teammate 先输出计划再执行。

### 权限
- Teammate 默认继承 lead 权限设置，可在启动后调整。

## 6) 对 VCoder 的集成影响（建议）

### Skills
- 增加“技能注册表”：合并个人/项目/插件来源，按优先级与命名空间解析。
- 解析 frontmatter（`disable-model-invocation`、`user-invocable`、`allowed-tools`）。
- UI 提供 `/` 菜单；自动触发保持服务端逻辑。
- 支持 skill 支持文件与 `$ARGUMENTS` 传参。

### Plugins
- 插件加载器：读取 `.claude-plugin/plugin.json` 与根目录组件（commands/agents/skills/hooks/MCP/LSP）。
- 插件 agents 进入 Agent 选择器；插件 hooks 合并到全局 hooks。
- 将 `.mcp.json` / `.lsp.json` 注入运行时能力。

### Plugin Marketplaces
- UI 管理市场源、插件浏览与启用状态。
- 工作区级持久化 marketplace 配置与启用策略。

### Hooks
- 实现多来源 hooks 合并与优先级策略。
- 将 hook 执行落入权限/审计日志，方便溯源。

### Agent Teams
- 多会话编排层：lead + teammate 并行管理。
- UI 支持队友列表、任务板、队友消息。
- VSCode 内替代 tmux/iTerm2 的多面板展示。

## 7) 建议落地顺序

1. Skills + Slash Commands：注册表、UI 菜单、frontmatter 解析、权限联动。
2. Plugins + Marketplaces + Hooks：插件加载器、市场管理、hooks 合并与审计。
3. Agent Teams：多会话编排、任务板、消息路由、计划审批。

## 8) 待确认 / 风险
- 插件市场是完全复刻 Claude Code 逻辑，还是 VSCode 内简化版？
- `allowed-tools` 与全局权限规则的优先级如何定义？
- Agent Teams 为实验能力：是否仅在实验开关下展示？

## 参考资料（官方）
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/plugins
- https://code.claude.com/docs/en/plugins-reference
- https://code.claude.com/docs/en/plugin-marketplaces
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/agent-teams
