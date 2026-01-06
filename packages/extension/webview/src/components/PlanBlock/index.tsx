import React, { useState, useMemo } from 'react';
import type { Task } from '@vcoder/shared';
import classNames from 'classnames';
import { ArrowRightIcon, CheckIcon, ErrorIcon, LoadingIcon, ManageIcon } from '../Icon';
import { useI18n } from '../../i18n/I18nProvider';
import './index.scss';

interface PlanBlockProps {
  plan: Task[];
  explanation?: string;
  sticky?: boolean;
}

const EMPTY_PLAN: Task[] = [];

export const PlanBlock: React.FC<PlanBlockProps> = ({ plan, explanation, sticky = false }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { t } = useI18n();
  const safePlan = plan ?? EMPTY_PLAN;

  // Flatten tasks for simple counting/display if needed, or just iterate top level
  // For now let's handle top-level tasks primarily to match PlanBlock design
  const counts = useMemo(() => {
    let total = 0;
    let pending = 0;
    let inProgress = 0;
    let completed = 0;
    let failed = 0;

    const traverse = (tasks: Task[]) => {
      tasks.forEach(t => {
        total++;
        if (t.status === 'completed') completed++;
        else if (t.status === 'failed') failed++;
        else if (t.status === 'in_progress') inProgress++;
        else pending++;
        
        if (t.children) traverse(t.children);
      });
    };
    traverse(safePlan);
    return { total, pending, inProgress, completed, failed };
  }, [safePlan]);

  if (safePlan.length === 0) {
    return null;
  }

  const isRunning = counts.inProgress > 0;
  const isAllCompleted = counts.completed === counts.total && counts.failed === 0 && counts.total > 0;
  const isError = counts.failed > 0;
  
  // Find current running task (first in_progress)
  const findCurrentTask = (tasks: Task[]): Task | null => {
    for (const t of tasks) {
      if (t.status === 'in_progress') return t;
      if (t.children) {
        const found = findCurrentTask(t.children);
        if (found) return found;
      }
    }
    return null;
  };
  const currentTask = findCurrentTask(safePlan);

  const getStatusIcon = (status: Task['status']) => {
    switch (status) {
      case 'completed': return <CheckIcon />;
      case 'failed': return <ErrorIcon />;
      case 'in_progress': return <LoadingIcon />;
      default: return <span className="dot" />; // Needs styling
    }
  };

  const getStatusClass = (status: Task['status']) => {
    switch (status) {
      case 'completed': return 'completed';
      case 'failed': return 'failed';
      case 'in_progress': return 'in-progress';
      default: return 'pending';
    }
  };

  const blockClass = classNames('agent-block', 'plan-block', {
    'agent-block--running': isRunning,
    'agent-block--success': isAllCompleted,
    'agent-block--error': isError,
    'plan-block--sticky': sticky,
  });

  const renderTaskItem = (task: Task, index: number, depth: number = 0) => (
    <div key={task.id}>
      <div
        className={classNames('agent-block-item', 'plan-item', getStatusClass(task.status))}
        style={{ paddingLeft: 12 + depth * 16 }}
      >
        <span className="plan-item-index">{index + 1}</span>
        <span
          className={classNames('agent-block-item-icon', {
            'agent-block-icon-spin': task.status === 'in_progress',
          })}
        >
          {getStatusIcon(task.status)}
        </span>
        <span className="agent-block-item-text">{task.title}</span>
      </div>
      {task.children?.map((child, idx) => renderTaskItem(child, idx, depth + 1))}
    </div>
  );

  const content = (
    <div className="plan-content-inner">
      {explanation && <div className="plan-explanation">{explanation}</div>}
      <div className="agent-block-list">
        {safePlan.map((task, index) => renderTaskItem(task, index))}
      </div>
    </div>
  );

  return (
    <div className={blockClass}>
      <div className="agent-block-header" onClick={() => setIsExpanded(!isExpanded)}>
        <span className="agent-block-icon"><ManageIcon /></span>
        <span className="agent-block-title">{t('Agent.Plan')}</span>
        <div className="plan-progress-dots">
           {/* Simple dots for top level only to avoid clutter */}
           {safePlan.map((step, i) => (
            <span 
              key={i} 
              className={classNames('progress-dot', getStatusClass(step.status))}
              title={step.title}
            />
          ))}
        </div>
        <span className="agent-block-badge">
          {counts.completed}/{counts.total}
        </span>
        <span className={classNames('agent-block-expand-icon', { expanded: isExpanded })}>
          <ArrowRightIcon />
        </span>
      </div>

      {!isExpanded && currentTask && (
        <div className="plan-current-step">
          <span className="current-step-icon"><LoadingIcon /></span>
          <span className="current-step-text">{currentTask.title}</span>
        </div>
      )}

      {/* Simplified overlay logic - always inline for now or specific sticky mode */}
      <div className={classNames('plan-content', { collapsed: !isExpanded })}>
        {content}
      </div>
    </div>
  );
};
