# 正文内容区 UI 设计改进方案

> 针对聊天气泡、Markdown 渲染、思考区块等正文内容组件的 UI 现代化改进

**版本**: v1.0  
**日期**: 2026-01-06  
**状态**: 设计中

---

## 1. 当前实现状态分析

### 1.1 现有组件概览

| 组件 | 文件 | 功能 | 当前状态 |
|------|------|------|----------|
| **ChatBubble** | `ChatBubble.tsx/scss` | 消息气泡容器 | 基础功能完成，样式朴素 |
| **MarkdownContent** | `MarkdownContent.tsx/scss` | Markdown 渲染 | 功能完整，设计基础 |
| **ThoughtBlock** | `ThoughtBlock.tsx/scss` | AI 思考过程展示 | 功能完成，视觉低调 |
| **InputArea** | `InputArea.tsx/scss` | 输入区域 | 已有现代化设计（marquee 动画） |

### 1.2 主要问题

#### A. ChatBubble 气泡组件

```
当前问题：
┌────────────────────────────────────────────────────┐
│ 👤 User                                            │  ← 头部过于简单
├────────────────────────────────────────────────────┤
│ 这是用户消息，背景只是简单的主色调                    │  ← 视觉层次不足
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│ 🤖 VCoder                                          │  ← 与用户消息区分度低
├────────────────────────────────────────────────────┤
│ 这是助手消息，背景透明                               │  ← 缺乏"AI 感"
└────────────────────────────────────────────────────┘
```

**具体问题**：
1. 用户/助手消息样式差异不明显
2. 头部 avatar + title 设计过于朴素
3. 缺少现代 AI 聊天常见的视觉元素
4. 消息入场动画单一

#### B. MarkdownContent 渲染组件

```
当前问题：
┌───────────────────────────────────────────────────┐
│ typescript                        [⤵️] [📋]        │  ← Emoji 图标不精致
├───────────────────────────────────────────────────┤
│ const hello = "world";                            │  ← 代码块样式基础
│                                                   │
└───────────────────────────────────────────────────┘
```

**具体问题**：
1. 代码块操作按钮使用 emoji（📋、⤵️）而非精致图标
2. 表格、引用块等元素样式可以更精致
3. 行内代码样式偏保守
4. 流式渲染光标动画可以优化

#### C. ThoughtBlock 思考区块

```scss
// 当前样式 - 过于低调
.thought-block {
    opacity: 0.85;  // 整体透明度降低
}
.thought-content {
    opacity: 0.75;  // 内容更透明
}
```

**具体问题**：
1. 多重透明度叠加导致视觉辨识度低
2. 展开/折叠过渡效果简单
3. 思考状态指示不够直观
4. 缺少与 Claude 官方类似的"thinking pulse"效果

---

## 2. 设计目标

### 2.1 核心原则

1. **层次分明** - 用户消息、AI 回复、思考过程、工具调用四层清晰区分
2. **现代感** - 参考 Claude、ChatGPT、Cursor 等现代 AI 界面设计
3. **一致性** - 与已完成的 StepProgress、ApprovalUI 风格统一
4. **性能优先** - 流式渲染场景下保持流畅

### 2.2 视觉参考

| 参考产品 | 特点 | 可借鉴元素 |
|----------|------|-----------|
| Claude Web | 简洁、知性 | 思考块紫色渐变、展开动画 |
| ChatGPT | 清晰、专业 | 消息气泡圆角、代码块样式 |
| Cursor Chat | IDE 集成感 | 与 VS Code 主题融合 |
| Augment | 现代、精致 | 输入区动画（我们已借鉴） |

---

## 3. ChatBubble 改进方案

### 3.1 新设计预览

```
用户消息：
╭─────────────────────────────────────────────────────────╮
│  [U]  You                                               │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  这是用户消息，使用微妙的主色调背景                        │
│                                                         │
╰─────────────────────────────────────────────────────────╯

助手消息：
╭ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─╮
│  ◈  VCoder                                    ⋯        │  ← 更多操作菜单
├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤
│                                                         │
│  [ThoughtBlock]                                         │
│  [MarkdownContent]                                      │
│  [StepProgressList]                                     │
│                                                         │
╰ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─╯
```

### 3.2 组件结构调整

```tsx
// ChatBubble.tsx 改进
export function ChatBubble({ message }: ChatBubbleProps) {
    const isUser = message.role === 'user';
    
    return (
        <div className={`vc-bubble ${isUser ? 'vc-bubble--user' : 'vc-bubble--assistant'}`}>
            {/* 新增：渐变背景层 */}
            <div className="vc-bubble-bg" />
            
            <div className="vc-bubble-header">
                {/* 改进：Avatar 设计 */}
                <div className={`vc-bubble-avatar ${isUser ? 'avatar--user' : 'avatar--assistant'}`}>
                    {isUser ? <UserIcon /> : <VoyahIcon />}
                </div>
                <span className="vc-bubble-title">{isUser ? 'You' : 'VCoder'}</span>
                
                {/* 新增：消息操作 */}
                {!isUser && (
                    <div className="vc-bubble-actions">
                        <button className="action-btn" title="复制">
                            <CopyIcon />
                        </button>
                        <button className="action-btn" title="更多">
                            <MoreIcon />
                        </button>
                    </div>
                )}
            </div>

            <div className="vc-bubble-content">
                {/* 内容渲染保持不变 */}
            </div>
        </div>
    );
}
```

### 3.3 样式设计

```scss
// ChatBubble.scss 改进

$bubble-prefixCls: vc-bubble;

.#{$bubble-prefixCls} {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    
    // 入场动画
    animation: bubble-enter 0.3s var(--vc-motion-ease-out);
    
    @media (prefers-reduced-motion: reduce) {
        animation: none;
    }
}

// ========== 用户消息样式 ==========
.#{$bubble-prefixCls}--user {
    .vc-bubble-header {
        .vc-bubble-title {
            color: var(--vc-color-text);
            font-weight: 600;
        }
    }
    
    .vc-bubble-content {
        background: var(--vc-user-bubble-bg);
        border: 1px solid var(--vc-user-bubble-border);
        border-radius: 12px 12px 4px 12px;  // 右下角小圆角，表示"我说的"
        padding: 12px 14px;
    }
    
    // 用户消息轻微右移，增强对话感
    // margin-left: 24px;
}

// ========== 助手消息样式 ==========
.#{$bubble-prefixCls}--assistant {
    .vc-bubble-header {
        .vc-bubble-title {
            color: var(--vc-color-text-secondary);
            font-weight: 500;
        }
    }
    
    .vc-bubble-content {
        background: transparent;
        border: none;
        padding: 8px 0;
    }
    
    // 助手消息渐变背景（可选）
    .vc-bubble-bg {
        position: absolute;
        top: 0;
        left: -12px;
        right: -12px;
        bottom: 0;
        background: linear-gradient(
            135deg,
            color-mix(in srgb, var(--vscode-textLink-foreground) 3%, transparent) 0%,
            transparent 60%
        );
        border-radius: 12px;
        pointer-events: none;
        z-index: 0;
    }
}

// ========== 头部样式 ==========
.vc-bubble-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    position: relative;
    z-index: 1;
}

// Avatar 设计
.vc-bubble-avatar {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    
    &.avatar--user {
        background: var(--vc-color-primary-bg);
        color: var(--vc-color-primary-text);
    }
    
    &.avatar--assistant {
        background: linear-gradient(135deg, 
            var(--vcoder-surface-3) 0%, 
            color-mix(in srgb, var(--vscode-textLink-foreground) 15%, var(--vcoder-surface-3)) 100%
        );
        color: var(--vscode-textLink-foreground);
    }
    
    svg {
        width: 14px;
        height: 14px;
    }
}

.vc-bubble-title {
    font-size: 12px;
    letter-spacing: 0.2px;
}

// 消息操作按钮
.vc-bubble-actions {
    margin-left: auto;
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.15s;
    
    .#{$bubble-prefixCls}:hover & {
        opacity: 1;
    }
    
    .action-btn {
        width: 24px;
        height: 24px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        color: var(--vc-color-text-tertiary);
        cursor: pointer;
        transition: all 0.15s;
        
        &:hover {
            background: var(--vc-control-item-bg-hover);
            color: var(--vc-color-text);
        }
        
        svg {
            width: 14px;
            height: 14px;
        }
    }
}

// ========== 内容区域 ==========
.vc-bubble-content {
    position: relative;
    z-index: 1;
    color: var(--vc-color-text);
    line-height: var(--vc-line-height);
    font-size: var(--vc-font-size);
    word-break: break-word;
    
    // 用户消息文本
    .message-text {
        white-space: pre-wrap;
    }
}

// ========== 主题变量 ==========
.vscode-dark,
.vscode-high-contrast {
    --vc-user-bubble-bg: color-mix(in srgb, var(--vc-color-primary) 12%, var(--vcoder-surface));
    --vc-user-bubble-border: color-mix(in srgb, var(--vc-color-primary) 25%, var(--vcoder-border));
}

.vscode-light,
.vscode-high-contrast-light {
    --vc-user-bubble-bg: color-mix(in srgb, var(--vc-color-primary) 8%, white);
    --vc-user-bubble-border: color-mix(in srgb, var(--vc-color-primary) 20%, var(--vcoder-border));
}

// ========== 动画 ==========
@keyframes bubble-enter {
    from {
        opacity: 0;
        transform: translateY(12px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

// 流式输出光标改进
.streaming-cursor {
    display: inline-block;
    width: 2px;
    height: 1.1em;
    margin-left: 2px;
    background: linear-gradient(
        180deg,
        var(--vc-color-primary) 0%,
        var(--vscode-textLink-foreground) 100%
    );
    border-radius: 1px;
    animation: cursor-blink 0.8s ease-in-out infinite;
    vertical-align: text-bottom;
}

@keyframes cursor-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
}
```

---

## 4. MarkdownContent 改进方案

### 4.1 代码块改进

```tsx
// 代码块操作按钮使用图标组件替代 emoji
import { CopyIcon, InsertIcon, CheckIcon } from './Icon';

function CodeBlock({ ... }) {
    return (
        <div className="vc-code-block">
            <div className="code-block-header">
                {language && (
                    <div className="code-language-badge">
                        <span className="language-dot" />
                        <span className="language-name">{language}</span>
                    </div>
                )}
                <div className="code-block-actions">
                    <button 
                        className={`code-action-btn ${inserted ? 'is-success' : ''}`}
                        onClick={handleInsert}
                        title={inserted ? '已插入' : '插入到编辑器'}
                    >
                        {inserted ? <CheckIcon /> : <InsertIcon />}
                    </button>
                    <button 
                        className={`code-action-btn ${copied ? 'is-success' : ''}`}
                        onClick={handleCopy}
                        title={copied ? '已复制' : '复制代码'}
                    >
                        {copied ? <CheckIcon /> : <CopyIcon />}
                    </button>
                </div>
            </div>
            {/* 代码内容 */}
        </div>
    );
}
```

### 4.2 样式改进

```scss
// MarkdownContent.scss 改进

.vc-markdown {
    // Typography 基础
    line-height: 1.65;
    font-size: var(--vc-font-size);
    
    // 段落增强
    p {
        margin: 0.6em 0;
        
        &:first-child { margin-top: 0; }
        &:last-child { margin-bottom: 0; }
    }
    
    // 列表增强
    ul, ol {
        margin: 0.5em 0;
        padding-left: 1.4em;
        
        li {
            margin: 0.3em 0;
            padding-left: 0.3em;
            
            &::marker {
                color: var(--vc-color-text-tertiary);
            }
        }
    }
    
    // 引用块增强
    blockquote {
        position: relative;
        margin: 0.8em 0;
        padding: 10px 14px 10px 16px;
        background: var(--vcoder-surface-3);
        border-radius: 0 8px 8px 0;
        border-left: 3px solid var(--vscode-textLink-foreground);
        color: var(--vc-color-text-secondary);
        font-style: italic;
        
        // 微妙渐变
        &::before {
            content: '';
            position: absolute;
            top: 0;
            left: 3px;
            bottom: 0;
            width: 60px;
            background: linear-gradient(
                90deg,
                color-mix(in srgb, var(--vscode-textLink-foreground) 8%, transparent),
                transparent
            );
            pointer-events: none;
        }
        
        p {
            margin: 0;
        }
    }
}

// ========== 代码块增强 ==========
.vc-code-block {
    margin: 0.8em 0;
    border-radius: 8px;
    overflow: hidden;
    background: var(--vcoder-surface-2);
    border: 1px solid var(--vcoder-border);
    
    // 悬停效果
    transition: border-color 0.2s, box-shadow 0.2s;
    
    &:hover {
        border-color: color-mix(in srgb, var(--vscode-textLink-foreground) 40%, var(--vcoder-border));
        box-shadow: 0 2px 8px color-mix(in srgb, var(--vscode-textLink-foreground) 10%, transparent);
    }
}

.code-block-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    background: var(--vcoder-surface-3);
    border-bottom: 1px solid var(--vcoder-border);
}

.code-language-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    
    .language-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--vscode-textLink-foreground);
    }
    
    .language-name {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--vc-color-text-secondary);
    }
}

.code-block-actions {
    display: flex;
    gap: 2px;
}

.code-action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--vc-color-text-tertiary);
    cursor: pointer;
    transition: all 0.15s;
    
    svg {
        width: 14px;
        height: 14px;
    }
    
    &:hover {
        background: var(--vc-control-item-bg-hover);
        color: var(--vc-color-text);
    }
    
    &.is-success {
        color: var(--vcoder-status-success);
    }
}

// ========== 行内代码增强 ==========
.inline-code {
    font-family: var(--vc-font-family-code);
    font-size: 0.9em;
    background: var(--vcoder-surface-3);
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid var(--vcoder-border-light);
    color: var(--vscode-textPreformat-foreground, var(--vc-color-text));
    
    // 轻微高亮效果
    box-shadow: inset 0 -1px 0 var(--vcoder-border-light);
}

// ========== 表格增强 ==========
.vc-markdown table {
    width: 100%;
    margin: 0.8em 0;
    border-collapse: separate;
    border-spacing: 0;
    border: 1px solid var(--vcoder-border);
    border-radius: 8px;
    overflow: hidden;
    
    th, td {
        padding: 10px 14px;
        text-align: left;
        border-bottom: 1px solid var(--vcoder-border-light);
        
        &:not(:last-child) {
            border-right: 1px solid var(--vcoder-border-light);
        }
    }
    
    th {
        background: var(--vcoder-surface-3);
        font-weight: 600;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        color: var(--vc-color-text-secondary);
    }
    
    tbody tr {
        transition: background 0.15s;
        
        &:hover {
            background: var(--vc-control-item-bg-hover);
        }
        
        &:last-child td {
            border-bottom: none;
        }
    }
}
```

---

## 5. ThoughtBlock 改进方案

### 5.1 新设计预览

```
思考中状态：
╭───────────────────────────────────────────────────────╮
│  ◈ 💭 Thinking...                          [pulse]   │
╰───────────────────────────────────────────────────────╯

思考完成状态：
╭───────────────────────────────────────────────────────╮
│  ▸ 💭 Thought                              [展开]    │
├───────────────────────────────────────────────────────┤
│                                                       │
│  我需要先分析这个请求的意图...                          │
│  用户希望改进 UI 设计，主要涉及...                      │
│                                                       │
╰───────────────────────────────────────────────────────╯
```

### 5.2 组件改进

```tsx
// ThoughtBlock.tsx 改进
import { useState, useRef, useEffect } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { ChevronRightIcon, ThinkIcon, LoadingIcon } from './Icon';
import './ThoughtBlock.scss';

interface ThoughtBlockProps {
    content: string;
    defaultExpanded?: boolean;
    isComplete?: boolean;
}

export function ThoughtBlock({ content, defaultExpanded = false, isComplete = true }: ThoughtBlockProps) {
    const { t } = useI18n();
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const contentRef = useRef<HTMLDivElement>(null);
    const [contentHeight, setContentHeight] = useState<number | undefined>();
    
    const isThinking = !isComplete;

    // 计算内容高度用于动画
    useEffect(() => {
        if (contentRef.current) {
            setContentHeight(contentRef.current.scrollHeight);
        }
    }, [content]);

    return (
        <div className={`thought-block ${isThinking ? 'is-thinking' : ''} ${isExpanded ? 'is-expanded' : ''}`}>
            {/* 思考中脉冲背景 */}
            {isThinking && <div className="thought-pulse" />}
            
            <button
                className="thought-header"
                onClick={() => setIsExpanded(!isExpanded)}
                aria-expanded={isExpanded}
            >
                <span className={`thought-expand-icon ${isExpanded ? 'rotated' : ''}`}>
                    <ChevronRightIcon />
                </span>
                
                <span className="thought-icon">
                    <ThinkIcon />
                </span>
                
                <span className="thought-title">
                    {isThinking ? t('Agent.Thinking') : t('Agent.Thought')}
                </span>
                
                {isThinking && (
                    <span className="thought-loading">
                        <LoadingIcon />
                    </span>
                )}
                
                {!isThinking && content && (
                    <span className="thought-preview">
                        {truncate(content, 60)}
                    </span>
                )}
            </button>

            <div 
                className="thought-content-wrapper"
                style={{ 
                    maxHeight: isExpanded ? (contentHeight || 500) : 0,
                }}
            >
                <div className="thought-content" ref={contentRef}>
                    {content || (isThinking ? `${t('Agent.Thinking')}...` : '')}
                </div>
            </div>
        </div>
    );
}

function truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen).trim() + '...';
}
```

### 5.3 样式改进

```scss
// ThoughtBlock.scss 改进

.thought-block {
    position: relative;
    margin: 8px 0;
    border-radius: 8px;
    background: var(--thought-bg);
    border: 1px solid var(--thought-border);
    overflow: hidden;
    transition: border-color 0.2s, box-shadow 0.2s;
    
    &:hover {
        border-color: var(--thought-border-hover);
    }
    
    // 思考中状态
    &.is-thinking {
        border-color: var(--thought-active-border);
        box-shadow: 0 0 0 1px color-mix(in srgb, var(--vscode-textLink-foreground) 10%, transparent);
    }
}

// 主题变量
.vscode-dark,
.vscode-high-contrast {
    --thought-bg: color-mix(in srgb, var(--vscode-textLink-foreground) 4%, var(--vcoder-surface));
    --thought-border: color-mix(in srgb, var(--vscode-textLink-foreground) 12%, var(--vcoder-border));
    --thought-border-hover: color-mix(in srgb, var(--vscode-textLink-foreground) 25%, var(--vcoder-border));
    --thought-active-border: color-mix(in srgb, var(--vscode-textLink-foreground) 40%, var(--vcoder-border));
    --thought-icon-color: var(--vscode-textLink-foreground);
}

.vscode-light,
.vscode-high-contrast-light {
    --thought-bg: color-mix(in srgb, var(--vscode-textLink-foreground) 5%, white);
    --thought-border: color-mix(in srgb, var(--vscode-textLink-foreground) 15%, var(--vcoder-border));
    --thought-border-hover: color-mix(in srgb, var(--vscode-textLink-foreground) 30%, var(--vcoder-border));
    --thought-active-border: color-mix(in srgb, var(--vscode-textLink-foreground) 50%, var(--vcoder-border));
    --thought-icon-color: var(--vscode-textLink-foreground);
}

// 脉冲动画背景
.thought-pulse {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(
        90deg,
        transparent 0%,
        color-mix(in srgb, var(--vscode-textLink-foreground) 8%, transparent) 50%,
        transparent 100%
    );
    background-size: 200% 100%;
    animation: thought-pulse-anim 2s ease-in-out infinite;
    pointer-events: none;
}

@keyframes thought-pulse-anim {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
}

// 头部
.thought-header {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--vc-color-text-secondary);
    font-size: 12px;
    text-align: left;
    transition: background 0.15s;
    
    &:hover {
        background: color-mix(in srgb, var(--vscode-list-hoverBackground) 50%, transparent);
    }
}

.thought-expand-icon {
    display: flex;
    align-items: center;
    color: var(--vc-color-text-tertiary);
    transition: transform 0.2s var(--vc-motion-ease-out);
    
    &.rotated {
        transform: rotate(90deg);
    }
    
    svg {
        width: 12px;
        height: 12px;
    }
}

.thought-icon {
    display: flex;
    align-items: center;
    color: var(--thought-icon-color);
    
    svg {
        width: 14px;
        height: 14px;
    }
}

.thought-title {
    font-weight: 500;
    color: var(--vc-color-text-secondary);
}

.thought-loading {
    display: flex;
    align-items: center;
    color: var(--thought-icon-color);
    
    svg {
        width: 12px;
        height: 12px;
        animation: spin 1s linear infinite;
    }
}

.thought-preview {
    margin-left: auto;
    font-size: 11px;
    color: var(--vc-color-text-tertiary);
    max-width: 40%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

// 内容区域 - 带动画
.thought-content-wrapper {
    overflow: hidden;
    transition: max-height 0.25s var(--vc-motion-ease-out);
}

.thought-content {
    padding: 0 12px 12px 34px;  // 左边与图标对齐
    font-size: 12px;
    color: var(--vc-color-text-secondary);
    line-height: 1.6;
    white-space: pre-wrap;
    border-top: 1px solid var(--thought-border);
    max-height: 200px;
    overflow-y: auto;
    
    // 滚动条样式
    &::-webkit-scrollbar {
        width: 4px;
    }
    
    &::-webkit-scrollbar-thumb {
        background: var(--vcoder-border);
        border-radius: 2px;
    }
}

@keyframes spin {
    to { transform: rotate(360deg); }
}
```

---

## 6. 新增图标需求

为支持上述改进，需要新增以下图标：

| 图标名 | 用途 | 建议来源 |
|--------|------|----------|
| `CopyIcon` | 复制代码 | Lucide `copy` |
| `InsertIcon` | 插入编辑器 | Lucide `corner-down-left` |
| `CheckIcon` | 操作成功 | Lucide `check` |
| `MoreIcon` | 更多操作 | Lucide `more-horizontal` |
| `ThinkIcon` | 思考图标 | Lucide `brain` 或自定义 |
| `ChevronRightIcon` | 展开箭头 | Lucide `chevron-right` |

---

## 7. 新增 i18n 键

### 7.1 中文 (zh-CN.ts)

```typescript
Agent: {
    // ... existing ...
    
    // 消息操作
    CopyMessage: '复制消息',
    MessageCopied: '已复制',
    MoreActions: '更多操作',
    
    // 代码块
    InsertToEditor: '插入到编辑器',
    CodeInserted: '已插入',
    CopyCode: '复制代码',
    CodeCopied: '已复制',
},
```

### 7.2 英文 (en-US.ts)

```typescript
Agent: {
    // ... existing ...
    
    // Message actions
    CopyMessage: 'Copy message',
    MessageCopied: 'Copied',
    MoreActions: 'More actions',
    
    // Code block
    InsertToEditor: 'Insert to editor',
    CodeInserted: 'Inserted',
    CopyCode: 'Copy code',
    CodeCopied: 'Copied',
},
```

---

## 8. 实施计划

### Phase 1: 基础样式更新 (0.5天)

- [ ] 更新主题变量（添加 `--thought-*`, `--vc-user-bubble-*` 等）
- [ ] 新增所需图标组件
- [ ] 添加 i18n 键

### Phase 2: ChatBubble 改进 (0.5天)

- [ ] 调整组件结构，添加 actions 区域
- [ ] 更新样式文件
- [ ] 区分用户/助手消息视觉风格

### Phase 3: MarkdownContent 改进 (0.5天)

- [ ] 替换代码块 emoji 为图标组件
- [ ] 优化代码块、表格、引用块样式
- [ ] 增强行内代码样式

### Phase 4: ThoughtBlock 改进 (0.5天)

- [ ] 添加展开/折叠动画
- [ ] 实现思考中脉冲效果
- [ ] 优化视觉层次

### Phase 5: 细节打磨 (0.5天)

- [ ] 动画时序调优
- [ ] 深色/浅色主题适配
- [ ] 无障碍优化（aria 属性等）
- [ ] 边界情况处理

**总计: 约 2.5 天**

---

## 9. 验证清单

- [ ] 用户消息和助手消息视觉区分明显
- [ ] 代码块操作按钮为精致图标
- [ ] 思考块展开/折叠有流畅动画
- [ ] 思考中状态有脉冲效果
- [ ] 流式渲染光标动画流畅
- [ ] 深色/浅色主题均表现良好
- [ ] 悬停状态有适当反馈
- [ ] 所有交互有 aria 属性

---

## 附录: 与现有设计的统一

本方案与已完成的 StepProgress、ApprovalUI 保持以下一致性：

1. **颜色变量** - 使用相同的 `--vcoder-*` 命名空间
2. **圆角规范** - 遵循 `--vcoder-radius-sm/md/lg` 体系
3. **动画曲线** - 使用 `--vc-motion-ease-*` 变量
4. **间距系统** - 遵循 4px 基础单位
5. **状态颜色** - 使用 `--vcoder-status-*` 语义色
