/**
 * Task List Component - Fixed at top, shows plan tasks
 */

import { useState, useMemo } from 'react';
import type { Task } from '@vcoder/shared';
import { 
    CheckIcon, 
    LoadingIcon, 
    ErrorIcon, 
    ExpandIcon,
    CollapseIcon
} from './Icon';
import './TaskList.scss';

// Approximate PlanIcon
const PlanIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path fillRule="evenodd" clipRule="evenodd" d="M6 1H10V2H6V1ZM3 3H13V14H3V3ZM2 3V14C2 14.5523 2.44772 15 3 15H13C13.5523 15 14 14.5523 14 14V3C14 2.44772 13.5523 2 13 2H11V1C11 0.447715 10.5523 0 10 0H6C5.44772 0 5 0.447715 5 1V2H3C2.44772 2 2 2.44772 2 3ZM5 5H11V6H5V5ZM5 8H11V9H5V8ZM5 11H9V12H5V11Z"/>
    </svg>
);

const PendingIcon = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
         <path fillRule="evenodd" clipRule="evenodd" d="M8 3C5.23858 3 3 5.23858 3 8C3 10.7614 5.23858 13 8 13C10.7614 13 13 10.7614 13 8C13 5.23858 10.7614 3 8 3ZM2 8C2 4.68629 4.68629 2 8 2C11.3137 2 14 4.68629 14 8C14 11.3137 11.3137 14 8 14C4.68629 14 2 11.3137 2 8Z"/>
    </svg>
);

interface TaskListProps {
    tasks: Task[];
    visible: boolean;
}

export function TaskList({ tasks, visible }: TaskListProps) {
    const [isExpanded, setIsExpanded] = useState(true);

    const counts = useMemo(() => {
        let completed = 0;
        let total = 0;
        const traverse = (t: Task[]) => {
            t.forEach(task => {
                total++;
                if (task.status === 'completed') completed++;
                if (task.children) traverse(task.children);
            });
        };
        traverse(tasks);
        return { completed, total };
    }, [tasks]);

    if (!visible || tasks.length === 0) {
        return null;
    }

    const getStatusIcon = (status: Task['status']) => {
        switch (status) {
            case 'completed': return <CheckIcon />;
            case 'failed': return <ErrorIcon />;
            case 'in_progress': return <LoadingIcon />;
            default: return <PendingIcon />;
        }
    };

    const renderTask = (task: Task, depth = 0) => (
        <div key={task.id} className={`task-item-container`}>
            <div className={`task-item ${task.status}`} style={{ paddingLeft: depth * 20 + 12 }}>
                <span className={`task-status-icon ${task.status}`}>
                    {getStatusIcon(task.status)}
                </span>
                <span className="task-title">{task.title}</span>
            </div>
            {task.children?.map((child) => renderTask(child, depth + 1))}
        </div>
    );

    return (
        <div className={`task-list ${isExpanded ? 'expanded' : ''}`}>
            <button
                className="task-list-header"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="task-header-left">
                    <span className="task-header-icon"><PlanIcon /></span>
                    <span className="task-list-title">Task Runs</span>
                </div>
                
                <div className="task-header-right">
                    <span className="task-progress-badge">
                        {counts.completed}/{counts.total}
                    </span>
                    <span className="expand-toggle">
                        {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
                    </span>
                </div>
            </button>
            <div className="task-progress-bar">
                <div 
                    className="progress-fill" 
                    style={{ width: `${counts.total ? (counts.completed / counts.total) * 100 : 0}%` }} 
                />
            </div>

            {isExpanded && (
                <div className="task-list-content">
                    {tasks.map((task) => renderTask(task))}
                </div>
            )}
        </div>
    );
}
