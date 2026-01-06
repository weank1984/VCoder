/**
 * Step Progress List Component
 * Displays tool executions as a step-based progress view
 */

import { useMemo, useState, useCallback } from 'react';
import type { ToolCall } from '../../types';
import { aggregateToSteps, getProgressStats } from '../../utils/stepAggregator';
import { useI18n } from '../../i18n/I18nProvider';
import { postMessage } from '../../utils/vscode';
import { StepItem } from './StepItem';
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
    const [allCollapsed, setAllCollapsed] = useState(false);
    const [collapsedSteps, setCollapsedSteps] = useState<Set<string>>(new Set());
    
    // Aggregate tool calls into steps
    const steps = useMemo(() => aggregateToSteps(toolCalls), [toolCalls]);
    
    // Get progress stats
    const stats = useMemo(() => getProgressStats(steps), [steps]);
    
    // Header status icon
    const headerIcon = useMemo(() => {
        if (stats.failed > 0) return <WarningIcon />;
        if (stats.running > 0) return <LoadingIcon />;
        return <CheckIcon />;
    }, [stats]);
    
    // Toggle individual step
    const toggleStep = useCallback((stepId: string) => {
        setCollapsedSteps(prev => {
            const next = new Set(prev);
            if (next.has(stepId)) {
                next.delete(stepId);
            } else {
                next.add(stepId);
            }
            return next;
        });
    }, []);
    
    // Toggle all steps
    const toggleAll = useCallback(() => {
        setAllCollapsed(prev => !prev);
        // Reset individual collapse states
        setCollapsedSteps(new Set());
    }, []);
    
    // Handle view file action
    const handleViewFile = useCallback((path: string, lineRange?: [number, number]) => {
        // Open file in editor - using executeCommand to open file
        // The path is passed to VS Code's openFile command
        postMessage({
            type: 'executeCommand',
            command: lineRange 
                ? `vscode.open:${path}:${lineRange[0]}`
                : `vscode.open:${path}`,
        });
    }, []);
    
    // Handle confirm/reject actions
    const handleConfirm = useCallback((tc: ToolCall, approve: boolean) => {
        if (approve) {
            postMessage({ type: 'confirmBash', commandId: tc.id });
        } else {
            postMessage({ type: 'skipBash', commandId: tc.id });
        }
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
                    title={allCollapsed ? t('StepProgress.ExpandAll') : t('StepProgress.CollapseAll')}
                >
                    {allCollapsed ? <ExpandIcon /> : <CollapseIcon />}
                    <span>{allCollapsed ? t('StepProgress.ExpandAll') : t('StepProgress.CollapseAll')}</span>
                </button>
            </div>
            
            <div className="step-progress-content">
                {steps.map((step) => (
                    <StepItem
                        key={step.id}
                        step={step}
                        isCollapsed={allCollapsed || collapsedSteps.has(step.id)}
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
