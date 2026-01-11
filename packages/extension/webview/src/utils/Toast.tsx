/**
 * Toast Notification System
 * Provides user-friendly notifications for errors, warnings, and success messages
 */

import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { CheckIcon, ErrorIcon, InfoIcon, WarningIcon, CloseIcon } from '../components/Icon';
import './Toast.scss';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
    id: string;
    type: ToastType;
    title: string;
    message?: string;
    duration?: number;
    action?: {
        label: string;
        onClick: () => void;
    };
}

interface ToastContextValue {
    toasts: Toast[];
    showToast: (toast: Omit<Toast, 'id'>) => void;
    showSuccess: (title: string, message?: string) => void;
    showError: (title: string, message?: string, action?: Toast['action']) => void;
    showWarning: (title: string, message?: string) => void;
    showInfo: (title: string, message?: string) => void;
    removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within ToastProvider');
    }
    return context;
}

interface ToastProviderProps {
    children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    
    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);
    
    const showToast = useCallback((toast: Omit<Toast, 'id'>) => {
        const id = `toast-${Date.now()}-${Math.random()}`;
        const newToast: Toast = { ...toast, id };
        
        setToasts(prev => [...prev, newToast]);
        
        // Auto-remove after duration
        if (toast.duration !== 0) {
            setTimeout(() => {
                removeToast(id);
            }, toast.duration || 5000);
        }
    }, [removeToast]);
    
    const showSuccess = useCallback((title: string, message?: string) => {
        showToast({ type: 'success', title, message, duration: 3000 });
    }, [showToast]);
    
    const showError = useCallback((title: string, message?: string, action?: Toast['action']) => {
        showToast({ type: 'error', title, message, action, duration: 0 }); // Errors don't auto-dismiss
    }, [showToast]);
    
    const showWarning = useCallback((title: string, message?: string) => {
        showToast({ type: 'warning', title, message, duration: 4000 });
    }, [showToast]);
    
    const showInfo = useCallback((title: string, message?: string) => {
        showToast({ type: 'info', title, message, duration: 4000 });
    }, [showToast]);
    
    return (
        <ToastContext.Provider
            value={{
                toasts,
                showToast,
                showSuccess,
                showError,
                showWarning,
                showInfo,
                removeToast,
            }}
        >
            {children}
            <ToastContainer toasts={toasts} onRemove={removeToast} />
        </ToastContext.Provider>
    );
}

interface ToastContainerProps {
    toasts: Toast[];
    onRemove: (id: string) => void;
}

function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
    if (toasts.length === 0) return null;
    
    return (
        <div className="toast-container">
            {toasts.map(toast => (
                <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
            ))}
        </div>
    );
}

interface ToastItemProps {
    toast: Toast;
    onRemove: (id: string) => void;
}

function ToastItem({ toast, onRemove }: ToastItemProps) {
    const getIcon = () => {
        switch (toast.type) {
            case 'success': return <CheckIcon />;
            case 'error': return <ErrorIcon />;
            case 'warning': return <WarningIcon />;
            case 'info': return <InfoIcon />;
        }
    };
    
    return (
        <div className={`toast-item toast-${toast.type}`}>
            <span className="toast-icon">{getIcon()}</span>
            <div className="toast-content">
                <div className="toast-title">{toast.title}</div>
                {toast.message && (
                    <div className="toast-message">{toast.message}</div>
                )}
                {toast.action && (
                    <button
                        className="toast-action"
                        onClick={() => {
                            toast.action!.onClick();
                            onRemove(toast.id);
                        }}
                    >
                        {toast.action.label}
                    </button>
                )}
            </div>
            <button
                className="toast-close"
                onClick={() => onRemove(toast.id)}
                aria-label="Close notification"
            >
                <CloseIcon />
            </button>
        </div>
    );
}
