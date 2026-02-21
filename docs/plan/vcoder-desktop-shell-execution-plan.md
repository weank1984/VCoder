# VCoder Desktop Shell 执行计划（不影响插件）

## 1. 目标

- 启动独立桌面 App（Claude Desktop 风格）。
- 复用现有 `packages/server` 与 `apps/vscode-extension/webview`。
- 保持现有 VSCode 插件功能与命令路径不变。

## 2. 约束

- 不修改 `apps/vscode-extension/src` 主链路逻辑。
- 不替换现有插件的构建命令（`pnpm build` / `pnpm dev`）。
- 桌面端新增内容全部放在 `apps/desktop-shell`。

## 3. 已完成（Phase 0 / Bootstrap）

- 新建 `apps/desktop-shell` 独立工程骨架。
- 实现 preload 消息桥，兼容 `acquireVsCodeApi` 与 `window.message`。
- 主进程接入 ACP 运行时：
  - 拉起 `packages/server/dist/index.js`
  - 转发 `session/update` / `session/complete`
  - 提供 `fs/*` 与 `terminal/*` ACP handler
- 新增独立脚本：
  - `pnpm desktop:build`
  - `pnpm desktop:dev`
  - `pnpm desktop:start`

## 4. 下一步（Phase 1）

- 已完成：权限规则文件持久化（`userData/permission-rules.json`）。
- 已完成：设置入口支持工作区切换并持久化（`desktop-config.json`）。
- 已完成：pending 文件打开优先预览 proposed 内容（写入 `pending-previews`）。
- 待完成：桌面端原生 Diff Review UI（替代 `vscode.diff`）。
- 待完成：桌面端会话/审计持久化完善。

## 5. 风险与控制

- 风险：`packages/server/dist` 或 `webview/dist` 未构建导致桌面壳启动失败。
  - 控制：启动时明确报错并提示构建命令。
- 风险：桌面端新增依赖影响插件命令。
  - 控制：桌面壳为独立目录 + 独立脚本，不进入插件运行链路。
