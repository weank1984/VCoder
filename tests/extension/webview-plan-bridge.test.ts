import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../../apps/vscode-extension/webview/src/store/useStore';

describe('webview store plan bridge', () => {
  beforeEach(() => {
    useStore.getState().reset();
  });

  it('keeps task_list as plan source and stores subagent_run separately', () => {
    const store = useStore.getState();
    store.setPlanMode(true);

    store.handleUpdate({
      sessionId: 's1',
      type: 'tool_use',
      content: {
        id: 'call_1',
        name: 'Task',
        input: { description: 'Explore project', subagent_type: 'Explore' },
        status: 'running',
      },
    });

    let state = useStore.getState();
    expect(state.tasks).toEqual([]);
    expect(state.subagentRuns).toEqual([]);

    store.handleUpdate({
      sessionId: 's1',
      type: 'task_list',
      content: {
        tasks: [{ id: 't1', title: 'Plan item', status: 'in_progress' }],
        currentTaskId: 't1',
      },
    });

    state = useStore.getState();
    expect(state.tasks).toEqual([{ id: 't1', title: 'Plan item', status: 'in_progress' }]);

    store.handleUpdate({
      sessionId: 's1',
      type: 'subagent_run',
      content: {
        id: 'call_1',
        title: 'Explore project',
        subagentType: 'Explore',
        parentTaskId: 't1',
        status: 'running',
        input: { description: 'Explore project', subagent_type: 'Explore' },
      },
    });

    state = useStore.getState();
    expect(state.subagentRuns).toHaveLength(1);
    expect(state.subagentRuns[0]).toMatchObject({
      id: 'call_1',
      title: 'Explore project',
      subagentType: 'Explore',
      parentTaskId: 't1',
      status: 'running',
    });

    store.handleUpdate({
      sessionId: 's1',
      type: 'subagent_run',
      content: { id: 'call_1', title: 'Explore project', status: 'completed', result: { ok: true } },
    });

    state = useStore.getState();
    expect(state.subagentRuns[0]).toMatchObject({ id: 'call_1', status: 'completed' });
  });

  it('marks subagent runs as failed on error', () => {
    const store = useStore.getState();
    store.setPlanMode(true);

    store.handleUpdate({
      sessionId: 's1',
      type: 'subagent_run',
      content: {
        id: 'run_2',
        title: 'Explore project',
        input: { description: 'Explore project' },
        status: 'running',
      },
    });

    store.handleUpdate({
      sessionId: 's1',
      type: 'subagent_run',
      content: { id: 'run_2', title: 'Explore project', status: 'failed', error: 'boom' },
    });

    const state = useStore.getState();
    expect(state.subagentRuns[0]).toMatchObject({ id: 'run_2', status: 'failed', error: 'boom' });
  });
});
