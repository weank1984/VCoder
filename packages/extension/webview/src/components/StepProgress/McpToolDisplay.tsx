/**
 * MCP Tool Display Component
 * Enhanced display for MCP (Model Context Protocol) tool calls
 * Shows server info, tool name, parameters summary, and result summary
 */

import { useState, useMemo } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import {
    McpIcon,
    CheckIcon,
    ErrorIcon,
    LoadingIcon,
    ExpandIcon,
    CollapseIcon,
    CopyIcon,
    InfoIcon,
} from '../Icon';

interface McpToolDisplayProps {
    /** Tool name (format: mcp__serverName__toolName) */
    toolName: string;
    /** Tool input parameters */
    input?: unknown;
    /** Tool result */
    result?: unknown;
    /** Tool status */
    status: 'pending' | 'running' | 'completed' | 'failed';
    /** Error message if failed */
    error?: string;
    /** Default collapsed state */
    defaultCollapsed?: boolean;
}

interface McpInfo {
    server: string;
    tool: string;
    fullName: string;
}

/**
 * Parse MCP tool name to extract server and tool info
 */
function parseMcpToolName(toolName: string): McpInfo | null {
    if (!toolName.startsWith('mcp__')) return null;
    
    const parts = toolName.split('__');
    if (parts.length < 3) return null;
    
    return {
        server: parts[1],
        tool: parts.slice(2).join('__'),
        fullName: toolName,
    };
}

/**
 * Generate a summary for complex objects
 */
function generateSummary(value: unknown, maxLength: number = 100): string {
    if (value === null || value === undefined) return '(empty)';
    
    if (typeof value === 'string') {
        return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
    }
    
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    
    if (Array.isArray(value)) {
        return `Array (${value.length} items)`;
    }
    
	    if (typeof value === 'object') {
	        const keys = Object.keys(value);
	        if (keys.length === 0) return '{}';
	        if (keys.length === 1) {
	            const key = keys[0];
	            const val = (value as Record<string, unknown>)[key];
	            return `{ ${key}: ${generateSummary(val, 50)} }`;
	        }
	        return `{ ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', ...' : ''} }`;
	    }
    
    return String(value);
}

/**
 * Safe JSON stringify
 */
function safeStringify(value: unknown): string {
    if (value === undefined) return '';
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

/**
 * Copy to clipboard
 */
function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).catch(err => {
        console.error('Failed to copy:', err);
    });
}

export function McpToolDisplay({
    toolName,
    input,
    result,
    status,
    error,
    defaultCollapsed = false,
}: McpToolDisplayProps) {
    const { t } = useI18n();
    const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
    const [showFullInput, setShowFullInput] = useState(false);
    const [showFullResult, setShowFullResult] = useState(false);
    
    // Parse MCP info
    const mcpInfo = useMemo(() => parseMcpToolName(toolName), [toolName]);
    
    // Generate summaries
    const inputSummary = useMemo(() => generateSummary(input), [input]);
    const resultSummary = useMemo(() => generateSummary(result, 150), [result]);
    
    // Status icon
    const statusIcon = useMemo(() => {
        switch (status) {
            case 'completed': return <CheckIcon />;
            case 'failed': return <ErrorIcon />;
            case 'running': return <LoadingIcon />;
            case 'pending': return <LoadingIcon />;
            default: return <LoadingIcon />;
        }
    }, [status]);
    
    if (!mcpInfo) {
        // Fallback: not an MCP tool
        return null;
    }
    
    return (
        <div className={`mcp-tool-display ${status} ${isCollapsed ? 'collapsed' : ''}`}>
            {/* MCP Tool Header */}
            <div className="mcp-header" onClick={() => setIsCollapsed(!isCollapsed)}>
                <span className="mcp-icon">
                    <McpIcon />
                </span>
                <div className="mcp-info">
                    <div className="mcp-tool-name">
                        <span className="mcp-server-badge" title={`MCP Server: ${mcpInfo.server}`}>
                            {mcpInfo.server}
                        </span>
                        <span className="mcp-tool">{mcpInfo.tool}</span>
                    </div>
                    {!isCollapsed && (
                        <div className="mcp-summary">
                            {inputSummary}
                        </div>
                    )}
                </div>
                <div className="mcp-status-area">
                    <span className={`mcp-status-icon ${status}`} title={error || undefined}>
                        {statusIcon}
                    </span>
                    <span className="mcp-collapse-icon">
                        {isCollapsed ? <ExpandIcon /> : <CollapseIcon />}
                    </span>
                </div>
            </div>
            
            {/* MCP Tool Content */}
            {!isCollapsed && (
                <div className="mcp-content">
                    {/* Input Section */}
                    {input !== undefined && (
                        <div className="mcp-section mcp-input">
                            <div className="mcp-section-header">
                                <InfoIcon />
                                <span>{t('Agent.ToolInput')}</span>
                                <button
                                    className="mcp-copy-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        copyToClipboard(safeStringify(input));
                                    }}
                                    title={t('Agent.CopyCode')}
                                >
                                    <CopyIcon />
                                </button>
                            </div>
                            <div className="mcp-section-content">
                                {!showFullInput && (
                                    <div className="mcp-summary-text">{inputSummary}</div>
                                )}
                                {showFullInput && (
                                    <pre className="mcp-full-content">
                                        {safeStringify(input)}
                                    </pre>
                                )}
                                {JSON.stringify(input).length > 200 && (
                                    <button
                                        className="mcp-toggle-btn"
                                        onClick={() => setShowFullInput(!showFullInput)}
                                    >
                                        {showFullInput ? (
                                            <>
                                                <CollapseIcon />
                                                <span>Show less</span>
                                            </>
                                        ) : (
                                            <>
                                                <ExpandIcon />
                                                <span>Show full input</span>
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                    
                    {/* Result Section */}
                    {result !== undefined && status === 'completed' && (
                        <div className="mcp-section mcp-result">
                            <div className="mcp-section-header">
                                <CheckIcon />
                                <span>{t('Agent.ToolResult')}</span>
                                <button
                                    className="mcp-copy-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        copyToClipboard(safeStringify(result));
                                    }}
                                    title={t('Agent.CopyCode')}
                                >
                                    <CopyIcon />
                                </button>
                            </div>
                            <div className="mcp-section-content">
                                {!showFullResult && (
                                    <div className="mcp-summary-text">{resultSummary}</div>
                                )}
                                {showFullResult && (
                                    <pre className="mcp-full-content">
                                        {safeStringify(result)}
                                    </pre>
                                )}
                                {JSON.stringify(result).length > 300 && (
                                    <button
                                        className="mcp-toggle-btn"
                                        onClick={() => setShowFullResult(!showFullResult)}
                                    >
                                        {showFullResult ? (
                                            <>
                                                <CollapseIcon />
                                                <span>Show less</span>
                                            </>
                                        ) : (
                                            <>
                                                <ExpandIcon />
                                                <span>Show full result</span>
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                    
                    {/* Error Section */}
                    {error && status === 'failed' && (
                        <div className="mcp-section mcp-error">
                            <div className="mcp-section-header">
                                <ErrorIcon />
                                <span>{t('Agent.ToolError')}</span>
                            </div>
                            <div className="mcp-section-content">
                                <pre className="mcp-error-content">{error}</pre>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
