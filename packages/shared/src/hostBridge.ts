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
}
