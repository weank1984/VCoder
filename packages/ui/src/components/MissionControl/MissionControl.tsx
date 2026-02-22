import { useState, useMemo } from 'react';
import classNames from 'classnames';
import { useI18n } from '../../i18n/I18nProvider';
import { ManageIcon, ArrowRightIcon } from '../Icon';
import { PlanSection } from './PlanSection';
import { AgentSection } from './AgentSection';
import { TodoSection } from './TodoSection';
import type { MissionControlProps, MissionControlTab } from './types';
import './MissionControl.scss';

export function MissionControl({ planTasks, subagentRuns, todoItems, taskItems, childToolCalls, activeTeams }: MissionControlProps) {
  const { t } = useI18n();
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<MissionControlTab>('plan');

  const hasPlan = planTasks.length > 0;
  const hasTeamMembers = activeTeams ? [...activeTeams.values()].some((team) => team.members.length > 0) : false;
  const hasAgents = subagentRuns.length > 0 || taskItems.length > 0 || hasTeamMembers;
  const hasTodos = todoItems.length > 0;

  const availableTabs = useMemo(() => {
    const tabs: MissionControlTab[] = [];
    if (hasPlan) tabs.push('plan');
    if (hasAgents) tabs.push('agents');
    if (hasTodos) tabs.push('todos');
    return tabs;
  }, [hasPlan, hasAgents, hasTodos]);

  // Auto-select first available tab if current is not available
  const effectiveTab = availableTabs.includes(activeTab) ? activeTab : availableTabs[0];

  // Compute summary stats
  const planCompleted = useMemo(() => {
    let total = 0;
    let completed = 0;
    const traverse = (items: typeof planTasks) => {
      for (const item of items) {
        total++;
        if (item.status === 'completed') completed++;
        if (item.children) traverse(item.children);
      }
    };
    traverse(planTasks);
    return { total, completed };
  }, [planTasks]);

  // When subagentRuns exist, taskItems are duplicates (same data from different sources).
  // Only count taskItems when there are no subagentRuns to avoid double-counting.
  const countTaskItems = subagentRuns.length === 0;
  const agentRunning = subagentRuns.filter(r => r.status === 'running').length
    + (countTaskItems ? taskItems.filter(item => item.status === 'running').length : 0);
  const agentTotal = subagentRuns.length + (countTaskItems ? taskItems.length : 0);
  const agentCompleted = subagentRuns.filter(r => r.status === 'completed').length
    + (countTaskItems ? taskItems.filter(item => item.status === 'success').length : 0);

  const todoCompleted = todoItems.filter(item => item.status === 'completed').length;

  const isRunning = agentRunning > 0 || planTasks.some(function check(item): boolean {
    return item.status === 'in_progress' || (item.children?.some(check) ?? false);
  });

  // Build summary text
  const summaryParts: string[] = [];
  if (hasPlan) summaryParts.push(`${planCompleted.completed}/${planCompleted.total} ${t('MissionControl.Plan').toLowerCase()}`);
  if (hasAgents) {
    const agentSummary = agentRunning > 0
      ? `${agentCompleted}/${agentTotal} · ${agentRunning} running`
      : `${agentCompleted}/${agentTotal}`;
    summaryParts.push(agentSummary);
  }
  if (hasTodos) summaryParts.push(`${todoCompleted}/${todoItems.length} todos`);

  // Nothing to show - return null AFTER all hooks
  if (availableTabs.length === 0) return null;

  const blockClass = classNames('mission-control', 'agent-block', {
    'agent-block--running': isRunning,
    'agent-block--success': !isRunning && agentTotal > 0 && agentCompleted === agentTotal,
  });

  return (
    <div className={blockClass}>
      <div className="agent-block-header" onClick={() => setIsExpanded(!isExpanded)}>
        <span className="agent-block-icon"><ManageIcon /></span>
        <span className="agent-block-title">{t('MissionControl.Title')}</span>
        <span className="mc-summary-text">{summaryParts.join(' · ')}</span>
        <span className={classNames('agent-block-expand-icon', { expanded: isExpanded })}>
          <ArrowRightIcon />
        </span>
      </div>

      <div className={classNames('mc-body', { collapsed: !isExpanded })}>
        {availableTabs.length > 1 && (
          <div className="mc-tabs">
            {availableTabs.map((tab) => (
              <button
                key={tab}
                className={classNames('mc-tab', { 'mc-tab-active': effectiveTab === tab })}
                onClick={() => setActiveTab(tab)}
              >
                {t(`MissionControl.${tab.charAt(0).toUpperCase() + tab.slice(1)}`)}
              </button>
            ))}
          </div>
        )}

        <div className="mc-content">
          {effectiveTab === 'plan' && <PlanSection plan={planTasks} />}
          {effectiveTab === 'agents' && <AgentSection subagentRuns={subagentRuns} taskItems={taskItems} childToolCalls={childToolCalls} activeTeams={activeTeams} />}
          {effectiveTab === 'todos' && <TodoSection todos={todoItems} />}
        </div>
      </div>
    </div>
  );
}
