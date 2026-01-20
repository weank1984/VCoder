import { useState, useEffect } from 'react';
import { useKeyboardNavigation } from './index';
import './KeyboardHelp.scss';

export const KeyboardHelp = () => {
    const [isOpen, setIsOpen] = useState(false);
    const { getActiveActions } = useKeyboardNavigation();
    const [activeActions, setActiveActions] = useState(getActiveActions());

    useEffect(() => {
        const handleShortcutFocus = (event: KeyboardEvent) => {
            if (event.ctrlKey && event.shiftKey && event.altKey && event.key === '/') {
                event.preventDefault();
                event.stopPropagation();
                setIsOpen(true);
                setActiveActions(getActiveActions());
            }
        };

        document.addEventListener('keydown', handleShortcutFocus);
        return () => document.removeEventListener('keydown', handleShortcutFocus);
    }, [getActiveActions]);

    const actionsByCategory = activeActions.reduce((acc, action) => {
        const category = action.category || 'global';
        if (!acc[category]) {
            acc[category] = [];
        }
        acc[category].push(action);
        return acc;
    }, {} as Record<string, typeof activeActions>);

    const formatShortcut = (shortcut: string[]) => {
        const part = shortcut[0] || '';
        const keys = part.split('+');
        
        return keys.map((key, index) => {
            const formattedKey = key.charAt(0).toUpperCase() + key.slice(1);
            let element;
            
            switch (key.toLowerCase()) {
                case 'ctrl':
                    element = (
                        <kbd key={key} className="vc-keyboard-shortcut-cmd">
                            Ctrl
                        </kbd>
                    );
                    break;
                case 'meta':
                    element = (
                        <kbd key={key} className="vc-keyboard-shortcut-cmd">
                            ⌘
                        </kbd>
                    );
                    break;
                case 'shift':
                    element = (
                        <kbd key={key} className="vc-keyboard-shortcut-mod">
                            Shift
                        </kbd>
                    );
                    break;
                case 'alt':
                    element = (
                        <kbd key={key} className="vc-keyboard-shortcut-mod">
                            Alt
                        </kbd>
                    );
                    break;
                default:
                    element = (
                        <kbd key={key} className="vc-keyboard-shortcut-key">
                            {formattedKey}
                        </kbd>
                    );
                    break;
            }
            
            if (index > 0) {
                return [<span key={`plus-${index}`} className="vc-keyboard-plus">+</span>, element];
            }
            return element;
        }).flat();
    };

    const categoryOrder = ['global', 'navigation', 'chat', 'editing', 'modal'];
    const categoryNames = {
        global: '全局快捷键',
        navigation: '导航操作',
        chat: '聊天功能',
        editing: '编辑操作',
        modal: '弹窗操作'
    };

    if (!isOpen) {
        return null;
    }

    return (
        <div className="vc-keyboard-help-overlay" onClick={() => setIsOpen(false)}>
            <div className="vc-keyboard-help" onClick={e => e.stopPropagation()}>
                <div className="vc-keyboard-help__header">
                    <h3>键盘快捷键</h3>
                    <button 
                        className="vc-keyboard-help__close"
                        onClick={() => setIsOpen(false)}
                        aria-label="关闭帮助"
                    >
                        ×
                    </button>
                </div>

                <div className="vc-keyboard-help__content">
                    {categoryOrder.map(category => {
                        if (!actionsByCategory[category] || actionsByCategory[category].length === 0) {
                            return null;
                        }

                        return (
                            <div key={category} className="vc-keyboard-help__section">
                                <h4 className="vc-keyboard-help__category">
                                    {categoryNames[category as keyof typeof categoryNames]}
                                </h4>
                                <div className="vc-keyboard-help__actions">
                                    {actionsByCategory[category].map(action => (
                                        <div key={action.id} className="vc-keyboard-help__action">
                                            <div className="vc-keyboard-help__shortcut">
                                                {formatShortcut(action.shortcut)}
                                            </div>
                                            <div className="vc-keyboard-help__description">
                                                {action.label}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="vc-keyboard-help__footer">
                    <p>按 Ctrl+Shift+Alt+/ 再次显示此帮助面板</p>
                </div>
            </div>
        </div>
    );
};