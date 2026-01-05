# 步骤化进度视图 (Step-based Progress View) 技术方案

> 将 VCoder 工具执行界面重构为类似 Antigravity 任务视图的步骤化展示

**版本**: v1.0  
**日期**: 2026-01-05  
**状态**: ✅ 已批准

---

## 1. 目标与风格定义

### 1.1 目标视觉效果

| 特性 | 当前状态 | 目标状态 |
|------|---------|---------|
| 顶层结构 | 平铺列表 | 大数字步骤序号 (1, 2, 3...) |
| 条目描述 | 工具名 (`read_file`) | 动作语义 (`Analyzed App.tsx`) |
| 文件信息 | 完整路径 | 文件图标 + 文件名 + 行号 |
| 折叠控制 | 单层折叠 | 多层级 + 全局控制 |
| Thought | 醒目标题 | 简洁折叠箭头 + 耗时显示 |

### 1.2 核心体验原则

- **信息密度适中**：一眼看清执行进度，详情按需展开
- **动作语义化**：用户看到的是"做了什么"，而非"调用了什么工具"
- **层级清晰**：步骤 > 条目 > 详情 三级结构

---

## 2. 数据模型设计

### 2.1 核心类型定义

```typescript
// 步骤 - 对应一个逻辑阶段
interface Step {
    id: string;
    index: number;                    // 步骤序号 (1, 2, 3...)
    title: string;                    // 步骤标题 (来自 task_boundary 或 自动生成)
    status: 'running' | 'completed' | 'failed';
    entries: StepEntry[];             // 子条目
    thought?: ThoughtInfo;            // 可选的思考内容
    startTime: number;
    endTime?: number;
}

// 思考信息
interface ThoughtInfo {
    content: string;
    durationMs: number;              // 思考耗时 (ms)
}

// 子条目 - 对应单个工具调用
interface StepEntry {
    id: string;
    type: 'file' | 'command' | 'search' | 'browser' | 'task' | 'other';
    action: string;                   // 动作动词: "Analyzed" | "Edited" | "Executed"
    target: {
        name: string;                 // 文件名或命令摘要
        fullPath?: string;            // 完整路径 (用于 tooltip/跳转)
        lineRange?: [number, number]; // 行号范围
    };
    status: 'pending' | 'running' | 'success' | 'error';
    toolCall: ToolCall;               // 原始工具调用数据
}
```

### 2.2 步骤聚合规则

> [!IMPORTANT]
> 需要讨论确认的核心逻辑

**方案 A: 以 `task_boundary` 为分隔点（推荐）**
- 每次 `task_boundary` 工具调用标记一个新步骤的开始
- 步骤标题取自 `TaskName` 或 `TaskStatus`
- 优点：语义明确，与 Agent 执行阶段对应
- 缺点：依赖 CLI 输出 `task_boundary` 事件

**方案 B: 智能聚合**
- 连续相关操作自动归组（如连续多个 `read_file`）
- 以时间间隔 + 操作类型作为分隔依据
- 优点：无需后端支持
- 缺点：聚合逻辑复杂，边界模糊

**方案 C: 混合策略 ✅ 已确认**
- 优先使用 `task_boundary` 作为步骤分隔
- 如果没有 `task_boundary`，则每个工具调用为独立步骤
- 支持后续迭代增加智能聚合

---

## 3. 动作映射表

### 3.1 工具名 → 动作动词

| 工具名 | 动作 (Action) | 类型 (Type) |
|--------|--------------|-------------|
| `read_file` / `view_file` | Analyzed | file |
| `view_file_outline` | Explored | file |
| `write_to_file` | Created | file |
| `replace_file_content` | Edited | file |
| `multi_replace_file_content` | Edited | file |
| `grep_search` | Searched | search |
| `find_by_name` | Located | search |
| `run_command` / `Bash` | Executed | command |
| `browser_subagent` | Browsed | browser |
| `read_url_content` | Fetched | browser |
| `task_boundary` | (用于步骤分隔) | task |
| `notify_user` | Notified | other |
| 其他 | Invoked | other |

### 3.2 动作映射函数

```typescript
const ACTION_MAP: Record<string, { action: string; type: StepEntry['type'] }> = {
    // File operations
    'read_file': { action: 'Analyzed', type: 'file' },
    'view_file': { action: 'Analyzed', type: 'file' },
    'view_file_outline': { action: 'Explored', type: 'file' },
    'write_to_file': { action: 'Created', type: 'file' },
    'replace_file_content': { action: 'Edited', type: 'file' },
    'multi_replace_file_content': { action: 'Edited', type: 'file' },
    
    // Search
    'grep_search': { action: 'Searched', type: 'search' },
    'find_by_name': { action: 'Located', type: 'search' },
    
    // Commands
    'run_command': { action: 'Executed', type: 'command' },
    'Bash': { action: 'Executed', type: 'command' },
    
    // Browser
    'browser_subagent': { action: 'Browsed', type: 'browser' },
    'read_url_content': { action: 'Fetched', type: 'browser' },
};

function getActionInfo(toolName: string): { action: string; type: StepEntry['type'] } {
    return ACTION_MAP[toolName] ?? { action: 'Invoked', type: 'other' };
}
```

---

## 4. 文件图标体系

### 4.1 图标映射策略

利用现有 `/components/Icon/icons/` 目录（163 个图标），按文件扩展名映射：

```typescript
const FILE_ICON_MAP: Record<string, string> = {
    // TypeScript / JavaScript
    '.ts': 'typescript',
    '.tsx': 'react_ts',
    '.js': 'javascript',
    '.jsx': 'react',
    
    // Styles
    '.css': 'css',
    '.scss': 'sass',
    '.less': 'less',
    
    // Data
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.xml': 'xml',
    
    // Docs
    '.md': 'markdown',
    '.txt': 'document',
    
    // Config
    '.toml': 'settings',
    '.env': 'tune',
    
    // Default
    'default': 'file',
};

function getFileIcon(filename: string): React.ReactNode {
    const ext = path.extname(filename).toLowerCase();
    const iconName = FILE_ICON_MAP[ext] ?? 'file';
    return <FileTypeIcon name={iconName} />;
}
```

### 4.2 需新增的图标

检查现有图标库，可能需要补充：
- [ ] `react_ts.svg` (TSX 文件)
- [ ] `sass.svg` (SCSS 文件)

---

## 5. 组件架构

### 5.1 组件层级

```
StepProgressList (新增)
├── StepProgressHeader (标题 + "Collapse all")
├── StepItem (每个步骤)
│   ├── StepHeader (序号 + 标题 + 状态 + 折叠)
│   ├── ThoughtBlock (可选, 改造后)
│   └── StepEntryList
│       └── StepEntry (单个工具条目)
│           ├── FileIcon
│           ├── ActionLabel
│           ├── TargetInfo (文件名 + 行号)
│           └── QuickActions ("View" 按钮)
```

### 5.2 文件变更清单

| 操作 | 文件路径 | 变更说明 |
|------|---------|---------|
| **[NEW]** | `components/StepProgress/index.tsx` | 主容器组件 |
| **[NEW]** | `components/StepProgress/StepItem.tsx` | 步骤组件 |
| **[NEW]** | `components/StepProgress/StepEntry.tsx` | 条目组件 |
| **[NEW]** | `components/StepProgress/index.scss` | 样式文件 |
| **[NEW]** | `utils/stepAggregator.ts` | 步骤聚合逻辑 |
| **[NEW]** | `utils/actionMapper.ts` | 动作映射逻辑 |
| **[MODIFY]** | `components/ThoughtBlock.tsx` | 简化 UI，支持 i18n |
| **[MODIFY]** | `components/ThoughtBlock.scss` | 样式调整 |
| **[MODIFY]** | `index.scss` | 深色主题优化 |
| **[DELETE]** | `components/ToolCallList.tsx` | 完成后删除 |
| **[DELETE]** | `components/ToolCallList.scss` | 完成后删除 |

### 5.3 StepProgressList 接口设计

```typescript
interface StepProgressListProps {
    toolCalls: ToolCall[];
    thoughts?: ThoughtInfo[];         // 可选的思考块数据
    defaultExpanded?: boolean;        // 默认是否展开所有步骤
    onViewFile?: (path: string, lineRange?: [number, number]) => void;
}

export function StepProgressList({ 
    toolCalls, 
    thoughts, 
    defaultExpanded = true,
    onViewFile 
}: StepProgressListProps) {
    // 1. 聚合工具调用为步骤
    const steps = useMemo(() => aggregateToSteps(toolCalls, thoughts), [toolCalls, thoughts]);
    
    // 2. 折叠状态管理
    const [collapsedSteps, setCollapsedSteps] = useState<Set<string>>(new Set());
    const [allCollapsed, setAllCollapsed] = useState(false);
    
    // 3. 渲染
    return (
        <div className="step-progress-list">
            <StepProgressHeader 
                totalSteps={steps.length}
                allCollapsed={allCollapsed}
                onToggleAll={() => setAllCollapsed(!allCollapsed)}
            />
            {steps.map((step, idx) => (
                <StepItem 
                    key={step.id}
                    step={step}
                    isCollapsed={allCollapsed || collapsedSteps.has(step.id)}
                    onToggle={() => toggleStep(step.id)}
                    onViewFile={onViewFile}
                />
            ))}
        </div>
    );
}
```

---

## 6. ThoughtBlock 改造

### 6.1 当前问题
- 使用 emoji "💭" 和中文标题，风格不统一
- 背景颜色过于突出

### 6.2 目标样式

```
▶ Thought     (收起状态)
▼ Thought     (展开状态)
   [淡色背景思考内容]
```

### 6.3 改造后组件

```typescript
interface ThoughtBlockProps {
    content: string;
    defaultExpanded?: boolean;
}

export function ThoughtBlock({ content, defaultExpanded = false }: ThoughtBlockProps) {
    const { t } = useI18n();
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    
    return (
        <div className="thought-block">
            <button className="thought-toggle" onClick={() => setIsExpanded(!isExpanded)}>
                <span className="toggle-arrow">{isExpanded ? '▼' : '▶'}</span>
                <span className="thought-label">{t('Agent.Thought')}</span>
            </button>
            {isExpanded && (
                <div className="thought-content">{content}</div>
            )}
        </div>
    );
}
```

---

## 7. 样式系统优化

### 7.1 深色主题调色板

```scss
// 新增变量 (index.scss)
:root {
    // 步骤进度视图专用
    --vcoder-step-bg: var(--vscode-editor-background);
    --vcoder-step-border: var(--vscode-panel-border);
    --vcoder-step-number-color: var(--vscode-textLink-foreground);
    --vcoder-step-header-bg: var(--vscode-editorWidget-background);
    
    // 条目状态色
    --vcoder-entry-success: var(--vscode-terminal-ansiGreen);
    --vcoder-entry-error: var(--vscode-terminal-ansiRed);
    --vcoder-entry-pending: var(--vscode-terminal-ansiYellow);
    
    // 思考块
    --vcoder-thought-bg: color-mix(in srgb, var(--vscode-editor-background) 95%, var(--vscode-terminal-ansiYellow));
}
```

### 7.2 关键样式规范

```scss
.step-progress-list {
    font-family: var(--vscode-font-family);
    
    .step-number {
        font-size: 24px;
        font-weight: 600;
        color: var(--vcoder-step-number-color);
        opacity: 0.6;
        min-width: 32px;
    }
    
    .step-entry {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        
        .file-icon { width: 16px; height: 16px; }
        .action-label { font-weight: 500; }
        .target-name { color: var(--vscode-textLink-foreground); }
        .line-range { 
            font-family: var(--vscode-editor-font-family);
            font-size: 11px;
            opacity: 0.7;
        }
        .view-button {
            margin-left: auto;
            opacity: 0;
            transition: opacity 0.15s;
        }
        
        &:hover .view-button { opacity: 1; }
    }
}
```

---

## 8. 实施计划

### Phase 1: 数据层 (0.5 天)

- [ ] 创建 `utils/stepAggregator.ts`
- [ ] 创建 `utils/actionMapper.ts`
- [ ] 编写单元测试

### Phase 2: 核心组件 (1.5 天)

- [ ] 创建 `components/StepProgress/` 目录结构
- [ ] 实现 `StepProgressList`
- [ ] 实现 `StepItem`
- [ ] 实现 `StepEntry`

### Phase 3: ThoughtBlock 改造 (0.5 天)

- [ ] 修改 `ThoughtBlock.tsx`
- [ ] 更新 `ThoughtBlock.scss`

### Phase 4: 样式系统 (0.5 天)

- [ ] 更新 `index.scss` 变量
- [ ] 创建 `StepProgress/index.scss`
- [ ] 深色主题验证

### Phase 5: 集成与验证 (1 天)

- [ ] 替换 `App.tsx` 中的 `ToolCallList` 调用
- [ ] 视觉对标验证
- [ ] 边缘情况测试

**预计总工期**: 4 天

---

## 9. 已确认决策

> [!NOTE]
> 以下决策已于 2026-01-05 获用户确认

| 决策项 | 结论 |
|--------|------|
| 步骤聚合策略 | ✅ 方案 C（混合策略） |
| 思考块耗时显示 | ❌ 不显示 |
| "View" 按钮行为 | ✅ 跳转编辑器并高亮行 |
| 旧组件保留 | ❌ 完成后删除 `ToolCallList` |
| 国际化 | ✅ 动作标签需多语言支持 |

---

## 10. 验证清单

- [ ] 步骤序号正确递增
- [ ] 文件类型图标正确显示
- [ ] 行号信息正确提取和显示
- [ ] 折叠/展开动画流畅
- [ ] 深色/浅色主题切换正常
- [ ] 长路径正确截断显示
- [ ] "View" 按钮可正确跳转
- [ ] 错误状态清晰可辨
- [ ] 加载状态有明确指示
