import { ipcMain, type BrowserWindow } from 'electron';
import { IPC_CHANNELS } from './ipc.js';

export class FindInPage {
  private isActive = false;
  private lastQuery = '';

  constructor(private win: BrowserWindow) {
    this.setupIpc();
    this.setupFoundListener();
  }

  open(): void {
    if (this.isActive) {
      return;
    }
    this.isActive = true;
    this.win.webContents.send(IPC_CHANNELS.FIND_IN_PAGE_OPEN);
  }

  close(): void {
    if (!this.isActive) {
      return;
    }
    this.isActive = false;
    this.lastQuery = '';
    this.win.webContents.stopFindInPage('clearSelection');
    this.win.webContents.send(IPC_CHANNELS.FIND_IN_PAGE_CLOSE);
  }

  toggle(): void {
    if (this.isActive) {
      this.close();
    } else {
      this.open();
    }
  }

  destroy(): void {
    ipcMain.removeAllListeners(IPC_CHANNELS.FIND_IN_PAGE_QUERY);
    ipcMain.removeAllListeners(IPC_CHANNELS.FIND_IN_PAGE_NEXT);
    ipcMain.removeAllListeners(IPC_CHANNELS.FIND_IN_PAGE_PREV);
    ipcMain.removeAllListeners(IPC_CHANNELS.FIND_IN_PAGE_CLOSE);
  }

  private setupIpc(): void {
    ipcMain.on(IPC_CHANNELS.FIND_IN_PAGE_QUERY, (_event, query: string) => {
      if (!query || query.length === 0) {
        this.win.webContents.stopFindInPage('clearSelection');
        this.lastQuery = '';
        return;
      }
      this.lastQuery = query;
      this.win.webContents.findInPage(query, { findNext: false });
    });

    ipcMain.on(IPC_CHANNELS.FIND_IN_PAGE_NEXT, () => {
      if (this.lastQuery) {
        this.win.webContents.findInPage(this.lastQuery, { findNext: true, forward: true });
      }
    });

    ipcMain.on(IPC_CHANNELS.FIND_IN_PAGE_PREV, () => {
      if (this.lastQuery) {
        this.win.webContents.findInPage(this.lastQuery, { findNext: true, forward: false });
      }
    });

    ipcMain.on(IPC_CHANNELS.FIND_IN_PAGE_CLOSE, () => {
      this.close();
    });
  }

  private setupFoundListener(): void {
    this.win.webContents.on('found-in-page', (_event, result) => {
      if (!this.win.isDestroyed()) {
        this.win.webContents.send(IPC_CHANNELS.FIND_IN_PAGE_RESULT, {
          activeMatchOrdinal: result.activeMatchOrdinal,
          matches: result.matches,
        });
      }
    });
  }
}
