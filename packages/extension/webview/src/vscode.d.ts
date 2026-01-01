/**
 * VSCode Webview API Type Definitions
 */

interface VSCodeApi {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VSCodeApi;

declare global {
    interface Window {
        vscode: VSCodeApi;
    }
}

export { };
