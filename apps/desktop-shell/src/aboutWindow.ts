import { BrowserWindow, app } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let aboutWindow: BrowserWindow | null = null;

export function showAboutWindow(parent: BrowserWindow): void {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.focus();
    return;
  }

  aboutWindow = new BrowserWindow({
    parent,
    modal: true,
    width: 420,
    height: 340,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const info = encodeURIComponent(
    JSON.stringify({
      appName: 'VCoder Desktop',
      version: app.getVersion(),
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      chromiumVersion: process.versions.chrome,
      platform: `${process.platform} ${process.arch}`,
    }),
  );

  aboutWindow.loadFile(path.join(__dirname, '..', 'resources', 'about.html'), { hash: info });

  aboutWindow.once('ready-to-show', () => {
    aboutWindow?.show();
  });

  aboutWindow.on('closed', () => {
    aboutWindow = null;
  });
}
