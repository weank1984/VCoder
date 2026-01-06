/**
 * Tool Result Display Component
 * Renders tool results with appropriate formatting based on result type
 */

import { useMemo, useState } from 'react';
import { 
    ExpandIcon, 
    CollapseIcon,
    ErrorIcon,
    WarningIcon,
    FolderIcon,
} from '../Icon';
import { FilePath } from '../FilePath';

/** Result display types */
type ResultDisplayType = 
    | 'text'        // Plain text
    | 'json'        // JSON object
    | 'files'       // File list
    | 'diff'        // Diff view
    | 'error'       // Error message
    | 'search'      // Search results
    | 'truncated';  // Truncated content

interface ToolResultDisplayProps {
    result: unknown;
    toolName?: string;
    maxLength?: number;
}

/** Detect result type based on content */
function detectResultType(result: unknown, toolName?: string): ResultDisplayType {
    if (!result) return 'text';
    
    if (typeof result === 'string') {
        // Check for error patterns
        if (result.startsWith('Error:') || 
            result.toLowerCase().includes('error:') ||
            result.toLowerCase().includes('failed:')) {
            return 'error';
        }
        // Check for diff patterns
        if (result.includes('@@') && (result.includes('+++') || result.includes('---'))) {
            return 'diff';
        }
        // Long content
        if (result.length > 3000) {
            return 'truncated';
        }
        return 'text';
    }
    
    if (Array.isArray(result)) {
        // Check if it's a file list (array of strings that look like paths)
        if (result.length > 0 && result.every(r => 
            typeof r === 'string' && (r.includes('/') || r.includes('\\'))
        )) {
            return 'files';
        }
        // Check for search results (Grep, codebase_search)
        if (toolName === 'Grep' || toolName === 'codebase_search' || toolName === 'grep_search') {
            return 'search';
        }
        return 'json';
    }
    
    return 'json';
}

/** Format file size */
function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Safe JSON stringify */
function safeStringify(value: unknown, pretty = true): string {
    if (value === undefined) return '';
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value, null, pretty ? 2 : 0);
    } catch {
        return String(value);
    }
}

/**
 * Clean line number prefixes from text content
 * Removes patterns like "1→", "2|", "3:" from the start of lines
 */
function cleanLineNumbers(text: string): string {
    return text.replace(/^\s*\d+[→|:]\s?/gm, '');
}

/** Text Result Component */
function TextResult({ text }: { text: string }) {
    const cleanedText = cleanLineNumbers(text);
    
    return (
        <div className="result-text">
            <pre>{cleanedText}</pre>
        </div>
    );
}

/** File List Result Component */
function FileListResult({ files }: { files: string[] }) {
    const [isExpanded, setIsExpanded] = useState(files.length <= 10);
    const displayFiles = isExpanded ? files : files.slice(0, 10);
    
    // Group files by directory
    const grouped = useMemo(() => {
        const groups: Record<string, string[]> = {};
        files.forEach(f => {
            const parts = f.split(/[/\\]/);
            const fileName = parts.pop() || f;
            const dir = parts.join('/') || '.';
            if (!groups[dir]) groups[dir] = [];
            groups[dir].push(fileName);
        });
        return groups;
    }, [files]);
    
    const showGrouped = Object.keys(grouped).length > 1 && files.length > 5;
    
    return (
        <div className="result-files">
            <div className="files-header">
                <span className="files-count">{files.length} files</span>
            </div>
            {showGrouped ? (
                <div className="files-grouped">
                    {Object.entries(grouped).slice(0, isExpanded ? undefined : 3).map(([dir, dirFiles]) => (
                        <div key={dir} className="file-group">
                            <div className="group-header">
                                <FolderIcon />
                                <span>{dir}</span>
                                <span className="group-count">{dirFiles.length}</span>
                            </div>
                            <div className="group-files">
                                {dirFiles.slice(0, isExpanded ? undefined : 5).map((file, i) => {
                                    const fullPath = dir === '.' ? file : `${dir}/${file}`;
                                    return (
                                        <FilePath 
                                            key={i}
                                            path={fullPath}
                                            variant="compact"
                                            className="file-item"
                                        />
                                    );
                                })}
                                {!isExpanded && dirFiles.length > 5 && (
                                    <div className="file-more">+{dirFiles.length - 5} more</div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="files-list">
                    {displayFiles.map((file, i) => (
                        <FilePath 
                            key={i}
                            path={file}
                            variant="compact"
                            className="file-item"
                        />
                    ))}
                </div>
            )}
            {files.length > 10 && (
                <button 
                    className="expand-btn"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
                    {isExpanded ? 'Show less' : `+${files.length - 10} more files`}
                </button>
            )}
        </div>
    );
}

/** Search Result Component */
function SearchResult({ results }: { results: unknown[] }) {
    const [isExpanded, setIsExpanded] = useState(results.length <= 5);
    const displayResults = isExpanded ? results : results.slice(0, 5);
    
    return (
        <div className="result-search">
            <div className="search-header">
                <span className="search-count">{results.length} matches</span>
            </div>
            <div className="search-list">
                {displayResults.map((result, i) => {
                    if (typeof result === 'string') {
                        return (
                            <div key={i} className="search-item">
                                <pre>{result}</pre>
                            </div>
                        );
                    }
                    // Handle structured results
                    const obj = result as Record<string, unknown>;
                    const hasFile = obj.file !== undefined && obj.file !== null;
                    const hasLine = obj.line !== undefined && obj.line !== null;
                    const hasContent = obj.content !== undefined && obj.content !== null;
                    const hasMatch = obj.match !== undefined && obj.match !== null;
                    const filePath = hasFile ? String(obj.file) : undefined;
                    const lineNum = hasLine ? Number(obj.line) : undefined;
                    
                    return (
                        <div key={i} className="search-item structured">
                            {hasFile && filePath && (
                                <FilePath 
                                    path={filePath}
                                    lineRange={lineNum ? [lineNum, lineNum] : undefined}
                                    variant="compact"
                                    className="search-file"
                                />
                            )}
                            {hasContent && (
                                <pre className="search-content">{String(obj.content)}</pre>
                            )}
                            {hasMatch && (
                                <pre className="search-match">{String(obj.match)}</pre>
                            )}
                        </div>
                    );
                })}
            </div>
            {results.length > 5 && (
                <button 
                    className="expand-btn"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
                    {isExpanded ? 'Show less' : `+${results.length - 5} more matches`}
                </button>
            )}
        </div>
    );
}

/** Diff View Component */
function DiffView({ diff }: { diff: string }) {
    const lines = diff.split('\n');
    
    return (
        <div className="result-diff">
            <pre>
                {lines.map((line, i) => {
                    let className = '';
                    if (line.startsWith('+') && !line.startsWith('+++')) {
                        className = 'diff-add';
                    } else if (line.startsWith('-') && !line.startsWith('---')) {
                        className = 'diff-remove';
                    } else if (line.startsWith('@@')) {
                        className = 'diff-chunk';
                    }
                    return (
                        <div key={i} className={className}>{line}</div>
                    );
                })}
            </pre>
        </div>
    );
}

/** Error Result Component */
function ErrorResult({ message }: { message: string }) {
    return (
        <div className="result-error">
            <div className="error-header">
                <ErrorIcon />
                <span>Error</span>
            </div>
            <pre>{message}</pre>
        </div>
    );
}

/** Truncated Result Component */
function TruncatedResult({ content, maxLength = 2000 }: { content: string; maxLength?: number }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const displayContent = isExpanded ? content : content.slice(0, maxLength);
    
    return (
        <div className="result-truncated">
            <div className="truncated-header">
                <WarningIcon />
                <span>Large output ({formatSize(content.length)})</span>
            </div>
            <pre>{displayContent}</pre>
            {content.length > maxLength && (
                <button 
                    className="expand-btn"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
                    {isExpanded ? 'Show less' : `Show all (${formatSize(content.length)})`}
                </button>
            )}
        </div>
    );
}

/** JSON View Component */
function JsonView({ data }: { data: unknown }) {
    const formatted = safeStringify(data, true);
    const lines = formatted.split('\n').length;
    const [isExpanded, setIsExpanded] = useState(lines <= 20);
    
    return (
        <div className="result-json">
            <pre>{isExpanded ? formatted : formatted.split('\n').slice(0, 20).join('\n') + '\n...'}</pre>
            {lines > 20 && (
                <button 
                    className="expand-btn"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
                    {isExpanded ? 'Show less' : `Show all (${lines} lines)`}
                </button>
            )}
        </div>
    );
}

/** Main Tool Result Display Component */
export function ToolResultDisplay({ result, toolName, maxLength = 3000 }: ToolResultDisplayProps) {
    const resultType = useMemo(() => detectResultType(result, toolName), [result, toolName]);
    
    switch (resultType) {
        case 'files':
            return <FileListResult files={result as string[]} />;
        case 'search':
            return <SearchResult results={result as unknown[]} />;
        case 'diff':
            return <DiffView diff={result as string} />;
        case 'error':
            return <ErrorResult message={result as string} />;
        case 'truncated':
            return <TruncatedResult content={result as string} maxLength={maxLength} />;
        case 'json':
            return <JsonView data={result} />;
        default:
            return <TextResult text={safeStringify(result, false)} />;
    }
}

export { detectResultType };
