/**
 * Step Aggregator - Aggregates tool calls into logical steps
 * Used by Step Progress View for step-based display
 */

import type { ToolCall } from '../types';
import { getActionInfo, extractTargetInfo, isTaskBoundary, type StepEntryType, type TargetInfo } from './actionMapper';

/** Step status */
export type StepStatus = 'running' | 'completed' | 'failed';

/** Entry status */
export type EntryStatus = 'pending' | 'running' | 'success' | 'error';

/** Step entry - single tool call within a step */
export interface StepEntry {
    id: string;
    type: StepEntryType;
    /** i18n key for action label */
    actionKey: string;
    target: TargetInfo;
    status: EntryStatus;
    toolCall: ToolCall;
}

/** Step - a logical group of tool calls */
export interface Step {
    id: string;
    index: number;
    title: string;
    status: StepStatus;
    entries: StepEntry[];
    startTime: number;
    endTime?: number;
}

/**
 * Map tool call status to entry status
 */
function mapStatus(tcStatus: ToolCall['status']): EntryStatus {
    switch (tcStatus) {
        case 'completed': return 'success';
        case 'failed': return 'error';
        case 'running': return 'running';
        case 'pending': return 'pending';
        default: return 'pending';
    }
}

/**
 * Derive step status from entries
 */
function deriveStepStatus(entries: StepEntry[]): StepStatus {
    if (entries.some(e => e.status === 'error')) return 'failed';
    if (entries.some(e => e.status === 'pending' || e.status === 'running')) return 'running';
    return 'completed';
}

/**
 * Generate step title from task boundary or entries
 */
function generateStepTitle(
    taskBoundary: ToolCall | undefined,
    entries: StepEntry[],
    stepIndex: number
): string {
    // If we have a task boundary, use its TaskName or TaskStatus
    if (taskBoundary?.input && typeof taskBoundary.input === 'object') {
        const input = taskBoundary.input as Record<string, unknown>;
        const taskName = input.TaskName as string | undefined;
        const taskStatus = input.TaskStatus as string | undefined;
        if (taskName && taskName !== '%SAME%') return taskName;
        if (taskStatus && taskStatus !== '%SAME%') return taskStatus;
    }
    
    // Fallback: generate from first entry action
    if (entries.length > 0) {
        const firstEntry = entries[0];
        // Use action + target as title
        return `${firstEntry.target.name}`;
    }
    
    return `Step ${stepIndex}`;
}

/**
 * Aggregate tool calls into steps using Strategy C (Mixed Strategy)
 * 
 * Rules:
 * 1. task_boundary creates a new step
 * 2. Without task_boundary, each tool call is its own step
 * 3. Task boundary tool calls are used for step metadata but not displayed as entries
 */
export function aggregateToSteps(toolCalls: ToolCall[]): Step[] {
    if (toolCalls.length === 0) return [];
    
    const steps: Step[] = [];
    let currentStep: Step | null = null;
    let currentTaskBoundary: ToolCall | undefined;
    let stepIndex = 1;
    
    for (const tc of toolCalls) {
        if (isTaskBoundary(tc.name)) {
            // If we have a current step, finalize it
            if (currentStep && currentStep.entries.length > 0) {
                currentStep.title = generateStepTitle(currentTaskBoundary, currentStep.entries, currentStep.index);
                currentStep.status = deriveStepStatus(currentStep.entries);
                steps.push(currentStep);
                stepIndex++;
            }
            
            // Start a new step with this task boundary
            currentTaskBoundary = tc;
            currentStep = {
                id: `step-${stepIndex}`,
                index: stepIndex,
                title: '', // Will be set when finalized
                status: 'running',
                entries: [],
                startTime: Date.now(),
            };
        } else {
            // Non-task-boundary tool call
            const actionInfo = getActionInfo(tc.name);
            const target = extractTargetInfo(tc);
            
            const entry: StepEntry = {
                id: tc.id,
                type: actionInfo.type,
                actionKey: actionInfo.actionKey,
                target,
                status: mapStatus(tc.status),
                toolCall: tc,
            };
            
            if (currentStep) {
                // Add to current step
                currentStep.entries.push(entry);
            } else {
                // No current step - create a single-entry step (no task_boundary mode)
                const singleStep: Step = {
                    id: `step-${stepIndex}`,
                    index: stepIndex,
                    title: target.name,
                    status: mapStatus(tc.status) === 'error' ? 'failed' : 
                            mapStatus(tc.status) === 'success' ? 'completed' : 'running',
                    entries: [entry],
                    startTime: Date.now(),
                };
                steps.push(singleStep);
                stepIndex++;
            }
        }
    }
    
    // Finalize the last step if exists
    if (currentStep && currentStep.entries.length > 0) {
        currentStep.title = generateStepTitle(currentTaskBoundary, currentStep.entries, currentStep.index);
        currentStep.status = deriveStepStatus(currentStep.entries);
        steps.push(currentStep);
    }
    
    return steps;
}

/**
 * Get overall progress stats from steps
 */
export function getProgressStats(steps: Step[]): {
    total: number;
    completed: number;
    running: number;
    failed: number;
} {
    let total = 0;
    let completed = 0;
    let running = 0;
    let failed = 0;
    
    for (const step of steps) {
        for (const entry of step.entries) {
            total++;
            switch (entry.status) {
                case 'success': completed++; break;
                case 'error': failed++; break;
                case 'running':
                case 'pending': running++; break;
            }
        }
    }
    
    return { total, completed, running, failed };
}
