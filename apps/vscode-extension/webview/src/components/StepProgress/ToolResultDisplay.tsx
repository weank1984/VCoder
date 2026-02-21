import { useMemo } from 'react';
import { safeStringify } from '../../utils/formatUtils';
import {
    TextResult,
    FileListResult,
    SearchResult,
    DiffView,
    ErrorResult,
    TruncatedResult,
    JsonView,
} from './resultRenderers';

type ResultDisplayType =
    | 'text'
    | 'json'
    | 'files'
    | 'diff'
    | 'error'
    | 'search'
    | 'truncated';

interface ToolResultDisplayProps {
    result: unknown;
    toolName?: string;
    maxLength?: number;
}

function detectResultType(result: unknown, toolName?: string): ResultDisplayType {
    if (!result) return 'text';

    if (typeof result === 'string') {
        if (result.startsWith('Error:') ||
            result.toLowerCase().includes('error:') ||
            result.toLowerCase().includes('failed:')) {
            return 'error';
        }
        if (result.includes('@@') && (result.includes('+++') || result.includes('---'))) {
            return 'diff';
        }
        if (result.length > 3000) {
            return 'truncated';
        }
        return 'text';
    }

    if (Array.isArray(result)) {
        if (result.length > 0 && result.every(r =>
            typeof r === 'string' && (r.includes('/') || r.includes('\\'))
        )) {
            return 'files';
        }
        if (toolName === 'Grep' || toolName === 'codebase_search' || toolName === 'grep_search') {
            return 'search';
        }
        return 'json';
    }

    return 'json';
}

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
