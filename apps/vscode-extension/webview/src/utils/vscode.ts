/**
 * VSCode API Hook
 */

type VSCodeApiLike = {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
};

const vscode: VSCodeApiLike =
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
