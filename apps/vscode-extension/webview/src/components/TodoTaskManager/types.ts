export type TodoItem = {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority?: 'high' | 'medium' | 'low';
};

export type EnhancedTodoItem = TodoItem & {
  createdAt: number;
  updatedAt: number;
  tags?: string[];
  estimatedTime?: number;
  assignedAgent?: string;
};

export type TaskItem = {
  id: string;
  description: string;
  subagentType?: string;
  status: 'pending' | 'running' | 'success' | 'error';
  progress?: number;
  startTime?: number;
  endTime?: number;
  result?: any;
};

export type TodoTaskFilter = {
  showTodos: boolean;
  showTasks: boolean;
  priorities: ('high' | 'medium' | 'low')[];
  statuses: string[];
};

export type TodoTaskSort = {
  by: 'priority' | 'status' | 'created' | 'updated';
  direction: 'asc' | 'desc';
};

export type TodoTaskManagerProps = {
  todos: EnhancedTodoItem[];
  tasks: TaskItem[];
  className?: string;
  maxHeight?: string | number;
  expandByDefault?: boolean;
  showFilters?: boolean;
  sortable?: boolean;
  onTodoUpdate?: (todos: EnhancedTodoItem[]) => void;
  onTaskUpdate?: (tasks: TaskItem[]) => void;
  onQuickAction?: (action: 'clear-completed' | 'mark-all-complete' | 'export') => void;
};

export const PriorityLevel = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
} as const;

export const TodoStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
} as const;

export const TaskStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  SUCCESS: 'success',
  ERROR: 'error'
} as const;

export const SortField = {
  PRIORITY: 'priority',
  STATUS: 'status',
  CREATED: 'created',
  UPDATED: 'updated'
} as const;