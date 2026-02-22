/**
 * Electron Mock for Testing
 * Mock Electron API for unit tests in Vitest environment
 */

import { vi } from 'vitest';

type MockApi = Record<string, any>;

export const app: MockApi = {
  getPath: vi.fn((name: string) => `/mock/${name}`),
  whenReady: vi.fn(() => Promise.resolve()),
  on: vi.fn(),
  quit: vi.fn(),
};

export const BrowserWindow: MockApi = vi.fn(() => ({
  loadURL: vi.fn(async () => {}),
  loadFile: vi.fn(async () => {}),
  show: vi.fn(),
  close: vi.fn(),
  destroy: vi.fn(),
  isDestroyed: vi.fn(() => false),
  isMaximized: vi.fn(() => false),
  isFullScreen: vi.fn(() => false),
  maximize: vi.fn(),
  setFullScreen: vi.fn(),
  setTitle: vi.fn(),
  getBounds: vi.fn(() => ({ x: 100, y: 100, width: 1280, height: 860 })),
  on: vi.fn(),
  webContents: {
    send: vi.fn(),
    setWindowOpenHandler: vi.fn(),
    on: vi.fn(),
  },
}));

BrowserWindow.getAllWindows = vi.fn(() => []);

export const screen: MockApi = {
  getAllDisplays: vi.fn(() => [
    {
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    },
  ]),
};

export const ipcMain: MockApi = {
  handle: vi.fn(),
  on: vi.fn(),
  removeHandler: vi.fn(),
};

export const ipcRenderer: MockApi = {
  send: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
};

export const shell: MockApi = {
  openExternal: vi.fn(async () => {}),
  openPath: vi.fn(async () => ''),
};

export const dialog: MockApi = {
  showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
  showSaveDialog: vi.fn(async () => ({ canceled: true })),
  showMessageBox: vi.fn(async () => ({ response: 0 })),
};

export const nativeTheme: MockApi = {
  themeSource: 'system',
  shouldUseDarkColors: true,
};

export const Menu: MockApi = {
  setApplicationMenu: vi.fn(),
  buildFromTemplate: vi.fn(() => ({})),
};

export const contextBridge: MockApi = {
  exposeInMainWorld: vi.fn(),
};

export const Notification: MockApi = vi.fn(() => ({
  show: vi.fn(),
  on: vi.fn(),
}));
