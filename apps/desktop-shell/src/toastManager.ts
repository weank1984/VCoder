import { type BrowserWindow } from 'electron';
import { IPC_CHANNELS } from './ipc.js';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export class ToastManager {
  constructor(private getWindow: () => BrowserWindow | null) {}

  show(type: ToastType, title: string, message?: string): void {
    const win = this.getWindow();
    if (!win || win.isDestroyed()) {
      return;
    }
    win.webContents.send(IPC_CHANNELS.WEBVIEW_INCOMING, {
      type: 'toast',
      data: { toastType: type, title, message },
    });
  }

  success(title: string, message?: string): void {
    this.show('success', title, message);
  }

  error(title: string, message?: string): void {
    this.show('error', title, message);
  }

  warning(title: string, message?: string): void {
    this.show('warning', title, message);
  }

  info(title: string, message?: string): void {
    this.show('info', title, message);
  }
}
