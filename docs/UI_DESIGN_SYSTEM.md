# VCoder UI 设计系统

> 统一的组件库和设计规范，确保界面一致性和开发效率

## 🎨 设计原则

### 1. VSCode 原生融合
- 完全遵循 VSCode 主题系统
- 使用 `--vscode-*` 变量作为基础
- 确保在所有主题下都有良好表现

### 2. 简洁现代
- 清晰的视觉层次
- 适度的留白和间距
- 流畅的过渡动画

### 3. 一致性优先
- 统一的交互模式
- 标准化的组件接口
- 可预测的用户体验

## 🔧 设计 Token

### 颜色系统

所有颜色都通过 CSS 变量定义在 `src/index.scss` 中：

```scss
// 背景色
--vc-bg                    // 主背景
--vc-bg-secondary          // 次级背景
--vc-bg-tertiary          // 三级背景

// 文本色
--vc-color-text           // 主文本
--vc-color-text-secondary // 次要文本
--vc-color-text-tertiary  // 辅助文本

// 边框
--vc-color-border         // 标准边框
--vc-color-border-secondary // 次级边框

// 状态色
--vc-color-primary        // 主色调/品牌色
--vc-color-error-text     // 错误文本
--vc-color-error-bg       // 错误背景
--vc-color-danger         // 危险操作
```

### 间距系统

```scss
--vc-padding: 12px        // 基础间距单位

// 使用倍数
padding: var(--vc-padding)           // 12px
padding: calc(var(--vc-padding) * 2) // 24px
padding: calc(var(--vc-padding) / 2) // 6px
gap: 8px                             // 小间距
gap: 16px                            // 常规间距
```

### 圆角系统

```scss
--vc-radius-sm: 6px       // 小圆角（按钮、标签）
--vc-radius-md: 10px      // 中圆角（卡片、输入框）
--vc-radius-lg: 14px      // 大圆角（面板、弹窗）

// 特殊：输入框使用 12px
border-radius: 12px
```

### 阴影系统

```scss
--vc-box-shadow-tertiary    // 轻微阴影（悬浮按钮）
--vc-box-shadow             // 标准阴影（弹窗）
--vc-box-shadow-secondary   // 深阴影（模态框）
```

### 动画系统

```scss
--vc-motion-duration-mid: 140ms
--vc-motion-ease-out: cubic-bezier(0.2, 0, 0, 1)

// 使用方式
transition: all var(--vc-motion-duration-mid) var(--vc-motion-ease-out);
```

## 📦 核心组件

### 1. Surface（表面）

**类名**: `vc-composer-surface`

**用途**: 输入框风格的容器，用于编辑区域

**文件**: `src/components/ComposerSurface.scss`

```tsx
<div className="vc-composer-surface">
  {/* 内容 */}
</div>

// 可交互的（支持 focus 状态）
<div className="vc-composer-surface vc-composer-surface--interactive">
  <textarea />
</div>

// 禁用状态
<div className="vc-composer-surface vc-composer-surface--muted">
  {/* 内容 */}
</div>
```

**样式特征**:
- 背景: `var(--vscode-input-background)`
- 边框: `1px solid var(--vscode-input-border)`
- 圆角: `12px`
- 阴影: `0 4px 12px rgba(0, 0, 0, 0.05)`
- Focus 时边框色变为 `var(--vscode-focusBorder)`

### 2. IconButton（图标按钮）

**组件**: `IconButton.tsx`

**用途**: 标准化的图标按钮

```tsx
import { IconButton } from './IconButton';
import { SendIcon } from './Icon';

<IconButton
  icon={<SendIcon />}
  label="发送消息"
  variant="ghost"       // 'ghost' | 'background'
  disabled={false}
  onClick={handleClick}
/>
```

**变体**:
- `ghost` (默认): 透明背景，hover 显示背景
- `background`: 有背景色

### 3. Button（文本按钮）

**建议创建**: 统一的文本按钮组件

```tsx
// 需要创建 Button.tsx
<Button variant="primary">确认</Button>
<Button variant="secondary">取消</Button>
<Button variant="ghost">更多</Button>
```

### 4. Dropdown（下拉菜单）

**当前实现**: InputArea 中的自定义下拉

**建议**: 提取为通用 Dropdown 组件

**现有类**:
- `.popover-container` - 弹出层容器基类
- `.agent-selector-popover` - Agent 选择器
- `.model-selector-popover` - Model 选择器

### 5. ChatBubble（对话气泡）

**组件**: `ChatBubble.tsx`

**类名规范**:
```scss
.vc-bubble                    // 基类
.vc-bubble--user             // 用户消息
.vc-bubble--assistant        // AI 消息
.vc-bubble--tool-only        // 仅工具调用

.vc-human-message-container  // 用户消息容器
.vc-human-message-content    // 用户消息内容

.vc-ai-message-container     // AI 消息容器
.vc-ai-actions               // AI 消息操作栏
```

### 6. InputArea（输入区域）

**组件**: `InputArea.tsx`

**主要特性**:
- 自动高度调整
- @ 文件选择器
- 附件预览
- Agent/Model 选择
- 发送/停止按钮

## 🎭 交互状态

### 标准状态样式

```scss
// 默认状态
.component {
  opacity: 1;
  cursor: pointer;
}

// Hover 状态
.component:hover {
  background: var(--vscode-list-hoverBackground);
  // 或
  background: var(--vscode-toolbar-hoverBackground);
}

// Active 状态
.component.is-active,
.component:active {
  background: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground);
}

// Disabled 状态
.component:disabled,
.component.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none; // 根据需要添加
}

// Focus 状态
.component:focus-visible {
  outline: 1px solid var(--vscode-focusBorder);
  outline-offset: 2px;
}
```

### 动画标准

```scss
// 淡入
@keyframes fade-in {
  from { 
    opacity: 0; 
    transform: translateY(4px); 
  }
  to { 
    opacity: 1; 
    transform: translateY(0); 
  }
}

// 使用
animation: fade-in 0.2s ease-out;
```

## 📝 命名规范

### BEM 风格

```scss
// Block
.vc-component-name { }

// Element
.vc-component-name__element { }

// Modifier
.vc-component-name--modifier { }

// State
.vc-component-name.is-active { }
.vc-component-name.is-disabled { }
```

### 示例

```scss
// ❌ 不推荐
.inputWrapper { }
.input-area-button { }
.active { }

// ✅ 推荐
.vc-input-wrapper { }
.vc-input-area__button { }
.vc-input-area__button--primary { }
.vc-input-area.is-active { }
```

## 🗂️ 文件组织

### 组件结构

```
components/
  ComponentName/
    index.tsx           # 组件逻辑
    index.scss          # 组件样式
    types.ts           # 类型定义（如需要）
```

### 共享样式

```
styles/
  index.scss           # 全局样式 + Design Tokens
  theme.scss          # 主题覆盖（暂时为空）
  _mixins.scss        # SCSS Mixins（建议创建）
  _utilities.scss     # 工具类（建议创建）
```

## 🔄 重构计划

### Phase 1: 基础组件库（建议优先）

1. **创建通用 Button 组件**
   ```tsx
   // src/components/Button/index.tsx
   export function Button({ variant, size, children, ... }) { }
   ```

2. **创建通用 Dropdown 组件**
   ```tsx
   // src/components/Dropdown/index.tsx
   export function Dropdown({ trigger, items, ... }) { }
   ```

3. **创建 Card 组件**
   ```tsx
   // src/components/Card/index.tsx
   export function Card({ children, ... }) { }
   ```

### Phase 2: 样式统一

1. **提取共享 Mixins**
   ```scss
   // src/styles/_mixins.scss
   @mixin hover-effect {
     transition: background var(--vc-motion-duration-mid);
     &:hover {
       background: var(--vscode-list-hoverBackground);
     }
   }
   
   @mixin surface {
     background: var(--vscode-input-background);
     border: 1px solid var(--vscode-input-border);
     border-radius: 12px;
     box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
   }
   ```

2. **审查并统一现有组件样式**
   - 确保所有颜色使用 CSS 变量
   - 统一间距使用 `--vc-padding` 倍数
   - 统一圆角使用 `--vc-radius-*`
   - 统一动画参数

### Phase 3: 文档和示例

1. **创建 Storybook 或组件预览页面**
2. **为每个组件添加使用示例**
3. **建立组件开发规范**

## 📋 检查清单

在添加或修改组件时，确保：

- [ ] 使用 `vc-` 前缀命名类
- [ ] 颜色通过 CSS 变量定义
- [ ] 间距使用标准系统（`--vc-padding` 的倍数）
- [ ] 圆角使用标准值（6px/10px/12px/14px）
- [ ] 实现标准交互状态（hover/active/disabled）
- [ ] 动画使用统一参数
- [ ] 支持 VSCode 主题切换
- [ ] 添加 TypeScript 类型定义
- [ ] 提供清晰的 Props 接口
- [ ] 组件可复用且独立

## 🎯 使用示例

### 创建新组件

```tsx
// src/components/MyComponent/index.tsx
import './index.scss';

interface MyComponentProps {
  variant?: 'default' | 'primary';
  disabled?: boolean;
  children: React.ReactNode;
}

export function MyComponent({ 
  variant = 'default', 
  disabled = false, 
  children 
}: MyComponentProps) {
  return (
    <div 
      className={[
        'vc-my-component',
        `vc-my-component--${variant}`,
        disabled ? 'is-disabled' : ''
      ].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
}
```

```scss
// src/components/MyComponent/index.scss
.vc-my-component {
  padding: var(--vc-padding);
  border-radius: var(--vc-radius-md);
  background: var(--vc-bg);
  color: var(--vc-color-text);
  transition: background var(--vc-motion-duration-mid) var(--vc-motion-ease-out);

  &:hover:not(.is-disabled) {
    background: var(--vscode-list-hoverBackground);
  }

  &.is-disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.vc-my-component--primary {
  background: var(--vc-color-primary);
  color: var(--vscode-button-foreground);
}
```

## 🔗 相关资源

- **Design Tokens**: `src/index.scss`
- **Composer Surface**: `src/components/ComposerSurface.scss`
- **Icon Button**: `src/components/IconButton.tsx`
- **Icons**: `src/components/Icon/`
- **示例组件**: 
  - `InputArea.tsx` - 复杂输入区域
  - `ChatBubble.tsx` - 消息展示
  - `StickyUserPrompt.tsx` - 吸顶提示

## 📞 维护

如发现设计不一致或需要添加新的设计 token，请：

1. 在 `src/index.scss` 中添加变量定义
2. 更新本文档说明
3. 通知团队成员新增的设计规范

---

**版本**: 1.0  
**更新日期**: 2026-01-16  
**维护者**: VCoder Team
