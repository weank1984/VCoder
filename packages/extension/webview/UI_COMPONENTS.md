# VCoder UI 组件库

> 统一、现代、可复用的 UI 组件系统

## 🎨 设计原则

- **VSCode 原生融合** - 完全遵循 VSCode 主题系统
- **一致性优先** - 统一的交互模式和视觉风格
- **易于使用** - 简洁的 API 和清晰的文档

## 📚 文档

完整文档请查看：

- **[V0.3 技术方案](../../docs/V0.3/TECH-SOLUTION.md)** - UI 规范基线与实施步骤
- **[V0.3 PRD](../../docs/V0.3/PRD.md)** - 产品目标、范围和验收标准

## 🚀 快速开始

### 安装依赖

```bash
pnpm install
```

### 使用组件

```tsx
import { Button, IconButton } from './components';
import { SendIcon } from './components/Icon';

function MyComponent() {
  return (
    <>
      {/* 文本按钮 */}
      <Button variant="primary">确认</Button>
      <Button variant="secondary">取消</Button>
      <Button variant="ghost">更多</Button>
      
      {/* 图标按钮 */}
      <IconButton 
        icon={<SendIcon />} 
        label="发送消息"
        onClick={handleSend}
      />
      
      {/* 带图标的按钮 */}
      <Button 
        variant="primary" 
        icon={<SendIcon />}
        loading={isLoading}
      >
        发送
      </Button>
    </>
  );
}
```

### 使用样式 Mixins

```scss
@use '../../styles/mixins' as *;

.my-component {
  // 应用表面样式（输入框风格）
  @include surface;
  
  // 添加 hover 效果
  @include hover-effect;
  
  // 添加 disabled 状态
  @include disabled-state;
  
  // 使用设计 Token
  padding: var(--vc-padding);
  border-radius: var(--vc-radius-md);
  color: var(--vc-color-text);
}
```

## 📦 可用组件

### 基础组件

#### Button（按钮）
```tsx
<Button 
  variant="primary"     // 'primary' | 'secondary' | 'ghost' | 'danger'
  size="medium"         // 'small' | 'medium' | 'large'
  icon={<Icon />}       // 左侧图标
  iconRight={<Icon />}  // 右侧图标
  loading={false}       // 加载状态
  fullWidth={false}     // 块级按钮
  disabled={false}
  onClick={handleClick}
>
  按钮文本
</Button>
```

#### IconButton（图标按钮）
```tsx
<IconButton 
  icon={<SendIcon />}
  variant="ghost"       // 'ghost' | 'background'
  label="发送消息"      // aria-label 和 title
  active={false}
  disabled={false}
  onClick={handleClick}
/>
```

### 表单组件

#### InputArea（输入区域）
```tsx
<InputArea ref={inputRef} />
```

### 展示组件

#### ChatBubble（对话气泡）
```tsx
<ChatBubble message={message} />
```

#### MarkdownContent（Markdown 渲染）
```tsx
<MarkdownContent 
  content={markdown}
  isComplete={true}
/>
```

#### ThoughtBlock（思考过程）
```tsx
<ThoughtBlock 
  content="AI 思考过程..."
  defaultExpanded={false}
  isComplete={true}
/>
```

### 功能组件

#### StepProgressList（工具调用展示）
```tsx
<StepProgressList toolCalls={toolCalls} />
```

#### FilePicker（文件选择器）
```tsx
<FilePicker
  files={workspaceFiles}
  searchQuery={query}
  onSelect={handleSelect}
  onClose={handleClose}
/>
```

#### StickyUserPrompt（吸顶提示）
```tsx
<StickyUserPrompt
  message={lastUserMessage}
  disabled={isLoading}
  onApplyToComposer={handleApply}
  onHeightChange={handleHeightChange}
/>
```

### 工具组件

#### Loading（加载动画）
```tsx
<Loading />
```

#### ErrorBoundary（错误边界）
```tsx
<ErrorBoundary>
  <YourComponent />
</ErrorBoundary>
```

## 🎨 设计 Token

### 颜色

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
--vc-color-border-secondary

// 状态色
--vc-color-primary        // 主色调
--vc-color-error-text     // 错误文本
--vc-color-danger         // 危险操作
```

### 间距

```scss
--vc-padding: 12px        // 基础间距单位

// 使用方式
padding: var(--vc-padding)           // 12px
padding: calc(var(--vc-padding) * 2) // 24px
padding: calc(var(--vc-padding) / 2) // 6px
gap: 8px                             // 小间距
```

### 圆角

```scss
--vc-radius-sm: 6px       // 小圆角
--vc-radius-md: 10px      // 中圆角
--vc-radius-lg: 14px      // 大圆角
```

### 阴影

```scss
--vc-box-shadow-tertiary  // 轻微阴影
--vc-box-shadow           // 标准阴影
--vc-box-shadow-secondary // 深阴影
```

### 动画

```scss
--vc-motion-duration-mid: 140ms
--vc-motion-ease-out: cubic-bezier(0.2, 0, 0, 1)

// 使用方式
transition: all var(--vc-motion-duration-mid) var(--vc-motion-ease-out);
```

## 🛠️ 可用 Mixins

```scss
@use '../../styles/mixins' as *;

// 表面样式
@include surface;              // 输入框风格的容器
@include surface-focus;        // focus 状态

// 交互状态
@include hover-effect;         // hover 效果
@include active-state;         // active 状态
@include disabled-state;       // disabled 状态
@include focus-visible;        // focus 轮廓

// 文本
@include text-ellipsis;        // 单行溢出省略
@include text-ellipsis-multiline(2);  // 多行溢出

// 布局
@include flex-center;          // Flexbox 居中
@include absolute-center;      // 绝对定位居中

// 组件样式
@include popover;              // 弹出层
@include list-item;            // 列表项
@include card;                 // 卡片
@include input;                // 输入框
@include badge;                // 标签徽章
@include divider;              // 分隔线

// 按钮样式
@include button-base;          // 按钮基础样式
@include button-primary;       // 主按钮
@include button-secondary;     // 次要按钮
@include button-ghost;         // 幽灵按钮

// 其他
@include scrollbar;            // 滚动条样式
@include fade-in-animation;    // 淡入动画
@include visually-hidden;      // 视觉隐藏（保留可访问性）
```

## 📐 命名规范

### BEM 风格

```scss
// Block（块）
.vc-component-name { }

// Element（元素）
.vc-component-name__element { }

// Modifier（修饰符）
.vc-component-name--modifier { }

// State（状态）
.vc-component-name.is-active { }
.vc-component-name.is-disabled { }
```

### 示例

```scss
// ✅ 推荐
.vc-button { }
.vc-button__icon { }
.vc-button--primary { }
.vc-button.is-loading { }

// ❌ 不推荐
.button { }
.buttonIcon { }
.btn-primary { }
.active { }
```

## 🔍 样式审查

运行样式审查脚本，查找需要优化的地方：

```bash
bash scripts/audit-styles.sh
```

审查内容包括：
- ✅ 硬编码颜色
- ✅ 固定间距值
- ✅ 不规范的圆角
- ✅ 不统一的动画参数
- ✅ 未规范的类名

## 📋 开发检查清单

在提交代码之前，确保：

### 样式规范
- [ ] 所有颜色使用 CSS 变量
- [ ] 间距使用 `--vc-padding` 倍数
- [ ] 圆角使用标准值
- [ ] 动画参数统一
- [ ] 类名使用 `vc-` 前缀
- [ ] 遵循 BEM 命名

### 功能检查
- [ ] 浅色主题正常
- [ ] 深色主题正常
- [ ] Hover 状态正确
- [ ] Disabled 状态正确
- [ ] Focus 可见
- [ ] 键盘导航正常

### 代码质量
- [ ] 使用 Mixins 复用代码
- [ ] 避免重复样式
- [ ] TypeScript 类型完整
- [ ] 添加必要注释

## 🎯 最佳实践

### DO ✅

```tsx
// 1. 使用统一组件
import { Button } from '@/components';
<Button variant="primary">确认</Button>

// 2. 使用 CSS 变量
.component {
  color: var(--vc-color-text);
  padding: var(--vc-padding);
}

// 3. 使用 Mixins
@use '../../styles/mixins' as *;
.component {
  @include hover-effect;
}
```

### DON'T ❌

```tsx
// 1. 避免自定义按钮样式
<button className="my-button">确认</button>

// 2. 避免硬编码颜色
.component {
  color: #333333;
  padding: 12px;
}

// 3. 避免重复代码
.component {
  display: flex;
  align-items: center;
  // ... 20 行重复样式
}
```

## 🔄 迁移指南

### 从自定义样式迁移到设计系统

```scss
// === 迁移前 ===
.my-button {
  padding: 8px 16px;
  background: #007fd4;
  color: #ffffff;
  border-radius: 6px;
  transition: all 0.2s ease;
  
  &:hover {
    background: #0066b3;
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

// === 迁移后（方案1：使用组件）===
import { Button } from '@/components';
<Button variant="primary">操作</Button>

// === 迁移后（方案2：使用 Mixins）===
@use '../../styles/mixins' as *;

.vc-my-button {
  @include button-primary;
}
```

## 📖 更多资源

- [V0.3 技术方案](../../docs/V0.3/TECH-SOLUTION.md)
- [V0.3 PRD](../../docs/V0.3/PRD.md)
- [Mixins 源码](./src/styles/_mixins.scss)
- [Button 组件示例](./src/components/Button/)

## 🤝 贡献

在添加新组件或修改样式时：

1. 查看设计系统文档了解规范
2. 使用现有的 Mixins 和组件
3. 运行样式审查脚本
4. 测试多个主题
5. 添加必要的文档

## 📞 获取帮助

遇到问题？

1. 查看文档：`docs/V0.3/TECH-SOLUTION.md`
2. 参考示例：`src/components/Button/`
3. 运行审查：`bash scripts/audit-styles.sh`
4. 团队讨论：在 PR 中提问

---

**维护者**: VCoder Team  
**最后更新**: 2026-01-16
