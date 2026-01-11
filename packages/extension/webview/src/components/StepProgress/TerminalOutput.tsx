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
 * Format file size
 */
function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Calculate byte length of a string (UTF-8)
 */
function getByteLength(str: string): number {
    // Use TextEncoder for accurate UTF-8 byte length
    return new TextEncoder().encode(str).length;
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
    const [startTime] = useState(Date.now());
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
    
    // Output stats
    const outputSize = getByteLength(output);
    const lineCount = output.split('\n').length;
    const duration = Date.now() - startTime;
    
    return (
        <div className={`terminal-output ${state} ${isCollapsed ? 'collapsed' : ''}`}>
            {/* Terminal Header */}
            <div className="terminal-header" onClick={() => setIsCollapsed(!isCollapsed)}>
                <span className="terminal-icon">{stateIcon}</span>
                <div className="terminal-info">
                    {command && (
                        <div className="terminal-command" title={command}>
                            <span className="terminal-prompt">$</span>
                            <span className="terminal-command-text">{command}</span>
                        </div>
                    )}
                    {cwd && (
                        <div className="terminal-cwd" title={cwd}>
                            {cwd}
                        </div>
                    )}
                </div>
                <div className="terminal-stats">
                    <span className="terminal-state">{stateLabel}</span>
                    {exitCode !== undefined && (
                        <span className="terminal-exit-code" title={t('Terminal.ExitCode')}>
                            exit: {exitCode}
                        </span>
                    )}
                    {signal && (
                        <span className="terminal-signal" title={t('Terminal.Signal')}>
                            signal: {signal}
                        </span>
                    )}
                    {!isRunning && (
                        <span className="terminal-duration">
                            {formatDuration(duration)}
                        </span>
                    )}
                </div>
                <div className="terminal-actions">
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
                    <span className="terminal-collapse-icon">
                        {isCollapsed ? <ExpandIcon /> : <CollapseIcon />}
                    </span>
                </div>
            </div>
            
            {/* Terminal Output Content */}
            {!isCollapsed && (
                <div className="terminal-content">
                    <pre
                        ref={outputRef}
                        className="terminal-output-text"
                        onScroll={handleScroll}
                    >
                        {cleanedOutput || (isRunning ? t('Terminal.WaitingForOutput') : t('Terminal.NoOutput'))}
                    </pre>
                    
                    {/* Output footer with stats */}
                    <div className="terminal-footer">
                        <span className="terminal-line-count">
                            {lineCount} {lineCount === 1 ? t('Terminal.Line') : t('Terminal.Lines')}
                        </span>
                        <span className="terminal-size">
                            {formatSize(outputSize)}
                        </span>
                        {isRunning && !autoScroll && (
                            <button
                                className="terminal-scroll-btn"
                                onClick={() => {
                                    setAutoScroll(true);
                                    if (outputRef.current) {
                                        outputRef.current.scrollTop = outputRef.current.scrollHeight;
                                    }
                                }}
                            >
                                {t('Terminal.ScrollToBottom')}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
