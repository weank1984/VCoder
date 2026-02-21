/**
 * Step Aggregator - Aggregates tool calls into logical steps
 * Used by Step Progress View for step-based display
 */

import type { ToolCall } from '../types';
import { getActionInfo, extractTargetInfo, isTaskBoundary, type StepEntryType, type TargetInfo } from './actionMapper';
import { isTerminalToolName, isFileEditToolName } from './toolClassifiers';

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

const STATUS_MAP: Record<string, EntryStatus> = {
    completed: 'success',
    failed: 'error',
    running: 'running',
    pending: 'pending',
};

function mapStatus(tcStatus: ToolCall['status']): EntryStatus {
    return STATUS_MAP[tcStatus] ?? 'pending';
}

function deriveStepStatus(entries: StepEntry[]): StepStatus {
    if (entries.some(e => e.status === 'error')) return 'failed';
    if (entries.some(e => e.status === 'pending' || e.status === 'running')) return 'running';
    return 'completed';
}

function entryStatusToStepStatus(status: EntryStatus): StepStatus {
    if (status === 'error') return 'failed';
    if (status === 'success') return 'completed';
    return 'running';
}

function generateStepTitle(
    taskBoundary: ToolCall | undefined,
    entries: StepEntry[],
    stepIndex: number
): string {
    if (taskBoundary?.input && typeof taskBoundary.input === 'object') {
        const input = taskBoundary.input as Record<string, unknown>;
        const taskName = input.TaskName as string | undefined;
        const taskStatus = input.TaskStatus as string | undefined;
        if (taskName && taskName !== '%SAME%') return taskName;
        if (taskStatus && taskStatus !== '%SAME%') return taskStatus;
    }

    if (entries.length > 0) {
        return entries[0].target.name;
    }

    return `Step ${stepIndex}`;
}

const INDEPENDENT_TOOLS = new Set(['TodoWrite', 'Task']);

function shouldBeIndependentStep(toolName: string): boolean {
    return isTerminalToolName(toolName) || isFileEditToolName(toolName) || INDEPENDENT_TOOLS.has(toolName);
}

function canGroupTogether(entry1: StepEntry, entry2: StepEntry): boolean {
    if (entry1.type !== entry2.type) return false;
    if (entry1.actionKey !== entry2.actionKey) return false;
    if (shouldBeIndependentStep(entry1.toolCall.name) || shouldBeIndependentStep(entry2.toolCall.name)) {
        return false;
    }
    return true;
}

function finalizeStep(step: Step, taskBoundary: ToolCall | undefined): void {
    step.title = generateStepTitle(taskBoundary, step.entries, step.index);
    step.status = deriveStepStatus(step.entries);
    step.isSingleEntry = step.entries.length === 1;
}

function createEmptyStep(stepIndex: number): Step {
    return {
        id: `step-${stepIndex}`,
        index: stepIndex,
        title: '',
        status: 'running',
        entries: [],
        startTime: Date.now(),
        isSingleEntry: false,
    };
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
            if (currentStep && currentStep.entries.length > 0) {
                finalizeStep(currentStep, currentTaskBoundary);
                steps.push(currentStep);
                stepIndex++;
            }

            currentTaskBoundary = tc;
            currentStep = createEmptyStep(stepIndex);
        } else {
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
                currentStep.entries.push(entry);
            } else {
                const lastStep = steps[steps.length - 1];
                const canGroup = lastStep &&
                                 lastStep.entries.length > 0 &&
                                 canGroupTogether(lastStep.entries[0], entry);

                if (canGroup) {
                    lastStep.entries.push(entry);
                    lastStep.status = deriveStepStatus(lastStep.entries);
                    lastStep.isSingleEntry = false;
                } else {
                    const newStep: Step = {
                        id: `step-${stepIndex}`,
                        index: stepIndex,
                        title: target.name,
                        status: entryStatusToStepStatus(entry.status),
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

    if (currentStep && currentStep.entries.length > 0) {
        finalizeStep(currentStep, currentTaskBoundary);
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
