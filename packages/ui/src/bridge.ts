/**
 * Host Bridge
 *
 * Abstracts communication between the shared Webview and its host environment.
 * The host provides an `acquireVsCodeApi()` compatible object regardless of
 * whether the Webview is running inside VSCode or the Desktop Shell (Electron).
 * See `packages/shared/src/hostBridge.ts` for the canonical interface definition.
 */
/// <reference path="./vscode.d.ts" />
import type { HostBridgeApi, HostCapabilities } from '@vcoder/shared';

// In ESM webviews (`<script type="module">`), globals exposed as `window.acquireVsCodeApi`
// are not guaranteed to be available as an unqualified identifier `acquireVsCodeApi`.
// VSCode provides a real global function, while Electron preload typically attaches it
// to the global object. Prefer `globalThis` for compatibility.
const acquire =
    typeof (globalThis as unknown as { acquireVsCodeApi?: unknown }).acquireVsCodeApi === 'function'
        ? ((globalThis as unknown as { acquireVsCodeApi: () => HostBridgeApi }).acquireVsCodeApi)
        : typeof acquireVsCodeApi === 'function'
          ? acquireVsCodeApi
          : undefined;

const vscode: HostBridgeApi =
    acquire
        ? acquire()
        : {
              postMessage: () => {},
              getState: () => undefined,
              setState: () => {},
          };

if (!acquire) {
    // Helps debug cases where the webview is running but host wiring is missing.
    console.warn('[VCoder][bridge] Host API not found (acquireVsCodeApi). postMessage is a no-op.');
}

export function postMessage(message: unknown): void {
    vscode.postMessage(message);
}

export function getState<T>(): T | undefined {
    return vscode.getState() as T | undefined;
}

export function setState<T>(state: T): void {
    vscode.setState(state);
}

export function getCapabilities(): HostCapabilities {
    return vscode.getCapabilities ? vscode.getCapabilities() : {};
}

export { vscode };
