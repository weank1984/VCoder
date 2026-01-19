/**
 * VSCode Mock for Testing
 * Mock VSCode API for unit tests in Vitest environment
 */

import { vi } from 'vitest';

export const window = {
  createOutputChannel: vi.fn(),
  showInformationMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  showWarningMessage: vi.fn(),
};

export const workspace = {
  getConfiguration: vi.fn(),
  workspaceFolders: [],
  rootPath: '/test/workspace',
};

export const commands = {
  registerCommand: vi.fn(),
  executeCommand: vi.fn(),
};

export const extensions = {
 getExtension: vi.fn(),
};

export const env = {
  appRoot: '/test/app',
  appName: 'test',
  clipboard: {
    writeText: vi.fn(),
    readText: vi.fn(),
  },
};

export const Uri = {
  file: vi.fn(),
  parse: vi.fn(),
};

export const Range = vi.fn();
export const Position = vi.fn();
export const Selection = vi.fn();