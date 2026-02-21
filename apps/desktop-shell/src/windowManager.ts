import { BrowserWindow, screen } from 'electron';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
  isFullScreen: boolean;
}

const DEFAULT_STATE: WindowState = {
  width: 1280,
  height: 860,
  isMaximized: false,
  isFullScreen: false,
};

const SAVE_DEBOUNCE_MS = 300;

export class WindowManager {
  private state: WindowState;
  private readonly statePath: string;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private tracked: BrowserWindow | null = null;

  constructor(stateDir: string) {
    this.statePath = path.join(stateDir, 'window-state.json');
    this.state = this.loadSync();
  }

  getState(): WindowState {
    return { ...this.state };
  }

  getBoundsForNewWindow(): { x?: number; y?: number; width: number; height: number } {
    const { x, y, width, height } = this.state;
    if (x !== undefined && y !== undefined) {
      const visible = this.isBoundsOnScreen({ x, y, width, height });
      if (visible) {
        return { x, y, width, height };
      }
    }
    return { width, height };
  }

  trackWindow(win: BrowserWindow): void {
    this.tracked = win;

    const update = () => this.scheduleSave(win);
    win.on('move', update);
    win.on('resize', update);
    win.on('maximize', update);
    win.on('unmaximize', update);
    win.on('enter-full-screen', update);
    win.on('leave-full-screen', update);

    win.on('closed', () => {
      this.tracked = null;
    });
  }

  saveSync(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.tracked && !this.tracked.isDestroyed()) {
      this.captureState(this.tracked);
    }
    try {
      fsSync.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch {
      // Swallow — best-effort save on quit
    }
  }

  private loadSync(): WindowState {
    try {
      const raw = fsSync.readFileSync(this.statePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<WindowState>;
      return {
        x: typeof parsed.x === 'number' ? parsed.x : undefined,
        y: typeof parsed.y === 'number' ? parsed.y : undefined,
        width: typeof parsed.width === 'number' && parsed.width > 100 ? parsed.width : DEFAULT_STATE.width,
        height: typeof parsed.height === 'number' && parsed.height > 100 ? parsed.height : DEFAULT_STATE.height,
        isMaximized: Boolean(parsed.isMaximized),
        isFullScreen: Boolean(parsed.isFullScreen),
      };
    } catch {
      return { ...DEFAULT_STATE };
    }
  }

  private captureState(win: BrowserWindow): void {
    this.state.isMaximized = win.isMaximized();
    this.state.isFullScreen = win.isFullScreen();
    if (!this.state.isMaximized && !this.state.isFullScreen) {
      const bounds = win.getBounds();
      this.state.x = bounds.x;
      this.state.y = bounds.y;
      this.state.width = bounds.width;
      this.state.height = bounds.height;
    }
  }

  private scheduleSave(win: BrowserWindow): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.captureState(win);
      void fs.writeFile(this.statePath, JSON.stringify(this.state, null, 2), 'utf-8').catch(() => {});
      this.saveTimer = null;
    }, SAVE_DEBOUNCE_MS);
  }

  private isBoundsOnScreen(bounds: { x: number; y: number; width: number; height: number }): boolean {
    const displays = screen.getAllDisplays();
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    return displays.some((display) => {
      const { x, y, width, height } = display.workArea;
      return centerX >= x && centerX <= x + width && centerY >= y && centerY <= y + height;
    });
  }
}
