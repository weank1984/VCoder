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
    // Track steps we've already applied default-collapse logic to.
    const seenStepIdsRef = useRef<Set<string>>(new Set());
    const prevToolCallCountRef = useRef<number>(toolCalls.length);
    
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
    
    // 当步骤从 running 变为 completed/failed 时，自动折叠该步骤
    // When a step transitions from running to completed/failed, auto-collapse it
    useEffect(() => {
        const prevStatusMap = prevStepStatusRef.current;
        const stepsToCollapse: string[] = [];

        const isTerminalTool = (name: string) =>
            ['bash', 'bashoutput', 'bash_output', 'run_command', 'mcp__acp__bashoutput'].includes(name.toLowerCase()) ||
            name.toLowerCase().includes('terminal');
        const isFileEditTool = (name: string) =>
            [
                'write',
                'edit',
                'strreplace',
                'multiedit',
                'write_to_file',
                'replace_file_content',
                'multi_replace_file_content',
                'apply_patch',
                'str_replace',
                'mcp__acp__write',
                'mcp__acp__edit',
            ].includes(name.toLowerCase());
        const isStickyOpenStep = (step: Step) =>
            step.entries.some((e) => {
                const tc = e.toolCall;
                return (
                    tc.status === 'awaiting_confirmation' ||
                    tc.name === 'TodoWrite' ||
                    isTerminalTool(tc.name) ||
                    isFileEditTool(tc.name)
                );
            });
        
        steps.forEach(step => {
            const prevStatus = prevStatusMap.get(step.id);
            // 如果之前是 running，现在变成 completed 或 failed，则自动折叠
            if (
                prevStatus === 'running' &&
                (step.status === 'completed' || step.status === 'failed') &&
                !isStickyOpenStep(step)
            ) {
                stepsToCollapse.push(step.id);
            }
            // 更新状态记录
            prevStatusMap.set(step.id, step.status);
        });
        
        if (stepsToCollapse.length === 0) return;

        const timeoutId = setTimeout(() => {
            setCollapsedSteps(prev => {
                const next = new Set(prev);
                stepsToCollapse.forEach(id => next.add(id));
                return next;
            });
        }, 0);

        return () => clearTimeout(timeoutId);
    }, [steps]);

    // Live mode: default-collapse non-important steps to match the reference UI.
    useEffect(() => {
        const didReset = toolCalls.length < prevToolCallCountRef.current;
        prevToolCallCountRef.current = toolCalls.length;

        setCollapsedSteps((prev) => {
            // Reset conditions (new session / cleared tool calls / history view).
            if (viewMode === 'history' || steps.length === 0 || didReset) {
                seenStepIdsRef.current = new Set();
                return new Set();
            }

            const isTerminalTool = (name: string) =>
                ['bash', 'bashoutput', 'bash_output', 'run_command', 'mcp__acp__bashoutput'].includes(name.toLowerCase()) ||
                name.toLowerCase().includes('terminal');
            const isFileEditTool = (name: string) =>
                [
                    'write',
                    'edit',
                    'strreplace',
                    'multiedit',
                    'write_to_file',
                    'replace_file_content',
                    'multi_replace_file_content',
                    'apply_patch',
                    'str_replace',
                    'mcp__acp__write',
                    'mcp__acp__edit',
                ].includes(name.toLowerCase());

            const next = new Set(prev);
            for (const step of steps) {
                // Only decide default for new steps; preserve user toggles.
                if (seenStepIdsRef.current.has(step.id)) continue;
                seenStepIdsRef.current.add(step.id);
                const shouldDefaultExpand = step.entries.some((e) => {
                    const tc = e.toolCall;
                    return (
                        tc.status === 'awaiting_confirmation' ||
                        tc.name === 'TodoWrite' ||
                        isTerminalTool(tc.name) ||
                        isFileEditTool(tc.name)
                    );
                });
                if (!shouldDefaultExpand) next.add(step.id);
            }
            return next;
        });
    }, [steps, toolCalls.length, viewMode]);
    
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
