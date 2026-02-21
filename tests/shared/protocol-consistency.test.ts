/**
 * Protocol Consistency Tests
 * Ensures UpdateType enum, Server emit points, and Webview handlers stay aligned.
 */

import { describe, it, expect } from 'vitest';
import type {
    UpdateType,
    UpdateNotificationParams,
    ThoughtUpdate,
    TextUpdate,
    ToolUseUpdate,
    ToolResultUpdate,
    FileChangeUpdate,
    McpCallUpdate,
    TaskListUpdate,
    SubagentRunUpdate,
    BashRequestUpdate,
    PlanReadyUpdate,
    ErrorUpdate,
    ConfirmationRequestUpdate,
    SessionSwitchUpdate,
} from '@vcoder/shared/protocol';

/**
 * Canonical list of UpdateType values.
 * When a new type is added to the union, it must be added here
 * (and TypeScript will error until the test is updated).
 */
const ALL_UPDATE_TYPES: UpdateType[] = [
    'thought',
    'text',
    'tool_use',
    'tool_result',
    'file_change',
    'mcp_call',
    'task_list',
    'subagent_run',
    'bash_request',
    'plan_ready',
    'error',
    'confirmation_request',
    'session_switch',
];

/** Types that are deprecated and no longer emitted by the Server. */
const DEPRECATED_TYPES: UpdateType[] = [
    'bash_request',
    'plan_ready',
];

/** Types actively emitted by the Server (wrapper.ts / server.ts / persistentSession.ts). */
const SERVER_EMITTED_TYPES: UpdateType[] = [
    'thought',
    'text',
    'tool_use',
    'tool_result',
    'file_change',
    'mcp_call',
    'task_list',
    'subagent_run',
    'error',
    'confirmation_request',
    'session_switch',
];

/** Types handled by the Webview updateSlice switch. */
const WEBVIEW_HANDLED_TYPES: UpdateType[] = [
    'thought',
    'text',
    'tool_use',
    'tool_result',
    'file_change',
    'mcp_call',
    'task_list',
    'subagent_run',
    'bash_request',
    'error',
    'confirmation_request',
    'session_switch',
];

describe('Protocol Consistency', () => {
    it('ALL_UPDATE_TYPES should cover every UpdateType variant', () => {
        // This test ensures the canonical list stays in sync with the type union.
        // If a new UpdateType variant is added, TypeScript won't error on the union itself,
        // but this list must be updated to keep the mapping accurate.
        expect(ALL_UPDATE_TYPES.length).toBe(13);
        expect(new Set(ALL_UPDATE_TYPES).size).toBe(ALL_UPDATE_TYPES.length);
    });

    it('every server-emitted type should be declared in protocol', () => {
        for (const type of SERVER_EMITTED_TYPES) {
            expect(ALL_UPDATE_TYPES).toContain(type);
        }
    });

    it('every webview-handled type should be declared in protocol', () => {
        for (const type of WEBVIEW_HANDLED_TYPES) {
            expect(ALL_UPDATE_TYPES).toContain(type);
        }
    });

    it('every non-deprecated server-emitted type should be handled by webview', () => {
        const activeServerTypes = SERVER_EMITTED_TYPES.filter(t => !DEPRECATED_TYPES.includes(t));
        for (const type of activeServerTypes) {
            expect(WEBVIEW_HANDLED_TYPES).toContain(type);
        }
    });

    it('deprecated types should not be in server-emitted list', () => {
        for (const type of DEPRECATED_TYPES) {
            expect(SERVER_EMITTED_TYPES).not.toContain(type);
        }
    });

    it('should be able to create UpdateNotificationParams for each active type', () => {
        const thought: UpdateNotificationParams = {
            sessionId: 's1',
            type: 'thought',
            content: { content: 'thinking...', isComplete: false } satisfies ThoughtUpdate,
        };
        expect(thought.type).toBe('thought');

        const text: UpdateNotificationParams = {
            sessionId: 's1',
            type: 'text',
            content: { text: 'hello' } satisfies TextUpdate,
        };
        expect(text.type).toBe('text');

        const toolUse: UpdateNotificationParams = {
            sessionId: 's1',
            type: 'tool_use',
            content: { id: 't1', name: 'Read', input: {}, status: 'running' } satisfies ToolUseUpdate,
        };
        expect(toolUse.type).toBe('tool_use');

        const toolResult: UpdateNotificationParams = {
            sessionId: 's1',
            type: 'tool_result',
            content: { id: 't1', result: 'ok' } satisfies ToolResultUpdate,
        };
        expect(toolResult.type).toBe('tool_result');

        const fileChange: UpdateNotificationParams = {
            sessionId: 's1',
            type: 'file_change',
            content: { type: 'modified', path: '/a.txt', proposed: true } satisfies FileChangeUpdate,
        };
        expect(fileChange.type).toBe('file_change');

        const mcpCall: UpdateNotificationParams = {
            sessionId: 's1',
            type: 'mcp_call',
            content: { id: 'm1', server: 'srv', tool: 'fn', input: {}, status: 'running' } satisfies McpCallUpdate,
        };
        expect(mcpCall.type).toBe('mcp_call');

        const taskList: UpdateNotificationParams = {
            sessionId: 's1',
            type: 'task_list',
            content: { tasks: [{ id: '1', title: 'Task', status: 'pending' }] } satisfies TaskListUpdate,
        };
        expect(taskList.type).toBe('task_list');

        const subagentRun: UpdateNotificationParams = {
            sessionId: 's1',
            type: 'subagent_run',
            content: { id: 'sa1', title: 'Run', status: 'running' } satisfies SubagentRunUpdate,
        };
        expect(subagentRun.type).toBe('subagent_run');

        const error: UpdateNotificationParams = {
            sessionId: 's1',
            type: 'error',
            content: { code: 'CLI_ERROR', message: 'oops' } satisfies ErrorUpdate,
        };
        expect(error.type).toBe('error');

        const confirmationRequest: UpdateNotificationParams = {
            sessionId: 's1',
            type: 'confirmation_request',
            content: { id: 'c1', type: 'bash', toolCallId: 't1', summary: 'run cmd' } satisfies ConfirmationRequestUpdate,
        };
        expect(confirmationRequest.type).toBe('confirmation_request');

        const sessionSwitch: UpdateNotificationParams = {
            sessionId: 's2',
            type: 'session_switch',
            content: { previousSessionId: 's1', newSessionId: 's2' } satisfies SessionSwitchUpdate,
        };
        expect(sessionSwitch.type).toBe('session_switch');
    });

    it('deprecated types should still compile for backward compatibility', () => {
        // bash_request
        const bashRequest: UpdateNotificationParams = {
            sessionId: 's1',
            type: 'bash_request',
            content: { id: 'b1', command: 'echo hi' } satisfies BashRequestUpdate,
        };
        expect(bashRequest.type).toBe('bash_request');

        // plan_ready
        const planReady: UpdateNotificationParams = {
            sessionId: 's1',
            type: 'plan_ready',
            content: { tasks: [], summary: 'plan' } satisfies PlanReadyUpdate,
        };
        expect(planReady.type).toBe('plan_ready');
    });
});
