# Desktop Shell (POC)

`apps/desktop-shell` is an isolated Electron shell for the standalone VCoder app.

Current goals of this package:
- Keep VSCode extension functionality untouched.
- Reuse existing `packages/server` ACP process.
- Reuse existing `apps/vscode-extension/webview` UI through a preload bridge.

This package is intentionally standalone and does not change extension runtime paths.
