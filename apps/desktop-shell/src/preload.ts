import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from './ipc.js';

type VsCodeApiLike = {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

type ThemeMode = 'light' | 'dark';

const VS_CODE_THEME_CLASSES = [
  'vscode-light',
  'vscode-dark',
  'vscode-high-contrast',
  'vscode-high-contrast-light',
] as const;

const COMMON_THEME_VARIABLES: Record<string, string> = {
  '--vscode-font-family': "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  '--vscode-editor-font-family': "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
};

const DARK_THEME_VARIABLES: Record<string, string> = {
  '--vscode-badge-background': '#4d4d4d',
  '--vscode-badge-foreground': '#ffffff',
  '--vscode-button-background': '#0e639c',
  '--vscode-button-border': 'transparent',
  '--vscode-button-foreground': '#ffffff',
  '--vscode-button-hoverBackground': '#1177bb',
  '--vscode-button-secondaryBackground': '#3a3d41',
  '--vscode-button-secondaryBorder': 'transparent',
  '--vscode-button-secondaryForeground': '#ffffff',
  '--vscode-button-secondaryHoverBackground': '#4a4d52',
  '--vscode-charts-blue': '#75beff',
  '--vscode-charts-green': '#89d185',
  '--vscode-charts-orange': '#d18616',
  '--vscode-charts-yellow': '#d7ba7d',
  '--vscode-checkbox-background': '#3c3c3c',
  '--vscode-checkbox-border': '#3c3c3c',
  '--vscode-checkbox-foreground': '#f0f0f0',
  '--vscode-descriptionForeground': '#9d9d9d',
  '--vscode-disabledForeground': '#6e6e6e',
  '--vscode-dropdown-background': '#3c3c3c',
  '--vscode-dropdown-border': '#3c3c3c',
  '--vscode-editor-background': '#1e1e1e',
  '--vscode-editor-foreground': '#d4d4d4',
  '--vscode-editor-inactiveSelectionBackground': 'rgba(255, 255, 255, 0.08)',
  '--vscode-editorGroup-border': '#3c3c3c',
  '--vscode-editorInfo-foreground': '#3794ff',
  '--vscode-editorWarning-foreground': '#cca700',
  '--vscode-editorWidget-background': '#252526',
  '--vscode-errorForeground': '#f48771',
  '--vscode-focusBorder': '#007fd4',
  '--vscode-foreground': '#cccccc',
  '--vscode-gitDecoration-addedResourceForeground': '#81b88b',
  '--vscode-gitDecoration-deletedResourceForeground': '#c74e39',
  '--vscode-gitDecoration-modifiedResourceForeground': '#e2c08d',
  '--vscode-icon-foreground': '#c5c5c5',
  '--vscode-input-activeBackground': '#45494e',
  '--vscode-input-background': '#3c3c3c',
  '--vscode-input-border': '#3c3c3c',
  '--vscode-input-foreground': '#cccccc',
  '--vscode-input-hoverBackground': '#45494e',
  '--vscode-input-placeholderForeground': '#8b8b8b',
  '--vscode-inputValidation-errorBackground': 'rgba(244, 71, 71, 0.12)',
  '--vscode-inputValidation-errorBorder': '#be1100',
  '--vscode-inputValidation-errorForeground': '#f48771',
  '--vscode-inputValidation-infoBackground': 'rgba(0, 122, 204, 0.12)',
  '--vscode-inputValidation-infoBorder': '#007acc',
  '--vscode-inputValidation-warningBackground': 'rgba(204, 167, 0, 0.12)',
  '--vscode-inputValidation-warningBorder': '#b89500',
  '--vscode-keybindingLabel-background': 'rgba(128, 128, 128, 0.2)',
  '--vscode-keybindingLabel-border': 'rgba(48, 48, 48, 0.8)',
  '--vscode-keybindingLabel-bottomBorder': 'rgba(68, 68, 68, 0.8)',
  '--vscode-keybindingLabel-foreground': '#cccccc',
  '--vscode-list-activeSelectionBackground': '#04395e',
  '--vscode-list-activeSelectionForeground': '#ffffff',
  '--vscode-list-errorForeground': '#f48771',
  '--vscode-list-errorHoverBackground': 'rgba(244, 71, 71, 0.15)',
  '--vscode-list-hoverBackground': 'rgba(90, 93, 94, 0.31)',
  '--vscode-list-inactiveSelectionBackground': '#37373d',
  '--vscode-notifications-background': '#252526',
  '--vscode-notifications-border': '#3c3c3c',
  '--vscode-notifications-foreground': '#cccccc',
  '--vscode-notificationsWarningIcon-foreground': '#cca700',
  '--vscode-overlay-background': 'rgba(0, 0, 0, 0.45)',
  '--vscode-panel-border': '#3c3c3c',
  '--vscode-progressBar-background': '#0e70c0',
  '--vscode-scrollbarSlider-activeBackground': 'rgba(191, 191, 191, 0.4)',
  '--vscode-scrollbarSlider-background': 'rgba(121, 121, 121, 0.4)',
  '--vscode-scrollbarSlider-hoverBackground': 'rgba(100, 100, 100, 0.7)',
  '--vscode-settings-dropdownBorder': '#3c3c3c',
  '--vscode-sideBar-background': '#252526',
  '--vscode-sideBar-border': '#3c3c3c',
  '--vscode-sideBarSectionHeader-border': '#3c3c3c',
  '--vscode-symbolIcon-classForeground': '#ee9d28',
  '--vscode-symbolIcon-eventForeground': '#ee9d28',
  '--vscode-symbolIcon-interfaceForeground': '#75beff',
  '--vscode-symbolIcon-methodForeground': '#b180d7',
  '--vscode-terminal-ansiBlue': '#569cd6',
  '--vscode-terminal-ansiBrightYellow': '#f9f1a5',
  '--vscode-terminal-ansiCyan': '#4ec9b0',
  '--vscode-terminal-ansiGreen': '#4ec9b0',
  '--vscode-terminal-ansiRed': '#f14c4c',
  '--vscode-terminal-ansiYellow': '#d7ba7d',
  '--vscode-terminal-foreground': '#cccccc',
  '--vscode-testing-iconFailed': '#f14c4c',
  '--vscode-testing-iconPassed': '#73c991',
  '--vscode-textBlockQuote-background': 'rgba(127, 127, 127, 0.08)',
  '--vscode-textBlockQuote-border': '#555555',
  '--vscode-textCodeBlock-background': 'rgba(10, 10, 10, 0.35)',
  '--vscode-textLink-activeForeground': '#77c3ff',
  '--vscode-textLink-foreground': '#4daafc',
  '--vscode-textPreformat-foreground': '#d7ba7d',
  '--vscode-toolbar-hoverBackground': 'rgba(90, 93, 94, 0.31)',
  '--vscode-warningForeground': '#cca700',
  '--vscode-widget-border': '#454545',
};

const LIGHT_THEME_VARIABLES: Record<string, string> = {
  '--vscode-badge-background': '#cfd8dc',
  '--vscode-badge-foreground': '#1f2328',
  '--vscode-button-background': '#0e639c',
  '--vscode-button-border': 'transparent',
  '--vscode-button-foreground': '#ffffff',
  '--vscode-button-hoverBackground': '#025f99',
  '--vscode-button-secondaryBackground': '#e5e5e5',
  '--vscode-button-secondaryBorder': '#c8c8c8',
  '--vscode-button-secondaryForeground': '#1f2328',
  '--vscode-button-secondaryHoverBackground': '#d6d6d6',
  '--vscode-charts-blue': '#007acc',
  '--vscode-charts-green': '#388a34',
  '--vscode-charts-orange': '#b15c00',
  '--vscode-charts-yellow': '#9d6c00',
  '--vscode-checkbox-background': '#ffffff',
  '--vscode-checkbox-border': '#c8c8c8',
  '--vscode-checkbox-foreground': '#1f2328',
  '--vscode-descriptionForeground': '#616161',
  '--vscode-disabledForeground': '#9b9b9b',
  '--vscode-dropdown-background': '#ffffff',
  '--vscode-dropdown-border': '#c8c8c8',
  '--vscode-editor-background': '#ffffff',
  '--vscode-editor-foreground': '#333333',
  '--vscode-editor-inactiveSelectionBackground': 'rgba(0, 0, 0, 0.06)',
  '--vscode-editorGroup-border': '#e7e7e7',
  '--vscode-editorInfo-foreground': '#005fb8',
  '--vscode-editorWarning-foreground': '#855f00',
  '--vscode-editorWidget-background': '#f3f3f3',
  '--vscode-errorForeground': '#b01011',
  '--vscode-focusBorder': '#005fb8',
  '--vscode-foreground': '#333333',
  '--vscode-gitDecoration-addedResourceForeground': '#2e7d32',
  '--vscode-gitDecoration-deletedResourceForeground': '#b01011',
  '--vscode-gitDecoration-modifiedResourceForeground': '#895503',
  '--vscode-icon-foreground': '#424242',
  '--vscode-input-activeBackground': '#ffffff',
  '--vscode-input-background': '#ffffff',
  '--vscode-input-border': '#c8c8c8',
  '--vscode-input-foreground': '#333333',
  '--vscode-input-hoverBackground': '#f8f8f8',
  '--vscode-input-placeholderForeground': '#8a8a8a',
  '--vscode-inputValidation-errorBackground': 'rgba(176, 16, 17, 0.1)',
  '--vscode-inputValidation-errorBorder': '#b01011',
  '--vscode-inputValidation-errorForeground': '#b01011',
  '--vscode-inputValidation-infoBackground': 'rgba(0, 95, 184, 0.1)',
  '--vscode-inputValidation-infoBorder': '#005fb8',
  '--vscode-inputValidation-warningBackground': 'rgba(133, 95, 0, 0.1)',
  '--vscode-inputValidation-warningBorder': '#855f00',
  '--vscode-keybindingLabel-background': 'rgba(221, 221, 221, 0.8)',
  '--vscode-keybindingLabel-border': 'rgba(204, 204, 204, 0.8)',
  '--vscode-keybindingLabel-bottomBorder': 'rgba(187, 187, 187, 0.8)',
  '--vscode-keybindingLabel-foreground': '#333333',
  '--vscode-list-activeSelectionBackground': '#0060c0',
  '--vscode-list-activeSelectionForeground': '#ffffff',
  '--vscode-list-errorForeground': '#b01011',
  '--vscode-list-errorHoverBackground': 'rgba(176, 16, 17, 0.1)',
  '--vscode-list-hoverBackground': '#e8e8e8',
  '--vscode-list-inactiveSelectionBackground': '#efefef',
  '--vscode-notifications-background': '#f3f3f3',
  '--vscode-notifications-border': '#e0e0e0',
  '--vscode-notifications-foreground': '#333333',
  '--vscode-notificationsWarningIcon-foreground': '#855f00',
  '--vscode-overlay-background': 'rgba(0, 0, 0, 0.3)',
  '--vscode-panel-border': '#e7e7e7',
  '--vscode-progressBar-background': '#0e70c0',
  '--vscode-scrollbarSlider-activeBackground': 'rgba(100, 100, 100, 0.5)',
  '--vscode-scrollbarSlider-background': 'rgba(121, 121, 121, 0.3)',
  '--vscode-scrollbarSlider-hoverBackground': 'rgba(100, 100, 100, 0.45)',
  '--vscode-settings-dropdownBorder': '#c8c8c8',
  '--vscode-sideBar-background': '#f3f3f3',
  '--vscode-sideBar-border': '#e7e7e7',
  '--vscode-sideBarSectionHeader-border': '#e0e0e0',
  '--vscode-symbolIcon-classForeground': '#9b4f96',
  '--vscode-symbolIcon-eventForeground': '#c5862b',
  '--vscode-symbolIcon-interfaceForeground': '#007acc',
  '--vscode-symbolIcon-methodForeground': '#795e26',
  '--vscode-terminal-ansiBlue': '#0451a5',
  '--vscode-terminal-ansiBrightYellow': '#855f00',
  '--vscode-terminal-ansiCyan': '#1a85a6',
  '--vscode-terminal-ansiGreen': '#388a34',
  '--vscode-terminal-ansiRed': '#cd3131',
  '--vscode-terminal-ansiYellow': '#895503',
  '--vscode-terminal-foreground': '#333333',
  '--vscode-testing-iconFailed': '#b01011',
  '--vscode-testing-iconPassed': '#388a34',
  '--vscode-textBlockQuote-background': 'rgba(127, 127, 127, 0.08)',
  '--vscode-textBlockQuote-border': '#c8c8c8',
  '--vscode-textCodeBlock-background': 'rgba(0, 0, 0, 0.04)',
  '--vscode-textLink-activeForeground': '#005a9e',
  '--vscode-textLink-foreground': '#006ab1',
  '--vscode-textPreformat-foreground': '#895503',
  '--vscode-toolbar-hoverBackground': 'rgba(90, 93, 94, 0.12)',
  '--vscode-warningForeground': '#855f00',
  '--vscode-widget-border': '#d0d0d0',
};

let webviewState: unknown = undefined;

const api: VsCodeApiLike = {
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

function getThemeVariables(mode: ThemeMode): Record<string, string> {
  return mode === 'light' ? LIGHT_THEME_VARIABLES : DARK_THEME_VARIABLES;
}

function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  root.style.colorScheme = mode;
  root.style.setProperty('--vc-vscode-theme-type', mode);
  root.classList.remove(...VS_CODE_THEME_CLASSES);
  root.classList.add(mode === 'light' ? 'vscode-light' : 'vscode-dark', 'vcoder-desktop');

  for (const [key, value] of Object.entries(COMMON_THEME_VARIABLES)) {
    root.style.setProperty(key, value);
  }
  for (const [key, value] of Object.entries(getThemeVariables(mode))) {
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
