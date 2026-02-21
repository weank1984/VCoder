import { useMemo } from 'react';
import type { ToolCall } from '../../types';
import type { ConfirmationType } from '@vcoder/shared';
import { ApprovalHeader } from './ApprovalHeader';
import { ApprovalContent } from './ApprovalContent';
import { ApprovalActions } from './ApprovalActions';

interface ApprovalUIProps {
    toolCall: ToolCall;
    onApprove: (options?: { trustAlways?: boolean; editedContent?: string }) => void;
    onReject: () => void;
}

export function ApprovalUI({ toolCall, onApprove, onReject }: ApprovalUIProps) {
    // 推断确认类型
    const confirmationType = useMemo(() => {
        if (toolCall.confirmationType) return toolCall.confirmationType;
        return inferConfirmationType(toolCall);
    }, [toolCall]);
    
    // 风险等级
    const riskLevel = toolCall.confirmationData?.riskLevel || 'low';
    
    return (
        <div className={`approval-container type-${confirmationType} risk-${riskLevel}`}>
            <ApprovalHeader 
                type={confirmationType} 
                riskLevel={riskLevel}
            />
            <ApprovalContent 
                toolCall={toolCall} 
                type={confirmationType}
            />
            <ApprovalActions 
                type={confirmationType}
                riskLevel={riskLevel}
                onApprove={onApprove} 
                onReject={onReject}
            />
        </div>
    );
}

/** 根据工具名推断确认类型 */
function inferConfirmationType(toolCall: ToolCall): ConfirmationType {
    const name = toolCall.name.toLowerCase();
    
    if (name === 'bash' || name === 'run_command' || name.includes('bash')) {
        return 'bash';
    }
    if (name === 'write' || name === 'edit' || name.includes('write') || name.includes('edit')) {
        return 'file_write';
    }
    if (name.includes('delete') || name.includes('remove')) {
        return 'file_delete';
    }
    if (name.startsWith('mcp__') || name.startsWith('mcp_')) {
        return 'mcp';
    }
    
    return 'dangerous';
}
