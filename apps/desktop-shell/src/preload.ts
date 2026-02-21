import { contextBridge, ipcRenderer } from 'electron';
import {
  DESKTOP_COMMON_THEME_VARIABLES,
  getDesktopThemeVariables,
  type DesktopThemeMode,
} from '../../../packages/shared/dist/desktopTheme.js';
import type { HostBridgeApi } from '../../../packages/shared/dist/hostBridge.js';
import { IPC_CHANNELS } from './ipc.js';

const VS_CODE_THEME_CLASSES = [
  'vscode-light',
  'vscode-dark',
  'vscode-high-contrast',
  'vscode-high-contrast-light',
] as const;

let webviewState: unknown = undefined;

const api: HostBridgeApi = {
  postMessage: (message) => {
    ipcRenderer.send(IPC_CHANNELS.WEBVIEW_OUTGOING, message);
  },
  getState: () => webviewState,
  setState: (state) => {
    webviewState = state;
  },
};

ipcRenderer.on(IPC_CHANNELS.WEBVIEW_INCOMING, (_event, payload: unknown) => {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: payload,
    }),
  );
});

function applyTheme(mode: DesktopThemeMode): void {
  const root = document.documentElement;
  root.style.colorScheme = mode;
  root.style.setProperty('--vc-vscode-theme-type', mode);
  root.classList.remove(...VS_CODE_THEME_CLASSES);
  root.classList.add(mode === 'light' ? 'vscode-light' : 'vscode-dark', 'vcoder-desktop');

  for (const [key, value] of Object.entries(DESKTOP_COMMON_THEME_VARIABLES)) {
    root.style.setProperty(key, value);
  }
  for (const [key, value] of Object.entries(getDesktopThemeVariables(mode))) {
    root.style.setProperty(key, value);
  }

  if (document.body) {
    document.body.classList.remove(...VS_CODE_THEME_CLASSES);
    document.body.classList.add(mode === 'light' ? 'vscode-light' : 'vscode-dark', 'vcoder-desktop');
  }
}

function initDesktopTheme(): void {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
  const applyCurrent = (): void => {
    applyTheme(mediaQuery.matches ? 'light' : 'dark');
  };

  applyCurrent();
  mediaQuery.addEventListener('change', (event) => {
    applyTheme(event.matches ? 'light' : 'dark');
  });

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        applyCurrent();
      },
      { once: true },
    );
  }
}

// Listen for manual theme mode changes from main process
ipcRenderer.on(IPC_CHANNELS.THEME_MODE_CHANGED, (_event, mode: string) => {
  if (mode === 'light' || mode === 'dark') {
    applyTheme(mode);
  }
});

initDesktopTheme();

contextBridge.exposeInMainWorld('acquireVsCodeApi', () => api);

// Desktop-specific APIs (optional — webview checks via typeof window.vcoderDesktop)
contextBridge.exposeInMainWorld('vcoderDesktop', {
  findInPage: {
    query: (text: string) => ipcRenderer.send(IPC_CHANNELS.FIND_IN_PAGE_QUERY, text),
    next: () => ipcRenderer.send(IPC_CHANNELS.FIND_IN_PAGE_NEXT),
    prev: () => ipcRenderer.send(IPC_CHANNELS.FIND_IN_PAGE_PREV),
    close: () => ipcRenderer.send(IPC_CHANNELS.FIND_IN_PAGE_CLOSE),
    onOpen: (cb: () => void) => {
      ipcRenderer.on(IPC_CHANNELS.FIND_IN_PAGE_OPEN, () => cb());
    },
    onClose: (cb: () => void) => {
      ipcRenderer.on(IPC_CHANNELS.FIND_IN_PAGE_CLOSE, () => cb());
    },
    onResult: (cb: (result: { activeMatchOrdinal: number; matches: number }) => void) => {
      ipcRenderer.on(IPC_CHANNELS.FIND_IN_PAGE_RESULT, (_e, result) => cb(result));
    },
  },
  theme: {
    getMode: () => ipcRenderer.invoke(IPC_CHANNELS.THEME_GET_MODE) as Promise<string>,
    setMode: (mode: string) => ipcRenderer.send(IPC_CHANNELS.THEME_SET_MODE, mode),
    onModeChanged: (cb: (mode: string) => void) => {
      ipcRenderer.on(IPC_CHANNELS.THEME_MODE_CHANGED, (_e, mode) => cb(mode));
    },
  },
  globalShortcut: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.GLOBAL_SHORTCUT_GET) as Promise<string | null>,
    set: (accelerator: string) => ipcRenderer.send(IPC_CHANNELS.GLOBAL_SHORTCUT_SET, accelerator),
  },
});
