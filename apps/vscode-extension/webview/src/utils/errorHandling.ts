/**
 * Error Handling Utilities
 * Provides better error classification, user-friendly messages, and retry mechanisms
 */

export type ErrorType = 
    | 'network'
    | 'timeout'
    | 'permission'
    | 'not_found'
    | 'validation'
    | 'agent'
    | 'file_system'
    | 'parse'
    | 'unknown';

export interface ErrorDetails {
    type: ErrorType;
    title: string;
    message: string;
    technicalDetails?: string;
    retryable: boolean;
    actionLabel?: string;
    suggestions?: string[];
}

/**
 * Parse error and extract user-friendly details
 */
export function parseError(error: unknown): ErrorDetails {
    // Handle null/undefined
    if (!error) {
        return {
            type: 'unknown',
            title: 'Unknown Error',
            message: 'An unexpected error occurred',
            retryable: true,
            suggestions: ['Try refreshing the page', 'Check your internet connection'],
        };
    }
    
    // Handle Error objects
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        
        // Network errors
        if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
            return {
                type: 'network',
                title: 'Network Error',
                message: 'Failed to connect to the server. Please check your network connection.',
                technicalDetails: error.message,
                retryable: true,
                actionLabel: 'Retry',
                suggestions: [
                    'Check your internet connection',
                    'Try disabling VPN or proxy',
                    'Check firewall settings',
                ],
            };
        }
        
        // Timeout errors
        if (message.includes('timeout') || message.includes('timed out')) {
            return {
                type: 'timeout',
                title: 'Request Timeout',
                message: 'The operation took too long to complete. The server might be busy.',
                technicalDetails: error.message,
                retryable: true,
                actionLabel: 'Retry',
                suggestions: [
                    'Wait a moment and try again',
                    'Check your network speed',
                    'The agent might be processing a large request',
                ],
            };
        }
        
        // Permission errors
        if (message.includes('permission') || message.includes('denied') || message.includes('unauthorized')) {
            return {
                type: 'permission',
                title: 'Permission Denied',
                message: 'You do not have permission to perform this action.',
                technicalDetails: error.message,
                retryable: false,
                suggestions: [
                    'Check your permission settings',
                    'Make sure the file/folder is not read-only',
                    'Try running VSCode as administrator (if needed)',
                ],
            };
        }
        
        // Not found errors
        if (message.includes('not found') || message.includes('404') || message.includes('enoent')) {
            return {
                type: 'not_found',
                title: 'Not Found',
                message: 'The requested resource was not found.',
                technicalDetails: error.message,
                retryable: false,
                suggestions: [
                    'Check if the file/folder exists',
                    'Make sure the path is correct',
                    'Try refreshing the workspace',
                ],
            };
        }
        
        // Validation errors
        if (message.includes('invalid') || message.includes('validation')) {
            return {
                type: 'validation',
                title: 'Validation Error',
                message: 'The input data is invalid. Please check and try again.',
                technicalDetails: error.message,
                retryable: false,
                suggestions: [
                    'Check your input for errors',
                    'Make sure all required fields are filled',
                    'Verify the format is correct',
                ],
            };
        }
        
        // File system errors
        if (message.includes('eacces') || message.includes('eisdir') || message.includes('enotdir')) {
            return {
                type: 'file_system',
                title: 'File System Error',
                message: 'Failed to access file or directory.',
                technicalDetails: error.message,
                retryable: false,
                suggestions: [
                    'Check file permissions',
                    'Make sure the file is not locked by another program',
                    'Verify the path is correct',
                ],
            };
        }
        
        // Parse errors
        if (message.includes('json') || message.includes('parse') || message.includes('syntax')) {
            return {
                type: 'parse',
                title: 'Parse Error',
                message: 'Failed to parse the data. The format might be invalid.',
                technicalDetails: error.message,
                retryable: false,
                suggestions: [
                    'Check the file format',
                    'Make sure the data is properly formatted',
                    'Try validating the syntax',
                ],
            };
        }
        
        // Agent errors
        if (message.includes('agent') || message.includes('model') || message.includes('api')) {
            return {
                type: 'agent',
                title: 'Agent Error',
                message: 'The AI agent encountered an error. This might be temporary.',
                technicalDetails: error.message,
                retryable: true,
                actionLabel: 'Retry',
                suggestions: [
                    'Try again in a moment',
                    'Check your API key if configured',
                    'Try starting a new session',
                ],
            };
        }
        
        // Generic error
        return {
            type: 'unknown',
            title: 'Error',
            message: error.message || 'An unexpected error occurred',
            technicalDetails: error.stack,
            retryable: true,
            actionLabel: 'Retry',
            suggestions: [
                'Try again',
                'Reload the window',
                'Check the developer console for details',
            ],
        };
    }
    
    // Handle string errors
    if (typeof error === 'string') {
        return {
            type: 'unknown',
            title: 'Error',
            message: error,
            retryable: true,
            suggestions: ['Try again'],
        };
    }
    
    // Handle JSON-RPC errors
    if (typeof error === 'object' && error !== null) {
        const err = error as Record<string, unknown>;
        if (typeof err.code === 'number' && typeof err.message === 'string') {
            return {
                type: 'agent',
                title: `Error ${err.code}`,
                message: err.message,
                technicalDetails: err.data ? JSON.stringify(err.data, null, 2) : undefined,
                retryable: err.code !== -32601, // Method not found is not retryable
                actionLabel: 'Retry',
                suggestions: ['Try again', 'Check the agent connection'],
            };
        }
    }
    
    // Fallback
    return {
        type: 'unknown',
        title: 'Unknown Error',
        message: String(error),
        retryable: true,
        suggestions: ['Try reloading the page'],
    };
}

/**
 * Retry mechanism with exponential backoff
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    options: {
        maxRetries?: number;
        initialDelay?: number;
        maxDelay?: number;
        onRetry?: (attempt: number, error: unknown) => void;
    } = {}
): Promise<T> {
    const {
        maxRetries = 3,
        initialDelay = 1000,
        maxDelay = 10000,
        onRetry,
    } = options;
    
    let lastError: unknown;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            
            if (attempt === maxRetries) {
                throw error;
            }
            
            const errorDetails = parseError(error);
            if (!errorDetails.retryable) {
                throw error;
            }
            
            if (onRetry) {
                onRetry(attempt + 1, error);
            }
            
            // Exponential backoff with jitter
            const delay = Math.min(
                initialDelay * Math.pow(2, attempt) + Math.random() * 1000,
                maxDelay
            );
            
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    throw lastError;
}

/**
 * Format error for logging
 */
export function formatErrorForLogging(error: unknown): string {
    const details = parseError(error);
    return `[${details.type}] ${details.title}: ${details.message}${
        details.technicalDetails ? `\n${details.technicalDetails}` : ''
    }`;
}

/**
 * Check if error is transient (can be retried)
 */
export function isTransientError(error: unknown): boolean {
    const details = parseError(error);
    return details.retryable && (
        details.type === 'network' ||
        details.type === 'timeout'
    );
}
