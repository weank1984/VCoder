import { useState, useEffect, useMemo } from 'react';
import type { SubagentRunUpdate, TeamMemberInfo } from '@vcoder/shared';
import type { ToolCall } from '../../types';
import type { TaskItem } from '../TodoTaskManager/types';
import type { TeamInfo } from './types';
import classNames from 'classnames';
import { useI18n } from '../../i18n/I18nProvider';
import { CheckIcon, ErrorIcon, LoadingIcon, ArrowRightIcon, RocketIcon } from '../Icon';

interface AgentSectionProps {
  /**
   * 两种不同来源的 agent 数据，概念上完全不同：
   *
   * [subagentRuns / taskItems] ← Claude Code Task 工具派生的子 agent
   *   - 来源：Claude CLI 调用 Task 工具时，ClaudeCodeWrapper 发出 subagent_run 事件
   *   - 本质：同一 CLI 进程内的独立 context window（不是新进程）
   *   - subagentRuns = 服务端实时事件路径（优先）
   *   - taskItems   = 客户端消息扫描路径（降级备用，有重叠时去重）
   *
   * [activeTeams] ← VCoder Agent Teams 多会话协作体系
   *   - 来源：Claude CLI 调用 TeamCreate 工具，VCoder 为每个成员创建 PersistentSession
   *   - 本质：多个独立 VCoder 会话，通过 TaskCreate/TaskList/TaskUpdate 协调任务
   *   - 任务 ID 为纯数字字符串（如 "1", "2"），不是 agent 名称
   */
  subagentRuns: SubagentRunUpdate[];
  taskItems: TaskItem[];
  childToolCalls?: Map<string, ToolCall[]>;
  activeTeams?: Map<string, TeamInfo>;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return '<1s';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  return `${minutes}m ${remainSeconds}s`;
}

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <span className="mc-agent-elapsed running">{formatElapsed(now - startedAt)}</span>;
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

function getToolStatusIcon(status: ToolCall['status']) {
  switch (status) {
    case 'completed': return <CheckIcon />;
    case 'failed': return <ErrorIcon />;
    case 'running':
    case 'pending':
    case 'awaiting_confirmation': return <LoadingIcon />;
  }
}

function getToolStatusClass(status: ToolCall['status']) {
  switch (status) {
    case 'completed': return 'completed';
    case 'failed': return 'failed';
    case 'running':
    case 'pending':
    case 'awaiting_confirmation': return 'in-progress';
  }
}

function summarizeToolInput(tc: ToolCall): string {
  if (!tc.input || typeof tc.input !== 'object') return '';
  const input = tc.input as Record<string, unknown>;
  // Show the most meaningful field
  if (typeof input.command === 'string') return input.command.slice(0, 80);
  if (typeof input.file_path === 'string') return input.file_path;
  if (typeof input.path === 'string') return input.path;
  if (typeof input.pattern === 'string') return input.pattern;
  if (typeof input.query === 'string') return input.query;
  if (typeof input.url === 'string') return input.url;
  if (typeof input.description === 'string') return input.description.slice(0, 80);
  return '';
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

function getMemberStatusIcon(status: TeamMemberInfo['status']) {
  switch (status) {
    case 'running': return <LoadingIcon />;
    case 'idle': return <CheckIcon />;
    case 'starting': return <LoadingIcon />;
    case 'stopped': return <span className="mc-dot" />;
    case 'failed': return <ErrorIcon />;
    case 'pending': return <span className="mc-dot" />;
  }
}

function getMemberStatusClass(status: TeamMemberInfo['status']) {
  switch (status) {
    case 'running': return 'in-progress';
    case 'starting': return 'in-progress';
    case 'idle': return 'completed';
    case 'stopped': return 'pending';
    case 'failed': return 'failed';
    case 'pending': return 'pending';
  }
}

function getMemberStatusKey(status: TeamMemberInfo['status']): string {
  switch (status) {
    case 'running': return 'MissionControl.MemberRunning';
    case 'starting': return 'MissionControl.MemberStarting';
    case 'idle': return 'MissionControl.MemberIdle';
    case 'stopped': return 'MissionControl.MemberStopped';
    case 'failed': return 'MissionControl.MemberFailed';
    case 'pending': return 'MissionControl.MemberStarting';
  }
}

const MEMBER_COLORS = ['#4a9eff', '#f5a623', '#7ed321', '#bd10e0', '#50e3c2', '#e74c3c'];

export function AgentSection({ subagentRuns, taskItems, childToolCalls, activeTeams }: AgentSectionProps) {
  const { t } = useI18n();
  const [expandedRunIds, setExpandedRunIds] = useState<Set<string>>(() => new Set());
  const [collapsedChildTools, setCollapsedChildTools] = useState<Set<string>>(() => new Set());

  const toggleRunDetails = (id: string) => {
    setExpandedRunIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleChildTools = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedChildTools((prev) => {
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
  const teamEntries = activeTeams ? [...activeTeams.values()] : [];
  const hasTeams = teamEntries.some((team) => team.members.length > 0);

  if (!hasRuns && !hasTasks && !hasTeams) return null;

  return (
    <div className="mc-section mc-agent-section">
      {hasRuns && (
        <div className="mc-agent-list">
          {subagentRuns.map((run, index) => {
            const isRunExpanded = expandedRunIds.has(run.id);
            const childTools = childToolCalls?.get(run.id);
            const hasChildTools = childTools && childTools.length > 0;
            const isChildCollapsed = collapsedChildTools.has(run.id);

            // Elapsed time
            const elapsedNode = run.startedAt ? (
              run.status === 'running' ? (
                <ElapsedTimer startedAt={run.startedAt} />
              ) : run.completedAt ? (
                <span className="mc-agent-elapsed">{formatElapsed(run.completedAt - run.startedAt)}</span>
              ) : null
            ) : null;

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
                  {elapsedNode}
                  <span className={classNames('mc-agent-expand', { expanded: isRunExpanded })}>
                    <ArrowRightIcon />
                  </span>
                </div>

                {isRunExpanded && (
                  <div className="mc-agent-details">
                    {run.status === 'failed' && run.error && (
                      <div className="mc-agent-panel mc-agent-error-panel">
                        <div className="mc-agent-panel-title">{t('Agent.ToolError')}</div>
                        <pre className="mc-agent-json mc-agent-error-text">
                          {typeof run.error === 'string' ? run.error : safeJson(run.error)}
                        </pre>
                      </div>
                    )}
                    {run.input && (
                      <div className="mc-agent-panel">
                        <div className="mc-agent-panel-title">{t('Agent.ToolInput')}</div>
                        <pre className="mc-agent-json">{safeJson(run.input)}</pre>
                      </div>
                    )}
                    {run.result !== undefined && !run.error && (
                      <div className="mc-agent-panel">
                        <div className="mc-agent-panel-title">{t('Agent.ToolResult')}</div>
                        <pre className="mc-agent-json">{safeJson(run.result)}</pre>
                      </div>
                    )}
                    {/* Show result alongside error if both exist */}
                    {run.result !== undefined && run.error && (
                      <div className="mc-agent-panel">
                        <div className="mc-agent-panel-title">{t('Agent.ToolResult')}</div>
                        <pre className="mc-agent-json">{safeJson(run.result)}</pre>
                      </div>
                    )}
                    {hasChildTools && (
                      <div className="mc-agent-child-tools">
                        <div
                          className="mc-agent-panel-title mc-agent-child-tools-header"
                          onClick={(e) => toggleChildTools(run.id, e)}
                        >
                          <span>{t('Agent.ToolCalls')} ({childTools.length})</span>
                          <span className={classNames('mc-agent-expand', { expanded: !isChildCollapsed })}>
                            <ArrowRightIcon />
                          </span>
                        </div>
                        {!isChildCollapsed && childTools.map(tc => (
                          <div key={tc.id} className={classNames('mc-child-tool', getToolStatusClass(tc.status))}>
                            <span className="mc-child-tool-icon">{getToolStatusIcon(tc.status)}</span>
                            <span className="mc-child-tool-name">{tc.name}</span>
                            <span className="mc-child-tool-summary">{summarizeToolInput(tc)}</span>
                          </div>
                        ))}
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

      {hasTeams && teamEntries.map((team) => (
        <div key={team.teamName} className="mc-team-section">
          <div className="mc-team-header">
            <span className="mc-team-name">{t('MissionControl.TeamMembers')}</span>
            {team.description && <span className="mc-team-desc">{team.description}</span>}
          </div>
          <div className="mc-team-members">
            {team.members.map((member, idx) => {
              const color = member.color || MEMBER_COLORS[idx % MEMBER_COLORS.length];
              return (
                <div
                  key={member.name}
                  className={classNames('mc-agent-item mc-team-member', getMemberStatusClass(member.status))}
                >
                  <span className="mc-team-member-dot" style={{ background: color }} />
                  <span
                    className={classNames('mc-agent-icon', {
                      'mc-icon-spin': member.status === 'running' || member.status === 'starting',
                    })}
                  >
                    {getMemberStatusIcon(member.status)}
                  </span>
                  <span className="mc-agent-text">{member.name}</span>
                  {member.agentType && (
                    <span className="mc-agent-type-badge">{member.agentType}</span>
                  )}
                  <span className="mc-team-member-status">{t(getMemberStatusKey(member.status))}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
