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

    // 提取命令/操作名称用于 header 展示
    const contextName = useMemo(() => {
        if (confirmationType === 'bash') {
            const cmd = toolCall.confirmationData?.command || '';
            return cmd.trim().split(/[\s|&;(<]/)[0] || '';
        }
        if (confirmationType === 'file_write' || confirmationType === 'file_delete') {
            const fp = toolCall.confirmationData?.filePath || '';
            return fp.split('/').pop() || fp.split('\\').pop() || '';
        }
        return '';
    }, [confirmationType, toolCall.confirmationData]);

    // 文件完整路径
    const filePath = useMemo(() => {
        if (confirmationType === 'file_write' || confirmationType === 'file_delete') {
            return toolCall.confirmationData?.filePath || '';
        }
        return '';
    }, [confirmationType, toolCall.confirmationData]);

    return (
        <div className={`approval-container type-${confirmationType} risk-${riskLevel}`}>
            <ApprovalHeader
                type={confirmationType}
                riskLevel={riskLevel}
                contextName={contextName}
                filePath={filePath}
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
