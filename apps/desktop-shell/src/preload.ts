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

initDesktopTheme();

contextBridge.exposeInMainWorld('acquireVsCodeApi', () => api);
