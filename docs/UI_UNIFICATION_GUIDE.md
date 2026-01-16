# UI 组件统一实施指南

> 逐步将现有组件迁移到统一设计系统的具体步骤

## 📋 前置准备

### 已完成 ✅

1. ✅ **设计系统文档**：`docs/UI_DESIGN_SYSTEM.md`
2. ✅ **SCSS Mixins**：`src/styles/_mixins.scss`
3. ✅ **Button 组件示例**：`src/components/Button/`
4. ✅ **设计 Tokens**：`src/index.scss`（已存在）
5. ✅ **ComposerSurface**：共享表面样式（已存在）

### 需要完成 📝

1. 📝 创建通用 Dropdown 组件
2. 📝 创建通用 Card 组件
3. 📝 统一现有组件样式
4. 📝 建立组件使用文档

## 🎯 实施策略

### 策略 1: 渐进式重构（推荐）

**优点**：
- 低风险，不影响现有功能
- 可以逐个组件迁移
- 便于测试和验证

**步骤**：
1. 新组件使用新的设计系统
2. 逐步重构现有组件
3. 保持向后兼容

### 策略 2: 一次性重构

**优点**：
- 快速统一
- 避免混合状态

**缺点**：
- 风险较高
- 需要大量测试

## 📊 组件优先级

### 高优先级（核心组件）

1. **Button**（已创建）
   - 替换所有自定义按钮样式
   - 统一交互行为

2. **InputArea**（需调整）
   - 已使用 ComposerSurface ✅
   - 需要提取 Dropdown 逻辑

3. **ChatBubble**（需微调）
   - 样式已规范 ✅
   - 可优化间距一致性

4. **IconButton**（已存在）
   - 样式已规范 ✅
   - 需添加 Tooltip 支持

### 中优先级（常用组件）

5. **Dropdown/Popover**
   - 提取通用下拉组件
   - 用于 Agent/Model 选择器

6. **Card**
   - StepProgress 卡片化
   - 统一圆角和阴影

7. **Modal/Dialog**
   - PermissionDialog
   - 统一弹窗样式

### 低优先级（特殊组件）

8. **StepProgress** 系列
   - 功能复杂，暂不修改
   - 仅调整颜色变量使用

9. **MarkdownContent**
   - 内容展示为主
   - 确保颜色变量正确

## 🔧 具体实施步骤

### Phase 1: 基础设施（本次完成）

- [x] 创建 `UI_DESIGN_SYSTEM.md` 文档
- [x] 创建 `_mixins.scss` 文件
- [x] 创建 `Button` 组件示例
- [ ] 更新 `styles/index.scss` 引入 mixins

### Phase 2: 创建基础组件（1-2天）

#### 2.1 导出 Button 组件

```typescript
// src/components/index.ts
export { Button } from './Button';
export type { ButtonProps } from './Button';
```

#### 2.2 创建 Dropdown 组件

```typescript
// src/components/Dropdown/index.tsx
export interface DropdownProps {
  trigger: React.ReactNode;
  items: DropdownItem[];
  placement?: 'top' | 'bottom' | 'left' | 'right';
  onSelect?: (item: DropdownItem) => void;
}
```

**参考现有实现**：
- `InputArea.tsx` 中的 `.agent-selector-popover`
- `InputArea.tsx` 中的 `.model-selector-popover`

#### 2.3 创建 Card 组件

```typescript
// src/components/Card/index.tsx
export interface CardProps {
  variant?: 'default' | 'elevated' | 'outlined';
  padding?: 'none' | 'small' | 'medium' | 'large';
  children: React.ReactNode;
}
```

### Phase 3: 重构现有组件（3-5天）

#### 3.1 重构 StickyUserPrompt

**当前问题**：
- 使用内联样式定义按钮
- 可以使用新的 Button 组件

**重构方案**：

```diff
// src/components/StickyUserPrompt.tsx
+ import { Button } from '../Button';

- <button className="vc-sticky-user-prompt-btn" onClick={...}>
-   {t('Agent.Cancel')}
- </button>
+ <Button variant="ghost" size="small" onClick={...}>
+   {t('Agent.Cancel')}
+ </Button>

- <button className="vc-sticky-user-prompt-btn vc-sticky-user-prompt-btn--primary" onClick={...}>
-   {t('Chat.UseAsInput')}
- </button>
+ <Button variant="primary" size="small" onClick={...}>
+   {t('Chat.UseAsInput')}
+ </Button>
```

#### 3.2 重构 InputArea Dropdown

**当前问题**：
- Agent/Model 选择器代码重复
- 样式混在 InputArea.scss 中

**重构方案**：

创建 `AgentSelector` 和 `ModelSelector` 组件，使用统一的 Dropdown。

```typescript
// src/components/AgentSelector/index.tsx
import { Dropdown } from '../Dropdown';

export function AgentSelector({ value, onChange, disabled }) {
  const items = agents.map(a => ({
    id: a.profile.id,
    label: a.profile.name,
    icon: <AgentIcon />,
  }));
  
  return (
    <Dropdown
      trigger={<AgentTrigger agent={currentAgent} />}
      items={items}
      onSelect={onChange}
      disabled={disabled}
    />
  );
}
```

#### 3.3 统一 StepProgress 样式

**当前状态**：
- 468 行样式文件
- 使用了大量自定义颜色

**重构方案**：

1. 审查所有颜色使用，替换为 CSS 变量
2. 统一圆角使用 `--vc-radius-*`
3. 统一间距使用 `--vc-padding` 倍数

```scss
// 重构前
.step-item {
  padding: 12px;
  border-radius: 8px;
  background: #f0f0f0; // ❌ 硬编码颜色
}

// 重构后
.vc-step-item {
  padding: var(--vc-padding);
  border-radius: var(--vc-radius-md);
  background: var(--vc-bg-secondary); // ✅ 使用变量
}
```

#### 3.4 优化 ChatBubble

**当前状态**：较好，已使用规范命名

**微调项**：
- 确保所有动画使用统一参数
- 使用 mixins 简化样式

```scss
// 重构前
.action-btn {
  transition: all 0.1s;
  &:hover {
    background-color: var(--vscode-toolbar-hoverBackground);
  }
}

// 重构后
@use '../../styles/mixins' as *;

.action-btn {
  @include hover-effect(var(--vscode-toolbar-hoverBackground));
}
```

### Phase 4: 样式审查和统一（2-3天）

#### 4.1 颜色审查

使用以下命令查找所有硬编码颜色：

```bash
# 查找十六进制颜色
rg "#[0-9a-fA-F]{3,6}" --type scss

# 查找 rgba 颜色
rg "rgba?\(" --type scss

# 查找 rgb 颜色
rg "rgb\(" --type scss
```

将所有硬编码颜色替换为 CSS 变量。

#### 4.2 间距审查

```bash
# 查找固定间距值
rg "padding:\s*\d+px" --type scss
rg "margin:\s*\d+px" --type scss
rg "gap:\s*\d+px" --type scss
```

替换为标准间距：
- `4px` → `calc(var(--vc-padding) / 3)`
- `6px` → `calc(var(--vc-padding) / 2)`
- `8px` → `calc(var(--vc-padding) * 2 / 3)`
- `12px` → `var(--vc-padding)`
- `16px` → `calc(var(--vc-padding) * 4 / 3)`
- `24px` → `calc(var(--vc-padding) * 2)`

#### 4.3 圆角审查

```bash
# 查找 border-radius
rg "border-radius:\s*\d+px" --type scss
```

统一为：
- `6px` → `var(--vc-radius-sm)`
- `8-10px` → `var(--vc-radius-md)`
- `12px` → `12px`（输入框专用）
- `14px+` → `var(--vc-radius-lg)`

#### 4.4 动画审查

```bash
# 查找 transition
rg "transition:" --type scss
```

统一为：
```scss
transition: all var(--vc-motion-duration-mid) var(--vc-motion-ease-out);
```

### Phase 5: 文档和测试（1-2天）

#### 5.1 组件使用文档

为每个组件创建使用示例：

```markdown
## Button 使用示例

### 基础用法

\`\`\`tsx
import { Button } from '@/components/Button';

<Button variant="primary">确认</Button>
<Button variant="secondary">取消</Button>
<Button variant="ghost">更多</Button>
\`\`\`

### 带图标

\`\`\`tsx
<Button icon={<SendIcon />}>发送</Button>
<Button iconRight={<ArrowIcon />}>下一步</Button>
\`\`\`

### 加载状态

\`\`\`tsx
<Button loading>处理中...</Button>
\`\`\`
```

#### 5.2 视觉回归测试

1. 截图记录重构前的界面
2. 重构后对比确保视觉一致
3. 测试不同主题下的表现

#### 5.3 功能测试

- [ ] 所有按钮点击正常
- [ ] 下拉菜单选择正常
- [ ] 输入框交互正常
- [ ] 主题切换正常
- [ ] 键盘导航正常

## 🔍 审查清单

在完成每个组件重构后，检查：

### 样式规范

- [ ] 所有颜色使用 CSS 变量（无硬编码）
- [ ] 间距使用标准系统
- [ ] 圆角使用标准值
- [ ] 动画使用统一参数
- [ ] 类名使用 `vc-` 前缀
- [ ] 使用 BEM 命名规范

### 交互状态

- [ ] Hover 状态正确
- [ ] Active 状态正确
- [ ] Disabled 状态正确
- [ ] Focus 状态可见
- [ ] 键盘导航支持

### 可访问性

- [ ] 按钮有 `aria-label`
- [ ] 交互元素可键盘访问
- [ ] 颜色对比度符合 WCAG AA
- [ ] 屏幕阅读器友好

### 性能

- [ ] 无不必要的重渲染
- [ ] 动画性能良好
- [ ] 样式文件大小合理

## 📈 进度跟踪

### 已完成

- [x] 设计系统文档
- [x] Mixins 库
- [x] Button 组件
- [x] ComposerSurface（已存在）
- [x] IconButton（已存在）

### 进行中

- [ ] 导出组件索引
- [ ] 创建 Dropdown 组件
- [ ] 创建 Card 组件

### 待开始

- [ ] 重构 StickyUserPrompt
- [ ] 重构 InputArea
- [ ] 重构 StepProgress
- [ ] 样式全面审查
- [ ] 组件文档
- [ ] 测试验证

## 🚀 快速开始

### 1. 在新组件中使用设计系统

```tsx
import { Button } from '@/components/Button';
import '@/styles/_mixins.scss';

export function MyComponent() {
  return (
    <div className="vc-my-component">
      <Button variant="primary">操作</Button>
    </div>
  );
}
```

```scss
@use '../../styles/mixins' as *;

.vc-my-component {
  padding: var(--vc-padding);
  border-radius: var(--vc-radius-md);
  @include hover-effect;
}
```

### 2. 重构现有组件

**步骤**：
1. 备份原组件
2. 识别可复用的模式
3. 替换为标准组件或 mixins
4. 测试功能和视觉
5. 提交更改

### 3. 审查自己的代码

使用提供的命令查找：
- 硬编码颜色
- 固定间距值
- 非标准圆角
- 不一致的动画

## 💡 最佳实践

### DO ✅

- ✅ 使用 CSS 变量定义颜色
- ✅ 使用 `--vc-padding` 倍数定义间距
- ✅ 使用标准圆角值
- ✅ 使用 mixins 复用样式
- ✅ 遵循 BEM 命名规范
- ✅ 为组件添加 TypeScript 类型
- ✅ 支持主题切换
- ✅ 考虑可访问性

### DON'T ❌

- ❌ 不要硬编码颜色值
- ❌ 不要使用随意的间距值
- ❌ 不要在组件内定义全局样式
- ❌ 不要忽略交互状态
- ❌ 不要使用 inline styles（除非必要）
- ❌ 不要复制粘贴样式代码
- ❌ 不要忽略浏览器兼容性

## 🤝 贡献指南

在提交 UI 相关的 PR 时：

1. **自查清单**：确保通过所有审查清单
2. **截图对比**：提供重构前后的视觉对比
3. **测试报告**：说明测试了哪些场景
4. **文档更新**：如添加新组件，更新文档

## 📞 获取帮助

如果在重构过程中遇到问题：

1. 查看 `UI_DESIGN_SYSTEM.md` 设计规范
2. 参考 `Button` 组件的实现
3. 查看 `_mixins.scss` 可用的 mixins
4. 在团队中寻求代码审查

---

**版本**: 1.0  
**更新日期**: 2026-01-16  
**维护者**: VCoder Team
