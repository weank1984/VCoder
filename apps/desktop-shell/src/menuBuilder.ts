import { Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';

export interface MenuCallbacks {
  onNewChat: () => void;
  onOpenWorkspace: () => void;
  onShowAbout: () => void;
  onOpenFind: () => void;
  sendToWebview: (payload: unknown) => void;
}

export function buildApplicationMenu(win: BrowserWindow, callbacks: MenuCallbacks): Menu {
  const isMac = process.platform === 'darwin';

  const appMenu: MenuItemConstructorOptions = {
    label: 'VCoder',
    submenu: [
      { label: 'About VCoder', click: callbacks.onShowAbout },
      { type: 'separator' },
      {
        label: 'Preferences…',
        accelerator: 'CmdOrCtrl+,',
        click: () => callbacks.sendToWebview({ type: 'showEcosystem' }),
      },
      { type: 'separator' },
      ...(isMac
        ? [
            { role: 'hide' as const },
            { role: 'hideOthers' as const },
            { role: 'unhide' as const },
            { type: 'separator' as const },
          ]
        : []),
      { role: 'quit' as const },
    ],
  };

  const fileMenu: MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      {
        label: 'New Chat',
        accelerator: 'CmdOrCtrl+N',
        click: callbacks.onNewChat,
      },
      {
        label: 'Open Workspace…',
        accelerator: 'CmdOrCtrl+O',
        click: callbacks.onOpenWorkspace,
      },
      { type: 'separator' },
      { role: isMac ? 'close' : 'quit' },
    ],
  };

  const viewMenu: MenuItemConstructorOptions = {
    label: 'View',
    submenu: [
      {
        label: 'Find…',
        accelerator: 'CmdOrCtrl+F',
        click: callbacks.onOpenFind,
      },
      { type: 'separator' },
      {
        label: 'History',
        accelerator: 'CmdOrCtrl+Shift+H',
        click: () => callbacks.sendToWebview({ type: 'showHistory' }),
      },
      {
        label: 'Ecosystem',
        accelerator: 'CmdOrCtrl+Shift+E',
        click: () => callbacks.sendToWebview({ type: 'showEcosystem' }),
      },
      { type: 'separator' },
      { role: 'togglefullscreen' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      {
        label: 'Developer Tools',
        accelerator: isMac ? 'Cmd+Alt+I' : 'Ctrl+Shift+I',
        click: () => {
          if (!win.isDestroyed()) {
            win.webContents.toggleDevTools();
          }
        },
      },
    ],
  };

  const helpMenu: MenuItemConstructorOptions = {
    role: 'help',
    submenu: [
      {
        label: 'Documentation',
        click: () => void shell.openExternal('https://github.com/nicepkg/vcoder'),
      },
      {
        label: 'Report Issue',
        click: () => void shell.openExternal('https://github.com/nicepkg/vcoder/issues'),
      },
    ],
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [appMenu] : []),
    fileMenu,
    { role: 'editMenu' },
    viewMenu,
    { role: 'windowMenu' },
    helpMenu,
  ];

  if (!isMac) {
    // On Windows/Linux, add About to Help menu
    const helpSubmenu = helpMenu.submenu as MenuItemConstructorOptions[];
    helpSubmenu.push({ type: 'separator' }, { label: 'About VCoder', click: callbacks.onShowAbout });
  }

  return Menu.buildFromTemplate(template);
}
