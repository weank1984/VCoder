import type { Task, SubagentRunUpdate } from '@vcoder/shared';
import type { EnhancedTodoItem, TaskItem } from '../TodoTaskManager/types';

export type MissionControlTab = 'plan' | 'agents' | 'todos';

export interface MissionControlProps {
  planTasks: Task[];
  subagentRuns: SubagentRunUpdate[];
  todoItems: EnhancedTodoItem[];
  taskItems: TaskItem[];
}
