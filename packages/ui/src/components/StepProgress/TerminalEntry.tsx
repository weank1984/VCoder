import { useMemo } from 'react';
import type { ToolCall } from '../../types';
import { asRecord, asString, asNumber } from '../../utils/typeGuards';
import { TerminalOutput } from './TerminalOutput';

interface TerminalEntryProps {
    toolCall: ToolCall;
    /** Hide inner collapse toggle (parent handles collapsing) */
    hideCollapse?: boolean;
}

export function useTerminalData(toolCall: ToolCall) {
    return useMemo(() => {
        const input = asRecord(toolCall.input);
        const result = asRecord(toolCall.result);

        return {
            command:
                asString(input?.command) ??
                asString(input?.cmd) ??
                asString(input?.CommandLine) ??
                asString(input?.Command) ??
                '',
            output:
                typeof toolCall.result === 'string'
                    ? toolCall.result
                    : asString(result?.output) ?? asString(result?.stdout) ?? '',
            exitCode: asNumber(result?.exitCode) ?? asNumber(result?.exit_code),
            signal: asString(result?.signal),
            terminalId: asString(result?.terminalId) ?? asString(result?.terminal_id),
            isRunning: toolCall.status === 'running',
        };
    }, [toolCall.input, toolCall.result, toolCall.status]);
}

export function shouldShowTerminal(toolCall: ToolCall, data: ReturnType<typeof useTerminalData>): boolean {
    if (toolCall.status === 'awaiting_confirmation') return false;
    if (toolCall.status === 'pending') return Boolean(data.output);
    return Boolean(data.output || data.isRunning || data.command);
}

export function TerminalEntry({ toolCall, hideCollapse = false }: TerminalEntryProps) {
    const data = useTerminalData(toolCall);

    if (!shouldShowTerminal(toolCall, data)) return null;

    return (
        <TerminalOutput
            command={data.command}
            output={data.output || ''}
            exitCode={data.exitCode}
            signal={data.signal}
            isRunning={data.isRunning}
            terminalId={data.terminalId}
            defaultCollapsed={false}
            hideCollapse={hideCollapse}
        />
    );
}
