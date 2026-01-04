import { useMemo, useState } from 'react';
import type { ToolCall } from '../types';
import { 
    CheckIcon, 
    ErrorIcon, 
    LoadingIcon, 
    CollapseIcon,
    FileIcon,
    HistoryIcon
} from './Icon';
import { postMessage } from '../utils/vscode';
import './ToolCallList.scss';

interface ToolCallListProps {
    toolCalls: ToolCall[];
}

interface Step {
    id: string;
    title: string;
    calls: ToolCall[];
    status: ToolCall['status'];
    thought?: string;
}

/**
 * 语义化动作映射
 */
const ACTION_MAP: Record<string, string> = {
    'read_file': 'Analyzed',
    'view_file': 'Analyzed',
    'read_url_content': 'Analyzed',
    'grep_search': 'Searched',
    'find_by_name': 'Found',
    'write_to_file': 'Created',
    'replace_file_content': 'Edited',
    'multi_replace_file_content': 'Edited',
    'run_command': 'Executed',
    'bash': 'Executed',
    'browser_subagent': 'Navigated'
};

/**
 * 获取文件图标后缀类名
 */
const getFileExtClass = (path: string): string => {
    const ext = path.split('.').pop()?.toLowerCase();
    if (!ext) return '';
    if (['ts', 'tsx', 'js', 'jsx'].includes(ext)) return 'tsx';
    if (['css', 'scss', 'less'].includes(ext)) return 'scss';
    if (['md', 'txt'].includes(ext)) return 'md';
    if (['json', 'yaml', 'yml'].includes(ext)) return 'json';
    return '';
};

export function ToolCallList({ toolCalls }: ToolCallListProps) {
    const [isAllCollapsed, setIsAllCollapsed] = useState(false);
    const [collapsedSteps, setCollapsedSteps] = useState<Set<string>>(new Set());
    const [expandedThoughts, setExpandedThoughts] = useState<Set<string>>(new Set());

    // 步骤分组逻辑
    const steps = useMemo(() => {
        const result: Step[] = [];
        let currentStep: Step | null = null;

        toolCalls.forEach((tc) => {
            const isBoundary = tc.name === 'task_boundary' || tc.name === 'Task';
            
            if (isBoundary) {
                const input = tc.input as any;
                const title = input?.TaskName || input?.description || input?.TaskStatus || 'Executing Task';
                
                currentStep = {
                    id: tc.id,
                    title,
                    calls: [],
                    status: tc.status
                };
                result.push(currentStep);
            } else {
                if (!currentStep) {
                    currentStep = {
                        id: 'initial-step',
                        title: 'Initialization',
                        calls: [],
                        status: 'completed'
                    };
                    result.push(currentStep);
                }
                currentStep.calls.push(tc);
                if (tc.status === 'failed') currentStep.status = 'failed';
                else if (tc.status === 'running' && currentStep.status !== 'failed') currentStep.status = 'running';
            }
        });

        return result;
    }, [toolCalls]);

    const toggleStep = (id: string) => {
        setCollapsedSteps(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleThought = (id: string) => {
        setExpandedThoughts(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleAction = (tc: ToolCall) => {
        // 模拟 "View" 操作，根据不同工具跳转
        const input = tc.input as any;
        const path = input?.TargetFile || input?.AbsolutePath || input?.Path || input?.path;
        if (path) {
            postMessage({ type: 'executeCommand', command: `vscode.open ${path}` });
        }
    };

    if (toolCalls.length === 0) return null;

    return (
        <div className="tool-call-list">
            <div className="tool-list-controls">
                <button className="collapse-all-btn" onClick={() => setIsAllCollapsed(!isAllCollapsed)}>
                    <HistoryIcon />
                    {isAllCollapsed ? 'Expand all' : 'Collapse all'}
                </button>
            </div>

            {steps.map((step, index) => {
                const isCollapsed = isAllCollapsed || collapsedSteps.has(step.id);
                
                return (
                    <div key={step.id} className="step-item">
                        <div className="step-header" onClick={() => toggleStep(step.id)}>
                            <span className="step-number">{index + 1}</span>
                            <span className="step-title">{step.title}</span>
                            <span className="step-status">
                                {step.status === 'running' && <LoadingIcon />}
                            </span>
                        </div>

                        {!isCollapsed && (
                            <div className="step-content">
                                {step.calls.map((tc) => {
                                    const input = tc.input as any;
                                    const action = ACTION_MAP[tc.name] || 'Used';
                                    const target = input?.TargetFile || input?.AbsolutePath || input?.Url || input?.CommandLine || input?.Query || tc.name;
                                    const basename = typeof target === 'string' ? target.split('/').pop() : tc.name;
                                    const extClass = typeof target === 'string' ? getFileExtClass(target) : '';

                                    return (
                                        <div key={tc.id} className="progress-entry">
                                            <span className={`entry-icon ${extClass} status-${tc.status}`}>
                                                {tc.status === 'completed' ? (
                                                    extClass ? <FileIcon /> : <CheckIcon />
                                                ) : tc.status === 'failed' ? (
                                                    <ErrorIcon />
                                                ) : (
                                                    <LoadingIcon />
                                                )}
                                            </span>
                                            <span className="entry-action-label">{action}</span>
                                            <span className="entry-target-name" title={String(target)}>
                                                {basename}
                                                {input?.StartLine && <span className="line-range">#L{input.StartLine}{input.EndLine ? `-L${input.EndLine}` : ''}</span>}
                                            </span>
                                            <span className="entry-actions" onClick={() => handleAction(tc)}>View</span>
                                        </div>
                                    );
                                })}

                                {/* 模拟的 Thought 块，如果该步骤有思考过程 */}
                                {step.calls.length > 0 && (
                                    <div className="thought-compact">
                                        <button 
                                            className={`thought-trigger ${expandedThoughts.has(step.id) ? 'expanded' : ''}`}
                                            onClick={(e) => { e.stopPropagation(); toggleThought(step.id); }}
                                        >
                                            <CollapseIcon />
                                            Thought for 2s
                                        </button>
                                        {expandedThoughts.has(step.id) && (
                                            <div className="thought-details">
                                                I am processing the logic for this step. This involves analyzing the provided context and determining the best course of action.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
