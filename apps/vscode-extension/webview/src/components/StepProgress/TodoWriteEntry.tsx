/**
 * TodoWrite Entry Component
 * Displays task list from TodoWrite tool calls
 */

import { useMemo, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { 
    CheckIcon, 
    LoadingIcon, 
    ErrorIcon,
    ExpandIcon,
    CollapseIcon,
    ListCheckIcon,
} from '../Icon';

interface TodoItem {
    id: string;
    content: string;
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
    priority?: 'high' | 'medium' | 'low';
}

interface TodoWriteEntryProps {
    input: unknown;
    isExpanded?: boolean;
    onToggle?: () => void;
}

/** Parse todo items from tool input */
function parseTodoItems(input: unknown): TodoItem[] {
    if (!input || typeof input !== 'object') return [];
    
    const obj = input as Record<string, unknown>;
    const tasks = obj.tasks ?? obj.todos ?? obj.items;
    
    if (!Array.isArray(tasks)) return [];
    
    return tasks.map((task, index) => {
        if (typeof task === 'string') {
            return {
                id: `task-${index}`,
                content: task,
                status: 'pending' as const,
            };
        }
        const t = task as Record<string, unknown>;
        return {
            id: String(t.id ?? `task-${index}`),
            content: String(t.content ?? t.title ?? t.description ?? ''),
            status: (t.status as TodoItem['status']) ?? 'pending',
            priority: t.priority as TodoItem['priority'],
        };
    });
}

/** Get status icon */
function getStatusIcon(status: TodoItem['status']) {
    switch (status) {
        case 'completed':
            return <CheckIcon />;
        case 'in_progress':
            return <LoadingIcon />;
        case 'cancelled':
            return <ErrorIcon />;
        default:
            return <span className="todo-circle" />;
    }
}

/** Get status class */
function getStatusClass(status: TodoItem['status']): string {
    switch (status) {
        case 'completed':
            return 'status-completed';
        case 'in_progress':
            return 'status-progress';
        case 'cancelled':
            return 'status-cancelled';
        default:
            return 'status-pending';
    }
}

export function TodoWriteEntry({ input, isExpanded = true, onToggle }: TodoWriteEntryProps) {
    const { t } = useI18n();
    const [expanded, setExpanded] = useState(isExpanded);
    
    const tasks = useMemo(() => parseTodoItems(input), [input]);
    
    // Calculate stats
    const stats = useMemo(() => {
        const completed = tasks.filter(t => t.status === 'completed').length;
        const inProgress = tasks.filter(t => t.status === 'in_progress').length;
        const pending = tasks.filter(t => t.status === 'pending').length;
        const cancelled = tasks.filter(t => t.status === 'cancelled').length;
        return { completed, inProgress, pending, cancelled, total: tasks.length };
    }, [tasks]);
    
    const handleToggle = () => {
        setExpanded(!expanded);
        onToggle?.();
    };
    
    if (tasks.length === 0) {
        return null;
    }
    
    return (
        <div className="todo-write-entry">
            <div className="todo-header" onClick={handleToggle}>
                <span className="todo-icon">
                    <ListCheckIcon />
                </span>
                <span className="todo-title">
                    {t('StepProgress.Planned')} {stats.total} task{stats.total !== 1 ? 's' : ''}
                </span>
                <div className="todo-stats">
                    {stats.completed > 0 && (
                        <span className="stat completed" title="Completed">
                            <CheckIcon /> {stats.completed}
                        </span>
                    )}
                    {stats.inProgress > 0 && (
                        <span className="stat progress" title="In Progress">
                            <LoadingIcon /> {stats.inProgress}
                        </span>
                    )}
                    {stats.pending > 0 && (
                        <span className="stat pending" title="Pending">
                            ○ {stats.pending}
                        </span>
                    )}
                </div>
                <span className="todo-expand">
                    {expanded ? <CollapseIcon /> : <ExpandIcon />}
                </span>
            </div>
            
            {expanded && (
                <div className="todo-list">
                    {tasks.map((task) => (
                        <div 
                            key={task.id} 
                            className={`todo-item ${getStatusClass(task.status)}`}
                        >
                            <span className="todo-status-icon">
                                {getStatusIcon(task.status)}
                            </span>
                            <span className="todo-content">
                                {task.content}
                            </span>
                            {task.priority && (
                                <span className={`todo-priority priority-${task.priority}`}>
                                    {task.priority}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
