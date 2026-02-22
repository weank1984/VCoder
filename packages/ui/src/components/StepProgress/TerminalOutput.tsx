/**
 * Terminal Output Component
 * Displays streaming terminal output with kill support
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import { StopIcon, CopyIcon, ExpandIcon, CollapseIcon } from '../Icon';
import { useI18n } from '../../i18n/I18nProvider';
import { useThrottledValue } from '../../hooks/useThrottledUpdate';
import { copyToClipboard } from '../../utils/clipboard';

interface TerminalOutputProps {
    /** Terminal output content */
    output: string;
    /** Terminal command */
    command?: string;
    /** Exit code (if completed) */
    exitCode?: number;
    /** Signal (if killed) */
    signal?: string;
    /** Whether the terminal process is still running */
    isRunning?: boolean;
    /** Terminal ID for kill operations */
    terminalId?: string;
    /** Kill callback */
    onKill?: (terminalId: string) => void;
    /** Default collapsed state */
    defaultCollapsed?: boolean;
    /** Hide collapse toggle (when parent already handles collapsing) */
    hideCollapse?: boolean;
}

/**
 * Strip ANSI escape codes for safe display
 * TODO: Consider using ansi-to-html for proper coloring in future
 */
function stripAnsi(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1b\[[0-9;]*m/g, '');
}

export function TerminalOutput({
    output,
    command,
    exitCode,
    signal,
    isRunning = false,
    terminalId,
    onKill,
    defaultCollapsed = false,
    hideCollapse = false,
}: TerminalOutputProps) {
    const { t } = useI18n();
    const [isCollapsed, setIsCollapsed] = useState(hideCollapse ? false : defaultCollapsed);
    const outputRef = useRef<HTMLPreElement>(null);
    const [autoScroll, setAutoScroll] = useState(true);

    // Throttle output updates to improve performance during high-frequency streaming
    // Use the raw output when not running, throttled when streaming
    const throttledOutput = useThrottledValue(output, isRunning ? 100 : 0);
    const displayOutput = isRunning ? throttledOutput : output;
    
    // Clean output
    const cleanedOutput = useMemo(() => stripAnsi(displayOutput), [displayOutput]);
    
    // Auto-scroll to bottom when new output arrives
    useEffect(() => {
        if (isRunning && autoScroll && outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [displayOutput, isRunning, autoScroll]);
    
    // Check if user manually scrolled up
    const handleScroll = () => {
        if (outputRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = outputRef.current;
            const isAtBottom = scrollHeight - scrollTop - clientHeight < 10;
            setAutoScroll(isAtBottom);
        }
    };
    
    // Determine terminal state
    const state = useMemo(() => {
        if (isRunning) return 'running';
        if (signal) return 'killed';
        if (exitCode !== undefined) {
            return exitCode === 0 ? 'success' : 'error';
        }
        return 'unknown';
    }, [isRunning, exitCode, signal]);
    
    // Handle kill
    const handleKill = () => {
        if (terminalId && onKill) {
            onKill(terminalId);
        }
    };

    const effectiveCollapsed = hideCollapse ? false : isCollapsed;

    return (
        <div className={`terminal-output ${state} ${effectiveCollapsed ? 'collapsed' : ''} ${hideCollapse ? 'no-header' : ''}`}>
            {/* Terminal Title Bar - hidden when parent handles collapsing */}
            {!hideCollapse && (
                <div className="terminal-title-bar">
                    <div className="terminal-title-text">
                        <span className="terminal-prompt-prefix">$</span> {command || 'bash'}
                    </div>
                    <div className="terminal-title-actions">
                        {isRunning && terminalId && onKill && (
                            <button
                                className="terminal-kill-btn"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleKill();
                                }}
                                title={t('Terminal.Kill')}
                            >
                                <StopIcon />
                            </button>
                        )}
                        <button
                            className="terminal-copy-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(output);
                            }}
                            title={t('Terminal.CopyOutput')}
                        >
                            <CopyIcon />
                        </button>
                        <button
                            className="terminal-toggle-btn"
                            onClick={() => setIsCollapsed(!isCollapsed)}
                            title={isCollapsed ? t('Terminal.Expand') : t('Terminal.Collapse')}
                        >
                            {isCollapsed ? <ExpandIcon /> : <CollapseIcon />}
                        </button>
                    </div>
                </div>
            )}

            {/* Terminal Content */}
            {!effectiveCollapsed && (
                <div className="terminal-content">
                    {(cleanedOutput || isRunning) && (
                        <pre
                            ref={outputRef}
                            className="terminal-output-text"
                            onScroll={handleScroll}
                        >
                            {cleanedOutput || (isRunning ? t('Terminal.WaitingForOutput') : t('Terminal.NoOutput'))}
                        </pre>
                    )}
                </div>
            )}
        </div>
    );
}
