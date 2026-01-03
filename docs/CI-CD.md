# GitHub CI/CD

本项目使用 GitHub Actions 实现：

- **CI**：在 PR / push 时执行安装、构建、测试
- **Release/CD**：在打 Tag 时打包 VSCode 扩展为 `.vsix`，并上传到 GitHub Release；可选发布到插件市场

## 1) CI（持续集成）

工作流文件：`.github/workflows/ci.yml`

触发条件：

- `push` 到 `main` / `master`
- `pull_request`

执行内容：

- `pnpm install --frozen-lockfile`
- `pnpm build`
- `pnpm test`
- 打包 VSIX（产物上传为 Actions artifact：`vcoder-ci-vsix`）

> 说明：目前仓库内的 `lint` 脚本在部分包里依赖未补齐（`eslint` 未在对应 package 的依赖中声明），因此默认未放入 CI。若需要我也可以顺手把全仓 lint 配齐并加进 CI。

## 2) Release/CD（持续交付）

工作流文件：`.github/workflows/release.yml`

触发条件：

- `push` Tag：`v*`（例如：`v0.1.0`）

执行内容：

- 安装依赖
- 在 `packages/extension` 下运行 `vsce package` 生成 `vcoder.vsix`
- 上传 `packages/extension/vcoder.vsix` 到 GitHub Release
- 可选：发布到 VS Marketplace / Open VSX

### 2.1 打 Tag 发布

```bash
git tag v0.1.0
git push origin v0.1.0
```

### 2.2 可选：发布到 VS Marketplace

在 GitHub 仓库 `Settings -> Secrets and variables -> Actions` 添加：

- `VSCE_PAT`：VS Marketplace Personal Access Token

要求：

- `packages/extension/package.json` 内的 `publisher` 与你在 Marketplace 的 publisher 一致

### 2.3 可选：发布到 Open VSX

添加 Secret：

- `OVSX_PAT`：Open VSX token
