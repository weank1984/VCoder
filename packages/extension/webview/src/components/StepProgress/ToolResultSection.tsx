import type { ToolCall } from '../../types';
import type { StepEntry as StepEntryType } from '../../utils/stepAggregator';
import { useI18n } from '../../i18n/I18nProvider';
import { CopyIcon, EditorIcon } from '../Icon';
import { ToolResultDisplay } from './ToolResultDisplay';
import { copyToClipboard } from '../../utils/clipboard';

interface ToolResultSectionProps {
    toolCall: ToolCall;
    entry: StepEntryType;
    onViewFile?: (path: string, lineRange?: [number, number]) => void;
}

function safeStringify(value: unknown): string {
    if (value === undefined) return '';
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

export function ToolResultSection({ toolCall, entry, onViewFile }: ToolResultSectionProps) {
    const { t } = useI18n();

    if (toolCall.result === undefined) return null;

    return (
        <div className="detail-section result">
            <div className="detail-header">
                <span>{t('Agent.ToolResult')}</span>
                <div className="header-actions">
                    <button
                        className="action-btn"
                        onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(safeStringify(toolCall.result));
                        }}
                        title="复制内容"
                    >
                        <CopyIcon />
                    </button>
                    {entry.target.fullPath && (
                        <button
                            className="action-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (onViewFile) {
                                    onViewFile(entry.target.fullPath!, entry.target.lineRange);
                                }
                            }}
                            title="在编辑器中打开"
                        >
                            <EditorIcon />
                        </button>
                    )}
                </div>
            </div>
            <div className="detail-content">
                <ToolResultDisplay result={toolCall.result} toolName={toolCall.name} />
            </div>
        </div>
    );
}
