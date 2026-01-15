/**
 * Terminal Output Component
 * Displays streaming terminal output with kill support
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import { TerminalIcon, StopIcon, CheckIcon, ErrorIcon, CopyIcon, ExpandIcon, CollapseIcon } from '../Icon';
import { useI18n } from '../../i18n/I18nProvider';
import { useThrottledValue } from '../../hooks/useThrottledUpdate';

interface TerminalOutputProps {
    /** Terminal output content */
    output: string;
    /** Terminal command */
    command?: string;
    /** Working directory */
    cwd?: string;
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
}

/**
 * Strip ANSI escape codes for safe display
 * TODO: Consider using ansi-to-html for proper coloring in future
 */
function stripAnsi(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Format execution time
 */
function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

/**
 * Copy to clipboard helper
 */
function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).catch(err => {
        console.error('Failed to copy:', err);
    });
}

export function TerminalOutput({
    output,
    command,
    cwd,
    exitCode,
    signal,
    isRunning = false,
    terminalId,
    onKill,
    defaultCollapsed = false,
}: TerminalOutputProps) {
    const { t } = useI18n();
    const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
    const startTimeRef = useRef<number | null>(null);
    const [durationMs, setDurationMs] = useState(0);
    const outputRef = useRef<HTMLPreElement>(null);
    const [autoScroll, setAutoScroll] = useState(true);

    // Reset duration tracking when a new terminal starts
    useEffect(() => {
        startTimeRef.current = null;
        const timeoutId = setTimeout(() => setDurationMs(0), 0);
        return () => clearTimeout(timeoutId);
    }, [terminalId, command]);

    // Track duration without calling Date.now() during render
    useEffect(() => {
        if (startTimeRef.current === null) {
            startTimeRef.current = Date.now();
        }

        const tick = () => {
            if (startTimeRef.current !== null) {
                setDurationMs(Date.now() - startTimeRef.current);
            }
        };

        const initialTimeoutId = setTimeout(tick, 0);

        if (!isRunning) {
            return () => clearTimeout(initialTimeoutId);
        }

        const intervalId = setInterval(tick, 250);
        return () => {
            clearTimeout(initialTimeoutId);
            clearInterval(intervalId);
        };
    }, [isRunning]);
    
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
    
    // Get state icon
    const stateIcon = useMemo(() => {
        switch (state) {
            case 'running': return <TerminalIcon />;
            case 'success': return <CheckIcon />;
            case 'error': return <ErrorIcon />;
            case 'killed': return <StopIcon />;
            default: return <TerminalIcon />;
        }
    }, [state]);
    
    // Get state label
    const stateLabel = useMemo(() => {
        switch (state) {
            case 'running': return t('Terminal.Running');
            case 'success': return t('Terminal.Success');
            case 'error': return t('Terminal.Failed');
            case 'killed': return t('Terminal.Killed');
            default: return '';
        }
    }, [state, t]);
    
    // Handle kill
    const handleKill = () => {
        if (terminalId && onKill) {
            onKill(terminalId);
        }
    };
    
    const duration = durationMs;
    
    return (
        <div className={`terminal-output ${state} ${isCollapsed ? 'collapsed' : ''}`}>
            {/* Terminal Title Bar */}
            <div className="terminal-title-bar">
                <div className="terminal-title-text">
                    {isRunning ? t('Terminal.RunningCommand') : t('Terminal.RanCommand')}: {command || 'bash'}
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

            {/* Terminal Content */}
            {!isCollapsed && (
                <div className="terminal-content">
                    {/* Command Display */}
                    <div className="terminal-command-display">
                        <div className="terminal-command-line">
                            <span className="terminal-prompt">$</span>
                            <span className="terminal-command-text">
                                {command}
                                {cwd && ` # ${cwd}`}
                            </span>
                        </div>
                    </div>

                    {/* Status Bar */}
                    <div className="terminal-status-bar">
                        <div className="terminal-status-left">
                            <span className="terminal-status-icon">{stateIcon}</span>
                            <span className="terminal-state">{stateLabel}</span>
                            {exitCode !== undefined && (
                                <span className="terminal-exit-code">
                                    exit: {exitCode}
                                </span>
                            )}
                            {signal && (
                                <span className="terminal-signal">
                                    signal: {signal}
                                </span>
                            )}
                        </div>
                        {!isRunning && (
                            <span className="terminal-duration">
                                {formatDuration(duration)}
                            </span>
                        )}
                    </div>
                    
                    {/* Output Display */}
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
