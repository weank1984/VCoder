/**
 * Task Entry Component
 * Displays Task (subagent) tool calls with nested child entries
 */

import { useMemo, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import type { ToolCall } from '../../types';
import { 
    RocketIcon,
    CheckIcon, 
    LoadingIcon, 
    ErrorIcon,
    ExpandIcon,
    CollapseIcon,
} from '../Icon';
import { ToolResultDisplay } from './ToolResultDisplay';

interface TaskEntryProps {
    toolCall: ToolCall;
    status: 'pending' | 'running' | 'success' | 'error';
    /** When true, render details only (step header already provides the summary line). */
    hideHeader?: boolean;
}

/** Parse task info from input */
function parseTaskInfo(input: unknown): {
    description: string;
    subagentType?: string;
    prompt?: string;
} {
    if (!input || typeof input !== 'object') {
        return { description: 'Task' };
    }
    
    const obj = input as Record<string, unknown>;
    const description = String(
        obj.TaskName ??
            obj.task_name ??
            obj.taskName ??
            obj.description ??
            obj.Description ??
            obj.title ??
            obj.Title ??
            'Task'
    );
    const subagentType = (
        obj.subagent_type ??
        obj.subagentType ??
        obj.SubagentType ??
        obj.subagent_name ??
        obj.subagentName ??
        obj.type
    ) as string | undefined;
    const prompt = (obj.prompt ?? obj.Prompt) as string | undefined;
    
    return { description, subagentType, prompt };
}

/** Get status icon */
function getStatusIcon(status: TaskEntryProps['status']) {
    switch (status) {
        case 'success':
            return <CheckIcon />;
        case 'error':
            return <ErrorIcon />;
        case 'running':
        case 'pending':
            return <LoadingIcon />;
        default:
            return <LoadingIcon />;
    }
}

/** Truncate text */
function truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '...';
}

export function TaskEntry({ toolCall, status, hideHeader = false }: TaskEntryProps) {
    const { t } = useI18n();
    const [isExpanded, setIsExpanded] = useState(true);
    
    const taskInfo = useMemo(() => parseTaskInfo(toolCall.input), [toolCall.input]);
    
    const hasAnyDetails = Boolean(taskInfo.prompt || toolCall.result !== undefined);

    const details = (
        <div className="task-details">
            {taskInfo.prompt && (
                <div className="task-prompt">
                    <div className="prompt-header">Prompt</div>
                    <pre>{taskInfo.prompt}</pre>
                </div>
            )}

            {toolCall.result !== undefined && (
                <div className="task-result">
                    <div className="result-header">{t('Agent.ToolResult')}</div>
                    <ToolResultDisplay result={toolCall.result} toolName="Task" />
                </div>
            )}
        </div>
    );

    if (hideHeader) {
        if (!hasAnyDetails) return null;
        return <div className={`task-entry ${status}`}>{details}</div>;
    }

    return (
        <div className={`task-entry ${status}`}>
            <div className="task-header" onClick={() => setIsExpanded(!isExpanded)}>
                <span className="task-icon">
                    <RocketIcon />
                </span>
                <div className="task-info">
                    <span className="task-action">{t('StepProgress.Delegated')}</span>
                    <span className="task-description" title={taskInfo.description}>
                        {truncate(taskInfo.description, 60)}
                    </span>
                    {taskInfo.subagentType && (
                        <span className="task-type-badge">
                            {taskInfo.subagentType}
                        </span>
                    )}
                </div>
                <span className={`task-status-icon ${status}`} title={toolCall.error || undefined}>
                    {getStatusIcon(status)}
                </span>
                <span className="task-expand-icon">
                    {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
                </span>
            </div>

            {isExpanded ? details : null}
        </div>
    );
}
