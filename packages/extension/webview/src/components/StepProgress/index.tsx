/**
 * Step Progress List Component
 * Displays tool executions as a step-based progress view
 */

import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import type { ToolCall } from '../../types';
import { aggregateToSteps, getProgressStats, type Step } from '../../utils/stepAggregator';
import { useI18n } from '../../i18n/I18nProvider';
import { postMessage } from '../../utils/vscode';
import { useStore } from '../../store/useStore';
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
    const { viewMode } = useStore();
    // 历史对话默认全部折叠，实时对话默认展开
    const [allCollapsed, setAllCollapsed] = useState(viewMode === 'history');
    const [collapsedSteps, setCollapsedSteps] = useState<Set<string>>(new Set());
    // 记录之前每个步骤的状态，用于检测状态变化
    const prevStepStatusRef = useRef<Map<string, Step['status']>>(new Map());
    
    // Aggregate tool calls into steps
    const steps = useMemo(() => aggregateToSteps(toolCalls), [toolCalls]);
    
    // Get progress stats
    const stats = useMemo(() => getProgressStats(steps), [steps]);
    
    // 当步骤从 running 变为 completed/failed 时，自动折叠该步骤
    // When a step transitions from running to completed/failed, auto-collapse it
    useEffect(() => {
        const prevStatusMap = prevStepStatusRef.current;
        const stepsToCollapse: string[] = [];
        
        steps.forEach(step => {
            const prevStatus = prevStatusMap.get(step.id);
            // 如果之前是 running，现在变成 completed 或 failed，则自动折叠
            if (prevStatus === 'running' && (step.status === 'completed' || step.status === 'failed')) {
                stepsToCollapse.push(step.id);
            }
            // 更新状态记录
            prevStatusMap.set(step.id, step.status);
        });
        
        if (stepsToCollapse.length > 0) {
            setCollapsedSteps(prev => {
                const next = new Set(prev);
                stepsToCollapse.forEach(id => next.add(id));
                return next;
            });
        }
    }, [steps]);
    
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
    
    // Handle confirm/reject actions using the unified confirmTool method
    const handleConfirm = useCallback((tc: ToolCall, approve: boolean, options?: { trustAlways?: boolean; editedContent?: string }) => {
        // Use confirmTool for all tool confirmations (including bash, file operations, etc.)
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
