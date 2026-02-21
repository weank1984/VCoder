import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { DesktopRuntime } from './desktopRuntime.js';
import { IPC_CHANNELS } from './ipc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

type DesktopConfig = {
  workspaceRoot?: string;
};

let mainWindow: BrowserWindow | null = null;
let runtime: DesktopRuntime | null = null;

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
  const entry = path.join(repoRoot, 'apps', 'vscode-extension', 'webview', 'dist', 'index.html');
  try {
    await fs.access(entry);
    return entry;
  } catch {
    return null;
  }
}

async function createWindow(): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
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

  const webviewEntry = await resolveWebviewEntry();
  if (webviewEntry) {
    await win.loadFile(webviewEntry);
  } else {
    await win.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(
          '<h2>VCoder Desktop Shell</h2><p>Missing webview bundle. Run `pnpm -C apps/vscode-extension/webview build` first.</p>',
        ),
    );
  }

  return win;
}

app.whenReady().then(async () => {
  const config = await loadDesktopConfig();
  const workspaceRoot = await resolveInitialWorkspaceRoot(config);

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
      await saveDesktopConfig({ workspaceRoot: nextRoot });
      setWindowTitle();
    },
  });

  await runtime.start();
  await saveDesktopConfig({ workspaceRoot });

  ipcMain.on(IPC_CHANNELS.WEBVIEW_OUTGOING, (_event, payload) => {
    if (runtime) {
      void runtime.handleWebviewMessage(payload);
    }
  });

  mainWindow = await createWindow();
  setWindowTitle();
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow().then((win) => {
        mainWindow = win;
        setWindowTitle();
        mainWindow.on('closed', () => {
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

app.on('before-quit', () => {
  if (runtime) {
    void runtime.shutdown();
  }
});
