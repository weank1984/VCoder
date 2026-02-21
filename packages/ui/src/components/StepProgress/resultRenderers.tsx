import { useMemo, useState } from 'react';
import {
    ExpandIcon,
    CollapseIcon,
    ErrorIcon,
    WarningIcon,
    FolderIcon,
} from '../Icon';
import { FilePath } from '../FilePath';
import { safeStringify } from '../../utils/formatUtils';

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function cleanLineNumbers(text: string): string {
    return text.replace(/^\s*\d+[→|:]\s?/gm, '');
}

export function TextResult({ text }: { text: string }) {
    const cleanedText = cleanLineNumbers(text);
    return (
        <div className="result-text">
            <pre>{cleanedText}</pre>
        </div>
    );
}

export function FileListResult({ files }: { files: string[] }) {
    const [isExpanded, setIsExpanded] = useState(files.length <= 10);
    const displayFiles = isExpanded ? files : files.slice(0, 10);

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

export function SearchResult({ results }: { results: unknown[] }) {
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

export function DiffView({ diff }: { diff: string }) {
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

export function ErrorResult({ message }: { message: string }) {
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

export function TruncatedResult({ content, maxLength = 2000 }: { content: string; maxLength?: number }) {
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

export function JsonView({ data }: { data: unknown }) {
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
