/**
 * Desktop Shell - WindowManager Tests
 * Tests for WindowManager: state loading, saving, bounds checking, state copy
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockReadFileSync, mockWriteFileSync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  default: {
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
  },
}));

vi.mock('node:fs/promises', () => ({
  default: {
    writeFile: vi.fn(async () => {}),
  },
}));

import { screen } from 'electron';
import { WindowManager } from '../../apps/desktop-shell/src/windowManager.js';

const DEFAULT_STATE = {
  width: 1280,
  height: 860,
  isMaximized: false,
  isFullScreen: false,
};

describe('WindowManager', () => {
  const stateDir = '/tmp/test-state';

  beforeEach(() => {
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();

    // Default: screen has one display
    (screen.getAllDisplays as ReturnType<typeof vi.fn>).mockReturnValue([
      { workArea: { x: 0, y: 0, width: 1920, height: 1080 } },
    ]);
  });

  describe('loadSync (via constructor)', () => {
    it('should return default state when file does not exist', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const wm = new WindowManager(stateDir);
      const state = wm.getState();

      expect(state).toEqual(DEFAULT_STATE);
    });

    it('should return default state when file contains invalid JSON', () => {
      mockReadFileSync.mockReturnValue('not valid json{{{');

      const wm = new WindowManager(stateDir);
      const state = wm.getState();

      expect(state).toEqual(DEFAULT_STATE);
    });

    it('should load saved state when file exists', () => {
      const saved = {
        x: 200,
        y: 150,
        width: 1400,
        height: 900,
        isMaximized: true,
        isFullScreen: false,
      };
      mockReadFileSync.mockReturnValue(JSON.stringify(saved));

      const wm = new WindowManager(stateDir);
      const state = wm.getState();

      expect(state.x).toBe(200);
      expect(state.y).toBe(150);
      expect(state.width).toBe(1400);
      expect(state.height).toBe(900);
      expect(state.isMaximized).toBe(true);
      expect(state.isFullScreen).toBe(false);
    });

    it('should use defaults for invalid width and height values', () => {
      const saved = { x: 100, y: 100, width: 50, height: 30 };
      mockReadFileSync.mockReturnValue(JSON.stringify(saved));

      const wm = new WindowManager(stateDir);
      const state = wm.getState();

      // width and height below 100 should fall back to defaults
      expect(state.width).toBe(DEFAULT_STATE.width);
      expect(state.height).toBe(DEFAULT_STATE.height);
    });

    it('should handle missing x and y gracefully', () => {
      const saved = { width: 1000, height: 700 };
      mockReadFileSync.mockReturnValue(JSON.stringify(saved));

      const wm = new WindowManager(stateDir);
      const state = wm.getState();

      expect(state.x).toBeUndefined();
      expect(state.y).toBeUndefined();
      expect(state.width).toBe(1000);
      expect(state.height).toBe(700);
    });

    it('should read from the correct path', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      new WindowManager(stateDir);

      expect(mockReadFileSync).toHaveBeenCalledWith(
        `${stateDir}/window-state.json`,
        'utf-8',
      );
    });
  });

  describe('getState()', () => {
    it('should return a copy, not the original reference', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const wm = new WindowManager(stateDir);
      const state1 = wm.getState();
      const state2 = wm.getState();

      // Should be equal in value
      expect(state1).toEqual(state2);
      // But not the same object reference
      expect(state1).not.toBe(state2);
    });

    it('should not allow external mutation of internal state', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const wm = new WindowManager(stateDir);
      const state = wm.getState();
      state.width = 9999;

      // Internal state should remain unchanged
      expect(wm.getState().width).toBe(DEFAULT_STATE.width);
    });
  });

  describe('getBoundsForNewWindow()', () => {
    it('should return saved bounds with x/y when they are on screen', () => {
      const saved = { x: 100, y: 100, width: 1280, height: 860, isMaximized: false, isFullScreen: false };
      mockReadFileSync.mockReturnValue(JSON.stringify(saved));

      const wm = new WindowManager(stateDir);
      const bounds = wm.getBoundsForNewWindow();

      expect(bounds).toEqual({ x: 100, y: 100, width: 1280, height: 860 });
    });

    it('should return only width/height when saved bounds are off screen', () => {
      const saved = { x: 5000, y: 5000, width: 1280, height: 860, isMaximized: false, isFullScreen: false };
      mockReadFileSync.mockReturnValue(JSON.stringify(saved));

      // The center would be at (5000 + 640, 5000 + 430) = (5640, 5430)
      // which is outside the display (0,0)-(1920,1080)
      const wm = new WindowManager(stateDir);
      const bounds = wm.getBoundsForNewWindow();

      expect(bounds.x).toBeUndefined();
      expect(bounds.y).toBeUndefined();
      expect(bounds.width).toBe(1280);
      expect(bounds.height).toBe(860);
    });

    it('should return only width/height when x/y are not saved', () => {
      const saved = { width: 1000, height: 700, isMaximized: false, isFullScreen: false };
      mockReadFileSync.mockReturnValue(JSON.stringify(saved));

      const wm = new WindowManager(stateDir);
      const bounds = wm.getBoundsForNewWindow();

      expect(bounds.x).toBeUndefined();
      expect(bounds.y).toBeUndefined();
      expect(bounds.width).toBe(1000);
      expect(bounds.height).toBe(700);
    });

    it('should detect bounds on screen across multiple displays', () => {
      (screen.getAllDisplays as ReturnType<typeof vi.fn>).mockReturnValue([
        { workArea: { x: 0, y: 0, width: 1920, height: 1080 } },
        { workArea: { x: 1920, y: 0, width: 1920, height: 1080 } },
      ]);

      // Window placed on the second display
      const saved = { x: 2200, y: 200, width: 1280, height: 860, isMaximized: false, isFullScreen: false };
      mockReadFileSync.mockReturnValue(JSON.stringify(saved));

      const wm = new WindowManager(stateDir);
      const bounds = wm.getBoundsForNewWindow();

      // Center is at (2200 + 640, 200 + 430) = (2840, 630), which is on second display
      expect(bounds.x).toBe(2200);
      expect(bounds.y).toBe(200);
    });
  });

  describe('saveSync()', () => {
    it('should write state to disk', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const wm = new WindowManager(stateDir);
      wm.saveSync();

      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        `${stateDir}/window-state.json`,
        expect.any(String),
        'utf-8',
      );

      const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
      expect(written.width).toBe(DEFAULT_STATE.width);
      expect(written.height).toBe(DEFAULT_STATE.height);
    });

    it('should not throw when writeFileSync fails', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      mockWriteFileSync.mockImplementation(() => {
        throw new Error('disk full');
      });

      const wm = new WindowManager(stateDir);

      expect(() => wm.saveSync()).not.toThrow();
    });
  });

  describe('trackWindow()', () => {
    it('should register event listeners on the window', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const wm = new WindowManager(stateDir);
      const win = {
        on: vi.fn(),
        isDestroyed: vi.fn(() => false),
        isMaximized: vi.fn(() => false),
        isFullScreen: vi.fn(() => false),
        getBounds: vi.fn(() => ({ x: 100, y: 100, width: 1280, height: 860 })),
      };

      wm.trackWindow(win as any);

      const onCalls = win.on.mock.calls;
      const registeredEvents = onCalls.map((call: any[]) => call[0]);

      expect(registeredEvents).toContain('move');
      expect(registeredEvents).toContain('resize');
      expect(registeredEvents).toContain('maximize');
      expect(registeredEvents).toContain('unmaximize');
      expect(registeredEvents).toContain('enter-full-screen');
      expect(registeredEvents).toContain('leave-full-screen');
      expect(registeredEvents).toContain('closed');
    });
  });
});
