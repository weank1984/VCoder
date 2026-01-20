import { createContext, useContext, useEffect, useRef, useCallback, type ReactNode } from 'react';

interface KeyboardAction {
    id: string;
    label: string;
    shortcut: string[];
    handler: () => void;
    enabled?: boolean;
    category?: 'navigation' | 'editing' | 'modal' | 'global' | 'chat';
}

interface KeyboardContextType {
    registerAction: (action: KeyboardAction) => void;
    unregisterAction: (id: string) => void;
    focusInput: () => void;
    focusNext: () => void;
    focusPrevious: () => void;
    getActiveActions: () => KeyboardAction[];
    isActionRegistered: (id: string) => boolean;
}

const KeyboardContext = createContext<KeyboardContextType | null>(null);

interface KeyboardNavigationProviderProps {
    children: ReactNode;
}

export const KeyboardNavigationProvider = ({ children }: KeyboardNavigationProviderProps) => {
    const actions = useRef<Map<string, KeyboardAction>>(new Map());
    const focusableElements = useRef<HTMLElement[]>([]);
    const currentFocusIndex = useRef(-1);
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

    const focusInput = useCallback(() => {
        if (inputRef.current) {
            inputRef.current.focus();
            return;
        }
        
        const firstInput = document.querySelector('input[type="text"], textarea, [contenteditable="true"]') as HTMLElement;
        if (firstInput) {
            firstInput.focus();
        }
    }, []);

    const updateFocusableElements = useCallback(() => {
        const selector = [
            'button:not([disabled])',
            'input:not([disabled]):not([type="hidden"])',
            'textarea:not([disabled])',
            'select:not([disabled])',
            'a[href]',
            '[tabindex]:not([tabindex="-1"])',
            '[contenteditable="true"]'
        ].join(', ');
        
        focusableElements.current = Array.from(document.querySelectorAll(selector) as NodeListOf<HTMLElement>)
            .filter(el => {
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden';
            });
    }, []);

    const focusNext = useCallback(() => {
        updateFocusableElements();
        const elements = focusableElements.current;
        
        if (elements.length === 0) return;
        
        const currentIndex = elements.indexOf(document.activeElement as HTMLElement);
        const nextIndex = (currentIndex + 1) % elements.length;
        
        elements[nextIndex].focus();
        currentFocusIndex.current = nextIndex;
    }, [updateFocusableElements]);

    const focusPrevious = useCallback(() => {
        updateFocusableElements();
        const elements = focusableElements.current;
        
        if (elements.length === 0) return;
        
        const currentIndex = elements.indexOf(document.activeElement as HTMLElement);
        const prevIndex = currentIndex <= 0 ? elements.length - 1 : currentIndex - 1;
        
        elements[prevIndex].focus();
        currentFocusIndex.current = prevIndex;
    }, [updateFocusableElements]);

    const registerAction = useCallback((action: KeyboardAction) => {
        actions.current.set(action.id, { ...action, enabled: action.enabled ?? true });
    }, []);

    const unregisterAction = useCallback((id: string) => {
        actions.current.delete(id);
    }, []);

    const isActionRegistered = useCallback((id: string) => {
        return actions.current.has(id);
    }, []);

    const getActiveActions = useCallback(() => {
        return Array.from(actions.current.values()).filter(action => action.enabled !== false);
    }, []);

    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        const { key, ctrlKey, metaKey, shiftKey, altKey } = event;
        
        const activeActions = getActiveActions();
        
        for (const action of activeActions) {
            const matches = action.shortcut.some(shortcut => {
                const parts = shortcut.toLowerCase().split('+');
                return (
                    parts.includes('ctrl') === ctrlKey &&
                    parts.includes('meta') === metaKey &&
                    parts.includes('shift') === shiftKey &&
                    parts.includes('alt') === altKey &&
                    parts.includes(key.toLowerCase())
                );
            });

            if (matches) {
                event.preventDefault();
                event.stopPropagation();
                action.handler();
                return;
            }
        }

        switch (true) {
            case ctrlKey && key === 'k':
            case metaKey && key === 'k':
                event.preventDefault();
                focusInput();
                break;

            case key === 'Tab':
                if (shiftKey) {
                    event.preventDefault();
                    focusPrevious();
                } else {
                    event.preventDefault();
                    focusNext();
                }
                break;

            case key === '/' && !ctrlKey && !metaKey && !altKey:
                const activeElement = document.activeElement;
                if (activeElement?.tagName !== 'INPUT' && activeElement?.tagName !== 'TEXTAREA') {
                    event.preventDefault();
                    focusInput();
                }
                break;

            case key === 'Escape':
                const modal = document.querySelector('[role="dialog"], .modal') as HTMLElement;
                if (modal) {
                    const closeButton = modal.querySelector('[data-action="close"], button[aria-label*="close"]') as HTMLElement;
                    closeButton?.click();
                }
                break;
        }
    }, [focusInput, focusNext, focusPrevious, getActiveActions]);

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        updateFocusableElements();
        
        const mutationObserver = new MutationObserver(() => {
            updateFocusableElements();
        });
        
        mutationObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['disabled', 'hidden', 'style', 'class']
        });

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            mutationObserver.disconnect();
        };
    }, [handleKeyDown, updateFocusableElements]);

    const value: KeyboardContextType = {
        registerAction,
        unregisterAction,
        focusInput,
        focusNext,
        focusPrevious,
        getActiveActions,
        isActionRegistered
    };

    return (
        <KeyboardContext.Provider value={value}>
            {children}
        </KeyboardContext.Provider>
    );
};

export const useKeyboardNavigation = () => {
    const context = useContext(KeyboardContext);
    if (!context) {
        throw new Error('useKeyboardNavigation must be used within KeyboardNavigationProvider');
    }
    return context;
};

export const useRegisterInput = () => {
    const registerInput = useCallback((element: HTMLInputElement | HTMLTextAreaElement | null) => {
        if (element) {
            element.dataset.keyboardRegistered = 'true';
        }
    }, []);

    return { registerInput };
};

export const useKeyboardAction = (action: KeyboardAction) => {
    const { registerAction, unregisterAction } = useKeyboardNavigation();

    useEffect(() => {
        registerAction(action);
        return () => unregisterAction(action.id);
    }, [action, registerAction, unregisterAction]);
};