# VCoder VSCode 调试配置指南

本项目已配置完整的 VSCode 调试环境，支持多种调试场景。

## 🎯 调试配置说明

### 1. Run Extension (运行扩展)
- **用途**: 调试 VSCode 扩展主进程
- **启动方式**: F5 或点击 "Run and Debug"
- **说明**: 启动一个新的 VSCode Extension Host 窗口，加载扩展进行调试
- **断点**: 可在 `packages/extension/src/**/*.ts` 中设置断点
- **特性**: ✅ 自动禁用所有其他扩展，避免干扰；如需启用其它扩展用 "Run Extension (With Extensions)"

### 2. Run Webview (运行 Webview)
- **用途**: 调试扩展的前端界面
- **启动方式**: 从调试面板选择 "Run Webview"
- **说明**: 同时启动扩展和 webview 开发服务器
- **断点**: 可在 `packages/extension/webview/src/**/*.tsx` 中设置断点
- **特性**: ✅ 自动禁用所有其他扩展，避免干扰；如需启用其它扩展用 "Run Webview (With Extensions)"

### 3. Debug Server (调试服务器)
- **用途**: 单独调试 Agent Server 进程
- **启动方式**: 从调试面板选择 "Debug Server"
- **说明**: 启动并附加到服务器进程
- **断点**: 可在 `packages/server/src/**/*.ts` 中设置断点

### 4. Compound: Extension + Server (复合调试)
- **用途**: 同时调试扩展和服务器
- **启动方式**: 从调试面板选择 "Extension + Server"
- **说明**: 同时启动两个调试会话，方便调试完整流程
- **断点**: 可在扩展和服务器代码中同时设置断点
- **特性**: 如需禁用其他扩展，使用对应的 "(Clean)" 配置

### 5. Run Tests (运行测试)
- **测试扩展**: 选择 "Run Tests (Extension)"
- **测试服务器**: 选择 "Run Tests (Server)"
- **测试共享包**: 选择 "Run Tests (Shared)"
- **说明**: 在调试模式下运行测试，支持断点

## 🔧 常用调试场景

### 场景 1: 开发扩展功能
1. 设置断点在 `packages/extension/src/extension.ts`
2. 选择 "Run Extension" 配置
3. 按 F5 启动调试
4. 在新打开的 VSCode 窗口中触发扩展功能

### 场景 2: 调试 ACP 通信
1. 使用复合配置 "Extension + Server"
2. 在扩展的 `acp/client.ts` 设置断点
3. 在服务器的 `acp/server.ts` 设置断点
4. 启动调试，查看完整通信流程

### 场景 3: 调试 Webview UI
1. 在 webview 组件中设置断点
2. 选择 "Run Webview" 配置
3. 启动后可在浏览器中调试 React 组件
4. 或使用 VSCode 的 Chrome 调试器

### 场景 4: 调试测试
1. 在测试文件中设置断点
2. 选择对应的测试配置
3. 启动调试，测试会在断点处暂停

## 📋 任务说明

### 开发任务（后台运行）
所有开发任务都已配置 `isBackground: true` 和自定义 problemMatcher：

- **dev:extension**: 监听模式编译扩展代码
  - 自动检测 TypeScript 错误
  - 监听文件变化自动重建
  - 后台运行，不会阻塞其他操作

- **dev:server**: 监听模式编译服务器代码
  - 自动检测 TypeScript 错误
  - 监听文件变化自动重建
  - 后台运行，不会阻塞其他操作

- **dev:webview**: 启动 webview 开发服务器（Vite）
  - 自动检测 Vite 构建错误
  - 提供热模块替换（HMR）
  - 后台运行，不会阻塞其他操作

### 构建任务（一次性运行）
- `build:extension`: 构建扩展代码
- `build:server`: 构建服务器代码
- `build:all`: 构建所有包

### 测试任务
- `test`: 运行所有测试
- `test:watch`: 监听模式运行测试（后台任务）

### 其他任务
- `clean`: 清理所有构建产物

## 🎨 快捷键

- **F5**: 启动调试
- **Shift+F5**: 停止调试
- **Ctrl+Shift+F5**: 重启调试
- **F9**: 切换断点
- **F10**: 单步跳过
- **F11**: 单步进入
- **Shift+F11**: 单步跳出

## 💡 提示

1. **调试时禁用其他扩展**
   - "Run Extension" / "Run Webview" 默认使用 `--disable-extensions`，确保调试环境干净
   - `--disable-extensions` 会禁用 Extension Host 里的所有扩展（包含内置扩展），如需依赖其它扩展请改用 "(With Extensions)"

2. **后台任务监控**
   - 后台任务（dev:* 和 test:watch）会自动在后台运行
   - 通过 **PROBLEMS** 面板查看实时错误和警告
   - 任务输出在 **OUTPUT** 面板中查看

2. **热重载**: 开发模式下，修改代码后会自动重新编译

3. **Console 输出**: 查看 Debug Console 面板查看日志

4. **Call Stack**: 在调试时查看调用栈

5. **Variables**: 查看当前作用域的变量

6. **Watch Panel**: 添加表达式监控

## 🔍 故障排除

### 后台任务未正常工作
- **问题**: 任务显示 "has not exited"
- **原因**: problemMatcher 未检测到任务的开始/结束模式
- **解决**:
  - 查看任务输出，确认任务的开始/结束文本
  - 调整 `beginsPattern` 和 `endsPattern` 正则表达式

### 扩展无法加载
- 确保已运行 `pnpm build` 构建代码
- 检查 `packages/extension/out/` 目录是否存在
- 查看输出面板的错误信息

### 服务器无法启动
- 确保已构建服务器代码
- 检查端口占用情况
- 查看集成终端的输出

### Webview 无法显示
- 确保已启动 webview 开发服务器
- 检查扩展是否能连接到 webview
- 查看浏览器控制台错误

### ProblemMatcher 不工作
- 检查终端输出格式是否匹配正则表达式
- 使用 **Test Task** 功能验证配置
- 查看 OUTPUT 面板的任务输出

## 📝 配置说明

### ProblemMatcher 工作原理

后台任务需要特殊的 problemMatcher 配置：

```json
{
  "problemMatcher": [{
    "pattern": {
      "regexp": "错误匹配正则表达式"
    },
    "background": {
      "activeOnStart": true,
      "beginsPattern": "任务开始的标识",
      "endsPattern": "任务结束的标识"
    }
  }]
}
```

**TypeScript Watch 任务**:
- 监听输出：`"Watching for file changes\."`
- 匹配错误：`"file.ts(line,col): error TS123: message"`

**Vite Dev Server**:
- 监听输出：`"VITE ... ready in ... ms"` 到 `"Local: http://..."`
- 匹配错误：`"file.ts:line:col: message"`

**Vitest Watch**:
- 监听输出：`"RUN"` 到 `"Test Files ... failed"`
- 匹配失败：`"FAIL tests/*.test.ts"`

## 📚 相关资源

- [VSCode 调试文档](https://code.visualstudio.com/docs/editor/debugging)
- [Extension Host 调试](https://code.visualstudio.com/api/get-started/extension-anatomy#debugging-your-extension)
- [Webview 调试指南](https://code.visualstudio.com/api/extension-guides/webview#testing-a-webview)
- [Tasks 配置](https://code.visualstudio.com/docs/editor/tasks)
- [ProblemMatcher 配置](https://code.visualstudio.com/docs/editor/tasks#defining-a-problem-matcher)
