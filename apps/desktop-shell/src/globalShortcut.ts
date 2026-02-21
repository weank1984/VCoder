import { globalShortcut, type BrowserWindow } from 'electron';

const DEFAULT_ACCELERATOR = 'CmdOrCtrl+Shift+Space';

export class GlobalShortcutManager {
  private currentAccelerator: string | null = null;

  constructor(private mainWindow: BrowserWindow) {}

  register(accelerator?: string): boolean {
    this.unregister();
    const accel = accelerator ?? DEFAULT_ACCELERATOR;

    const success = globalShortcut.register(accel, () => {
      if (this.mainWindow.isDestroyed()) {
        return;
      }
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }
      this.mainWindow.show();
      this.mainWindow.focus();
    });

    if (success) {
      this.currentAccelerator = accel;
    } else {
      console.warn(`[GlobalShortcut] Failed to register: ${accel} (may conflict with another app)`);
    }

    return success;
  }

  unregister(): void {
    if (this.currentAccelerator) {
      globalShortcut.unregister(this.currentAccelerator);
      this.currentAccelerator = null;
    }
  }

  getCurrentAccelerator(): string | null {
    return this.currentAccelerator;
  }

  destroy(): void {
    this.unregister();
  }
}
