# VCoder UI 重点页面翻新设计

> 版本: v1.0 | 日期: 2026-03-06 | 状态: Approved

## 背景

VCoder 的设计系统基础良好（424 行 token 定义，8pt 网格，VSCode 主题集成），但存在以下核心问题：

1. 双 token 系统冲突：`_tokens.scss`（`--vc-token-*`）和 `index.scss`（`--vc-*`）定义重叠且值不同
2. 工具调用卡片和 MissionControl 信息层次扁平，偏"日志式"
3. 硬编码值散落（icon 尺寸、max-height、部分 margin）
4. 审批卡片颜色使用 ANSI 终端色而非语义 token

**对标产品**: Cursor — 简洁、现代、深度融入 IDE 的风格

**范围**: 聊天主界面 + MissionControl + 工具调用卡片三个核心区域翻新

## 方案选择

选择"Token 先行 + 逐屏打磨"方案：先合并 token 系统为单一来源，再逐个翻新三个重点区域。

理由：当前 token 系统已接近完善，只需合并双轨。合并后逐屏翻新，每步都能看到整体一致性提升。

---

## 第一步：Token 系统合并

### 目标

将 `_tokens.scss` 和 `index.scss` 合并为单一 token 来源，统一前缀 `--vc-*`。

### 具体做法

1. 保留 `index.scss` 为唯一 token 定义文件，废弃 `_tokens.scss`
2. 对比两套 token 的值冲突（如 `radius-lg`：12px vs 8px），以更符合 Cursor 风格的值为准
3. 新增缺失的 token 类别：
   - Icon 尺寸：`--vc-icon-size-xs`(10px) / `sm`(12px) / `md`(14px) / `lg`(16px) / `xl`(20px)
   - 组件高度：`--vc-height-input`(36px) / `--vc-height-button-sm`(24px) / `md`(28px)
4. 全局搜索替换 `--vc-token-*` -> `--vc-*`，删除 `_tokens.scss`
5. 将所有散落的硬编码值替换为 token 引用

### 回归控制

合并后跑一次全量构建 + 视觉对比，确保无样式丢失。

---

## 第二步：聊天主界面翻新（ChatBubble + InputArea）

### ChatBubble

**用户消息**:
- 去掉渐变背景，改为纯色微底色卡片（`--vc-color-bg-tertiary`），减少视觉噪音
- 圆角统一为 `--vc-radius-lg`（倾向 10-12px）
- hover 操作按钮统一 `--vc-icon-size-sm` 尺寸

**AI 消息**:
- 保持无容器的文档流风格（与 Cursor 一致）
- 代码块提升对比度：更深背景色、左侧语言标签、右上角复制按钮
- Markdown 行高和段间距微调，提升长回复可读性

**流式打字指示器**:
- 3-dot 脉冲保留，硬编码动画时长换成 `--vc-duration-normal`

**Token 用量显示**:
- 保持 AI 消息底部右对齐，字号 `--vc-font-size-2xs`，tabular-nums

### InputArea

**输入框**:
- 当前透明无边框风格已对标 Cursor，保持不动
- 高度约束用 token：`min-height: --vc-height-input`，`max-height: --vc-height-input-max`(240px)

**工具栏（ModelSelector 等）**:
- pill 式触发器风格保持
- 统一所有 icon 为 `--vc-icon-size-sm`
- 模型专属色引用从 `--vc-token-model-*` 改为 `--vc-model-*`

**附件 chips**:
- 间距硬编码替换为 token

### 不动的部分
- Welcome 页面
- 滚动行为 / 虚拟列表逻辑

---

## 第三步：工具调用卡片翻新（StepProgress）

### 摘要行重设计

当前：左边框色带 + icon + 工具名 + 文件路径，一行展开所有信息。

改为：
- 收起态只显示一行：状态 icon（`--vc-icon-size-sm`）+ 工具动作 + 目标（文件名，不含完整路径）+ 耗时
- 完整路径、参数等只在展开后显示
- 左边框色带宽度从 2px 改为 3px，增加辨识度
- 状态色统一走语义 token：
  - running: `--vc-color-primary`
  - completed: `--vc-color-success-text`
  - failed: `--vc-color-error-text`
  - awaiting_confirmation: `--vc-color-warning-text`（替换 ANSI 色）

### 展开详情结构化

当前展开后内容平铺，改为分区块：
- 参数区：灰底代码块，max-height 用 token `--vc-height-code-preview`(200px)
- 输出/结果区：与参数区视觉区分，更亮背景
- 错误区（如有）：红色边框 + `--vc-color-error-bg-subtle` 背景，错误信息 + 堆栈可折叠

### 文件编辑卡片（FileEditEntry）

- Diff 预览 max-height 改为 token `--vc-height-diff-preview`(320px)
- 文件图标颜色：硬编码 hex 改为 CSS class + token，便于主题适配
- Accept/Reject 按钮样式与 FloatingApproval 统一

### 终端输出卡片（TerminalEntry）

- 输出区域保持深色背景 + monospace
- 命令行提示符颜色走 `--vc-color-success-text`
- 长输出"显示更多"交互保持

### 审批卡片颜色修正

- risk-medium: `--vc-color-warning-text`（替代 `--vscode-terminal-ansiYellow`）
- risk-high: `--vc-color-error-text`（替代 `--vscode-terminal-ansiRed`）
- 重复的 `color-mix(80%)` 提取为 `--vc-color-border-subtle`

---

## 第四步：MissionControl 翻新

### 容器与布局

- 玻璃态背景保留（效果好）
- `max-height: 300px` 改为 token `--vc-height-mc-content`，默认 280px
- 展开/收起 CSS Grid `0fr -> 1fr` 动画保留

### Tab 栏

- `font-size: 11px` 和 `padding: 4px 10px` 硬编码改为 `--vc-font-size-xs` + `--vc-space-1 --vc-space-2`
- Active tab spring easing（`cubic-bezier(0.34, 1.56, 0.64, 1)`）保留

### Agent 行卡片化

当前扁平 flex row，改为：
- 每个 agent 行加微底色（`--vc-color-bg-secondary`），圆角 `--vc-radius-md`，padding `--vc-space-2`
- 行内信息重排：
  - 左侧：状态 icon + agent 标题（单行截断）
  - 右侧：类型 badge + 耗时（`tabular-nums`）
- running 状态行：左边框 3px `--vc-color-primary`（与 StepProgress 一致）
- awaiting_confirmation 状态行：左边框 `--vc-color-warning-text` + 琥珀色微光

### Agent 详情页

- 返回按钮 + 标题栏保持
- 工具调用列表复用翻新后的 StepProgress 卡片样式

### Plan 和 Todo Section

- Plan 序号圆形 badge 渐变效果保留
- Todo 条目样式与 agent 行对齐：微底色 + 圆角 + token 化间距

### 不动的部分

- 展开/收起逻辑
- Tab 切换状态管理
- `selectedRunId` 导航模式

---

## 执行顺序

```
Step 1: Token 合并（基础设施）
  |
Step 2: ChatBubble + InputArea（用户最常看到的区域）
  |
Step 3: StepProgress 工具卡片（信息层次提升最大的区域）
  |
Step 4: MissionControl（收尾打磨）
```

每步完成后跑构建验证 + 视觉对比，确保无回归。

## 设计原则

1. **Token 唯一来源**: 所有视觉值必须走 `--vc-*` token，不允许硬编码
2. **信息层次**: 摘要态紧凑，详情态结构化，不做平铺
3. **状态色语义化**: 所有状态色走 `--vc-color-{status}-text`，不引用 ANSI/终端色
4. **与 Cursor 对标**: 简洁、高对比、融入 IDE，不追求花哨动画
5. **向前兼容**: 不改动组件逻辑和状态管理，只改视觉层
