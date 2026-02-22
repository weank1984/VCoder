import type { EnhancedTodoItem } from '../TodoTaskManager/types';
import { CheckIcon, LoadingIcon, ErrorIcon, ListCheckIcon } from '../Icon';

interface TodoSectionProps {
  todos: EnhancedTodoItem[];
}

function getTodoStatusIcon(status: EnhancedTodoItem['status']) {
  switch (status) {
    case 'completed': return <CheckIcon />;
    case 'in_progress': return <LoadingIcon />;
    case 'cancelled': return <ErrorIcon />;
    default: return <ListCheckIcon />;
  }
}

function getPriorityClass(priority?: string): string {
  if (!priority) return '';
  return `mc-todo-priority-${priority}`;
}

export function TodoSection({ todos }: TodoSectionProps) {
  if (todos.length === 0) return null;

  return (
    <div className="mc-section mc-todo-section">
      <div className="mc-todo-list">
        {todos.map((todo) => (
          <div
            key={todo.id}
            className={`mc-todo-item ${getPriorityClass(todo.priority)}`}
            data-status={todo.status}
          >
            <span className={`mc-todo-checkbox ${todo.status === 'completed' ? 'mc-todo-checked' : ''}`}>
              {getTodoStatusIcon(todo.status)}
            </span>
            <span className={`mc-todo-content ${todo.status === 'completed' ? 'mc-todo-done' : ''}`}>
              {todo.content}
            </span>
            {todo.priority && (
              <span className={`mc-todo-badge mc-todo-badge-${todo.priority}`}>
                {todo.priority.toUpperCase()}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
