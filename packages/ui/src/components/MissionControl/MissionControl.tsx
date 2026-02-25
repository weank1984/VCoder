import { useState, useMemo, useEffect } from 'react';
import classNames from 'classnames';
import { useI18n } from '../../i18n/I18nProvider';
import { ManageIcon, ArrowRightIcon, ArrowLeftIcon } from '../Icon';
import { PlanSection } from './PlanSection';
import { AgentSection } from './AgentSection';
import { AgentDetailView } from './AgentDetailView';
import { TodoSection } from './TodoSection';
import type { MissionControlProps, MissionControlTab } from './types';
import './MissionControl.scss';

export function MissionControl({ planTasks, subagentRuns, todoItems, taskItems, childToolCalls, activeTeams, onScrollToConfirmation }: MissionControlProps) {
  const { t } = useI18n();
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<MissionControlTab>('plan');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

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

  const hasAwaitingConfirmation = useMemo(() => {
    if (!childToolCalls) return false;
    for (const calls of childToolCalls.values()) {
      if (calls.some(tc => tc.status === 'awaiting_confirmation')) return true;
    }
    return false;
  }, [childToolCalls]);

  // Auto-expand and switch to agents tab when there are awaiting_confirmation tool calls
  useEffect(() => {
    if (hasAwaitingConfirmation) {
      setIsExpanded(true);
      if (availableTabs.includes('agents')) setActiveTab('agents');
    }
  }, [hasAwaitingConfirmation]);

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
      ? `${agentCompleted}/${agentTotal} · ${agentRunning} ${t('MissionControl.Running')}`
      : `${agentCompleted}/${agentTotal}`;
    summaryParts.push(agentSummary);
  }
  if (hasTodos) summaryParts.push(`${todoCompleted}/${todoItems.length} todos`);

  // Nothing to show - return null AFTER all hooks
  if (availableTabs.length === 0) return null;

  const blockClass = classNames('mission-control', 'agent-block', {
    'agent-block--waiting': hasAwaitingConfirmation,
    'agent-block--running': !hasAwaitingConfirmation && isRunning,
    'agent-block--success': !hasAwaitingConfirmation && !isRunning && agentTotal > 0 && agentCompleted === agentTotal,
  });

  const selectedRun = selectedRunId ? subagentRuns.find(r => r.id === selectedRunId) : null;

  return (
    <div className={blockClass}>
      {selectedRun ? (
        // Detail mode header: back button + run title
        <div className="agent-block-header" onClick={() => setIsExpanded(!isExpanded)}>
          <button
            className="mc-back-btn"
            title={t('MissionControl.Back')}
            onClick={(e) => { e.stopPropagation(); setSelectedRunId(null); }}
          >
            <ArrowLeftIcon />
          </button>
          <span className="agent-block-title mc-detail-title">{selectedRun.title}</span>
          <span className={classNames('agent-block-expand-icon', { expanded: isExpanded })}>
            <ArrowRightIcon />
          </span>
        </div>
      ) : (
        // Normal mode header
        <div className="agent-block-header" onClick={() => setIsExpanded(!isExpanded)}>
          <span className="agent-block-icon"><ManageIcon /></span>
          <span className="agent-block-title">{t('MissionControl.Title')}</span>
          {hasAwaitingConfirmation && (
            <button className="mc-confirm-badge" title={t('MissionControl.NeedsConfirmation')}
              onClick={(e) => { e.stopPropagation(); onScrollToConfirmation?.(); }}>
              {t('MissionControl.NeedsConfirmation')}
            </button>
          )}
          <span className="mc-summary-text" title={summaryParts.join(' · ')}>{summaryParts.join(' · ')}</span>
          <span className={classNames('agent-block-expand-icon', { expanded: isExpanded })}>
            <ArrowRightIcon />
          </span>
        </div>
      )}

      <div className={classNames('mc-body', { collapsed: !isExpanded })}>
        {selectedRun ? (
          // Detail view
          <div className="mc-content">
            <AgentDetailView run={selectedRun} childTools={childToolCalls?.get(selectedRun.id)} />
          </div>
        ) : (
          // Normal tabs view
          <>
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
              {effectiveTab === 'agents' && (
                <AgentSection
                  subagentRuns={subagentRuns}
                  taskItems={taskItems}
                  childToolCalls={childToolCalls}
                  activeTeams={activeTeams}
                  onSelectRun={setSelectedRunId}
                />
              )}
              {effectiveTab === 'todos' && <TodoSection todos={todoItems} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
