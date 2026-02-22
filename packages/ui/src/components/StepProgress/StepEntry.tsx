import { useMemo, useState } from 'react';
import type { StepEntry as StepEntryType } from '../../utils/stepAggregator';
import type { ToolCall } from '../../types';
import { useI18n } from '../../i18n/I18nProvider';
import {
    FileIcon,
    TerminalIcon,
    SearchIcon,
    WebIcon,
    PlayIcon,
    CheckIcon,
    ErrorIcon,
    LoadingIcon,
    ExpandIcon,
    CollapseIcon,
    RocketIcon,
    ListCheckIcon,
    McpIcon,
    NotebookIcon,
} from '../Icon';
import { SmartToolInput } from './SmartToolInput';
import { TodoWriteEntry } from './TodoWriteEntry';
import { TaskEntry } from './TaskEntry';
import { TerminalEntry, useTerminalData, shouldShowTerminal } from './TerminalEntry';
import { FileEditEntry, useDiffData, shouldShowDiff } from './FileEditEntry';
import { ApprovalSection } from './ApprovalSection';
import { ToolResultSection } from './ToolResultSection';
import { McpToolDisplay } from './McpToolDisplay';
import { isTerminalToolName, isFileEditToolName } from '../../utils/toolClassifiers';

interface StepEntryProps {
    entry: StepEntryType;
    onViewFile?: (path: string, lineRange?: [number, number]) => void;
    onConfirm?: (tc: ToolCall, approve: boolean, options?: { trustAlways?: boolean; editedContent?: string }) => void;
    hideSummary?: boolean;
}

function getEntryIcon(type: StepEntryType['type']) {
    switch (type) {
        case 'file': return <FileIcon />;
        case 'command': return <TerminalIcon />;
        case 'search': return <SearchIcon />;
        case 'browser': return <WebIcon />;
        case 'task': return <RocketIcon />;
        case 'plan': return <ListCheckIcon />;
        case 'mcp': return <McpIcon />;
        case 'notebook': return <NotebookIcon />;
        default: return <PlayIcon />;
    }
}

function formatLineRange(lineRange?: [number, number]): string {
    if (!lineRange) return '';
    const [start, end] = lineRange;
    if (start === end) return `:L${start}`;
    return `:L${start}-${end}`;
}

export function StepEntry({ entry, onViewFile, onConfirm, hideSummary = false }: StepEntryProps) {
    const { t } = useI18n();
    const [isExpanded, setIsExpanded] = useState(hideSummary);

    const tc = entry.toolCall;
    const isPending = tc.status === 'pending';
    const isCommandPending = isPending && (tc.name === 'Bash' || tc.name === 'run_command');
    const isAwaitingConfirmation = tc.status === 'awaiting_confirmation';

    const isTerminalTool = isTerminalToolName(tc.name);
    const isFileEditTool = isFileEditToolName(tc.name);
    const isMcp = tc.name.startsWith('mcp__');
    const isMcpGenericTool = isMcp && !isTerminalTool && !isFileEditTool;

    const terminalData = useTerminalData(tc);
    useDiffData(tc, entry.target.fullPath ?? '');

    const actionText = t(entry.actionKey);

    const statusIcon = useMemo(() => {
        switch (entry.status) {
            case 'success': return <CheckIcon />;
            case 'error': return <ErrorIcon />;
            case 'running':
            case 'pending': return <LoadingIcon />;
            default: return null;
        }
    }, [entry.status]);

    const mcpInfo = useMemo(() => {
        if (!isMcp) return null;
        const parts = tc.name.split('__');
        return {
            server: parts[1] || 'unknown',
            tool: parts.slice(2).join('__') || tc.name,
        };
    }, [tc.name, isMcp]);

    // Specialized rendering for TodoWrite
    if (tc.name === 'TodoWrite') {
        return (
            <TodoWriteEntry
                input={tc.input}
                isExpanded={isExpanded}
                onToggle={() => setIsExpanded(!isExpanded)}
            />
        );
    }

    // Specialized rendering for Task (subagent)
    if (tc.name === 'Task') {
        return (
            <TaskEntry
                toolCall={tc}
                status={entry.status}
                hideHeader={hideSummary}
            />
        );
    }

    const handleView = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (entry.target.fullPath && onViewFile) {
            onViewFile(entry.target.fullPath, entry.target.lineRange);
        }
    };

    const showViewBtn = entry.target.fullPath && (
        entry.type === 'file' ||
        entry.type === 'notebook'
    );

    const hasTerminalSection = isTerminalTool && shouldShowTerminal(tc, terminalData);
    const hasDiffSection = isFileEditTool && shouldShowDiff(tc);
    const hasApprovalSection = Boolean(
        (isAwaitingConfirmation && onConfirm) || (!isAwaitingConfirmation && isCommandPending && onConfirm)
    );
    const hasInputSection = Boolean(
        tc.input !== undefined && !isTerminalTool && !isFileEditTool && tc.name !== 'TodoWrite'
    );
    const hasMcpSection = Boolean(isMcpGenericTool);
    const hasResultSection = Boolean(
        tc.result !== undefined && !isTerminalTool && !isFileEditTool && !isMcpGenericTool
    );
    const hasAnyDetails =
        hasTerminalSection || hasDiffSection || hasApprovalSection ||
        hasInputSection || hasMcpSection || hasResultSection;

    return (
        <div
            className={`step-entry ${entry.status} ${entry.type} ${hideSummary ? 'summary-hidden' : ''} ${
                isTerminalTool ? 'is-terminal' : ''
            } ${isFileEditTool ? 'is-file-edit' : ''}`}
        >
            {!hideSummary && (
                <div className="entry-summary" onClick={() => setIsExpanded(!isExpanded)}>
                    <span className="entry-icon">{getEntryIcon(entry.type)}</span>
                    <span className="entry-action">{actionText}</span>
                    <span className="entry-target" title={entry.target.fullPath}>
                        {isMcp && mcpInfo && (
                            <span className="mcp-badge" title={`MCP: ${mcpInfo.server}`}>
                                [{mcpInfo.server}]
                            </span>
                        )}
                        {entry.target.name}
                        {entry.target.lineRange && (
                            <span className="entry-line-range">
                                {formatLineRange(entry.target.lineRange)}
                            </span>
                        )}
                    </span>
                    <span
                        className={`entry-status-icon ${entry.status}`}
                        title={tc.error || undefined}
                    >
                        {statusIcon}
                    </span>
                    {showViewBtn && (
                        <button
                            className="entry-view-btn"
                            onClick={handleView}
                            title={t('StepProgress.View')}
                        >
                            {t('StepProgress.View')}
                        </button>
                    )}
                    <span className="entry-expand-icon">
                        {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
                    </span>
                </div>
            )}

            {(isExpanded || hideSummary) && hasAnyDetails && (
                <div className="entry-details">
                    {hasApprovalSection && onConfirm && (
                        <ApprovalSection
                            toolCall={tc}
                            isCommandPending={!isAwaitingConfirmation && isCommandPending}
                            onConfirm={onConfirm}
                        />
                    )}

                    {hasInputSection && (
                        <div className="detail-section input">
                            <div className="detail-header">{t('Agent.ToolInput')}</div>
                            <div className="detail-content">
                                <SmartToolInput input={tc.input} toolName={tc.name} />
                            </div>
                        </div>
                    )}

                    {hasTerminalSection && isTerminalTool && (
                        <TerminalEntry toolCall={tc} hideCollapse={hideSummary} />
                    )}

                    {hasDiffSection && isFileEditTool && (
                        <FileEditEntry
                            toolCall={tc}
                            fallbackPath={entry.target.fullPath ?? ''}
                            onConfirm={onConfirm ? (t, approve) => onConfirm(t, approve) : undefined}
                            onViewFile={onViewFile ? (path) => onViewFile(path) : undefined}
                        />
                    )}

                    {hasMcpSection && (
                        <McpToolDisplay
                            toolName={tc.name}
                            input={tc.input}
                            result={tc.result}
                            status={tc.status === 'awaiting_confirmation' ? 'pending' : tc.status}
                            error={tc.error}
                            defaultCollapsed={false}
                        />
                    )}

                    {hasResultSection && (
                        <ToolResultSection
                            toolCall={tc}
                            entry={entry}
                            onViewFile={onViewFile}
                        />
                    )}
                </div>
            )}
        </div>
    );
}
