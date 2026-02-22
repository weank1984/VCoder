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
  planTasks: Task[];
  subagentRuns: SubagentRunUpdate[];
  todoItems: EnhancedTodoItem[];
  taskItems: TaskItem[];
  childToolCalls?: Map<string, ToolCall[]>;
  activeTeams?: Map<string, TeamInfo>;
}
