/**
 * VSCode API Hook
 */

const vscode = acquireVsCodeApi();

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
