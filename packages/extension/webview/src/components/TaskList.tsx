/**
 * Task List Component - Fixed at top, shows plan tasks
 */

import { useState } from 'react';
import type { Task } from '@vcoder/shared';
import './TaskList.css';

interface TaskListProps {
    tasks: Task[];
    visible: boolean;
}

export function TaskList({ tasks, visible }: TaskListProps) {
    const [isExpanded, setIsExpanded] = useState(true);

    if (!visible || tasks.length === 0) {
        return null;
    }

    const getStatusIcon = (status: Task['status']) => {
        switch (status) {
            case 'completed': return '✓';
            case 'in_progress': return '⏳';
            default: return '☐';
        }
    };

    const renderTask = (task: Task, depth = 0) => (
        <div key={task.id} className={`task-item ${task.status}`} style={{ paddingLeft: depth * 16 + 8 }}>
            <span className="task-status">{getStatusIcon(task.status)}</span>
            <span className="task-title">{task.title}</span>
            {task.children?.map((child) => renderTask(child, depth + 1))}
        </div>
    );

    return (
        <div className="task-list">
            <button
                className="task-list-header"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className="task-icon">📋</span>
                <span className="task-list-title">计划（{tasks.length} 项）</span>
                <span className="expand-toggle">{isExpanded ? '▼ 收起' : '▶ 展开'}</span>
            </button>

            {isExpanded && (
                <div className="task-list-content">
                    {tasks.map((task) => renderTask(task))}
                </div>
            )}
        </div>
    );
}
