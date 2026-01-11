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
    | 'unknown';

export interface ErrorDetails {
    type: ErrorType;
    title: string;
    message: string;
    technicalDetails?: string;
    retryable: boolean;
    actionLabel?: string;
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
            };
        }
        
        // Timeout errors
        if (message.includes('timeout') || message.includes('timed out')) {
            return {
                type: 'timeout',
                title: 'Request Timeout',
                message: 'The operation took too long to complete. Please try again.',
                technicalDetails: error.message,
                retryable: true,
                actionLabel: 'Retry',
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
            };
        }
        
        // Not found errors
        if (message.includes('not found') || message.includes('404')) {
            return {
                type: 'not_found',
                title: 'Not Found',
                message: 'The requested resource was not found.',
                technicalDetails: error.message,
                retryable: false,
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
            };
        }
        
        // Agent errors
        if (message.includes('agent') || message.includes('model')) {
            return {
                type: 'agent',
                title: 'Agent Error',
                message: 'The AI agent encountered an error. Please try again or restart the session.',
                technicalDetails: error.message,
                retryable: true,
                actionLabel: 'Retry',
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
        };
    }
    
    // Handle string errors
    if (typeof error === 'string') {
        return {
            type: 'unknown',
            title: 'Error',
            message: error,
            retryable: true,
        };
    }
    
    // Handle JSON-RPC errors
    if (typeof error === 'object' && error !== null) {
        const err = error as any;
        if (err.code && err.message) {
            return {
                type: 'agent',
                title: `Error ${err.code}`,
                message: err.message,
                technicalDetails: err.data ? JSON.stringify(err.data, null, 2) : undefined,
                retryable: err.code !== -32601, // Method not found is not retryable
                actionLabel: 'Retry',
            };
        }
    }
    
    // Fallback
    return {
        type: 'unknown',
        title: 'Unknown Error',
        message: String(error),
        retryable: true,
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
