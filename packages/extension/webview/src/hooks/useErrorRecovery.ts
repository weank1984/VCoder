/**
 * Error Recovery Hook
 * Provides automatic error recovery with retry logic
 */

import { useState, useCallback } from 'react';
import { retryWithBackoff, parseError, type ErrorDetails } from '../utils/errorHandling';
import { useToast } from '../utils/Toast';

interface UseErrorRecoveryOptions {
    maxRetries?: number;
    showToast?: boolean;
    onError?: (error: ErrorDetails) => void;
}

export function useErrorRecovery(options: UseErrorRecoveryOptions = {}) {
    const {
        maxRetries = 3,
        showToast = true,
        onError,
    } = options;

    const [isRetrying, setIsRetrying] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    const { showError, showWarning } = useToast();

    const executeWithRecovery = useCallback(
        async <T>(fn: () => Promise<T>): Promise<T | null> => {
            try {
                setIsRetrying(false);
                setRetryCount(0);
                return await fn();
            } catch (error) {
                const errorDetails = parseError(error);
                
                // Call custom error handler
                if (onError) {
                    onError(errorDetails);
                }

                // Show error toast if enabled
                if (showToast) {
                    if (errorDetails.retryable) {
                        showWarning(
                            errorDetails.title,
                            errorDetails.message
                        );
                    } else {
                        showError(
                            errorDetails.title,
                            errorDetails.message
                        );
                    }
                }

                // Don't retry if not retryable
                if (!errorDetails.retryable) {
                    throw error;
                }

                // Try to recover with backoff
                try {
                    setIsRetrying(true);
                    const result = await retryWithBackoff(fn, {
                        maxRetries,
                        onRetry: (attempt) => {
                            setRetryCount(attempt);
                            console.log(`[Recovery] Retry attempt ${attempt}/${maxRetries}`);
                        },
                    });
                    setIsRetrying(false);
                    setRetryCount(0);
                    return result;
                } catch (retryError) {
                    setIsRetrying(false);
                    const finalError = parseError(retryError);
                    
                    if (showToast) {
                        showError(
                            finalError.title,
                            `${finalError.message} (Failed after ${maxRetries} retries)`
                        );
                    }
                    
                    throw retryError;
                }
            }
        },
        [maxRetries, showToast, onError, showError, showWarning]
    );

    return {
        executeWithRecovery,
        isRetrying,
        retryCount,
    };
}
