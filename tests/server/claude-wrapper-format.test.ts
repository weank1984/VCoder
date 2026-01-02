import { describe, expect, it } from 'vitest';
import { ClaudeCodeWrapper } from '../../packages/server/src/claude/wrapper';

describe('ClaudeCodeWrapper stream-json formats', () => {
  it('parses assistant tool_use blocks', () => {
    const wrapper = new ClaudeCodeWrapper({ workingDirectory: '/tmp' });
    const events: Array<{ type: string; content: unknown }> = [];

    wrapper.on('update', (_sessionId: string, content: unknown, type: string) => {
      events.push({ type, content });
    });

    (wrapper as any).handleClaudeCodeEvent('s1', {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'call_1',
            name: 'Bash',
            input: { command: 'ls -la', description: 'List files' },
          },
        ],
      },
    });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('tool_use');
    expect(events[0].content).toMatchObject({
      id: 'call_1',
      name: 'Bash',
      input: { command: 'ls -la', description: 'List files' },
      status: 'running',
    });
  });

  it('parses user tool_result blocks', () => {
    const wrapper = new ClaudeCodeWrapper({ workingDirectory: '/tmp' });
    const events: Array<{ type: string; content: unknown }> = [];

    wrapper.on('update', (_sessionId: string, content: unknown, type: string) => {
      events.push({ type, content });
    });

    (wrapper as any).handleClaudeCodeEvent('s1', {
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            tool_use_id: 'call_1',
            type: 'tool_result',
            content: 'ok',
            is_error: false,
          },
        ],
      },
    });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('tool_result');
    expect(events[0].content).toMatchObject({
      id: 'call_1',
      result: 'ok',
    });
  });

  it('synthesizes file_change for Write tool_use blocks', () => {
    const wrapper = new ClaudeCodeWrapper({ workingDirectory: '/tmp' });
    const events: Array<{ type: string; content: any }> = [];

    wrapper.on('update', (_sessionId: string, content: unknown, type: string) => {
      events.push({ type, content: content as any });
    });

    (wrapper as any).handleClaudeCodeEvent('s1', {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'call_write',
            name: 'Write',
            input: { path: 'src/a.txt', content: 'hello' },
          },
        ],
      },
    });

    expect(events.map((e) => e.type)).toEqual(['tool_use', 'file_change']);
    expect(events[0].content).toMatchObject({ id: 'call_write', name: 'Write' });
    expect(events[1].content).toMatchObject({
      path: 'src/a.txt',
      proposed: true,
      content: 'hello',
    });
  });
});

