import React from 'react';
import './IconButton.scss';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    icon: React.ReactNode;
    variant?: 'ghost' | 'background'; // ghost is default (transparent)
    active?: boolean;
    label?: string; // For aria-label and potentially tooltip
    className?: string;
}

export const IconButton: React.FC<IconButtonProps> = ({ 
    icon, 
    variant = 'ghost', 
    active = false, 
    label,
    className = '',
    ...props 
}) => {
    return (
        <button
            className={`vc-icon-button vc-icon-button--${variant} ${active ? 'is-active' : ''} ${className}`}
            aria-label={label}
            title={label}
            {...props}
        >
            <span className="vc-icon-button__content">
                {icon}
            </span>
        </button>
    );
};
