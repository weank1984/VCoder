# 工具用户交互 UI 设计方案

> 统一处理工具需要用户批准/确认的交互场景

**版本**: v1.0  
**日期**: 2026-01-06  
**状态**: 设计中

---

## 1. 当前实现状态分析

### 1.1 现有两套交互机制

| 层级 | 处理方式 | 适用工具 | 用户体验 |
|------|----------|----------|----------|
| **扩展层** (extension.ts) | VS Code 原生弹窗 | bash_request, file_change, plan_ready | 模态对话框，打断流程 |
| **Webview层** (StepEntry.tsx) | 内嵌按钮 UI | Bash/run_command (pending 状态) | 上下文内操作，不打断 |

### 1.2 当前代码位置

- **扩展层处理**: `packages/extension/src/extension.ts` (行 86-134)
- **Webview 批准 UI**: `packages/extension/webview/src/components/StepProgress/StepEntry.tsx` (行 228-242)
- **样式定义**: `packages/extension/webview/src/components/StepProgress/index.scss` (行 437-505)
- **消息类型**: `packages/extension/webview/src/types.ts` (行 100-108)
- **协议定义**: `packages/shared/src/protocol.ts` (行 163-175, 286-289)

### 1.3 存在的问题

1. **两套机制不统一** - 用户体验割裂
2. **Webview 批准 UI 覆盖不全** - 只针对 Bash，文件操作没有
3. **扩展层弹窗阻塞** - 等待用户确认时会阻塞其他操作
4. **状态类型不完整** - 没有专门的 `awaiting_confirmation` 状态

---

## 2. 设计目标

1. **统一交互体验** - 所有需要确认的操作都在 Webview 内处理
2. **不打断工作流** - 用户可以继续查看其他内容
3. **上下文清晰** - 批准 UI 紧邻对应的工具调用显示
4. **类型安全** - 完善的 TypeScript 类型定义
5. **可扩展** - 易于添加新的确认类型

---

## 3. 数据结构设计

### 3.1 扩展 ToolCall 状态

```typescript
// packages/extension/webview/src/types.ts

export interface ToolCall {
    id: string;
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'awaiting_confirmation';
    input?: unknown;
    result?: unknown;
    error?: string;
    parentToolUseId?: string;
    
    /** 需要确认的操作类型 */
    confirmationType?: ConfirmationType;
    
    /** 确认相关的额外信息 */
    confirmationData?: ConfirmationData;
}

export type ConfirmationType = 
    | 'bash'         // Shell 命令执行
    | 'file_write'   // 文件创建/修改
    | 'file_delete'  // 文件删除
    | 'plan'         // 计划模式确认
    | 'mcp'          // MCP 工具调用
    | 'dangerous';   // 其他危险操作

export interface ConfirmationData {
    /** Bash 命令内容 */
    command?: string;
    
    /** 文件路径 */
    filePath?: string;
    
    /** 文件 diff 内容 */
    diff?: string;
    
    /** 完整文件内容（用于预览） */
    content?: string;
    
    /** 计划任务列表 */
    tasks?: Task[];
    
    /** 计划摘要 */
    planSummary?: string;
    
    /** 风险等级 */
    riskLevel?: 'low' | 'medium' | 'high';
    
    /** 风险原因列表 */
    riskReasons?: string[];
}
```

### 3.2 新增协议消息类型

```typescript
// packages/shared/src/protocol.ts

// 新增 UpdateType
export type UpdateType =
    | 'thought'
    | 'text'
    | 'tool_use'
    | 'tool_result'
    | 'file_change'
    | 'mcp_call'
    | 'task_list'
    | 'subagent_run'
    | 'bash_request'
    | 'plan_ready'
    | 'error'
    | 'confirmation_request';  // 新增

// 统一的确认请求
export interface ConfirmationRequestUpdate {
    /** 确认请求唯一 ID */
    id: string;
    
    /** 确认类型 */
    type: ConfirmationType;
    
    /** 关联的工具调用 ID */
    toolCallId: string;
    
    /** 简短摘要 */
    summary: string;
    
    /** 详细信息 */
    details?: ConfirmationData;
}
```

### 3.3 Webview 消息类型

```typescript
// packages/extension/webview/src/types.ts

// 通用工具确认消息
export interface ConfirmToolMessage {
    type: 'confirmTool';
    toolCallId: string;
    confirmed: boolean;
    options?: {
        /** 对此类工具始终信任 */
        trustAlways?: boolean;
        /** 用户编辑后的内容（用于文件修改） */
        editedContent?: string;
    };
}

// 扩展 WebviewMessage
export type WebviewMessage =
    | SendMessage
    // ... existing ...
    | ConfirmToolMessage;  // 新增
```

---

## 4. 组件设计

### 4.1 组件结构

```
StepEntry.tsx
├── ApprovalUI.tsx (通用容器)
│   ├── ApprovalHeader.tsx (标题 + 类型图标)
│   ├── ApprovalContent.tsx (根据类型渲染不同内容)
│   │   ├── BashApprovalContent.tsx
│   │   ├── FileApprovalContent.tsx
│   │   └── PlanApprovalContent.tsx
│   └── ApprovalActions.tsx (操作按钮)
```

### 4.2 ApprovalUI 主组件

```typescript
// packages/extension/webview/src/components/StepProgress/ApprovalUI.tsx

import { useMemo } from 'react';
import type { ToolCall, ConfirmationType } from '../../types';
import { useI18n } from '../../i18n/I18nProvider';
import { ApprovalHeader } from './ApprovalHeader';
import { ApprovalContent } from './ApprovalContent';
import { ApprovalActions } from './ApprovalActions';

interface ApprovalUIProps {
    toolCall: ToolCall;
    onApprove: (options?: { trustAlways?: boolean; editedContent?: string }) => void;
    onReject: () => void;
}

export function ApprovalUI({ toolCall, onApprove, onReject }: ApprovalUIProps) {
    const { t } = useI18n();
    
    // 推断确认类型
    const confirmationType = useMemo(() => {
        if (toolCall.confirmationType) return toolCall.confirmationType;
        return inferConfirmationType(toolCall);
    }, [toolCall]);
    
    // 风险等级
    const riskLevel = toolCall.confirmationData?.riskLevel || 'low';
    
    return (
        <div className={`approval-container type-${confirmationType} risk-${riskLevel}`}>
            <ApprovalHeader 
                type={confirmationType} 
                riskLevel={riskLevel}
            />
            <ApprovalContent 
                toolCall={toolCall} 
                type={confirmationType}
            />
            <ApprovalActions 
                type={confirmationType}
                riskLevel={riskLevel}
                onApprove={onApprove} 
                onReject={onReject}
            />
        </div>
    );
}

/** 根据工具名推断确认类型 */
function inferConfirmationType(toolCall: ToolCall): ConfirmationType {
    const name = toolCall.name.toLowerCase();
    
    if (name === 'bash' || name === 'run_command' || name.includes('bash')) {
        return 'bash';
    }
    if (name === 'write' || name === 'edit' || name.includes('write') || name.includes('edit')) {
        return 'file_write';
    }
    if (name.includes('delete') || name.includes('remove')) {
        return 'file_delete';
    }
    if (name.startsWith('mcp__')) {
        return 'mcp';
    }
    
    return 'dangerous';
}
```

### 4.3 ApprovalContent 内容组件

```typescript
// packages/extension/webview/src/components/StepProgress/ApprovalContent.tsx

import type { ToolCall, ConfirmationType } from '../../types';
import { BashApprovalContent } from './BashApprovalContent';
import { FileApprovalContent } from './FileApprovalContent';
import { PlanApprovalContent } from './PlanApprovalContent';
import { GenericApprovalContent } from './GenericApprovalContent';

interface ApprovalContentProps {
    toolCall: ToolCall;
    type: ConfirmationType;
}

export function ApprovalContent({ toolCall, type }: ApprovalContentProps) {
    switch (type) {
        case 'bash':
            return <BashApprovalContent toolCall={toolCall} />;
        case 'file_write':
        case 'file_delete':
            return <FileApprovalContent toolCall={toolCall} isDelete={type === 'file_delete'} />;
        case 'plan':
            return <PlanApprovalContent toolCall={toolCall} />;
        default:
            return <GenericApprovalContent toolCall={toolCall} />;
    }
}
```

---

## 5. UI 视觉设计

### 5.1 Bash 命令确认

```
┌────────────────────────────────────────────────────────────┐
│ ⚠️ 命令执行需要批准                          [中等风险]    │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ $ npm run build && npm publish                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  💡 风险提示:                                              │
│     • 会修改 node_modules 目录                            │
│     • 会发布包到 npm registry                             │
│     • 命令包含管道操作                                     │
│                                                            │
│              [批准执行]    [跳过]    [□ 始终信任]          │
└────────────────────────────────────────────────────────────┘
```

### 5.2 文件修改确认

```
┌────────────────────────────────────────────────────────────┐
│ 📝 文件修改需要确认                                        │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  📄 src/components/Button.tsx                              │
│                                                            │
│  [查看完整 Diff]  [在编辑器中打开]                         │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  1  - import { useState } from 'react';              │  │
│  │  1  + import { useState, useEffect } from 'react';   │  │
│  │  2    import './Button.scss';                        │  │
│  │ ...                                                  │  │
│  │     +15 行 / -3 行                                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│              [接受修改]    [拒绝]    [编辑后接受]          │
└────────────────────────────────────────────────────────────┘
```

### 5.3 文件删除确认

```
┌────────────────────────────────────────────────────────────┐
│ 🗑️ 文件删除需要确认                          [高风险]      │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ⚠️ 即将删除以下文件:                                      │
│                                                            │
│  📄 src/utils/deprecated.ts                                │
│                                                            │
│  此操作不可撤销，请确认是否继续。                           │
│                                                            │
│              [确认删除]    [取消]                           │
└────────────────────────────────────────────────────────────┘
```

### 5.4 计划确认 (Plan Mode)

```
┌────────────────────────────────────────────────────────────┐
│ 📋 执行计划需要确认                                        │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  AI 计划执行以下 5 个步骤:                                 │
│                                                            │
│  ✓ 1. 分析 package.json 依赖                              │
│  ○ 2. 创建 src/utils/helper.ts                            │
│  ○ 3. 修改 src/index.ts 添加导入                          │
│  ○ 4. 运行 npm test 验证                                  │
│  ○ 5. 更新 README.md 文档                                 │
│                                                            │
│  预计影响: 2 个新文件, 2 个修改, 1 个命令                  │
│                                                            │
│              [执行计划]    [取消]    [编辑计划]            │
└────────────────────────────────────────────────────────────┘
```

---

## 6. 样式实现

```scss
// packages/extension/webview/src/components/StepProgress/index.scss

// ===========================================
// Approval UI Styles
// ===========================================

.approval-container {
    margin: 8px 0;
    border-radius: 8px;
    background: var(--vcoder-surface);
    border: 1px solid var(--vcoder-border);
    overflow: hidden;
    
    // 类型主题色
    &.type-bash {
        border-left: 3px solid var(--vscode-terminal-ansiYellow);
    }
    
    &.type-file_write {
        border-left: 3px solid var(--vscode-textLink-foreground);
    }
    
    &.type-file_delete {
        border-left: 3px solid var(--vscode-terminal-ansiRed);
    }
    
    &.type-plan {
        border-left: 3px solid var(--vscode-terminal-ansiGreen);
    }
    
    &.type-mcp {
        border-left: 3px solid var(--vscode-terminal-ansiMagenta);
    }
    
    &.type-dangerous {
        border-left: 3px solid var(--vscode-terminal-ansiRed);
    }
}

// 头部
.approval-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: var(--vcoder-surface-3);
    border-bottom: 1px solid var(--vcoder-border);
    
    .header-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        font-size: 13px;
        
        svg {
            width: 16px;
            height: 16px;
        }
    }
}

// 风险等级标签
.risk-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    
    svg {
        width: 12px;
        height: 12px;
    }
    
    &.risk-low {
        background: color-mix(in srgb, var(--vscode-terminal-ansiGreen) 15%, transparent);
        color: var(--vscode-terminal-ansiGreen);
    }
    
    &.risk-medium {
        background: color-mix(in srgb, var(--vscode-terminal-ansiYellow) 15%, transparent);
        color: var(--vscode-terminal-ansiYellow);
    }
    
    &.risk-high {
        background: color-mix(in srgb, var(--vscode-terminal-ansiRed) 15%, transparent);
        color: var(--vscode-terminal-ansiRed);
    }
}

// 内容区域
.approval-content {
    padding: 12px 14px;
}

// 命令预览
.command-preview {
    padding: 10px 12px;
    background: var(--vcoder-surface-2);
    border-radius: 6px;
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
    color: var(--vscode-terminal-ansiGreen);
    
    .command-prompt {
        color: var(--vscode-descriptionForeground);
        margin-right: 8px;
    }
}

// 风险提示列表
.risk-hints {
    margin-top: 12px;
    
    .risk-title {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 500;
        color: var(--vscode-foreground);
        margin-bottom: 6px;
        
        svg {
            width: 14px;
            height: 14px;
            color: var(--vscode-terminal-ansiYellow);
        }
    }
    
    .risk-list {
        padding-left: 20px;
        
        li {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            padding: 2px 0;
        }
    }
}

// 文件信息
.file-info-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    
    svg {
        width: 16px;
        height: 16px;
        color: var(--vscode-descriptionForeground);
    }
    
    .file-path {
        font-size: 12px;
        color: var(--vscode-textLink-foreground);
        font-family: var(--vscode-editor-font-family);
    }
}

// 快捷操作按钮
.quick-actions {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
    
    button {
        padding: 4px 10px;
        border-radius: 4px;
        font-size: 11px;
        background: var(--vcoder-surface-3);
        color: var(--vscode-foreground);
        cursor: pointer;
        transition: all 0.15s;
        
        &:hover {
            background: var(--vscode-list-hoverBackground);
        }
    }
}

// 内联 Diff 预览
.inline-diff {
    border-radius: 6px;
    background: var(--vcoder-surface-2);
    overflow: hidden;
    max-height: 200px;
    overflow-y: auto;
    
    .diff-line {
        padding: 2px 10px;
        font-family: var(--vscode-editor-font-family);
        font-size: 11px;
        line-height: 1.4;
        
        &.diff-add {
            background: color-mix(in srgb, var(--vscode-diffEditor-insertedTextBackground) 40%, transparent);
            color: var(--vscode-terminal-ansiGreen);
        }
        
        &.diff-remove {
            background: color-mix(in srgb, var(--vscode-diffEditor-removedTextBackground) 40%, transparent);
            color: var(--vscode-terminal-ansiRed);
        }
        
        &.diff-context {
            color: var(--vscode-editor-foreground);
        }
    }
    
    .diff-stats {
        padding: 6px 10px;
        font-size: 10px;
        color: var(--vscode-descriptionForeground);
        border-top: 1px solid var(--vcoder-border);
        background: var(--vcoder-surface-3);
    }
}

// 计划任务列表
.plan-tasks {
    .task-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 0;
        font-size: 12px;
        
        .task-status {
            width: 16px;
            height: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            
            svg {
                width: 14px;
                height: 14px;
            }
            
            &.completed { color: var(--vscode-terminal-ansiGreen); }
            &.pending { color: var(--vscode-descriptionForeground); }
        }
        
        .task-content {
            flex: 1;
            color: var(--vscode-foreground);
        }
    }
    
    .plan-summary {
        margin-top: 10px;
        padding: 8px 10px;
        background: var(--vcoder-surface-3);
        border-radius: 4px;
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
    }
}

// 操作按钮区域
.approval-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 10px 14px;
    background: var(--vcoder-surface-3);
    border-top: 1px solid var(--vcoder-border);
}

.approval-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    
    svg {
        width: 14px;
        height: 14px;
    }
    
    // 主按钮
    &.btn-primary {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        
        &:hover {
            background: var(--vscode-button-hoverBackground);
        }
    }
    
    // 次按钮
    &.btn-secondary {
        background: transparent;
        border: 1px solid var(--vcoder-border);
        color: var(--vscode-foreground);
        
        &:hover {
            background: var(--vscode-list-hoverBackground);
        }
    }
    
    // 危险按钮
    &.btn-danger {
        background: var(--vscode-inputValidation-errorBackground);
        color: var(--vscode-errorForeground);
        border: 1px solid var(--vscode-inputValidation-errorBorder);
        
        &:hover {
            background: color-mix(in srgb, var(--vscode-inputValidation-errorBackground) 80%, black);
        }
    }
}

// 信任选项
.trust-option {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-right: auto;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    
    input[type="checkbox"] {
        width: 14px;
        height: 14px;
    }
    
    &:hover {
        color: var(--vscode-foreground);
    }
}
```

---

## 7. i18n 扩展

### 7.1 中文 (zh-CN.ts)

```typescript
Agent: {
    // ... existing ...
    
    // 确认标题
    ConfirmBash: '命令执行需要批准',
    ConfirmFileWrite: '文件修改需要确认',
    ConfirmFileDelete: '文件删除需要确认',
    ConfirmPlan: '执行计划需要确认',
    ConfirmMcp: 'MCP 工具调用需要确认',
    ConfirmDangerous: '危险操作需要确认',
    
    // 风险等级
    RiskLow: '低风险',
    RiskMedium: '中等风险',
    RiskHigh: '高风险',
    RiskHint: '风险提示',
    
    // 操作按钮
    ApproveAndRun: '批准执行',
    AcceptChanges: '接受修改',
    RejectChanges: '拒绝',
    ConfirmDelete: '确认删除',
    RunPlan: '执行计划',
    EditPlan: '编辑计划',
    EditThenAccept: '编辑后接受',
    TrustAlways: '始终信任此类操作',
    Skip: '跳过',
    Cancel: '取消',
    
    // Diff 相关
    ViewFullDiff: '查看完整 Diff',
    OpenInEditor: '在编辑器中打开',
    LinesAdded: '+{0} 行',
    LinesRemoved: '-{0} 行',
    LinesChanged: '{0} 行变更',
    
    // 计划相关
    PlanSteps: 'AI 计划执行以下 {0} 个步骤',
    PlanImpact: '预计影响: {0} 个新文件, {1} 个修改, {2} 个命令',
    
    // 文件删除
    FileDeleteWarning: '即将删除以下文件',
    FileDeleteIrreversible: '此操作不可撤销，请确认是否继续。',
    
    // 风险原因
    RiskModifyNodeModules: '会修改 node_modules 目录',
    RiskPublishPackage: '会发布包到 registry',
    RiskPipeCommand: '命令包含管道操作',
    RiskSudoCommand: '命令包含 sudo 提权',
    RiskDeleteFiles: '会删除文件',
    RiskNetworkAccess: '会访问网络',
},
```

### 7.2 英文 (en-US.ts)

```typescript
Agent: {
    // ... existing ...
    
    // Confirmation titles
    ConfirmBash: 'Command execution requires approval',
    ConfirmFileWrite: 'File modification requires confirmation',
    ConfirmFileDelete: 'File deletion requires confirmation',
    ConfirmPlan: 'Execution plan requires confirmation',
    ConfirmMcp: 'MCP tool call requires confirmation',
    ConfirmDangerous: 'Dangerous operation requires confirmation',
    
    // Risk levels
    RiskLow: 'Low risk',
    RiskMedium: 'Medium risk',
    RiskHigh: 'High risk',
    RiskHint: 'Risk hints',
    
    // Action buttons
    ApproveAndRun: 'Approve & Run',
    AcceptChanges: 'Accept Changes',
    RejectChanges: 'Reject',
    ConfirmDelete: 'Confirm Delete',
    RunPlan: 'Run Plan',
    EditPlan: 'Edit Plan',
    EditThenAccept: 'Edit & Accept',
    TrustAlways: 'Always trust this type',
    Skip: 'Skip',
    Cancel: 'Cancel',
    
    // Diff related
    ViewFullDiff: 'View Full Diff',
    OpenInEditor: 'Open in Editor',
    LinesAdded: '+{0} lines',
    LinesRemoved: '-{0} lines',
    LinesChanged: '{0} lines changed',
    
    // Plan related
    PlanSteps: 'AI plans to execute {0} steps',
    PlanImpact: 'Expected impact: {0} new files, {1} modified, {2} commands',
    
    // File deletion
    FileDeleteWarning: 'About to delete the following file',
    FileDeleteIrreversible: 'This action cannot be undone. Are you sure?',
    
    // Risk reasons
    RiskModifyNodeModules: 'Will modify node_modules directory',
    RiskPublishPackage: 'Will publish package to registry',
    RiskPipeCommand: 'Command contains pipe operations',
    RiskSudoCommand: 'Command contains sudo',
    RiskDeleteFiles: 'Will delete files',
    RiskNetworkAccess: 'Will access network',
},
```

---

## 8. Store 处理逻辑

```typescript
// packages/extension/webview/src/store/useStore.ts

handleUpdate: (update) => {
    const { type, content } = update;

    switch (type) {
        // ... existing cases ...
        
        case 'confirmation_request': {
            const request = content as ConfirmationRequestUpdate;
            
            // 更新对应的 ToolCall 状态
            get().updateToolCall(request.toolCallId, {
                status: 'awaiting_confirmation',
                confirmationType: request.type,
                confirmationData: request.details,
            });
            break;
        }
    }
},

// 新增: 处理确认响应
confirmTool: (toolCallId: string, confirmed: boolean, options?: { trustAlways?: boolean; editedContent?: string }) => {
    // 更新状态
    set((state) => {
        const messages = [...state.messages];
        for (const msg of messages) {
            if (msg.toolCalls) {
                const tc = msg.toolCalls.find(t => t.id === toolCallId);
                if (tc) {
                    tc.status = confirmed ? 'running' : 'failed';
                    delete tc.confirmationType;
                    delete tc.confirmationData;
                    break;
                }
            }
        }
        return { messages };
    });
    
    // 发送消息给扩展
    postMessage({
        type: 'confirmTool',
        toolCallId,
        confirmed,
        options,
    });
},
```

---

## 9. 扩展层协调

```typescript
// packages/extension/src/extension.ts

acpClient.on('session/update', (params: UpdateNotificationParams) => {
    void (async () => {
        // 统一转换为 confirmation_request
        if (params.type === 'bash_request') {
            const { id, command } = params.content as BashRequestUpdate;
            
            // 如果配置了 trustMode，直接批准
            const trustMode = vscode.workspace.getConfiguration('vcoder').get<boolean>('trustMode', false);
            if (trustMode) {
                await acpClient.confirmBash(id);
                return;
            }
            
            // 转换为 confirmation_request 发送给 webview
            chatProvider.postConfirmationRequest({
                id: `confirm-${id}`,
                type: 'bash',
                toolCallId: id,
                summary: command,
                details: {
                    command,
                    riskLevel: assessBashRisk(command),
                    riskReasons: getBashRiskReasons(command),
                },
            });
            return;
        }
        
        if (params.type === 'file_change') {
            const change = params.content as FileChangeUpdate;
            if (change.proposed) {
                chatProvider.postConfirmationRequest({
                    id: `confirm-${change.path}`,
                    type: change.type === 'deleted' ? 'file_delete' : 'file_write',
                    toolCallId: change.path, // 使用 path 作为标识
                    summary: change.path,
                    details: {
                        filePath: change.path,
                        diff: change.diff,
                        content: change.content,
                    },
                });
            }
            return;
        }
        
        if (params.type === 'plan_ready') {
            const { tasks, summary } = params.content as PlanReadyUpdate;
            chatProvider.postConfirmationRequest({
                id: 'confirm-plan',
                type: 'plan',
                toolCallId: 'plan',
                summary,
                details: {
                    tasks,
                    planSummary: summary,
                },
            });
            return;
        }
        
        // 其他消息正常转发
        chatProvider.handleUpdate(params);
    })();
});

// Webview 消息处理
webview.onDidReceiveMessage((msg) => {
    if (msg.type === 'confirmTool') {
        const { toolCallId, confirmed, options } = msg;
        
        // 根据 toolCallId 判断类型并调用相应 API
        if (toolCallId.startsWith('bash-')) {
            if (confirmed) {
                acpClient.confirmBash(toolCallId.replace('bash-', ''));
            } else {
                acpClient.skipBash(toolCallId.replace('bash-', ''));
            }
        } else if (toolCallId === 'plan') {
            if (confirmed) {
                acpClient.confirmPlan();
            }
        } else {
            // 文件操作
            if (confirmed) {
                acpClient.acceptFileChange(toolCallId);
            } else {
                acpClient.rejectFileChange(toolCallId);
            }
        }
        
        // 处理 trustAlways 选项
        if (options?.trustAlways) {
            // 保存到配置
            vscode.workspace.getConfiguration('vcoder').update('trustedOperations', 
                [...(config.trustedOperations || []), inferOperationType(toolCallId)],
                vscode.ConfigurationTarget.Global
            );
        }
    }
});
```

---

## 10. 实施计划

### Phase 1: 数据结构准备 (0.5天)

- [ ] 扩展 `ToolCall` 类型，添加 `awaiting_confirmation` 状态
- [ ] 添加 `ConfirmationType` 和 `ConfirmationData` 类型
- [ ] 在 `protocol.ts` 添加 `confirmation_request` 类型
- [ ] 添加 `ConfirmToolMessage` 消息类型

### Phase 2: 通用 ApprovalUI 组件 (1天)

- [ ] 创建 `ApprovalUI.tsx` 主组件
- [ ] 创建 `ApprovalHeader.tsx` 头部组件
- [ ] 创建 `ApprovalActions.tsx` 操作按钮组件
- [ ] 添加样式支持

### Phase 3: 各类型内容组件 (1天)

- [ ] 创建 `BashApprovalContent.tsx` - Bash 命令预览
- [ ] 创建 `FileApprovalContent.tsx` - 文件修改/删除预览
- [ ] 创建 `PlanApprovalContent.tsx` - 计划任务列表
- [ ] 创建 `GenericApprovalContent.tsx` - 通用备用

### Phase 4: Store 和消息处理 (0.5天)

- [ ] 在 `useStore.ts` 添加 `confirmation_request` 处理
- [ ] 添加 `confirmTool` action
- [ ] 在 `StepEntry.tsx` 集成 `ApprovalUI`

### Phase 5: 扩展层协调 (0.5天)

- [ ] 修改 `extension.ts` 转换现有消息为 `confirmation_request`
- [ ] 处理 `confirmTool` 消息
- [ ] 添加 `trustAlways` 配置存储

### Phase 6: i18n 和测试 (0.5天)

- [ ] 添加中英文翻译
- [ ] 端到端测试
- [ ] 边界情况处理

**总计: 约 4 天**

---

## 11. 风险评估逻辑

```typescript
// packages/extension/webview/src/utils/riskAssessment.ts

export function assessBashRisk(command: string): 'low' | 'medium' | 'high' {
    const normalized = command.toLowerCase();
    
    // 高风险模式
    const highRiskPatterns = [
        /\bsudo\b/,
        /\brm\s+-rf?\b/,
        /\bchmod\s+777\b/,
        /\bdd\s+if=/,
        />\s*\/dev\//,
        /\bmkfs\b/,
    ];
    
    for (const pattern of highRiskPatterns) {
        if (pattern.test(normalized)) return 'high';
    }
    
    // 中等风险模式
    const mediumRiskPatterns = [
        /\bnpm\s+(publish|unpublish)\b/,
        /\bgit\s+push\b.*--force/,
        /\brm\b/,
        /\|/,  // 管道
        /&&/,  // 命令链
        /\bcurl\b.*\|.*\bsh\b/,
    ];
    
    for (const pattern of mediumRiskPatterns) {
        if (pattern.test(normalized)) return 'medium';
    }
    
    return 'low';
}

export function getBashRiskReasons(command: string): string[] {
    const reasons: string[] = [];
    const normalized = command.toLowerCase();
    
    if (/\bsudo\b/.test(normalized)) {
        reasons.push('RiskSudoCommand');
    }
    if (/\brm\b/.test(normalized)) {
        reasons.push('RiskDeleteFiles');
    }
    if (/\bnpm\s+publish\b/.test(normalized)) {
        reasons.push('RiskPublishPackage');
    }
    if (/node_modules/.test(normalized)) {
        reasons.push('RiskModifyNodeModules');
    }
    if (/\|/.test(normalized)) {
        reasons.push('RiskPipeCommand');
    }
    if (/\bcurl\b|\bwget\b|\bfetch\b/.test(normalized)) {
        reasons.push('RiskNetworkAccess');
    }
    
    return reasons;
}
```

---

## 12. 验证清单

- [ ] Bash 命令在 webview 内显示批准 UI
- [ ] 文件修改显示内联 diff 预览
- [ ] 文件删除显示警告提示
- [ ] 计划模式显示任务列表
- [ ] 风险等级正确评估
- [ ] "始终信任" 选项正常工作
- [ ] VS Code 原生弹窗作为后备
- [ ] i18n 中英文完整
- [ ] 样式与现有 UI 一致

---

## 附录: 与现有实现的兼容

为保持向后兼容，当 webview 不可见时仍使用 VS Code 原生弹窗：

```typescript
// extension.ts
if (!chatProvider.isWebviewVisible()) {
    // 使用原生弹窗
    const picked = await vscode.window.showWarningMessage(...);
} else {
    // 发送给 webview 处理
    chatProvider.postConfirmationRequest(...);
}
```
