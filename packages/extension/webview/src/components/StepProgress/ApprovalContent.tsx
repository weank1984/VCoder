import type { ToolCall, ConfirmationType } from '../../types';
import { BashApprovalContent } from './BashApprovalContent';
import { FileApprovalContent } from './FileApprovalContent';
import { PlanApprovalContent } from './PlanApprovalContent';
import { GenericApprovalContent } from './GenericApprovalContent';

interface ApprovalContentProps {
    toolCall: ToolCall;
    type: ConfirmationType;
}

export function ApprovalContent({ toolCall, type }: ApprovalContentProps) {
    switch (type) {
        case 'bash':
            return <BashApprovalContent toolCall={toolCall} />;
        case 'file_write':
        case 'file_delete':
            return <FileApprovalContent toolCall={toolCall} isDelete={type === 'file_delete'} />;
        case 'plan':
            return <PlanApprovalContent toolCall={toolCall} />;
        default:
            return <GenericApprovalContent toolCall={toolCall} />;
    }
}
