import type { ToolCall } from '../../types';
import type { Task } from '@vcoder/shared';
import { useI18n } from '../../i18n/I18nProvider';

interface PlanApprovalContentProps {
    toolCall: ToolCall;
}

export function PlanApprovalContent({ toolCall }: PlanApprovalContentProps) {
    const { t } = useI18n();
    const tasks = toolCall.confirmationData?.tasks || [];
    const planSummary = toolCall.confirmationData?.planSummary || '';
    
    // Calculate impact stats
    const stats = calculateImpactStats(tasks);
    
    return (
        <div className="approval-content">
            {/* Plan description */}
            <div className="plan-description">
                {t('Agent.PlanSteps', tasks.length)}
            </div>
            
            {/* Task list */}
            <div className="plan-tasks">
                {tasks.map((task, index) => (
                    <div key={task.id} className="task-item">
                        <div className={`task-status ${task.status}`}>
                            {task.status === 'completed' ? (
                                <svg viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425a.247.247 0 0 1 .02-.022Z" />
                                </svg>
                            ) : (
                                <svg viewBox="0 0 16 16" fill="currentColor">
                                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1" fill="none" />
                                </svg>
                            )}
                        </div>
                        <div className="task-content">
                            <span className="task-number">{index + 1}.</span> {task.title}
                        </div>
                    </div>
                ))}
            </div>
            
            {/* Plan summary */}
            {(stats.newFiles > 0 || stats.modifiedFiles > 0 || stats.commands > 0) && (
                <div className="plan-summary">
                    {t('Agent.PlanImpact', stats.newFiles, stats.modifiedFiles, stats.commands)}
                </div>
            )}
            
            {planSummary && (
                <div className="plan-summary-text">
                    {planSummary}
                </div>
            )}
        </div>
    );
}

interface ImpactStats {
    newFiles: number;
    modifiedFiles: number;
    commands: number;
}

function calculateImpactStats(tasks: Task[]): ImpactStats {
    // This is a heuristic based on task titles
    const stats: ImpactStats = {
        newFiles: 0,
        modifiedFiles: 0,
        commands: 0,
    };
    
    tasks.forEach(task => {
        const title = task.title.toLowerCase();
        if (title.includes('create') || title.includes('add new')) {
            stats.newFiles++;
        } else if (title.includes('modify') || title.includes('update') || title.includes('edit')) {
            stats.modifiedFiles++;
        } else if (title.includes('run') || title.includes('execute') || title.includes('command')) {
            stats.commands++;
        }
    });
    
    return stats;
}
