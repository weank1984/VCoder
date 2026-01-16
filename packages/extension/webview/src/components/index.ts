/**
 * VCoder UI Components
 * 统一的组件导出
 */

// === 基础组件 ===
export { Button } from './Button';
export type { ButtonProps } from './Button';

export { IconButton } from './IconButton';

// === 图标 ===
export * from './Icon';

// === 布局组件 ===
// (待添加: Card, Container 等)

// === 表单组件 ===
export { InputArea } from './InputArea';
export type { InputAreaHandle } from './InputArea';

// === 展示组件 ===
export { ChatBubble } from './ChatBubble';
export { MarkdownContent } from './MarkdownContent';
export { ThoughtBlock } from './ThoughtBlock';

// === 功能组件 ===
export { StepProgressList } from './StepProgress';
export { FilePicker } from './FilePicker';
export { StickyUserPrompt } from './StickyUserPrompt';
export type { StickyUserPromptProps } from './StickyUserPrompt';

// === 工具组件 ===
export { default as Loading } from './Loading';
export { ErrorBoundary } from './ErrorBoundary';

// === Logo ===
export { Logo } from './Logo';

// 注意：更多组件将逐步添加到这里
