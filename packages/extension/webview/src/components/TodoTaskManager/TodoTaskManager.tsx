import { useState, useMemo, useCallback } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import {
  ListCheckIcon,
  RocketIcon,
  InfoIcon,
  CollapseIcon,
  ExpandIcon,
  MoreIcon,
  TrashIcon,
  CheckIcon,
  LoadingIcon,
  ErrorIcon,
} from '../Icon';

import type {
  TodoTaskManagerProps,
  TodoTaskFilter,
  TodoTaskSort,
} from './types';
import './TodoTaskManager.scss';

type PriorityLevel = 'high' | 'medium' | 'low';
type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
type TaskStatus = 'pending' | 'running' | 'success' | 'error';

export const TodoTaskManager: React.FC<TodoTaskManagerProps> = ({
  todos,
  tasks,
  className = '',
  maxHeight,
  expandByDefault = false,
  showFilters = true,
  sortable = true,
  onTodoUpdate,
  onQuickAction,
}) => {
  const { t } = useI18n();

  const [isExpanded, setIsExpanded] = useState(expandByDefault);
  const [viewMode, setViewMode] = useState<'compact' | 'comfortable'>('compact');
  const [activeTab, setActiveTab] = useState<'all' | 'todos' | 'tasks'>('all');

  const [filter] = useState<TodoTaskFilter>({
    showTodos: true,
    showTasks: true,
    priorities: ['high', 'medium', 'low'],
    statuses: ['pending', 'in_progress', 'completed', 'running', 'error'],
  });

  const [sort] = useState<TodoTaskSort>({
    by: 'priority',
    direction: 'desc',
  });

  const priorityOrder = useMemo(() => ({
    high: 3,
    medium: 2,
    low: 1,
  }), []);

  const filteredSortedTodos = useMemo(() => {
    let filtered = todos.filter(todo => {
      if (!filter.showTodos) return false;
      if (todo.priority && !filter.priorities.includes(todo.priority)) return false;
      if (!filter.statuses.includes(todo.status)) return false;
      return true;
    });

    if (sortable) {
      filtered.sort((a, b) => {
        let comparison = 0;
        const direction = sort.direction === 'asc' ? 1 : -1;

        switch (sort.by) {
          case 'priority':
            const priorityA = a.priority ? priorityOrder[a.priority] : 0;
            const priorityB = b.priority ? priorityOrder[b.priority] : 0;
            comparison = priorityB - priorityA;
            break;
          case 'status':
            const statusOrder = { pending: 0, in_progress: 1, completed: 2, cancelled: 3 };
            comparison = statusOrder[a.status] - statusOrder[b.status];
            break;
          case 'created':
            comparison = b.createdAt - a.createdAt;
            break;
          case 'updated':
            comparison = b.updatedAt - a.updatedAt;
            break;
        }

        return comparison * direction;
      });
    }

    return filtered;
  }, [todos, filter, sort, sortable, priorityOrder]);

  const filteredSortedTasks = useMemo(() => {
    let filtered = tasks.filter(task => {
      if (!filter.showTasks) return false;
      if (!filter.statuses.includes(task.status)) return false;
      return true;
    });

    if (sortable) {
      filtered.sort((a, b) => {
        const direction = sort.direction === 'asc' ? 1 : -1;
        const statusPriority = { running: 4, pending: 3, error: 2, success: 1 };
        return (statusPriority[b.status] - statusPriority[a.status]) * direction;
      });
    }

    return filtered;
  }, [tasks, filter, sort, sortable]);

  const handleTodoStatusChange = useCallback((todoId: string, newStatus: TodoStatus) => {
    if (!onTodoUpdate) return;
    const updatedTodos = todos.map(todo =>
      todo.id === todoId
        ? { ...todo, status: newStatus, updatedAt: Date.now() }
        : todo
    );
    onTodoUpdate(updatedTodos);
  }, [todos, onTodoUpdate]);

  const handleTodoDelete = useCallback((todoId: string) => {
    if (!onTodoUpdate) return;
    const updatedTodos = todos.filter(todo => todo.id !== todoId);
    onTodoUpdate(updatedTodos);
  }, [todos, onTodoUpdate]);

  const getPriorityClass = (priority?: PriorityLevel): string => {
    if (!priority) return 'vc-todo-priority-none';
    return `vc-todo-priority-${priority}`;
  };

  const getTodoStatusIcon = (status: TodoStatus) => {
    switch (status) {
      case 'pending':
        return <ListCheckIcon style={{ fontSize: '12px' }} />;
      case 'in_progress':
        return <LoadingIcon style={{ fontSize: '12px' }} />;
      case 'completed':
        return <CheckIcon style={{ fontSize: '12px' }} />;
      case 'cancelled':
        return <ErrorIcon style={{ fontSize: '12px' }} />;
    }
  };

  const getTaskStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case 'pending':
        return <InfoIcon style={{ fontSize: '12px' }} />;
      case 'running':
        return <LoadingIcon style={{ fontSize: '12px' }} />;
      case 'success':
        return <CheckIcon style={{ fontSize: '12px' }} />;
      case 'error':
        return <ErrorIcon style={{ fontSize: '12px' }} />;
    }
  };

  const stats = useMemo(() => ({
    pendingTodos: todos.filter(t => t.status === 'pending').length,
    completedTodos: todos.filter(t => t.status === 'completed').length,
    runningTasks: tasks.filter(t => t.status === 'running').length,
    highPriority: todos.filter(t => t.priority === 'high' && t.status !== 'completed').length,
  }), [todos, tasks]);

  return (
    <div
      className={`vc-todo-task-manager ${className}`}
      style={{ maxHeight }}
    >
      <div className="vc-todo-manager-header">
        <div className="vc-todo-manager-title">
          <ListCheckIcon style={{ fontSize: '14px' }} />
          <span className="vc-todo-manager-title-text">
            {t('TODO/TASK Manager', 'TODO/TASK Manager')}
          </span>
          <span className="vc-todo-manager-count">
            {todos.length + tasks.length}
          </span>
        </div>
        <div className="vc-todo-manager-actions">
          <button
            className="vc-todo-manager-action-btn"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? <CollapseIcon style={{ fontSize: '12px' }} /> : <ExpandIcon style={{ fontSize: '12px' }} />}
          </button>
          <button
            className="vc-todo-manager-action-btn"
            onClick={() => setViewMode(viewMode === 'compact' ? 'comfortable' : 'compact')}
            aria-label={viewMode === 'compact' ? 'Comfortable view' : 'Compact view'}
          >
            <MoreIcon style={{ fontSize: '12px' }} />
          </button>
        </div>
      </div>

      <div className="vc-todo-manager-summary">
        <span className="vc-todo-summary-stat" data-priority="high">
          {stats.highPriority} {t('High', 'High')}
        </span>
        <span className="vc-todo-summary-stat">
          {stats.pendingTodos} {t('Pending', 'Pending')}
        </span>
        <span className="vc-todo-summary-stat">
          {stats.runningTasks} {t('Running', 'Running')}
        </span>
      </div>

      {showFilters && (
        <div className="vc-todo-manager-tabs">
          <button
            className={`vc-todo-tab ${activeTab === 'all' ? 'vc-todo-tab-active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            {t('All', 'All')}
          </button>
          <button
            className={`vc-todo-tab ${activeTab === 'todos' ? 'vc-todo-tab-active' : ''}`}
            onClick={() => setActiveTab('todos')}
          >
            {t('TODOs', 'TODOs')}
          </button>
          <button
            className={`vc-todo-tab ${activeTab === 'tasks' ? 'vc-todo-tab-active' : ''}`}
            onClick={() => setActiveTab('tasks')}
          >
            {t('Tasks', 'Tasks')}
          </button>
        </div>
      )}

      {isExpanded && (
        <div className="vc-todo-manager-content">
          {(activeTab === 'all' || activeTab === 'todos') && (
            <div className="vc-todo-section">
              <div className="vc-todo-section-header">
                <span className="vc-todo-section-title">
                  {t('TODOs', 'TODOs')}
                </span>
                <span className="vc-todo-section-count">
                  {filteredSortedTodos.length}
                </span>
              </div>
              <div className="vc-todo-list">
                {filteredSortedTodos.length === 0 ? (
                  <div className="vc-todo-empty">
                    <InfoIcon style={{ fontSize: '16px' }} />
                    <span>{t('No TODOs', 'No TODOs')}</span>
                  </div>
                ) : (
                  filteredSortedTodos.map(todo => (
                    <div
                      key={todo.id}
                      className={`vc-todo-item vc-todo-item-${viewMode} ${getPriorityClass(todo.priority)}`}
                      data-status={todo.status}
                    >
                      <div className="vc-todo-item-main">
                        <button
                          className={`vc-todo-checkbox ${todo.status === 'completed' ? 'vc-todo-checkbox-checked' : ''}`}
                          onClick={() => handleTodoStatusChange(
                            todo.id,
                            todo.status === 'completed' ? 'pending' : 'completed'
                          )}
                          aria-label={todo.status === 'completed' ? 'Mark as pending' : 'Mark as complete'}
                        >
                          {getTodoStatusIcon(todo.status)}
                        </button>
                        <span className={`vc-todo-content ${todo.status === 'completed' ? 'vc-todo-content-completed' : ''}`}>
                          {todo.content}
                        </span>
                      </div>
                      <div className="vc-todo-item-actions">
                        {todo.priority && (
                          <span className={`vc-todo-badge vc-todo-badge-${todo.priority}`}>
                            {t(todo.priority.toUpperCase(), todo.priority.toUpperCase())}
                          </span>
                        )}
                        <button
                          className="vc-todo-action-btn"
                          onClick={() => handleTodoDelete(todo.id)}
                          aria-label="Delete"
                        >
                          <TrashIcon style={{ fontSize: '12px' }} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {(activeTab === 'all' || activeTab === 'tasks') && (
            <div className="vc-todo-section">
              <div className="vc-todo-section-header">
                <span className="vc-todo-section-title">
                  {t('Tasks', 'Tasks')}
                </span>
                <span className="vc-todo-section-count">
                  {filteredSortedTasks.length}
                </span>
              </div>
              <div className="vc-todo-list">
                {filteredSortedTasks.length === 0 ? (
                  <div className="vc-todo-empty">
                    <RocketIcon style={{ fontSize: '16px' }} />
                    <span>{t('No Tasks', 'No Tasks')}</span>
                  </div>
                ) : (
                  filteredSortedTasks.map(task => (
                    <div
                      key={task.id}
                      className={`vc-task-item vc-task-item-${viewMode} vc-task-status-${task.status}`}
                    >
                      <div className="vc-task-item-main">
                        <span className="vc-task-status-icon">
                          {getTaskStatusIcon(task.status)}
                        </span>
                        <span className="vc-task-content">
                          {task.description}
                        </span>
                      </div>
                      <div className="vc-task-item-actions">
                        {task.subagentType && (
                          <span className="vc-task-badge">
                            <RocketIcon style={{ fontSize: '12px' }} />
                            {task.subagentType}
                          </span>
                        )}
                        {task.progress !== undefined && task.status === 'running' && (
                          <div className="vc-task-progress">
                            <div
                              className="vc-task-progress-bar"
                              style={{ width: `${task.progress}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {isExpanded && onQuickAction && (
        <div className="vc-todo-quick-actions">
          <button
            className="vc-todo-quick-action"
            onClick={() => onQuickAction('clear-completed')}
          >
            <CheckIcon style={{ fontSize: '12px' }} />
            <span>{t('Clear Completed', 'Clear Completed')}</span>
          </button>
          <button
            className="vc-todo-quick-action"
            onClick={() => onQuickAction('mark-all-complete')}
          >
            <ListCheckIcon style={{ fontSize: '12px' }} />
            <span>{t('Mark All Complete', 'Mark All Complete')}</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default TodoTaskManager;
