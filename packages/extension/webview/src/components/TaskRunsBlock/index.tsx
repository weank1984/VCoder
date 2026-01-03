import React, { useMemo, useState } from 'react';
import type { SubagentRunUpdate } from '@vcoder/shared';
import classNames from 'classnames';
import { ArrowRightIcon, CheckIcon, CodebaseIcon, ErrorIcon, LoadingIcon } from '../Icon';
import { useI18n } from '../../i18n/I18nProvider';
import './index.scss';

interface TaskRunsBlockProps {
  runs: SubagentRunUpdate[];
  sticky?: boolean;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export const TaskRunsBlock: React.FC<TaskRunsBlockProps> = ({ runs, sticky = false }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedRunIds, setExpandedRunIds] = useState<Set<string>>(() => new Set());
  const { t } = useI18n();

  const counts = useMemo(() => {
    let total = 0;
    let running = 0;
    let completed = 0;
    let failed = 0;
    for (const r of runs) {
      total++;
      if (r.status === 'running') running++;
      else if (r.status === 'failed') failed++;
      else completed++;
    }
    return { total, running, completed, failed };
  }, [runs]);

  const isRunning = counts.running > 0;
  const isAllCompleted = counts.completed === counts.total && counts.failed === 0 && counts.total > 0;
  const isError = counts.failed > 0;

  const blockClass = classNames('agent-block', 'task-runs-block', {
    'agent-block--running': isRunning,
    'agent-block--success': isAllCompleted,
    'agent-block--error': isError,
    'task-runs-block--sticky': sticky,
  });

  const getStatusIcon = (status: SubagentRunUpdate['status']) => {
    switch (status) {
      case 'completed':
        return <CheckIcon />;
      case 'failed':
        return <ErrorIcon />;
      case 'running':
        return <LoadingIcon />;
    }
  };

  const getStatusClass = (status: SubagentRunUpdate['status']) => {
    switch (status) {
      case 'completed':
        return 'completed';
      case 'failed':
        return 'failed';
      case 'running':
        return 'in-progress';
    }
  };

  const currentRun = runs.find((r) => r.status === 'running') ?? runs[runs.length - 1];

  const toggleRunDetails = (id: string) => {
    setExpandedRunIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className={blockClass}>
      <div className="agent-block-header" onClick={() => setIsExpanded(!isExpanded)}>
        <span className="agent-block-icon"><CodebaseIcon /></span>
        <span className="agent-block-title">{t('Agent.TaskRuns')}</span>
        <span className="agent-block-badge">
          {counts.completed}/{counts.total}
        </span>
        <span className={classNames('agent-block-expand-icon', { expanded: isExpanded })}>
          <ArrowRightIcon />
        </span>
      </div>

      {!isExpanded && currentRun && (
        <div className="task-runs-current">
          <span className={classNames('task-runs-current-icon', { 'agent-block-icon-spin': currentRun.status === 'running' })}>
            {getStatusIcon(currentRun.status)}
          </span>
          <span className="task-runs-current-text">{currentRun.title}</span>
        </div>
      )}

      <div className={classNames('agent-block-content', { collapsed: !isExpanded })}>
        <div className="agent-block-list task-runs-list">
          {runs.map((run, index) => {
            const isRunExpanded = expandedRunIds.has(run.id);
            return (
              <div key={run.id} className="task-runs-item-wrap">
                <div
                  className={classNames('agent-block-item', 'task-runs-item', getStatusClass(run.status))}
                  onClick={() => toggleRunDetails(run.id)}
                >
                  <span className="task-runs-index">{index + 1}</span>
                  <span
                    className={classNames('agent-block-item-icon', {
                      'agent-block-icon-spin': run.status === 'running',
                    })}
                  >
                    {getStatusIcon(run.status)}
                  </span>
                  <span className="agent-block-item-text">{run.title}</span>
                  <span className={classNames('agent-block-expand-icon', { expanded: isRunExpanded })}>
                    <ArrowRightIcon />
                  </span>
                </div>

                {isRunExpanded && (
                  <div className="task-runs-details">
                    {run.subagentType && (
                      <div className="task-runs-meta">
                        <span className="task-runs-meta-label">{t('Agent.Subagent')}</span>
                        <span className="task-runs-meta-value">{run.subagentType}</span>
                      </div>
                    )}
                    {run.parentTaskId && (
                      <div className="task-runs-meta">
                        <span className="task-runs-meta-label">{t('Agent.PlanLabel')}</span>
                        <span className="task-runs-meta-value">{run.parentTaskId}</span>
                      </div>
                    )}
                    {run.input && (
                      <div className="task-runs-panel">
                        <div className="task-runs-panel-title">{t('Agent.ToolInput')}</div>
                        <pre className="task-runs-json">{safeJson(run.input)}</pre>
                      </div>
                    )}
                    {(run.result !== undefined || run.error) && (
                      <div className="task-runs-panel">
                        <div className="task-runs-panel-title">{run.error ? t('Agent.ToolError') : t('Agent.ToolResult')}</div>
                        <pre className="task-runs-json">{safeJson(run.error ? run.error : run.result)}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
