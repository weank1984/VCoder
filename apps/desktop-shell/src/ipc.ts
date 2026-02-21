export const IPC_CHANNELS = {
  // Core webview messaging
  WEBVIEW_OUTGOING: 'vcoder:webview:outgoing',
  WEBVIEW_INCOMING: 'vcoder:webview:incoming',

  // Find in Page
  FIND_IN_PAGE_OPEN: 'vcoder:findInPage:open',
  FIND_IN_PAGE_CLOSE: 'vcoder:findInPage:close',
  FIND_IN_PAGE_QUERY: 'vcoder:findInPage:query',
  FIND_IN_PAGE_NEXT: 'vcoder:findInPage:next',
  FIND_IN_PAGE_PREV: 'vcoder:findInPage:prev',
  FIND_IN_PAGE_RESULT: 'vcoder:findInPage:result',

  // Theme
  THEME_GET_MODE: 'vcoder:theme:getMode',
  THEME_SET_MODE: 'vcoder:theme:setMode',
  THEME_MODE_CHANGED: 'vcoder:theme:modeChanged',

  // Global Shortcut
  GLOBAL_SHORTCUT_GET: 'vcoder:globalShortcut:get',
  GLOBAL_SHORTCUT_SET: 'vcoder:globalShortcut:set',

  // Toast
  TOAST_SHOW: 'vcoder:toast:show',

  // App Info
  APP_INFO: 'vcoder:app:info',

  // Health
  HEALTH_STATUS: 'vcoder:health:status',
} as const;
