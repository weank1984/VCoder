/**
 * Step Item Component
 * Displays a single step with its entries
 */

import { useMemo } from 'react';
import type { Step } from '../../utils/stepAggregator';
import type { ToolCall } from '../../types';
import { StepEntry } from './StepEntry';
import { useI18n } from '../../i18n/I18nProvider';
import { 
    CheckIcon, 
    LoadingIcon, 
    ErrorIcon,
    ExpandIcon,
    CollapseIcon,
} from '../Icon';

interface StepItemProps {
    step: Step;
    isCollapsed: boolean;
    onToggle: () => void;
    onViewFile?: (path: string, lineRange?: [number, number]) => void;
    onConfirm?: (tc: ToolCall, approve: boolean) => void;
}

export function StepItem({ 
    step, 
    isCollapsed, 
    onToggle, 
    onViewFile,
    onConfirm 
}: StepItemProps) {
    const { t } = useI18n();
    
    // Generate rich title (action + target) for single-entry steps
    const displayTitle = useMemo(() => {
        if (step.isSingleEntry && step.entries.length === 1) {
            const entry = step.entries[0];
            const actionText = t(entry.actionKey);
            return `${actionText} ${entry.target.name}`;
        }
        return step.title;
    }, [step, t]);
    
    // Get error message for failed steps
    const errorMessage = useMemo(() => {
        if (step.status !== 'failed') return null;
        
        // Find first error in entries
        const errorEntry = step.entries.find(e => e.status === 'error' && e.toolCall.error);
        if (!errorEntry) return null;
        
        return errorEntry.toolCall.error;
    }, [step.status, step.entries]);
    
    // Step status icon with tooltip for errors
    const statusIcon = useMemo(() => {
        switch (step.status) {
            case 'completed': return <CheckIcon />;
            case 'failed': return <ErrorIcon />;
            case 'running': return <LoadingIcon />;
            default: return <LoadingIcon />;
        }
    }, [step.status]);
    
    return (
        <div className={`step-item ${step.status}`}>
            <div className="step-header" onClick={onToggle}>
                <span className={`step-number ${step.status}`}>{step.index}</span>
                <div className="step-info">
                    <span className="step-title" title={displayTitle}>{displayTitle}</span>
                    <span 
                        className={`step-status-icon ${step.status}`}
                        title={errorMessage || undefined}
                    >
                        {statusIcon}
                    </span>
                </div>
                <span className="step-expand-icon">
                    {isCollapsed ? <ExpandIcon /> : <CollapseIcon />}
                </span>
            </div>
            
            {!isCollapsed && (
                <div className="step-entries">
                    {step.entries.map((entry) => (
                        <StepEntry
                            key={entry.id}
                            entry={entry}
                            onViewFile={onViewFile}
                            onConfirm={onConfirm}
                            hideSummary={step.isSingleEntry}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
