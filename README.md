# VCoder

VCoder 是一款 VSCode 插件,将 Claude Code CLI 的能力无缝集成到 VSCode 中，为开发者提供智能编程辅助。

## 特性

- **对话式交互** - 在侧边栏与 AI 进行自然语言交互
- **思考过程可视化** - 查看 AI 的推理逻辑和问题分析思路
- **工具调用追踪** - 详细展示 AI 执行的每个操作
- **任务计划列表** - Plan Mode 下的任务分解和进度跟踪
- **代码修改预览** - Diff 视图展示变更，接受或拒绝修改
- **多会话管理** - 支持同时进行多个独立对话
- **MCP 集成** - 支持 Model Context Protocol 扩展

## 前置要求

- VSCode >= 1.80.0
- Node.js >= 18.0.0
- Claude Code CLI

```bash
npm install -g @anthropic-ai/claude-code
```

## 安装

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
code --install-extension vcoder-0.1.0.vsix
```

## 快速开始

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

## 使用指南

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

## 开发

```bash
# 安装依赖
pnpm install

# 构建
pnpm build

# 开发模式
pnpm dev

# 清理
pnpm clean
```

## 项目结构

```
vcoder/
├── packages/
│   ├── extension/       # VSCode 插件
│   ├── server/          # Agent Server
│   └── shared/          # 共享类型
├── docs/                # 文档
└── README.md
```

## 安全

- API Key 使用 VSCode Secret Storage 加密存储
- 代码修改需用户确认（Diff 预览）
- Bash 命令执行前需用户确认
- 文件操作限制在 workspace 范围内

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

## 联系方式

- 作者: weank1984
- 邮箱: weank1984@gmail.com
- GitHub: [@weank1984](https://github.com/weank1984)
