import type { Task, SubagentRunUpdate, TeamMemberInfo } from '@vcoder/shared';
import type { ToolCall } from '../../types';
import type { EnhancedTodoItem, TaskItem } from '../TodoTaskManager/types';

export type MissionControlTab = 'plan' | 'agents' | 'todos';

export interface TeamInfo {
  teamName: string;
  description?: string;
  leadSessionId: string;
  members: TeamMemberInfo[];
}

export interface MissionControlProps {
  /**
   * 来源：服务端解析 TodoWrite 工具输出（ClaudeCodeWrapper → task_list 事件 → store.tasks）。
   * TodoWrite 是 Claude Code CLI 的内置工具，用于 Claude 在当前会话内追踪自身的工作进度，
   * 与 Claude Code 的 plan mode（计划模式）无关。
   * 数据格式为层级结构（支持 children），对应 MissionControl 的 Checklist（清单）Tab。
   *
   * Source: server-side parsing of TodoWrite tool output via task_list update event.
   * TodoWrite is Claude's internal session work-tracking checklist, unrelated to plan mode.
   */
  planTasks: Task[];

  /**
   * 来源：服务端实时事件（ClaudeCodeWrapper 检测到 Task 工具调用时发出 subagent_run 事件）。
   * Task 工具是 Claude Code CLI 用于派生子 agent（Subagent）的机制，子 agent 运行在独立的
   * context window 中（同一进程，不是新进程）。这是「真实」的子 agent 数据路径。
   *
   * Source: real-time server events when Claude calls the Task tool to spawn a subagent.
   * A subagent runs in an independent context window within the same CLI process.
   */
  subagentRuns: SubagentRunUpdate[];

  /**
   * 来源：客户端从消息历史中扫描 TodoWrite 工具调用（App.tsx useMemo）。
   * 与 planTasks 来自同一个 TodoWrite 工具，但解析路径不同：
   *   - planTasks: 服务端层级解析，包含 children
   *   - todoItems: 客户端扁平解析，包含 priority 字段
   * 两者是同一份数据的不同视图，分别用于 Checklist Tab（层级）和 TODOs Tab（带优先级的扁平列表）。
   *
   * Source: client-side scan of message history for TodoWrite tool calls.
   * Same data source as planTasks (TodoWrite), but flat format with priority field.
   */
  todoItems: EnhancedTodoItem[];

  /**
   * 来源：客户端从消息历史中扫描 Task 工具调用（App.tsx useMemo）。
   * 与 subagentRuns 来自同一个 Task 工具，是 subagentRuns 的客户端降级备用路径：
   * 当 subagentRuns（服务端实时事件）存在时，会对 taskItems 去重，避免双重显示。
   * Task 工具 ID ≠ Agent Teams 的 TaskCreate 任务 ID（后者为纯数字字符串）。
   *
   * Source: client-side scan of message history for Task tool calls.
   * Fallback for subagentRuns; deduplicated when subagentRuns are present.
   * Note: Task tool ≠ Agent Teams TaskCreate. Task tool spawns subagents;
   * TaskCreate/TaskList are for coordinating work across Agent Teams sessions.
   */
  taskItems: TaskItem[];

  /** 子 agent 的嵌套工具调用，按父 Task 的 toolUseId 分组 */
  childToolCalls?: Map<string, ToolCall[]>;

  /** 点击"待确认"徽章时，滚动消息流到底部以显示 ApprovalUI */
  onScrollToConfirmation?: () => void;

  /**
   * 来源：VCoder Agent Teams 功能（TeamCreate 工具 + PersistentSession）。
   * Agent Teams 是跨会话的多 agent 协作机制，与 Claude Code 的 Task 工具子 agent 完全不同：
   *   - Task 工具子 agent：同一 CLI 进程内的独立 context window，单会话内使用
   *   - Agent Teams：多个独立 VCoder 会话协同工作，通过 TaskCreate/TaskList/TaskUpdate 协调任务
   *
   * Source: VCoder's Agent Teams feature (TeamCreate tool + PersistentSession).
   * Distinct from Task-tool subagents: Agent Teams are separate VCoder sessions
   * coordinated via TaskCreate/TaskList/TaskUpdate (task IDs are numeric strings like "1", "2").
   */
  activeTeams?: Map<string, TeamInfo>;
}
