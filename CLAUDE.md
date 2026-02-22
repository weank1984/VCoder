# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VCoder is a VSCode extension (and experimental Electron desktop app) that provides an AI coding assistant UI powered by Claude Code CLI. It uses a custom **Agent Client Protocol (ACP)** over JSON-RPC 2.0 to communicate between the host environment and a Node.js agent server that spawns Claude CLI processes.

## Build & Development Commands

```bash
# Install dependencies
pnpm install

# Full monorepo build (shared → server → apps, via Turborepo)
pnpm build

# Dev mode (all packages in watch mode)
pnpm dev

# VSCode extension only
pnpm build:plugin          # Build
pnpm dev:plugin            # Watch mode
pnpm package:plugin        # Build + package → apps/vscode-extension/vcoder.vsix

# Desktop shell (Electron app)
pnpm build:app             # Build all deps + desktop
pnpm dev:app               # Dev mode
pnpm start:app             # Run built Electron app
```

## Testing

Tests use **Vitest** and live in the root `tests/` directory (not inside packages).

```bash
pnpm test                  # Run all tests once
pnpm test:watch            # Watch mode
pnpm test:coverage         # With v8 coverage

# Run a single test file
npx vitest run tests/server/acp.test.ts

# Run a directory of tests
npx vitest run tests/extension/
```

Mock aliases are configured in `vitest.config.ts`: `vscode` → `tests/mocks/vscode.ts`, `electron` → `tests/mocks/electron.ts`, and `@vcoder/*` → source TS files.

## Linting

```bash
pnpm lint                  # ESLint via Turborepo (all packages)
```

ESLint uses flat config (`eslint.config.js`). Unused vars prefixed with `_` are allowed. `@typescript-eslint/no-explicit-any` is disabled only for `transcriptStore.ts`.

## Monorepo Structure

This is a **pnpm workspace** with **Turborepo** orchestration. Build order is enforced via `^build` dependency in `turbo.json`.

| Package | Path | Description |
|---|---|---|
| `@vcoder/shared` | `packages/shared` | ACP protocol types, ACPClient, HostBridgeApi interface |
| `@vcoder/server` | `packages/server` | ACP server process; spawns Claude CLI via ClaudeCodeWrapper |
| `@vcoder/ui` | `packages/ui` | Shared React UI components, Zustand store, hooks, i18n (source-only, no build step) |
| VSCode extension | `apps/vscode-extension` | Extension host (CommonJS) + WebView (Vite + React) |
| Desktop shell | `apps/desktop-shell` | Electron main process + WebView (Vite + React, port 5174 in dev) |

**Dependency flow:** `@vcoder/shared` → `@vcoder/server` + `@vcoder/ui` → apps

## Architecture

### 3-Tier Communication

```
Host (VSCode Extension / Electron)
  ↕  postMessage (WebView IPC)
Shared WebView UI (@vcoder/ui — React 19 + Zustand)
  ↕  HostBridgeApi abstraction
Host → ACPClient (JSON-RPC 2.0 over stdio) → @vcoder/server
  ↕  spawn + JSON stream
Claude Code CLI (external process)
```

### Key Abstractions

- **HostBridgeApi** (`packages/shared/src/hostBridge.ts`): Unified interface that both VSCode and Electron hosts implement. The shared UI code in `@vcoder/ui` only talks through `bridge.ts`, never directly to host APIs.
- **ACPClient/ACPServer**: Custom JSON-RPC 2.0 over stdio. Methods include `initialize`, `session/*`, `prompt`, `settings/change`, `file/accept|reject`, `history/*`, `permission/rules/*`, `lsp/*`.
- **ClaudeCodeWrapper** (`packages/server/src/claude/wrapper.ts`): Manages per-session Claude CLI child processes. Each chat session maps to a separate process.
- **CapabilityOrchestrator** (`apps/vscode-extension/src/services/capabilityOrchestrator.ts`): Dependency topology sort and lifecycle management of VS Code extension capabilities.
- **Zustand store** (`packages/ui/src/store/`): Slice-based architecture — `messagesSlice`, `sessionsSlice`, `uiSlice`, `updateSlice`, `historySlice`, `agentSlice`, `permissionRulesSlice`.

### TypeScript Configuration

- Root `tsconfig.json`: `ES2022`, `NodeNext`, `strict`, `composite` (project references)
- VSCode extension overrides to `module: "CommonJS"`, outputs to `out/`
- WebViews use `module: "ESNext"`, `moduleResolution: "bundler"` (Vite handles bundling, `noEmit: true`)
- Desktop shell uses `NodeNext` with `DOM` lib (Electron)

### WebView Build

Both webview apps (VSCode + Desktop) use Vite with identical patterns:
- Source aliases resolve `@vcoder/shared` and `@vcoder/ui` to TypeScript source (not built output)
- SCSS `loadPaths` include `packages/ui/src` for shared style imports
- Single-file bundle output (`cssCodeSplit: false`) for WebView CSP compliance

## Conventions

- Language: Project docs and comments are primarily in Chinese (zh-CN), code identifiers in English
- i18n: `packages/ui/src/i18n/` with `en-US` and `zh-CN` locales
- Styles: SCSS modules with component-paired files (e.g., `ChatBubble.tsx` + `ChatBubble.scss`)
- Node.js: `>=20.19.0 || >=22.12.0`
- Package manager: `pnpm@9.0.0` (enforced via `packageManager` field)
