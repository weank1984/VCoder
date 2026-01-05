/**
 * Step Item Component
 * Displays a single step with its entries
 */

import { useMemo } from 'react';
import type { Step } from '../../utils/stepAggregator';
import type { ToolCall } from '../../types';
import { StepEntry } from './StepEntry';
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
    
    // Step status icon
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
                <span className="step-number">{step.index}</span>
                <div className="step-info">
                    <span className="step-title">{step.title}</span>
                    <span className={`step-status-icon ${step.status}`}>
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
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
