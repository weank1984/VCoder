/**
 * Desktop Shell - ToastManager Tests
 * Tests for ToastManager: toast types, null/destroyed window handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToastManager } from '../../apps/desktop-shell/src/toastManager.js';

function createMockWindow() {
  return {
    isDestroyed: vi.fn(() => false),
    webContents: {
      send: vi.fn(),
    },
  };
}

describe('ToastManager', () => {
  let mockWindow: ReturnType<typeof createMockWindow>;
  let toastManager: ToastManager;

  beforeEach(() => {
    mockWindow = createMockWindow();
    toastManager = new ToastManager(() => mockWindow as any);
  });

  describe('show()', () => {
    it('should send toast message via webContents.send', () => {
      toastManager.show('success', 'Done', 'Operation completed');

      expect(mockWindow.webContents.send).toHaveBeenCalledTimes(1);
      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'vcoder:webview:incoming',
        {
          type: 'toast',
          data: {
            toastType: 'success',
            title: 'Done',
            message: 'Operation completed',
          },
        },
      );
    });

    it('should send toast without message when message is undefined', () => {
      toastManager.show('info', 'Notice');

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'vcoder:webview:incoming',
        {
          type: 'toast',
          data: {
            toastType: 'info',
            title: 'Notice',
            message: undefined,
          },
        },
      );
    });

    it('should not throw when window is null', () => {
      const nullManager = new ToastManager(() => null);

      expect(() => nullManager.show('error', 'Fail')).not.toThrow();
    });

    it('should not send when window is null', () => {
      const nullManager = new ToastManager(() => null);
      nullManager.show('error', 'Fail');

      // mockWindow.webContents.send should not have been called
      // (the null manager never gets a window reference)
      expect(mockWindow.webContents.send).not.toHaveBeenCalled();
    });

    it('should not throw when window is destroyed', () => {
      mockWindow.isDestroyed.mockReturnValue(true);

      expect(() => toastManager.show('warning', 'Alert')).not.toThrow();
    });

    it('should not send when window is destroyed', () => {
      mockWindow.isDestroyed.mockReturnValue(true);

      toastManager.show('warning', 'Alert');

      expect(mockWindow.webContents.send).not.toHaveBeenCalled();
    });
  });

  describe('success()', () => {
    it('should delegate to show with type "success"', () => {
      toastManager.success('Saved', 'File saved successfully');

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'vcoder:webview:incoming',
        {
          type: 'toast',
          data: {
            toastType: 'success',
            title: 'Saved',
            message: 'File saved successfully',
          },
        },
      );
    });
  });

  describe('error()', () => {
    it('should delegate to show with type "error"', () => {
      toastManager.error('Failed', 'Something went wrong');

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'vcoder:webview:incoming',
        {
          type: 'toast',
          data: {
            toastType: 'error',
            title: 'Failed',
            message: 'Something went wrong',
          },
        },
      );
    });
  });

  describe('warning()', () => {
    it('should delegate to show with type "warning"', () => {
      toastManager.warning('Caution', 'Disk space low');

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'vcoder:webview:incoming',
        {
          type: 'toast',
          data: {
            toastType: 'warning',
            title: 'Caution',
            message: 'Disk space low',
          },
        },
      );
    });
  });

  describe('info()', () => {
    it('should delegate to show with type "info"', () => {
      toastManager.info('Update', 'New version available');

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'vcoder:webview:incoming',
        {
          type: 'toast',
          data: {
            toastType: 'info',
            title: 'Update',
            message: 'New version available',
          },
        },
      );
    });

    it('should work without a message parameter', () => {
      toastManager.info('Ping');

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'vcoder:webview:incoming',
        {
          type: 'toast',
          data: {
            toastType: 'info',
            title: 'Ping',
            message: undefined,
          },
        },
      );
    });
  });
});
