/**
 * Collapsible - CSS Grid 平滑高度动画包装组件
 * 内容始终在 DOM 中，通过 grid-template-rows: 0fr → 1fr 实现平滑展开/折叠
 */

import type { ReactNode } from 'react';
import './index.scss';

interface CollapsibleProps {
    isOpen: boolean;
    children: ReactNode;
    className?: string;
}

export function Collapsible({ isOpen, children, className = '' }: CollapsibleProps) {
    return (
        <div className={`vc-collapsible ${isOpen ? 'is-open' : ''} ${className}`}>
            <div className="collapsible-inner">
                {children}
            </div>
        </div>
    );
}
