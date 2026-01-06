# VCoder 竞品调研与需求分析（Cursor / Google Antigravity 等）

> 面向下一阶段迭代（v0.2+）的机会点梳理：从竞品的“交互范式”和“工程化能力”出发，结合 VCoder 当前实现，输出可落地的改进方向与优先级建议。

## 1. 目标与范围

### 1.1 目标
- 找到 Cursor、Google Antigravity 等工具在“IDE/Agent 融合”上的关键设计点，并提炼为 VCoder 的可执行改进项
- 基于当前 VCoder 架构（VSCode Extension + Agent Server + ACP），给出“能做/不该做/需要依赖”的边界
- 形成分层需求（P0/P1/P2）与路线图，为后续 PRD/Technical Design 提供输入

### 1.2 范围说明
- 本文聚焦 **IDE 侧体验（交互、可控性、可验证性、效率）** 与 **Agent 编排能力（异步、多任务、产物）**
- 不做模型能力本身评测（能力由 Claude Code / Codex CLI 等后端决定）

---

## 2. VCoder 现状与能力边界（基于当前仓库实现）

### 2.1 产品形态与架构
- **形态**：VSCode 插件，将 CLI Agent（当前以 Claude Code 为主）无缝集成到 IDE
- **架构**：Client-Server 分离，VSCode 侧通过 **ACP（JSON-RPC 2.0）** 与 Agent Server 通信
- **核心差异点**：VCoder 不直接“自建模型/工具执行”，而是做 **CLI Agent 能力的 IDE 化编排、可视化与安全控制**

### 2.2 已具备的关键体验资产（可作为迭代基座）

- **Thought/Tool 可视化**：thought 块、工具调用列表、工具结果展示
- **多会话**：会话创建/切换/删除
- **History 接入**：读取 Claude Code 本地 transcripts，展示历史会话与消息
- **能力开关与设置映射**：permissionMode、allowedTools/disallowedTools、fallback model、append system prompt、MCP config、additional dirs 等（部分已在后端封装）

### 2.2.1 计划中/未完成的功能（需要补充实现）

- **流式对话**：Webview Chat + streaming 更新 - 未实现
- **Plan Mode 与确认机制**：计划就绪后弹窗确认执行 - 目前只存在于规划中，实际未实现
- **文件变更安全链路**：file change → VSCode diff 预览 → accept/reject - 未实现
- **Bash 执行确认**：默认弹窗确认 - 代码已实现但功能不可用

### 2.3 当前边界与短板（从"IDE 体验"视角）
- **编辑器深度融合不足**：缺少 Cursor 类的 inline edit / tab completion / editor command 工作流（目前以侧边栏为主）
- **“只读问答/检索”与“可执行改动”未形成模式化隔离**：Plan/Execute 有，但缺乏 Ask/Debug 等“行为收敛”的模式
- **可验证性仍偏“日志驱动”**：工具调用透明，但“验证产物”（测试报告、截图、变更摘要）不是一等公民
- **异步/后台任务编排薄弱**：虽然有 subagent/tool 事件，但缺少统一的“任务管理面板”与交互闭环
- **可复用工作流较弱**：缺少团队可共享的命令/模板体系（类似 `.cursor/commands`）

---

## 3. 竞品解读

## 3.1 Cursor（AI-first Code Editor）

### 3.1.1 关键产品点（与 VCoder 对标的部分）
- **“模式（Mode）”是核心交互骨架**：将不同意图的任务拆成明确模式，用户知道“这次 AI 会做什么/不会做什么”
  - 典型模式：**Agent / Ask / Plan / Debug**
- **Agent 模式强调自治与闭环**：可自动运行命令并根据错误自修复（Auto-run / Auto-fix Errors）
- **Ask 模式强调检索与理解**：自动找到相关文件（Search Codebase / Find relevant files），降低用户选上下文成本
- **工作流复用**：通过 **custom slash commands** 复用/共享指令，并落盘在项目目录（如 `.cursor/commands`）

### 3.1.2 对 VCoder 的启发（抽象成可复用原则）
- **把“控制”产品化**：用 Mode 明确边界，比“靠用户提示词约束”更稳定
- **把“复用”工程化**：把高频任务抽象为命令模板，而不是每次从零写 prompt
- **把“上下文选择”自动化**：Ask 模式的价值不在聊天，而在“自动检索并收敛上下文”

---

## 3.2 Google Antigravity（agentic development platform）

### 3.2.1 关键产品点（从公开信息抽象）
- **双界面范式**：
  - **Editor View**：传统 IDE + AI（同步、手把手）
  - **Manager Surface**：专门用于 **spawn / orchestrate / observe 多个 agent**（异步、后台）
- **Artifacts 作为信任与验证载体**：
  - 让 agent 输出“可审阅的产物”（任务清单、计划、截图、录屏、walkthrough）
  - 用户在 Artifact 上评论反馈，agent 可继续迭代而不中断执行流
- **Learning/Knowledge base**：把“经验沉淀”做成平台原语，为后续任务持续增益
- **模型可选性**：对多模型/多厂商的兼容与切换

### 3.2.2 对 VCoder 的启发
- **从“日志可视化”走向“产物可审阅”**：工具调用透明是必要条件，但不等于高效验证
- **异步是下一代体验的分水岭**：把“长任务”从当前对话线程剥离到任务管理面板，减少用户阻塞
- **把“记忆/学习”纳入产品闭环**：让 VCoder 在同一项目里越用越懂

---

## 3.3 其他相关工具（用于补全趋势，不做展开评测）
- **GitHub Copilot / Copilot Chat**：IDE 深度集成、代码补全与对话并存、面向团队/企业的治理能力强
- **Cline / Continue（VSCode 生态）**：强调 agent 工具调用透明、审批链路、可配置模型与上下文策略
- **aider / Claude Code / Codex CLI（CLI 生态）**：强调端到端任务完成（含工具与权限），IDE 侧需要做的是“体验与安全的外壳”

---

## 4. 差异分析：VCoder 可以借鉴与超越的方向

## 4.1 交互范式：从“聊天”到“模式化工作”

**建议方向：引入多模式（Mode）体系（不止 Plan/Execute）**
- **Ask（只读）**：默认禁止写文件/跑命令；目标是解释、检索、定位
- **Plan（规划）**：输出计划 + 风险点 + 验证策略；必须二次确认
- **Agent（执行）**：允许改动与命令执行，但受权限策略与审批约束
- **Debug（调试）**：围绕错误日志/测试失败，强化“复现→定位→修复→回归”的闭环

落地提示（结合现有实现）：
- 现有已有 `permissionMode`/allowedTools/disallowedTools、Plan confirm、bash confirm 的基础，可将 Mode 映射为一组 **策略集合**（工具范围 + 默认确认行为 + 提示词模板）

---

## 4.2 工作流复用：引入“项目级命令模板”

**建议方向：参考 `.cursor/commands`，新增 `.vcoder/commands`**
- 支持 `/` 触发的命令模板（如 `/review`, `/fix`, `/write-tests`, `/refactor`, `/explain`）
- 命令包含：
  - 固定 prompt 模板（含工具使用约束）
  - 上下文选择策略（自动附加最近打开文件、选区、错误面板内容等）
  - Mode/权限策略的覆盖（例如强制 Ask-only）

价值：
- 提升一致性与可复制性（尤其团队内）
- 降低“写提示词”的门槛，让产品更像“工程工具”

---

## 4.3 可验证性：把 Artifacts 做成一等公民

**建议方向：在 Webview 引入 Artifact Card**
- 将零散 tool logs 聚合为“可审阅产物”：
  - **变更摘要**（文件/模块/风险）
  - **验证结果**（测试/构建/静态检查）
  - **UI 变更证据**（截图、录屏、步骤说明——取决于后端是否能产生）
  - **Plan 与执行回放**（计划 → 执行步骤 → 结果）
- 支持对 Artifact 的评论/反馈，再次驱动 agent 迭代

价值：
- 降低审阅成本（从“读日志”到“看结果”）
- 强化信任（用户更容易判断“是否达到预期”）

---

## 4.4 异步与多任务：从“会话列表”升级为“任务管理面板”

**建议方向：引入 Task Manager（Manager Surface 的轻量版）**
- 支持将长任务（重构、排错、迁移、生成测试）作为后台任务运行
- 任务维度能力：
  - 创建/暂停/取消/重试
  - 并行任务队列与资源占用提示
  - 任务产物（Artifacts）汇总
- 与现有 subagent/tool 事件结合：把“子代理运行”从信息流升级为“可操作实体”

---

## 4.5 知识库与记忆：让 VCoder 在项目内“越用越懂”

**建议方向：引入项目级 Knowledge Base（本地落盘）**
- 形式建议：
  - `.vcoder/knowledge/`（结构化：规范、架构、约定、常见坑）
  - `.vcoder/memory.md`（可读可写的“项目记忆”）
- 交互建议：
  - Chat 中一键“保存到知识库”（snippet/decision/command）
  - Prompt 时按需自动注入（例如 Debug 模式注入“本项目测试命令/启动方式”）

---

## 4.6 上下文检索：补齐 Ask 模式的关键能力

**建议方向：做“轻量索引 + 自动上下文选择”**
- 不一定要做向量索引起步，P0 可以先做：
  - `rg`/符号检索的封装与 UI（在 Ask 模式优先使用）
  - 最近文件、依赖图（package imports）、Git diff 等信号用于“相关文件推荐”
- 目标：让用户少做“@ 引用/手动选文件”，让系统“先帮你找，再让你确认”

---

## 5. 分层需求建议（P0 / P1 / P2）

## 5.1 P0（快速提升核心体验，1–2 周量级）
- **Mode 体系最小闭环**：Ask/Plan/Agent/Debug 的 UI 与策略映射（基于现有 permissionMode + 工具白名单）
- **.vcoder/commands（命令模板）**：项目级可落盘 + 输入框补全 + 一键执行
- **Artifacts v0**：至少聚合“变更摘要 + 验证结果 + Plan 摘要”，降低审阅成本
- **工具审批体验强化**：在 tool card 上突出风险等级、影响文件、可选“仅本次/始终允许”

## 5.2 P1（形成差异化：可验证 + 异步编排，2–4 周）
- **Task Manager 面板**：后台任务队列 + 任务产物汇总 + 可操作（取消/重试）
- **Knowledge Base v1**：落盘结构 + 手动/半自动写入 + Prompt 注入策略
- **自动上下文推荐**：Ask 模式“相关文件推荐”与“一键附加”

## 5.3 P2（高阶：深度 IDE 融合与多后端）
- **Editor 内联工作流**：选区 inline edit、代码动作（Code Action）驱动、可能的 inline completion 探索
- **多后端完善**：Codex CLI 接入、能力探测与统一差异展示
- **高级验证与回放**：更强的产物（截图/录屏/测试矩阵）、可追溯执行记录

---

## 6. 评估指标（建议）
- **效率**：完成一个端到端任务的总用时、用户手动选择上下文次数、重复 prompt 次数
- **信任**：拒绝变更率、bash/工具审批通过率、回滚/修复次数
- **稳定性**：会话失败率、CLI 重连成功率、长会话性能（渲染/内存）
- **复用**：命令模板使用率、团队共享命令数量、知识库命中率

---

## 7. 风险与依赖
- **CLI 能力依赖**：部分体验（如真正的 inline completion）可能需要后端提供特定接口/协议，不应硬做成“伪体验”
- **安全边界**：bypassPermissions、自动执行命令等需要明确的默认策略与显著提醒
- **性能**：长会话/大日志需要虚拟列表与渲染优化；索引/检索需要避免阻塞 UI
- **一致性**：多后端（Claude/Codex）事件映射与能力差异需要统一抽象，否则 UI/交互会碎片化

---

## 8. 参考链接
- Cursor Docs（Modes）：https://cursor.com/docs/agent/modes
- Google Developers Blog（Antigravity）：https://developers.googleblog.com/en/build-with-google-antigravity-our-new-agentic-development-platform/
- Antigravity 官网入口：https://antigravity.google/

