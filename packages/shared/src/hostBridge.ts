/**
 * HostBridgeApi — the contract between the shared Webview and any host environment.
 *
 * Both host implementations must satisfy this interface:
 *   - VSCode Extension: provided by `vscode.acquireVsCodeApi()` (native VSCode API)
 *   - Desktop Shell (Electron): provided by `preload.ts` via `contextBridge.exposeInMainWorld`
 *
 * The Webview must only communicate with its host through this interface.
 * No host-specific APIs (e.g. `window.electronAPI`, VSCode internals) should appear
 * inside the shared Webview code — satisfying NFR-006.
 */
/**
 * Capabilities that a host environment may provide.
 * The Webview queries these at startup to conditionally enable UI features
 * that depend on host-specific functionality.
 */
export interface HostCapabilities {
  /** Host can insert text into the active editor at cursor position */
  insertText?: boolean;
  /** Host can open a file in the editor/viewer */
  openFile?: boolean;
  /** Host can show a native diff view (e.g. VSCode diff editor) */
  nativeDiff?: boolean;
  /** Host can export audit logs to a file */
  auditExport?: boolean;
}

export interface HostBridgeApi {
  /**
   * Send a message to the host.
   * The host is responsible for routing the message to the appropriate handler
   * (Extension Host or Electron main process) and then on to the ACP server.
   */
  postMessage(message: unknown): void;

  /**
   * Retrieve previously persisted webview UI state.
   * The host stores this state across webview hide/show cycles.
   */
  getState(): unknown;

  /**
   * Persist webview UI state so it can be restored after the webview is hidden or reloaded.
   */
  setState(state: unknown): void;

  /**
   * Query which capabilities the host environment supports.
   * Optional — if not implemented, the Webview assumes no extended capabilities.
   */
  getCapabilities?(): HostCapabilities;
}
