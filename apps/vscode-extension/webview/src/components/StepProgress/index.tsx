/**
 * Step Progress List Component
 * Displays tool executions as a step-based progress view
 */

import { useMemo, useCallback } from 'react';
import type { ToolCall } from '../../types';
import { aggregateToSteps, getProgressStats } from '../../utils/stepAggregator';
import { useI18n } from '../../i18n/I18nProvider';
import { postMessage } from '../../utils/vscode';
import { useStore } from '../../store/useStore';
import { StepItem } from './StepItem';
import { useStepCollapseState } from './useStepCollapseState';
import {
    CheckIcon,
    LoadingIcon,
    WarningIcon,
    CollapseIcon,
    ExpandIcon,
} from '../Icon';
import './index.scss';

interface StepProgressListProps {
    toolCalls: ToolCall[];
    defaultExpanded?: boolean;
}

export function StepProgressList({ toolCalls }: StepProgressListProps) {
    const { t } = useI18n();

    // Reduce noise: keep only the latest TodoWrite (task list updates are frequent).
    const filteredToolCalls = useMemo(() => {
        let seenTodoWrite = false;
        const out: ToolCall[] = [];
        for (let i = toolCalls.length - 1; i >= 0; i--) {
            const tc = toolCalls[i];
            if (tc.name === 'TodoWrite') {
                if (seenTodoWrite) continue;
                seenTodoWrite = true;
            }
            out.push(tc);
        }
        out.reverse();
        return out;
    }, [toolCalls]);

    // Aggregate tool calls into steps
    const steps = useMemo(() => aggregateToSteps(filteredToolCalls), [filteredToolCalls]);

    // Get progress stats
    const stats = useMemo(() => getProgressStats(steps), [steps]);

    // Collapse state management
    const { isStepCollapsed, areAllCollapsed, toggleStep, toggleAll } = useStepCollapseState(steps, toolCalls);

    // Header status icon
    const headerIcon = useMemo(() => {
        if (stats.failed > 0) return <WarningIcon />;
        if (stats.running > 0) return <LoadingIcon />;
        return <CheckIcon />;
    }, [stats]);
    
    // Handle view file action
    const handleViewFile = useCallback((path: string, lineRange?: [number, number]) => {
        postMessage({ type: 'openFile', path, lineRange });
    }, []);
    
    // Handle confirm/reject actions using the unified confirmTool method
    const handleConfirm = useCallback((tc: ToolCall, approve: boolean, options?: { trustAlways?: boolean; editedContent?: string }) => {
        // Backward compatibility: legacy bash approvals are `bash_request` updates.
        if (tc.name === 'Bash' && tc.status === 'pending') {
            postMessage({ type: approve ? 'confirmBash' : 'skipBash', commandId: tc.id });
            return;
        }

        // Unified confirm for modern confirmation flows.
        useStore.getState().confirmTool(tc.id, approve, options);
    }, []);
    
    if (steps.length === 0) return null;

    return (
        <div className="step-progress-list">
            <div className="step-progress-header">
                <span className={`header-status-icon ${stats.failed > 0 ? 'failed' : stats.running > 0 ? 'running' : 'completed'}`}>
                    {headerIcon}
                </span>
                <span className="header-title">{t('StepProgress.Title')}</span>
                <span className="header-count">{stats.completed}/{stats.total}</span>
                <button 
                    className="collapse-all-btn"
                    onClick={toggleAll}
                    title={areAllCollapsed ? t('StepProgress.ExpandAll') : t('StepProgress.CollapseAll')}
                >
                    {areAllCollapsed ? <ExpandIcon /> : <CollapseIcon />}
                    <span>{areAllCollapsed ? t('StepProgress.ExpandAll') : t('StepProgress.CollapseAll')}</span>
                </button>
            </div>
            
            <div className="step-progress-content">
                {steps.map((step) => (
                    <StepItem
                        key={step.id}
                        step={step}
                        isCollapsed={isStepCollapsed(step.id)}
                        onToggle={() => toggleStep(step.id)}
                        onViewFile={handleViewFile}
                        onConfirm={handleConfirm}
                    />
                ))}
            </div>
        </div>
    );
}

export { StepItem } from './StepItem';
export { StepEntry } from './StepEntry';
export { ToolResultDisplay } from './ToolResultDisplay';
export { TodoWriteEntry } from './TodoWriteEntry';
export { TaskEntry } from './TaskEntry';
