import { useState, useMemo } from 'react';
import type { SubagentRunUpdate } from '@vcoder/shared';
import type { TaskItem } from '../TodoTaskManager/types';
import classNames from 'classnames';
import { useI18n } from '../../i18n/I18nProvider';
import { CheckIcon, ErrorIcon, LoadingIcon, ArrowRightIcon, RocketIcon } from '../Icon';

interface AgentSectionProps {
  subagentRuns: SubagentRunUpdate[];
  taskItems: TaskItem[];
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getRunStatusIcon(status: SubagentRunUpdate['status']) {
  switch (status) {
    case 'completed': return <CheckIcon />;
    case 'failed': return <ErrorIcon />;
    case 'running': return <LoadingIcon />;
  }
}

function getRunStatusClass(status: SubagentRunUpdate['status']) {
  switch (status) {
    case 'completed': return 'completed';
    case 'failed': return 'failed';
    case 'running': return 'in-progress';
  }
}

function getTaskStatusIcon(status: TaskItem['status']) {
  switch (status) {
    case 'success': return <CheckIcon />;
    case 'error': return <ErrorIcon />;
    case 'running': return <LoadingIcon />;
    default: return <span className="mc-dot" />;
  }
}

function getTaskStatusClass(status: TaskItem['status']) {
  switch (status) {
    case 'success': return 'completed';
    case 'error': return 'failed';
    case 'running': return 'in-progress';
    default: return 'pending';
  }
}

export function AgentSection({ subagentRuns, taskItems }: AgentSectionProps) {
  const { t } = useI18n();
  const [expandedRunIds, setExpandedRunIds] = useState<Set<string>>(() => new Set());

  const toggleRunDetails = (id: string) => {
    setExpandedRunIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Deduplicate: subagentRuns (real-time server events) take priority over
  // taskItems (extracted from Task tool calls in messages). When both exist
  // for the same task they represent duplicate data.
  const runTitles = useMemo(() => new Set(subagentRuns.map(r => r.title)), [subagentRuns]);
  const uniqueTaskItems = useMemo(
    () => subagentRuns.length > 0
      ? taskItems.filter(task => !runTitles.has(task.description))
      : taskItems,
    [taskItems, subagentRuns.length, runTitles],
  );

  const hasRuns = subagentRuns.length > 0;
  const hasTasks = uniqueTaskItems.length > 0;

  if (!hasRuns && !hasTasks) return null;

  return (
    <div className="mc-section mc-agent-section">
      {hasRuns && (
        <div className="mc-agent-list">
          {subagentRuns.map((run, index) => {
            const isRunExpanded = expandedRunIds.has(run.id);
            return (
              <div key={run.id} className="mc-agent-item-wrap">
                <div
                  className={classNames('mc-agent-item', getRunStatusClass(run.status))}
                  onClick={() => toggleRunDetails(run.id)}
                >
                  <span className="mc-agent-index">{index + 1}</span>
                  <span
                    className={classNames('mc-agent-icon', {
                      'mc-icon-spin': run.status === 'running',
                    })}
                  >
                    {getRunStatusIcon(run.status)}
                  </span>
                  <span className="mc-agent-text">{run.title}</span>
                  {run.subagentType && (
                    <span className="mc-agent-type-badge">{run.subagentType}</span>
                  )}
                  <span className={classNames('mc-agent-expand', { expanded: isRunExpanded })}>
                    <ArrowRightIcon />
                  </span>
                </div>

                {isRunExpanded && (
                  <div className="mc-agent-details">
                    {run.input && (
                      <div className="mc-agent-panel">
                        <div className="mc-agent-panel-title">{t('Agent.ToolInput')}</div>
                        <pre className="mc-agent-json">{safeJson(run.input)}</pre>
                      </div>
                    )}
                    {(run.result !== undefined || run.error) && (
                      <div className="mc-agent-panel">
                        <div className="mc-agent-panel-title">
                          {run.error ? t('Agent.ToolError') : t('Agent.ToolResult')}
                        </div>
                        <pre className="mc-agent-json">
                          {safeJson(run.error ? run.error : run.result)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {hasTasks && (
        <div className="mc-task-list">
          {uniqueTaskItems.map((task, index) => (
            <div
              key={task.id}
              className={classNames('mc-agent-item', getTaskStatusClass(task.status))}
            >
              <span className="mc-agent-index">{(hasRuns ? subagentRuns.length : 0) + index + 1}</span>
              <span
                className={classNames('mc-agent-icon', {
                  'mc-icon-spin': task.status === 'running',
                })}
              >
                {getTaskStatusIcon(task.status)}
              </span>
              <span className="mc-agent-text">{task.description}</span>
              {task.subagentType && (
                <span className="mc-agent-type-badge">
                  <RocketIcon />
                  {task.subagentType}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
