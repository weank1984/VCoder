/**
 * EnvironmentSelector Component
 * Displays "Local" environment label below the input area.
 * Matches Claude Code desktop UI - placeholder for future remote environment support.
 */

import { ArrowBottomIcon } from '../Icon';
import './index.scss';

interface EnvironmentSelectorProps {
    environment?: string;
    disabled?: boolean;
}

export function EnvironmentSelector({ environment = 'Local', disabled = false }: EnvironmentSelectorProps) {
    return (
        <div className={`environment-selector ${disabled ? 'is-disabled' : ''}`}>
            <span className="environment-selector__icon">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M1.5 2h13l.5.5v7l-.5.5h-13l-.5-.5v-7l.5-.5zM2 9h12V3H2v6zm2 3h8v1H4v-1z" />
                </svg>
            </span>
            <span className="environment-selector__label">{environment}</span>
            <span className="environment-selector__chevron">
                <ArrowBottomIcon />
            </span>
        </div>
    );
}
