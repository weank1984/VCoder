/**
 * Task Entry Component
 * Displays Task (subagent) tool calls with nested child entries.
 * When a task completes with a text result, renders the result as
 * MarkdownContent directly in the conversation flow.
 */

import { useMemo, useState, useEffect } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import type { ToolCall } from '../../types';
import {
    RocketIcon,
    CheckIcon,
    LoadingIcon,
    ErrorIcon,
    ArrowRightIcon,
} from '../Icon';
import { MarkdownContent } from '../MarkdownContent';
import { useStore } from '../../store/useStore';

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

    return { description, subagentType };
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

function formatElapsed(ms: number): string {
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
    return <span className="task-elapsed running">{formatElapsed(now - startedAt)}</span>;
}

/**
 * Extract displayable text from the Task tool result.
 * Returns null if no meaningful text content is found.
 */
function extractResultText(result: unknown): string | null {
    if (result == null) return null;
    if (typeof result === 'string') {
        const trimmed = result.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    // result may be an array of content blocks from the CLI
    if (Array.isArray(result)) {
        const textParts: string[] = [];
        for (const block of result) {
            if (block && typeof block === 'object' && 'type' in block) {
                const b = block as { type: string; text?: string; content?: string };
                if (b.type === 'text' && typeof b.text === 'string') {
                    textParts.push(b.text);
                } else if (b.type === 'text' && typeof b.content === 'string') {
                    textParts.push(b.content);
                }
            } else if (typeof block === 'string') {
                textParts.push(block);
            }
        }
        const joined = textParts.join('\n').trim();
        return joined.length > 0 ? joined : null;
    }
    return null;
}

export function TaskEntry({ toolCall, status, hideHeader = false }: TaskEntryProps) {
    const { t } = useI18n();

    const taskInfo = useMemo(() => parseTaskInfo(toolCall.input), [toolCall.input]);
    const resultText = useMemo(() => extractResultText(toolCall.result), [toolCall.result]);
    const isComplete = status === 'success' || status === 'error';

    // Get live subagent run data for elapsed time
    const { subagentRuns } = useStore();
    const subagentRun = subagentRuns.find(r => r.id === toolCall.id);

    const handleOpenDetail = () => {
        useStore.getState().setMcSelectedRunId(toolCall.id);
    };

    // hideHeader mode: only render the result text
    if (hideHeader) {
        if (!resultText) return null;
        return (
            <div className="task-entry-result">
                <MarkdownContent content={resultText} isComplete={isComplete} />
            </div>
        );
    }

    const elapsedNode = subagentRun?.startedAt ? (
        subagentRun.status === 'running' ? (
            <ElapsedTimer startedAt={subagentRun.startedAt} />
        ) : subagentRun.completedAt ? (
            <span className="task-elapsed">{formatElapsed(subagentRun.completedAt - subagentRun.startedAt)}</span>
        ) : null
    ) : null;

    return (
        <div className={`task-entry ${status}`}>
            <div className="task-header">
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
                {elapsedNode}
                <span className={`task-status-icon ${status}`} title={toolCall.error || undefined}>
                    {getStatusIcon(status)}
                </span>
                <button
                    className="task-detail-btn"
                    title={t('StepProgress.ViewInMissionControl')}
                    onClick={handleOpenDetail}
                >
                    <ArrowRightIcon />
                </button>
            </div>

            {/* Render result text as MarkdownContent directly in the conversation flow */}
            {resultText && (
                <div className="task-entry-result">
                    <MarkdownContent content={resultText} isComplete={isComplete} />
                </div>
            )}
        </div>
    );
}
