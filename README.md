# VCoder

VCoder 是一款 VSCode 插件,将 Claude Code CLI 的能力无缝集成到 VSCode 中，为开发者提供智能编程辅助。

## ✨ 特性

- **🤖 对话式交互** - 在侧边栏与 AI 进行自然语言交互
- **🧠 思考过程可视化** - 查看 AI 的推理逻辑和问题分析思路
- **🔧 工具调用追踪** - 详细展示 AI 执行的每个操作
- **📋 任务计划列表** - Plan Mode 下的任务分解和进度跟踪
- **🔄 代码修改预览** - Diff 视图展示变更，接受或拒绝修改
- **💬 多会话管理** - 支持同时进行多个独立对话
- **🔌 MCP 集成** - 支持 Model Context Protocol 扩展
- **👥 多 Agent 支持** - 支持切换不同的 AI Agent
- **🌐 多语言界面** - 支持中文和英文界面切换
- **📊 会话管理** - 导入/导出会话，审计日志功能
- **🎨 Mermaid 图表** - 支持渲染 Mermaid 图表
- **🔐 权限控制** - 细粒度的操作权限管理

## 📋 前置要求

- VSCode >= 1.80.0
- Node.js >= 20.19.0 或 >= 22.12.0
- Claude Code CLI

```bash
npm install -g @anthropic-ai/claude-code
```

## 🚀 安装

### 从 VSCode 市场安装

1. 打开 VSCode
2. 按 `Ctrl+Shift+X` 打开扩展面板
3. 搜索 "VCoder"
4. 点击安装

### 从源码运行

```bash
git clone https://github.com/weank1984/vcoder.git
cd vcoder
pnpm install
pnpm build
```

在 VSCode 中按 `F5` 启动扩展开发主机。

### 安装 .vsix 文件

```bash
npm install -g @vscode/vsce
vsce package
code --install-extension vcoder-0.5.0.vsix
```

## 🚀 快速开始

### 1. 安装 Claude Code CLI

```bash
npm install -g @anthropic-ai/claude-code
```

### 2. 配置 API Key

- 打开命令面板 (`Cmd+Shift+P` / `Ctrl+Shift+P`)
- 输入 `VCoder: Set API Key`
- 输入 Anthropic API Key

### 3. 开始使用

- 点击侧边栏 VCoder 图标
- 输入问题开始对话

## 📖 使用指南

### 基本对话

在输入框中输入问题，按 Enter 发送（Shift+Enter 换行）。AI 会实时响应并展示思考过程。

### Plan Mode

- **Plan Mode** - AI 先规划任务步骤，等待确认后执行
- **Execute Mode** - AI 直接执行操作
- 在输入框右侧切换模式

### 代码修改

AI 建议代码修改时会显示 Diff 预览：
- ✅ **接受** - 应用修改
- ❌ **拒绝** - 忽略修改
- ✏️ **编辑** - 手动调整后应用

### @ 引用

输入 `@` 弹出文件选择器，选中代码后发送会自动附加代码内容。

### Agent 切换

支持切换不同的 AI Agent：

1. 点击设置按钮（⋯）
2. 选择 "Switch Agent"
3. 从列表中选择所需 Agent

### MCP 服务器配置

在 VSCode 设置中配置 MCP 服务器：

```json
{
  "vcoder.mcpServers": [
    {
      "name": "filesystem",
      "type": "stdio",
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem", "/path/to/allowed/files"]
    },
    {
      "name": "github",
      "type": "stdio",
      "command": "npx",
      "args": ["@modelcontextprotocol/server-github"]
    }
  ]
}
```

### 权限配置

细粒度控制不同操作的权限：

```json
{
  "vcoder.permissionMode": "default",  // 权限模式: 'default', 'plan', 'acceptEdits', 'bypassPermissions'
  "vcoder.agentProfiles": []  // Agent 配置文件
}
```

## 👨‍💻 开发

```bash
# 安装依赖
pnpm install

# 构建全部（monorepo）
pnpm build

# 构建 VSCode 插件
pnpm build:plugin

# 打包 VSCode 插件（生成 vcoder.vsix）
pnpm package:plugin

# 构建桌面 App（自动构建 shared/server/webview 依赖）
pnpm build:app

# 启动桌面 App
pnpm start:app

# 桌面 App 开发模式
pnpm dev:app

# 开发模式
pnpm dev

# 运行测试
pnpm test

# 代码检查
pnpm lint

# 清理
pnpm clean
```

## 🖥️ 桌面应用（POC）

新增了独立桌面壳（不影响现有 VSCode 插件）：

```bash
# 推荐（统一命名）
pnpm build:app
pnpm start:app
```

桌面壳里点击设置按钮会触发工作区目录选择（用于切换 `workspaceRoot`）。

## 🔄 CI/CD

见 `docs/CI-CD.md`。

## 📁 项目结构

```
vcoder/
├── apps/
│   ├── vscode-extension/ # VSCode 插件（含 WebView）
│   │   ├── src/          # Extension 源码
│   │   └── webview/      # WebView 前端
│   └── desktop-shell/    # 桌面壳 POC
├── packages/
│   ├── server/           # Agent Server
│   └── shared/           # 共享类型与协议
├── docs/                # 文档
├── tests/               # 跨包测试
└── README.md
```

## 🔒 安全

- API Key 使用 VSCode Secret Storage 加密存储
- 代码修改需用户确认（Diff 预览）
- Bash 命令执行前需用户确认
- 文件操作限制在 workspace 范围内

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📞 联系方式

- 作者: VCoder Team
- 邮箱: weank1984@gmail.com
- GitHub: [@weank1984](https://github.com/weank1984)

## 🗺️ 路线图

- [ ] V0.5 - 完整的 MCP 生态集成
- [ ] V0.6 - 更多 AI 模型支持
- [ ] V0.7 - 插件市场和扩展系统
- [ ] V0.8 - 团队协作功能

## ⭐ 致谢

感谢所有为 VCoder 项目做出贡献的开发者和用户！

特别感谢:

- Anthropic 团队提供的 Claude Code CLI
- 所有反馈建议的用户
