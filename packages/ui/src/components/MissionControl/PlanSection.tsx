import { useMemo } from 'react';
import type { Task } from '@vcoder/shared';
import classNames from 'classnames';
import { CheckIcon, ErrorIcon, LoadingIcon } from '../Icon';

interface PlanSectionProps {
  plan: Task[];
}

function getStatusIcon(status: Task['status']) {
  switch (status) {
    case 'completed': return <CheckIcon />;
    case 'failed': return <ErrorIcon />;
    case 'in_progress': return <LoadingIcon />;
    default: return <span className="mc-dot" />;
  }
}

function getStatusClass(status: Task['status']) {
  switch (status) {
    case 'completed': return 'completed';
    case 'failed': return 'failed';
    case 'in_progress': return 'in-progress';
    default: return 'pending';
  }
}

function renderTaskItem(task: Task, index: number, depth: number = 0) {
  return (
    <div key={task.id}>
      <div
        className={classNames('mc-plan-item', getStatusClass(task.status))}
        style={{ paddingLeft: 12 + depth * 16 }}
      >
        <span className="mc-plan-index">{index + 1}</span>
        <span
          className={classNames('mc-plan-icon', {
            'mc-icon-spin': task.status === 'in_progress',
          })}
        >
          {getStatusIcon(task.status)}
        </span>
        <span className="mc-plan-text">{task.title}</span>
      </div>
      {task.children?.map((child, idx) => renderTaskItem(child, idx, depth + 1))}
    </div>
  );
}

export function PlanSection({ plan }: PlanSectionProps) {
  const counts = useMemo(() => {
    let total = 0;
    let completed = 0;
    const traverse = (tasks: Task[]) => {
      for (const t of tasks) {
        total++;
        if (t.status === 'completed') completed++;
        if (t.children) traverse(t.children);
      }
    };
    traverse(plan);
    return { total, completed };
  }, [plan]);

  if (plan.length === 0) return null;

  return (
    <div className="mc-section mc-plan-section">
      <div className="mc-section-header">
        <span className="mc-section-count">{counts.completed}/{counts.total}</span>
      </div>
      <div className="mc-plan-list">
        {plan.map((task, index) => renderTaskItem(task, index))}
      </div>
    </div>
  );
}
