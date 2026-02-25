import { useState, useEffect, useMemo } from 'react';
import type { SubagentRunUpdate } from '@vcoder/shared';
import type { ToolCall } from '../../types';
import classNames from 'classnames';
import { CheckIcon, ErrorIcon, LoadingIcon } from '../Icon';

interface AgentDetailViewProps {
  run: SubagentRunUpdate;
  childTools?: ToolCall[];
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return '<1s';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  return `${minutes}m ${remainSeconds}s`;
}

function useElapsed(run: SubagentRunUpdate): string | null {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (run.status !== 'running') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [run.status]);

  if (!run.startedAt) return null;
  const ms = run.status === 'running'
    ? now - run.startedAt
    : (run.completedAt ?? now) - run.startedAt;
  return formatElapsed(ms);
}

function getToolStatusIcon(status: ToolCall['status']) {
  switch (status) {
    case 'completed': return <CheckIcon />;
    case 'failed': return <ErrorIcon />;
    default: return <LoadingIcon />;
  }
}

function getToolStatusClass(status: ToolCall['status']) {
  switch (status) {
    case 'completed': return 'completed';
    case 'failed': return 'failed';
    case 'awaiting_confirmation': return 'awaiting-confirmation';
    case 'running': return 'in-progress';
    default: return 'pending';
  }
}

function summarizeInput(tc: ToolCall): string {
  if (!tc.input || typeof tc.input !== 'object') return '';
  const input = tc.input as Record<string, unknown>;
  if (typeof input.command === 'string') return input.command.slice(0, 100);
  if (typeof input.file_path === 'string') return input.file_path;
  if (typeof input.path === 'string') return input.path;
  if (typeof input.pattern === 'string') return input.pattern;
  if (typeof input.query === 'string') return input.query;
  if (typeof input.url === 'string') return input.url;
  if (typeof input.description === 'string') return input.description.slice(0, 100);
  return '';
}

export function AgentDetailView({ run, childTools }: AgentDetailViewProps) {
  const elapsed = useElapsed(run);

  const taskDescription = run.input && typeof (run.input as Record<string, unknown>).description === 'string'
    ? (run.input as Record<string, unknown>).description as string
    : null;

  const resultText = run.result != null
    ? (typeof run.result === 'string' ? run.result : JSON.stringify(run.result, null, 2))
    : null;

  const errorText = run.error != null
    ? (typeof run.error === 'string' ? run.error : JSON.stringify(run.error))
    : null;

  const toolStats = useMemo(() => {
    if (!childTools?.length) return null;
    const counts: Record<string, number> = {};
    for (const tc of childTools) {
      counts[tc.name] = (counts[tc.name] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [childTools]);

  return (
    <div className="mc-detail-view">
      {/* 状态栏：类型 + 耗时 */}
      <div className="mc-detail-meta">
        {run.subagentType && (
          <span className="mc-agent-type-badge">{run.subagentType}</span>
        )}
        {elapsed && (
          <span className={classNames('mc-agent-elapsed', { running: run.status === 'running' })}>
            {elapsed}
          </span>
        )}
      </div>

      {/* 工具调用统计 */}
      {toolStats && (
        <div className="mc-detail-tool-stats">
          {toolStats.map(([name, count]) => (
            <span key={name} className="mc-detail-tool-stat">
              {name} <span className="mc-detail-tool-stat-count">×{count}</span>
            </span>
          ))}
        </div>
      )}

      {/* 任务描述 */}
      {taskDescription && (
        <div className="mc-detail-prompt">
          <p className="mc-detail-prompt-text">{taskDescription}</p>
        </div>
      )}

      {/* 工具活动流 */}
      {childTools && childTools.length > 0 && (
        <div className="mc-detail-tools">
          {childTools.map(tc => (
            <div key={tc.id} className={classNames('mc-detail-tool', getToolStatusClass(tc.status))}>
              <span className={classNames('mc-detail-tool-icon', {
                'mc-icon-spin': tc.status === 'running',
                'mc-await-pulse-icon': tc.status === 'awaiting_confirmation',
              })}>
                {getToolStatusIcon(tc.status)}
              </span>
              <span className="mc-detail-tool-name">{tc.name}</span>
              <span className="mc-detail-tool-summary">{summarizeInput(tc)}</span>
            </div>
          ))}
        </div>
      )}

      {/* 执行结果 */}
      {run.status === 'completed' && resultText && (
        <div className="mc-detail-result">
          <p className="mc-detail-result-text">{resultText}</p>
        </div>
      )}

      {/* 执行错误 */}
      {run.status === 'failed' && errorText && (
        <div className="mc-detail-error">
          <p className="mc-detail-error-text">{errorText}</p>
        </div>
      )}
    </div>
  );
}
