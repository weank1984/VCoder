import { app, BrowserWindow, ipcMain, Menu, nativeTheme, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { DesktopRuntime } from './desktopRuntime.js';
import { IPC_CHANNELS } from './ipc.js';
import { WindowManager } from './windowManager.js';
import { buildApplicationMenu } from './menuBuilder.js';
import { showAboutWindow } from './aboutWindow.js';
import { FindInPage } from './findInPage.js';
import { GlobalShortcutManager } from './globalShortcut.js';
import { ToastManager } from './toastManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

type DesktopConfig = {
  workspaceRoot?: string;
  themeMode?: 'system' | 'light' | 'dark';
  globalShortcut?: string;
};

let mainWindow: BrowserWindow | null = null;
let runtime: DesktopRuntime | null = null;
let windowManager: WindowManager | null = null;
let findInPage: FindInPage | null = null;
let shortcutManager: GlobalShortcutManager | null = null;
let toastManager: ToastManager | null = null;
let desktopConfig: DesktopConfig = {};

function getDesktopConfigPath(): string {
  return path.join(app.getPath('userData'), 'desktop-config.json');
}

async function loadDesktopConfig(): Promise<DesktopConfig> {
  try {
    const raw = await fs.readFile(getDesktopConfigPath(), 'utf-8');
    const parsed = JSON.parse(raw) as DesktopConfig;
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
}

async function saveDesktopConfig(config: DesktopConfig): Promise<void> {
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(getDesktopConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
}

function setWindowTitle(): void {
  if (!mainWindow || !runtime) {
    return;
  }
  const rootName = path.basename(runtime.getWorkspaceRoot()) || runtime.getWorkspaceRoot();
  mainWindow.setTitle(`VCoder Desktop - ${rootName}`);
}

async function resolveInitialWorkspaceRoot(config: DesktopConfig): Promise<string> {
  const fromEnv = process.env.VCODER_WORKSPACE_ROOT?.trim();
  const candidates = [fromEnv, config.workspaceRoot, repoRoot].filter(
    (value): value is string => Boolean(value && value.length > 0),
  );

  for (const candidate of candidates) {
    const fullPath = path.resolve(candidate);
    try {
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        return fullPath;
      }
    } catch {
      continue;
    }
  }
  return repoRoot;
}

async function resolveWebviewEntry(): Promise<string | null> {
  const entry = path.join(repoRoot, 'apps', 'desktop-shell', 'webview', 'dist', 'index.html');
  try {
    await fs.access(entry);
    return entry;
  } catch {
    return null;
  }
}

function getLoadingHtml(): string {
  return `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    display: flex; align-items: center; justify-content: center;
    height: 100vh;
    background: #1e1e1e; color: #aaa;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  @media (prefers-color-scheme: light) {
    body { background: #fff; color: #666; }
    .spinner { border-color: #e0e0e0; border-top-color: #6366f1; }
  }
  .loader { text-align: center; }
  .spinner {
    width: 36px; height: 36px;
    border: 3px solid #3a3a3a; border-top-color: #6366f1;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 16px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  p { font-size: 14px; }
</style></head><body>
  <div class="loader">
    <div class="spinner"></div>
    <p>Starting VCoder…</p>
  </div>
</body></html>`;
}

function getErrorHtml(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const escaped = message.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    display: flex; align-items: center; justify-content: center;
    height: 100vh;
    background: #1e1e1e; color: #ccc;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  @media (prefers-color-scheme: light) {
    body { background: #fff; color: #333; }
    .error-box { background: #fef2f2; border-color: #fecaca; }
    code { background: #f3f4f6; }
  }
  .container { text-align: center; padding: 32px; max-width: 500px; }
  h2 { font-size: 20px; margin-bottom: 12px; color: #ef4444; }
  .error-box {
    background: #2d1b1b; border: 1px solid #5c2020;
    border-radius: 8px; padding: 16px; margin-bottom: 20px; text-align: left;
  }
  code { font-size: 12px; display: block; word-break: break-all; background: #2a2a2a; padding: 8px; border-radius: 4px; margin-top: 8px; }
  button {
    background: #6366f1; color: white; border: none;
    padding: 10px 24px; border-radius: 6px; font-size: 14px; cursor: pointer;
  }
  button:hover { background: #4f46e5; }
</style></head><body>
  <div class="container">
    <h2>Failed to Start</h2>
    <div class="error-box">
      <p>VCoder server could not be started.</p>
      <code>${escaped}</code>
    </div>
    <button onclick="location.reload()">Retry</button>
  </div>
</body></html>`;
}

function applyThemeMode(mode: DesktopConfig['themeMode']): void {
  nativeTheme.themeSource = mode === 'system' || !mode ? 'system' : mode;
}

async function createWindow(): Promise<BrowserWindow> {
  const bounds = windowManager?.getBoundsForNewWindow() ?? { width: 1280, height: 860 };
  const state = windowManager?.getState();

  const win = new BrowserWindow({
    ...bounds,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, targetUrl) => {
    if (!targetUrl.startsWith('file://')) {
      event.preventDefault();
      void shell.openExternal(targetUrl);
    }
  });

  if (state?.isMaximized) {
    win.maximize();
  }
  if (state?.isFullScreen) {
    win.setFullScreen(true);
  }

  windowManager?.trackWindow(win);
  return win;
}

// ─── Theme IPC ─────────────────────────────────────────────────
function setupThemeIpc(): void {
  ipcMain.handle(IPC_CHANNELS.THEME_GET_MODE, () => desktopConfig.themeMode ?? 'system');

  ipcMain.on(IPC_CHANNELS.THEME_SET_MODE, async (_event, mode: string) => {
    const themeMode = mode as DesktopConfig['themeMode'];
    desktopConfig.themeMode = themeMode;
    applyThemeMode(themeMode);
    await saveDesktopConfig(desktopConfig);

    const resolved =
      themeMode === 'system' || !themeMode
        ? nativeTheme.shouldUseDarkColors
          ? 'dark'
          : 'light'
        : themeMode;
    mainWindow?.webContents.send(IPC_CHANNELS.THEME_MODE_CHANGED, resolved);
  });
}

// ─── Global Shortcut IPC ───────────────────────────────────────
function setupShortcutIpc(): void {
  ipcMain.handle(IPC_CHANNELS.GLOBAL_SHORTCUT_GET, () => shortcutManager?.getCurrentAccelerator() ?? null);

  ipcMain.on(IPC_CHANNELS.GLOBAL_SHORTCUT_SET, async (_event, accelerator: string) => {
    if (shortcutManager) {
      const success = shortcutManager.register(accelerator || undefined);
      if (success) {
        desktopConfig.globalShortcut = accelerator;
        await saveDesktopConfig(desktopConfig);
      }
    }
  });
}

// ─── App Lifecycle ─────────────────────────────────────────────
app.whenReady().then(async () => {
  desktopConfig = await loadDesktopConfig();
  const workspaceRoot = await resolveInitialWorkspaceRoot(desktopConfig);

  applyThemeMode(desktopConfig.themeMode);
  windowManager = new WindowManager(app.getPath('userData'));
  toastManager = new ToastManager(() => mainWindow);

  // Create window with loading screen first
  mainWindow = await createWindow();
  await mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(getLoadingHtml()));
  mainWindow.show();

  // Initialize runtime
  runtime = new DesktopRuntime({
    rootDir: repoRoot,
    stateDir: app.getPath('userData'),
    workspaceRoot,
    postMessage: (payload) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.WEBVIEW_INCOMING, payload);
      }
    },
    onWorkspaceRootChanged: async (nextRoot) => {
      desktopConfig.workspaceRoot = nextRoot;
      await saveDesktopConfig(desktopConfig);
      setWindowTitle();
      toastManager?.success('Workspace Changed', path.basename(nextRoot));
    },
  });

  // Start runtime — show error screen on failure
  try {
    await runtime.start();
    desktopConfig.workspaceRoot = workspaceRoot;
    await saveDesktopConfig(desktopConfig);
  } catch (error) {
    await mainWindow.loadURL(
      'data:text/html;charset=utf-8,' + encodeURIComponent(getErrorHtml(error)),
    );
    return;
  }

  // Setup IPC before loading the webview to avoid missing early messages
  ipcMain.on(IPC_CHANNELS.WEBVIEW_OUTGOING, (_event, payload) => {
    if (runtime) {
      void runtime.handleWebviewMessage(payload);
    }
  });
  setupThemeIpc();
  setupShortcutIpc();

  // Load the webview
  const webviewEntry = await resolveWebviewEntry();
  if (webviewEntry) {
    await mainWindow.loadFile(webviewEntry);
  } else {
    await mainWindow.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(
          '<h2>VCoder Desktop Shell</h2><p>Missing webview bundle. Run `pnpm -C apps/desktop-shell/webview build` first.</p>',
        ),
    );
  }

  setWindowTitle();

  // Initialize sub-modules
  findInPage = new FindInPage(mainWindow);
  shortcutManager = new GlobalShortcutManager(mainWindow);
  shortcutManager.register(desktopConfig.globalShortcut);

  // Build application menu
  const menu = buildApplicationMenu(mainWindow, {
    onNewChat: () => void runtime?.handleWebviewMessage({ type: 'newSession' }),
    onOpenWorkspace: () => void runtime?.handleWebviewMessage({ type: 'openSettings' }),
    onShowAbout: () => mainWindow && showAboutWindow(mainWindow),
    onOpenFind: () => findInPage?.toggle(),
    sendToWebview: (payload) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.WEBVIEW_INCOMING, payload);
      }
    },
  });
  Menu.setApplicationMenu(menu);

  mainWindow.on('closed', () => {
    findInPage?.destroy();
    findInPage = null;
    mainWindow = null;
  });

  // macOS: re-create window on dock click
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow().then(async (win) => {
        mainWindow = win;
        const webview = await resolveWebviewEntry();
        if (webview) {
          await win.loadFile(webview);
        }
        win.show();
        setWindowTitle();
        findInPage = new FindInPage(win);
        win.on('closed', () => {
          findInPage?.destroy();
          findInPage = null;
          mainWindow = null;
        });
      });
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  shortcutManager?.destroy();
  shortcutManager = null;
});

app.on('before-quit', () => {
  windowManager?.saveSync();
  if (runtime) {
    void runtime.shutdown();
  }
});
