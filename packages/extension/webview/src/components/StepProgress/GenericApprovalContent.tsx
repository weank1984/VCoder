import type { ToolCall } from '../../types';

interface GenericApprovalContentProps {
    toolCall: ToolCall;
}

export function GenericApprovalContent({ toolCall }: GenericApprovalContentProps) {
    const input = toolCall.input;
    
    return (
        <div className="approval-content">
            <div className="generic-info">
                <div className="info-row">
                    <span className="info-label">工具名称:</span>
                    <span className="info-value">{toolCall.name}</span>
                </div>
                
                {input ? (
                    <div className="info-row">
                        <span className="info-label">输入参数:</span>
                        <pre className="info-value code-block">
                            {JSON.stringify(input, null, 2)}
                        </pre>
                    </div>
                ) : null}
                
                {toolCall.confirmationData?.riskReasons && toolCall.confirmationData.riskReasons.length > 0 && (
                    <div className="risk-hints">
                        <div className="risk-title">
                            <svg viewBox="0 0 16 16" fill="currentColor">
                                <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z" />
                                <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z" />
                            </svg>
                            <span>风险提示</span>
                        </div>
                        <ul className="risk-list">
                            {toolCall.confirmationData.riskReasons.map((reason, index) => (
                                <li key={index}>• {reason}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}
