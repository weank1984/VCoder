/**
 * Host Bridge
 *
 * Abstracts communication between the shared Webview and its host environment.
 * The host provides an `acquireVsCodeApi()` compatible object regardless of
 * whether the Webview is running inside VSCode or the Desktop Shell (Electron).
 * See `packages/shared/src/hostBridge.ts` for the canonical interface definition.
 */
/// <reference path="./vscode.d.ts" />
import type { HostBridgeApi } from '@vcoder/shared';

const vscode: HostBridgeApi =
    typeof acquireVsCodeApi === 'function'
        ? acquireVsCodeApi()
        : {
              postMessage: () => {},
              getState: () => undefined,
              setState: () => {},
          };

export function postMessage(message: unknown): void {
    vscode.postMessage(message);
}

export function getState<T>(): T | undefined {
    return vscode.getState() as T | undefined;
}

export function setState<T>(state: T): void {
    vscode.setState(state);
}

export { vscode };
