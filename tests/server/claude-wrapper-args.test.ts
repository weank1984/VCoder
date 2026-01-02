import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

function createFakeChildProcess() {
  const child = new EventEmitter() as any;
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = vi.fn();
  return child;
}

describe('ClaudeCodeWrapper spawn args', () => {
  it('includes --model and --permission-mode plan when enabled', async () => {
    vi.resetModules();

    const fakeChild = createFakeChildProcess();
    const spawnMock = vi.fn(() => {
      // Resolve quickly so prompt() can finish.
      process.nextTick(() => fakeChild.emit('close', 0));
      return fakeChild;
    });

    vi.doMock('child_process', () => ({ spawn: spawnMock }));

    const { ClaudeCodeWrapper } = await import('../../packages/server/src/claude/wrapper');

    const wrapper = new ClaudeCodeWrapper({ workingDirectory: '/tmp' });
    wrapper.updateSettings({ model: 'claude-3-5-haiku-20241022', planMode: true });

    await wrapper.prompt('s1', 'hello');

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const args = spawnMock.mock.calls[0][1] as string[];

    const modelIndex = args.indexOf('--model');
    expect(modelIndex).toBeGreaterThan(-1);
    expect(args[modelIndex + 1]).toBe('claude-3-5-haiku-20241022');

    const permissionIndex = args.indexOf('--permission-mode');
    expect(permissionIndex).toBeGreaterThan(-1);
    expect(args[permissionIndex + 1]).toBe('plan');

    const disallowedIndex = args.indexOf('--disallowed-tools');
    expect(disallowedIndex).toBeGreaterThan(-1);
    expect(args[disallowedIndex + 1]).toBe('AskUserQuestion');
  });
});
