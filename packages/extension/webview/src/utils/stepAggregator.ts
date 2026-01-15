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
    /** Whether this step has a single entry (used for UI optimization) */
    isSingleEntry: boolean;
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
 * Check if a tool should always be in its own step (not grouped)
 */
function shouldBeIndependentStep(toolName: string): boolean {
    const lower = toolName.toLowerCase();
    // Terminal/Bash commands should be independent
    if (lower === 'bash' || lower === 'bashoutput' || lower === 'run_command' || lower.includes('terminal')) {
        return true;
    }
    // File editing should be independent
    if (lower === 'write' || lower === 'edit' || lower === 'strreplace' || lower === 'multiedit') {
        return true;
    }
    // Task management should be independent
    if (lower === 'todowrite' || lower === 'task') {
        return true;
    }
    return false;
}

/**
 * Check if two tool calls can be grouped together
 */
function canGroupTogether(entry1: StepEntry, entry2: StepEntry): boolean {
    // Must be same type (file, search, etc.)
    if (entry1.type !== entry2.type) return false;
    
    // Must have same action (both Read, both Grep, etc.)
    if (entry1.actionKey !== entry2.actionKey) return false;
    
    // Don't group if either should be independent
    if (shouldBeIndependentStep(entry1.toolCall.name) || shouldBeIndependentStep(entry2.toolCall.name)) {
        return false;
    }
    
    return true;
}

/**
 * Aggregate tool calls into steps with smart grouping
 * 
 * Rules:
 * 1. task_boundary creates a new step
 * 2. Without task_boundary, consecutive similar operations are grouped
 * 3. Terminal commands and file edits remain independent
 */
export function aggregateToSteps(toolCalls: ToolCall[]): Step[] {
    if (toolCalls.length === 0) return [];
    
    const steps: Step[] = [];
    let currentStep: Step | null = null;
    let currentTaskBoundary: ToolCall | undefined;
    let stepIndex = 1;
    
    for (const tc of toolCalls) {
        if (isTaskBoundary(tc.name)) {
            // Finalize current step if exists
            if (currentStep && currentStep.entries.length > 0) {
                currentStep.title = generateStepTitle(currentTaskBoundary, currentStep.entries, currentStep.index);
                currentStep.status = deriveStepStatus(currentStep.entries);
                currentStep.isSingleEntry = currentStep.entries.length === 1;
                steps.push(currentStep);
                stepIndex++;
            }
            
            // Start a new step with this task boundary
            currentTaskBoundary = tc;
            currentStep = {
                id: `step-${stepIndex}`,
                index: stepIndex,
                title: '',
                status: 'running',
                entries: [],
                startTime: Date.now(),
                isSingleEntry: false,
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
                // Inside a task boundary - add to current step
                currentStep.entries.push(entry);
            } else {
                // No task boundary - try to group with previous step
                const lastStep = steps[steps.length - 1];
                const canGroup = lastStep && 
                                 lastStep.entries.length > 0 && 
                                 canGroupTogether(lastStep.entries[0], entry);
                
                if (canGroup) {
                    // Add to existing step
                    lastStep.entries.push(entry);
                    lastStep.status = deriveStepStatus(lastStep.entries);
                    lastStep.isSingleEntry = false;
                } else {
                    // Create new step
                    const newStep: Step = {
                        id: `step-${stepIndex}`,
                        index: stepIndex,
                        title: target.name,
                        status: mapStatus(tc.status) === 'error' ? 'failed' : 
                                mapStatus(tc.status) === 'success' ? 'completed' : 'running',
                        entries: [entry],
                        startTime: Date.now(),
                        isSingleEntry: true,
                    };
                    steps.push(newStep);
                    stepIndex++;
                }
            }
        }
    }
    
    // Finalize the last step if inside a task boundary
    if (currentStep && currentStep.entries.length > 0) {
        currentStep.title = generateStepTitle(currentTaskBoundary, currentStep.entries, currentStep.index);
        currentStep.status = deriveStepStatus(currentStep.entries);
        currentStep.isSingleEntry = currentStep.entries.length === 1;
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
