/**
 * VSCode Webview API Type Definitions
 */

declare global {
    interface VSCodeApi {
        postMessage(message: unknown): void;
        getState(): unknown;
        setState(state: unknown): void;
    }

    function acquireVsCodeApi(): VSCodeApi;

    interface Window {
        vscode: VSCodeApi;
    }
}

export {};
