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
        {depth > 0
          ? <span className="mc-plan-child-bullet" />
          : <span className="mc-plan-index">{index + 1}</span>
        }
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
  if (plan.length === 0) return null;

  return (
    <div className="mc-section mc-plan-section">
      <div className="mc-plan-list">
        {plan.map((task, index) => renderTaskItem(task, index))}
      </div>
    </div>
  );
}
