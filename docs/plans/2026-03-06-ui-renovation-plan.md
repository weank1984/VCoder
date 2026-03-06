# UI 重点页面翻新实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 合并双 token 系统 + 翻新聊天界面/工具卡片/MissionControl 三个核心区域，对标 Cursor 视觉品质。

**Architecture:** 先统一设计 token 为单一来源（`--vc-*` 前缀），消除 `_tokens.scss` 中的 `--vc-token-*` 双轨。然后逐个翻新三个重点区域的 SCSS，不改动组件逻辑和状态管理。

**Tech Stack:** SCSS, CSS Custom Properties, Vite (webview build)

**Design Doc:** `docs/plans/2026-03-06-ui-renovation-design.md`

---

## 构建验证命令

每个 Task 完成后运行：

```bash
pnpm -C apps/vscode-extension/webview build 2>&1 | tail -5
```

期望：`build` 成功无报错。

---

## Task 1: 合并 `_tokens.scss` 到 `index.scss`，统一 `--vc-*` 前缀

**Files:**
- Modify: `packages/ui/src/index.scss` (添加缺失的 token)
- Delete: `packages/ui/src/styles/_tokens.scss`
- Modify: `packages/ui/src/styles/index.scss` (移除 `@use './_tokens.scss'`)
- Modify: `packages/ui/src/styles/_mixins.scss` (替换 14 处 `--vc-token-*`)
- Modify: `packages/ui/src/styles/_agent-block.scss` (替换硬编码值)

### Step 1: 在 `packages/ui/src/index.scss` 的 `:root` 中补充 `_tokens.scss` 独有的 token

`_tokens.scss` 中有些 token 在 `index.scss` 中已有对应（值可能不同），有些是独有的。需要补充的独有 token：

```scss
/* 在 index.scss 的 :root 末尾、GLOBAL RESET 之前添加 */

/* ==========================================================================
   13. GLASS / SURFACE TOKENS
   ========================================================================== */

--vc-glass-bg: rgba(30, 31, 35, 0.78);
--vc-glass-border: rgba(255, 255, 255, 0.08);
--vc-glass-blur: 12px;
--vc-hover-soft: rgba(255, 255, 255, 0.06);

/* ==========================================================================
   14. MODEL-SPECIFIC COLORS
   ========================================================================== */

--vc-model-sonnet: #6c8cff;
--vc-model-sonnet-bg: rgba(108, 140, 255, 0.10);
--vc-model-haiku: #2dd4bf;
--vc-model-haiku-bg: rgba(45, 212, 191, 0.10);
--vc-model-glm: #fbbf24;
--vc-model-glm-bg: rgba(251, 191, 36, 0.10);

/* ==========================================================================
   15. ICON SIZE TOKENS
   ========================================================================== */

--vc-icon-size-xs: 10px;
--vc-icon-size-sm: 12px;
--vc-icon-size-md: 14px;
--vc-icon-size-lg: 16px;
--vc-icon-size-xl: 20px;

/* ==========================================================================
   16. COMPONENT HEIGHT TOKENS
   ========================================================================== */

--vc-height-input: 36px;
--vc-height-input-max: 240px;
--vc-height-code-preview: 200px;
--vc-height-diff-preview: 320px;
--vc-height-mc-content: 280px;
```

同时添加浅色主题覆盖（在 `GLOBAL RESET` 之前）：

```scss
.vscode-light,
.vscode-high-contrast-light {
    --vc-glass-bg: rgba(255, 255, 255, 0.88);
    --vc-glass-border: rgba(0, 0, 0, 0.08);
    --vc-hover-soft: rgba(0, 0, 0, 0.05);
}
```

### Step 2: 值冲突决议

两套 token 有以下值冲突，统一决议如下（不需改 `index.scss` 中已有的值）：

| Token | `_tokens.scss` | `index.scss` | 决议 |
|-------|---------------|-------------|------|
| radius-xs | 4px | 2px | 保留 `index.scss` 的 2px |
| radius-sm | 6px | 4px | 保留 `index.scss` 的 4px |
| radius-md | 8px | 6px | 保留 `index.scss` 的 6px |
| radius-lg | 12px | 8px | **改为 10px**（Cursor 风格，在 2xl=12px 之下） |
| shadow 各级 | 更重 | 更轻 | 保留 `index.scss` 的更轻版本 |
| duration-fast | 150ms | 100ms | 保留 `index.scss` 的 100ms |
| z-index 系列 | 50-500 | 100-2000 | 保留 `index.scss` 的（更宽泛） |

**唯一需修改**：`--vc-radius-lg` 从 `8px` 改为 `10px`。

### Step 3: 移除 `@use './_tokens.scss'`

在 `packages/ui/src/styles/index.scss` 第 1 行，删除 `@use './_tokens.scss';`。

### Step 4: 全局替换 `--vc-token-*` → `--vc-*`

在以下 12 个文件中执行替换。映射规则：

| `--vc-token-*` | → `--vc-*` |
|-----------------|-----------|
| `--vc-token-bg-base` | `--vc-color-bg-base` |
| `--vc-token-bg-surface` | `--vc-color-bg-secondary` |
| `--vc-token-bg-elevated` | `--vc-color-bg-elevated` |
| `--vc-token-bg-overlay` | `--vc-color-mask` |
| `--vc-token-accent` | `--vc-color-primary` |
| `--vc-token-accent-soft` | `--vc-color-primary-bg-hover` |
| `--vc-token-accent-hover` | `--vc-color-primary-hover` |
| `--vc-token-success` | `--vc-color-success-text` |
| `--vc-token-warning` | `--vc-color-warning-text` |
| `--vc-token-error` | `--vc-color-error-text` |
| `--vc-token-model-sonnet` | `--vc-model-sonnet` |
| `--vc-token-model-sonnet-bg` | `--vc-model-sonnet-bg` |
| `--vc-token-model-haiku` | `--vc-model-haiku` |
| `--vc-token-model-haiku-bg` | `--vc-model-haiku-bg` |
| `--vc-token-model-glm` | `--vc-model-glm` |
| `--vc-token-model-glm-bg` | `--vc-model-glm-bg` |
| `--vc-token-font-2xs` | `--vc-font-size-2xs` |
| `--vc-token-font-xs` | `--vc-font-size-xs` |
| `--vc-token-font-sm` | `--vc-font-size-sm` |
| `--vc-token-font-md` | `--vc-font-size-md` |
| `--vc-token-font-lg` | `--vc-font-size-lg` |
| `--vc-token-font-xl` | `--vc-font-size-xl` |
| `--vc-token-font-2xl` | `--vc-font-size-2xl` |
| `--vc-token-weight-*` | `--vc-font-weight-*` |
| `--vc-token-lh-tight` | `--vc-line-height-tight` |
| `--vc-token-lh-normal` | `--vc-line-height-normal` |
| `--vc-token-lh-relaxed` | `--vc-line-height-relaxed` |
| `--vc-token-space-N` | `--vc-space-N` |
| `--vc-token-shadow-*` | `--vc-shadow-*` |
| `--vc-token-shadow-float` | `--vc-shadow-2xl` |
| `--vc-token-radius-*` | `--vc-radius-*` |
| `--vc-token-duration-*` | `--vc-motion-duration-*` (instant→instant, fast→fast, normal→mid, slow→slow, slower→slower) |
| `--vc-token-ease-default` | `--vc-motion-ease-in-out` |
| `--vc-token-ease-in` | `--vc-motion-ease-in` |
| `--vc-token-ease-out` | `--vc-motion-ease-out` |
| `--vc-token-ease-spring` | `--vc-motion-ease-bounce` |
| `--vc-token-glass-bg` | `--vc-glass-bg` |
| `--vc-token-glass-border` | `--vc-glass-border` |
| `--vc-token-glass-blur` | `--vc-glass-blur` |
| `--vc-token-hover-soft` | `--vc-hover-soft` |
| `--vc-token-z-*` | 对应 `--vc-z-index-*` |

**需修改的文件**（共 12 个，264 处）：

1. `packages/ui/src/styles/_mixins.scss` — 14 处
2. `packages/ui/src/components/FloatingApproval/FloatingApproval.scss` — 6 处
3. `packages/ui/src/components/ComposerToolbar/index.scss` — 39 处
4. `packages/ui/src/components/ModelSelector.scss` — 47 处
5. `packages/ui/src/components/SessionHeader.scss` — 3 处
6. `packages/ui/src/components/StepProgress/index.scss` — 5 处
7. `packages/ui/src/components/StepProgress/ApprovalUI.scss` — 1 处
8. `packages/ui/src/components/Welcome/index.scss` — 6 处
9. `packages/ui/src/components/MissionControl/MissionControl.scss` — 8 处
10. `packages/ui/src/components/PlanModeDivider.scss` — 10 处
11. `packages/ui/src/components/InputArea.scss` — 44 处
12. `packages/ui/src/styles/_agent-block.scss` — 硬编码值替换

### Step 5: 删除 `_tokens.scss`

删除 `packages/ui/src/styles/_tokens.scss`。

### Step 6: 构建验证

```bash
pnpm -C apps/vscode-extension/webview build 2>&1 | tail -5
pnpm -C apps/desktop-shell/webview build 2>&1 | tail -5
```

期望：两端构建成功。

### Step 7: 提交

```bash
git add -A packages/ui/src/styles/ packages/ui/src/index.scss packages/ui/src/components/
git commit -m "refactor(tokens): 合并双 token 系统为单一 --vc-* 前缀"
```

---

## Task 2: ChatBubble 视觉翻新

**Files:**
- Modify: `packages/ui/src/components/ChatBubble.scss` (207 lines)
- Modify: `packages/ui/src/components/ChatBubble.tsx` (249 lines) — 仅改 className，不改逻辑

### Step 1: 用户消息气泡样式修改

在 `ChatBubble.scss` 中找到用户消息的样式（应有渐变背景 `linear-gradient`），替换为：

```scss
// 用户消息 — 纯色微底色，去掉渐变
background: var(--vc-color-bg-tertiary);
border: 1px solid var(--vc-color-border-tertiary);
border-radius: var(--vc-radius-lg); // 现在是 10px
```

### Step 2: Hover 操作按钮统一 icon 尺寸

找到 copy/retry 按钮的 icon 尺寸（当前硬编码 `13px` 等），替换为：

```scss
width: var(--vc-icon-size-sm);   // 12px
height: var(--vc-icon-size-sm);
```

### Step 3: 打字指示器动画时长 token 化

找到 typing indicator 的 `animation-duration`（当前 `1.2s` 硬编码），替换为 token 或保持合理值：

```scss
animation: vc-typing-dot 1.2s var(--vc-motion-ease-in-out) infinite;
```

同时确认 dot 尺寸使用一致的值（当前 `3px` 可保留，太小不需要 token 化）。

### Step 4: 消除剩余硬编码 px 值

检查 `ChatBubble.scss` 中所有 `px` 值，将 padding/margin/gap 中的硬编码换为 `--vc-space-*` token：
- `gap: 2px` → `gap: var(--vc-space-1)` (4px) 或保留 2px（如果视觉上 4px 太大则保留）
- `max-width: 840px` → 定义 `--vc-width-chat-max: 840px` 或保留（此值是内容宽度限制，非间距）

### Step 5: 构建验证 + 提交

```bash
pnpm -C apps/vscode-extension/webview build 2>&1 | tail -5
git add packages/ui/src/components/ChatBubble.scss packages/ui/src/components/ChatBubble.tsx
git commit -m "style(ChatBubble): 用户消息纯色底色 + icon 尺寸 token 化"
```

---

## Task 3: InputArea 视觉翻新

**Files:**
- Modify: `packages/ui/src/components/InputArea.scss` (561 lines)

### Step 1: 输入框高度 token 化

找到 textarea 的 `min-height` 和 `max-height`，替换为：

```scss
min-height: var(--vc-height-input);      // 36px
max-height: var(--vc-height-input-max);  // 240px
```

### Step 2: 全量替换 `--vc-token-*` 引用（44 处）

此文件是 `--vc-token-*` 引用最多的文件之一（44 处），逐一替换为对应的 `--vc-*` token。如果 Task 1 已全局替换，此步骤可跳过。

### Step 3: Icon 尺寸统一

找到工具栏图标尺寸（`12px`、`14px` 等硬编码），统一为：
- 小图标：`var(--vc-icon-size-sm)` (12px)
- 标准图标：`var(--vc-icon-size-md)` (14px)

### Step 4: 附件 chips 间距 token 化

找到 attachment 相关的 gap/padding 硬编码，替换为 `--vc-space-*`。

### Step 5: 构建验证 + 提交

```bash
pnpm -C apps/vscode-extension/webview build 2>&1 | tail -5
git add packages/ui/src/components/InputArea.scss
git commit -m "style(InputArea): 高度/icon/间距全面 token 化"
```

---

## Task 4: StepProgress 工具卡片翻新 — 摘要行与状态色

**Files:**
- Modify: `packages/ui/src/components/StepProgress/index.scss` (823 lines)
- Modify: `packages/ui/src/components/StepProgress/ApprovalUI.scss` (557 lines)

### Step 1: 左边框宽度增加辨识度

找到 `.step-item` 的 `border-left` 样式（当前 `2px`），改为 `3px`：

```scss
border-left: 3px solid var(--vc-color-primary);
```

### Step 2: 状态色统一为语义 token

找到所有状态色引用，替换：
- `--vscode-terminal-ansiYellow` → `--vc-color-warning-text`
- `--vscode-terminal-ansiRed` → `--vc-color-error-text`
- `--vscode-terminal-ansiBlue` → `--vc-color-primary`
- `--vscode-terminal-ansiGreen` → `--vc-color-success-text`

在 `index.scss` 和 `ApprovalUI.scss` 中都执行此替换。

### Step 3: Icon 尺寸 token 化

找到 `14px`、`12px` 等图标尺寸硬编码，替换为 `--vc-icon-size-sm`/`--vc-icon-size-md`。

### Step 4: 审批卡片 color-mix 提取

找到 `ApprovalUI.scss` 中重复的 `color-mix(in srgb, var(--vscode-panel-border) 80%, transparent)` 模式，改为引用 `--vc-color-border-secondary`。

### Step 5: max-height token 化

- 参数区代码块 `max-height: 200px` → `var(--vc-height-code-preview)`
- Diff 预览 `max-height: 320px` → `var(--vc-height-diff-preview)`

### Step 6: 构建验证 + 提交

```bash
pnpm -C apps/vscode-extension/webview build 2>&1 | tail -5
git add packages/ui/src/components/StepProgress/
git commit -m "style(StepProgress): 状态色语义化 + icon/高度 token 化 + 左边框加粗"
```

---

## Task 5: StepProgress 工具卡片翻新 — 展开详情结构化

**Files:**
- Modify: `packages/ui/src/components/StepProgress/index.scss` (823 lines)
- Modify: `packages/ui/src/components/StepProgress/TerminalOutput.scss` (186 lines)
- Modify: `packages/ui/src/components/StepProgress/DiffViewer.scss` (502 lines)

### Step 1: 展开详情分区视觉区分

在 `index.scss` 中为展开后的内容区添加分区样式：

```scss
// 参数区
.step-detail-params {
  background: var(--vc-color-bg-secondary);
  border-radius: var(--vc-radius-sm);
  padding: var(--vc-space-2);
  max-height: var(--vc-height-code-preview);
  overflow-y: auto;
}

// 结果区
.step-detail-result {
  background: var(--vc-color-bg-elevated);
  border-radius: var(--vc-radius-sm);
  padding: var(--vc-space-2);
}

// 错误区
.step-detail-error {
  background: var(--vc-color-error-bg-subtle);
  border: 1px solid var(--vc-color-error-border);
  border-radius: var(--vc-radius-sm);
  padding: var(--vc-space-2);
}
```

### Step 2: 终端输出命令提示符颜色

在 `TerminalOutput.scss` 中，找到命令提示符绿色（可能硬编码），改为 `--vc-color-success-text`。

### Step 3: DiffViewer 文件图标颜色 token 化

在 `DiffViewer.scss` 中，找到硬编码的语言图标颜色（`#4584b6` 等），替换为 VSCode symbol icon token：

```scss
&.python  { color: var(--vscode-symbolIcon-classForeground, #4584b6); }
&.javascript { color: var(--vscode-symbolIcon-methodForeground, #f7df1e); }
// ... 其他语言类推，保留 fallback 值
```

### Step 4: 构建验证 + 提交

```bash
pnpm -C apps/vscode-extension/webview build 2>&1 | tail -5
git add packages/ui/src/components/StepProgress/
git commit -m "style(StepProgress): 展开详情分区结构化 + 终端/Diff 颜色 token 化"
```

---

## Task 6: MissionControl 翻新 — Tab 栏与容器

**Files:**
- Modify: `packages/ui/src/components/MissionControl/MissionControl.scss` (793 lines)

### Step 1: 容器 max-height token 化

找到 `.mc-content` 的 `max-height: 300px`，替换为：

```scss
max-height: var(--vc-height-mc-content); // 280px
```

### Step 2: Tab 栏尺寸 token 化

找到 `.mc-tab` 的硬编码 `font-size: 11px` 和 `padding: 4px 10px`，替换为：

```scss
font-size: var(--vc-font-size-xs);  // 11px
padding: var(--vc-space-1) var(--vc-space-2); // 4px 8px — 比原来稍紧凑
```

### Step 3: 摘要文字尺寸 token 化

找到 `.mc-summary-text` 的 `font-size: 11px` 和 `margin-right: 8px`，替换为：

```scss
font-size: var(--vc-font-size-xs);
margin-right: var(--vc-space-2);
```

### Step 4: Section count 尺寸 token 化

找到 `.mc-section-count` 的 `font-size: 11px`，替换为 `var(--vc-font-size-xs)`。

### Step 5: 全量替换 `--vc-token-*` 引用（8 处）

如果 Task 1 未覆盖，手动替换此文件中剩余的 `--vc-token-*` 引用。

### Step 6: 构建验证 + 提交

```bash
pnpm -C apps/vscode-extension/webview build 2>&1 | tail -5
git add packages/ui/src/components/MissionControl/MissionControl.scss
git commit -m "style(MissionControl): 容器/Tab/文字尺寸全面 token 化"
```

---

## Task 7: MissionControl 翻新 — Agent 行卡片化

**Files:**
- Modify: `packages/ui/src/components/MissionControl/MissionControl.scss` (793 lines)
- Modify: `packages/ui/src/components/MissionControl/AgentSection.tsx` (279 lines) — 可能需要添加 className

### Step 1: Agent 行添加微底色和圆角

找到 agent 行的样式（可能是 `.mc-agent-row` 或类似），添加：

```scss
.mc-agent-row {
  background: var(--vc-color-bg-secondary);
  border-radius: var(--vc-radius-md); // 6px
  padding: var(--vc-space-2);

  // running 状态 — 与 StepProgress 一致
  &.status-running {
    border-left: 3px solid var(--vc-color-primary);
  }

  // awaiting_confirmation 状态 — 琥珀色
  &.status-waiting {
    border-left: 3px solid var(--vc-color-warning-text);
    box-shadow: inset 0 0 0 1px var(--vc-color-warning-border);
  }
}
```

### Step 2: 行内信息重排

确认耗时显示使用 `font-variant-numeric: tabular-nums`。

### Step 3: Agent 列表间距 token 化

找到 agent 列表的 `gap`（可能是 `8px` 硬编码），替换为 `var(--vc-space-2)`。

### Step 4: 构建验证 + 提交

```bash
pnpm -C apps/vscode-extension/webview build 2>&1 | tail -5
git add packages/ui/src/components/MissionControl/
git commit -m "style(MissionControl): Agent 行卡片化 + 状态色与 StepProgress 一致"
```

---

## Task 8: `_agent-block.scss` token 化

**Files:**
- Modify: `packages/ui/src/styles/_agent-block.scss`

### Step 1: 替换硬编码变量

找到 `--block-radius: 8px`、`--block-padding: 12px`、`--block-gap: 8px`，替换为：

```scss
--block-radius: var(--vc-radius-lg);     // 10px
--block-padding: var(--vc-space-3);      // 12px
--block-gap: var(--vc-space-2);          // 8px
```

### Step 2: 构建验证 + 提交

```bash
pnpm -C apps/vscode-extension/webview build 2>&1 | tail -5
git add packages/ui/src/styles/_agent-block.scss
git commit -m "style(agent-block): 硬编码值替换为 design token"
```

---

## Task 9: 清理 legacy token 别名

**Files:**
- Modify: `packages/ui/src/index.scss`

### Step 1: 审查 legacy token 区域

检查 `index.scss` 第 278-341 行的 legacy token 别名区域。确认哪些仍有引用（通过 grep），哪些可以安全删除。

```bash
# 检查每个 legacy token 是否仍被引用
grep -r "--vcoder-" packages/ui/src/components/ --include="*.scss" -l
```

### Step 2: 删除无引用的 legacy token

删除不再被引用的 `--vcoder-*` 和自引用的 `--vc-*` 别名（如 `--vc-color-border: var(--vc-color-border)` 这种自引用）。

### Step 3: 构建验证 + 提交

```bash
pnpm -C apps/vscode-extension/webview build 2>&1 | tail -5
pnpm -C apps/desktop-shell/webview build 2>&1 | tail -5
git add packages/ui/src/index.scss
git commit -m "refactor(tokens): 清理无引用的 legacy token 别名"
```

---

## Task 10: 全量验证

### Step 1: 双端构建

```bash
pnpm build 2>&1 | tail -10
```

期望：全量构建成功。

### Step 2: 测试通过

```bash
pnpm test 2>&1 | tail -20
```

期望：所有 32 个测试文件通过。

### Step 3: 确认无残留 `--vc-token-*`

```bash
grep -r "--vc-token-" packages/ui/src/ --include="*.scss" | wc -l
```

期望：0（零残留）。

### Step 4: 提交验证结果

如果有任何修复，统一提交：

```bash
git add -A
git commit -m "fix: UI 翻新最终验证修复"
```

---

## 执行顺序与依赖

```
Task 1 (Token 合并) ← 所有后续 Task 依赖此步
  ├─ Task 2 (ChatBubble)      ← 独立
  ├─ Task 3 (InputArea)       ← 独立
  ├─ Task 4 (StepProgress 状态色) ← 独立
  ├─ Task 5 (StepProgress 详情) ← 依赖 Task 4
  ├─ Task 6 (MissionControl 容器) ← 独立
  ├─ Task 7 (MissionControl Agent) ← 依赖 Task 6
  └─ Task 8 (agent-block)     ← 独立
Task 9 (Legacy 清理) ← 依赖 Task 1-8 全部完成
Task 10 (全量验证) ← 最后执行
```

Task 2/3/4/6/8 可以并行执行。
