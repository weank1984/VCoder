/**
 * VSCode Mock for Testing
 * Mock VSCode API for unit tests in Vitest environment
 */

import { vi } from 'vitest';

type MockApi = Record<string, any>;

export const window: MockApi = {
  createOutputChannel: vi.fn(() => ({
    appendLine: vi.fn(),
    show: vi.fn(),
  })),
  showInformationMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  showQuickPick: vi.fn(),
  createStatusBarItem: vi.fn(() => ({
    command: undefined,
    tooltip: undefined,
    show: vi.fn(),
    hide: vi.fn(),
  })),
  registerWebviewViewProvider: vi.fn(() => ({ dispose: vi.fn() })),
  registerFileDecorationProvider: vi.fn(() => ({ dispose: vi.fn() })),
  createWebviewPanel: vi.fn(),
};

export const workspace: MockApi = {
  getConfiguration: vi.fn(() => ({
    get: vi.fn(),
    update: vi.fn(),
  })),
  workspaceFolders: [],
  rootPath: '/test/workspace',
  onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
  findFiles: vi.fn(async () => []),
  fs: { stat: vi.fn() },
};

export const commands: MockApi = {
  registerCommand: vi.fn(),
  executeCommand: vi.fn(),
};

export const extensions: MockApi = {
 getExtension: vi.fn(),
};

export const env: MockApi = {
  appRoot: '/test/app',
  appName: 'test',
  clipboard: {
    writeText: vi.fn(),
    readText: vi.fn(),
  },
};

export const Uri: MockApi = {
  file: vi.fn(),
  parse: vi.fn(),
};

export class EventEmitter<T> {
  private listeners = new Set<(event: T) => void>();

  event = (listener: (event: T) => void) => {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  };

  fire(event: T) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  dispose() {
    this.listeners.clear();
  }
}

export const StatusBarAlignment = {
  Left: 1,
  Right: 2,
};

export const Range: MockApi = vi.fn();
export const Position: MockApi = vi.fn();
export const Selection: MockApi = vi.fn();
