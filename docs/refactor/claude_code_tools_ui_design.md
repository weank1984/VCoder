# Claude Code CLI 工具及 UI 显示方案

> 全面梳理 Claude Code CLI 提供的工具类型及其输出格式，制定统一的 UI 显示规范

**版本**: v1.0  
**日期**: 2026-01-05  
**状态**: 草稿

---

## 1. 工具全景图

### 1.1 Claude Code CLI 内置工具完整列表

根据 CLI 实际输出，Claude Code 提供以下内置工具：

| 工具名 | 类别 | 功能描述 | 输入参数 | 输出格式 |
|--------|------|----------|----------|----------|
| **Read** | 文件 | 读取文件内容 | `path`, `StartLine?`, `EndLine?` | 文件内容文本 |
| **Write** | 文件 | 创建/覆写文件 | `path`, `content` | 写入确认 |
| **Edit** | 文件 | 编辑文件（diff/patch） | `path`, `oldContent`, `newContent` | 编辑确认 |
| **NotebookEdit** | 文件 | 编辑 Jupyter Notebook | `path`, `cellIndex`, `content` | 编辑确认 |
| **Glob** | 搜索 | 文件名模式搜索 | `pattern`, `path?` | 匹配文件列表 |
| **Grep** | 搜索 | 文件内容正则搜索 | `pattern`, `path?`, `flags?` | 匹配行列表 |
| **Bash** | 命令 | 执行 Shell 命令 | `command`, `cwd?`, `background?` | stdout/stderr |
| **BashOutput** | 命令 | 获取后台命令输出 | `pid` 或 `commandId` | 命令输出 |
| **KillShell** | 命令 | 终止 Shell 进程 | `pid` | 确认 |
| **WebSearch** | 网络 | 网页搜索 | `query` | 搜索结果列表 |
| **Task** | 代理 | 调用子代理执行任务 | `description`, `prompt`, `subagent_type?` | 子代理结果 |
| **TodoWrite** | 计划 | 创建/更新任务列表 | `tasks[]` | 任务列表 |
| **ExitPlanMode** | 计划 | 退出计划模式 | `plan` | (可能不可用) |
| **Skill** | 扩展 | 调用技能 | skill-specific | skill-specific |
| **SlashCommand** | 扩展 | 调用斜杠命令 | command-specific | command-specific |

### 1.2 MCP 工具格式

MCP (Model Context Protocol) 工具遵循统一命名格式：

```
mcp__<server_name>__<tool_name>
```

示例：
- `mcp__web_reader__webReader` - 网页阅读器
- `mcp__4_5v_mcp__analyze_image` - 图像分析
- `mcp__filesystem__readFile` - 文件系统读取

---

## 2. 当前 UI 实现状态

### 2.1 已实现的工具映射

`actionMapper.ts` 当前覆盖：

```typescript
const ACTION_MAP: Record<string, ActionInfo> = {
    // 文件操作 - ✅ 完整
    'read_file': { actionKey: 'StepProgress.Analyzed', type: 'file' },
    'view_file': { actionKey: 'StepProgress.Analyzed', type: 'file' },
    'Read': { actionKey: 'StepProgress.Analyzed', type: 'file' },
    'Write': { actionKey: 'StepProgress.Created', type: 'file' },
    'Edit': { actionKey: 'StepProgress.Edited', type: 'file' },
    'list_dir': { actionKey: 'StepProgress.Listed', type: 'file' },
    
    // 搜索 - ⚠️ 部分
    'grep_search': { actionKey: 'StepProgress.Searched', type: 'search' },
    'find_by_name': { actionKey: 'StepProgress.Located', type: 'search' },
    
    // 命令 - ✅ 完整
    'Bash': { actionKey: 'StepProgress.Executed', type: 'command' },
    
    // 浏览器 - ✅ 完整
    'browser_subagent': { actionKey: 'StepProgress.Browsed', type: 'browser' },
    'read_url_content': { actionKey: 'StepProgress.Fetched', type: 'browser' },
};
```

### 2.2 缺失的工具映射

| 工具名 | 需要的 Action | 需要的 Type | 优先级 |
|--------|--------------|-------------|--------|
| `Glob` | Located | search | 🔴 高 |
| `Grep` | Searched | search | 🔴 高 |
| `NotebookEdit` | Edited | file | 🟡 中 |
| `WebSearch` | Searched | browser | 🔴 高 |
| `Task` | Delegated | task | 🔴 高 |
| `TodoWrite` | Planned | task | 🔴 高 |
| `BashOutput` | Fetched | command | 🟢 低 |
| `KillShell` | Stopped | command | 🟢 低 |
| `Skill` | Invoked | other | 🟢 低 |
| `SlashCommand` | Invoked | other | 🟢 低 |
| `mcp__*` | (动态) | mcp | 🟡 中 |

---

## 3. UI 显示方案设计

### 3.1 新增 Entry Type

扩展 `StepEntryType` 以支持更多工具类别：

```typescript
export type StepEntryType = 
    | 'file'      // 文件操作
    | 'command'   // Shell 命令
    | 'search'    // 搜索操作
    | 'browser'   // 网络/浏览器
    | 'task'      // 子代理/任务
    | 'plan'      // 计划/TODO (新增)
    | 'mcp'       // MCP 工具 (新增)
    | 'notebook'  // Notebook 操作 (新增)
    | 'other';    // 其他
```

### 3.2 完整 ACTION_MAP 更新

```typescript
const ACTION_MAP: Record<string, ActionInfo> = {
    // ========== 文件操作 ==========
    'Read': { actionKey: 'StepProgress.Analyzed', type: 'file' },
    'read_file': { actionKey: 'StepProgress.Analyzed', type: 'file' },
    'view_file': { actionKey: 'StepProgress.Analyzed', type: 'file' },
    'view_file_outline': { actionKey: 'StepProgress.Explored', type: 'file' },
    
    'Write': { actionKey: 'StepProgress.Created', type: 'file' },
    'write_to_file': { actionKey: 'StepProgress.Created', type: 'file' },
    
    'Edit': { actionKey: 'StepProgress.Edited', type: 'file' },
    'replace_file_content': { actionKey: 'StepProgress.Edited', type: 'file' },
    'multi_replace_file_content': { actionKey: 'StepProgress.Edited', type: 'file' },
    
    'list_dir': { actionKey: 'StepProgress.Listed', type: 'file' },
    
    // ========== Notebook ==========
    'NotebookEdit': { actionKey: 'StepProgress.Edited', type: 'notebook' },
    
    // ========== 搜索操作 ==========
    'Glob': { actionKey: 'StepProgress.Located', type: 'search' },
    'Grep': { actionKey: 'StepProgress.Searched', type: 'search' },
    'grep_search': { actionKey: 'StepProgress.Searched', type: 'search' },
    'find_by_name': { actionKey: 'StepProgress.Located', type: 'search' },
    'codebase_search': { actionKey: 'StepProgress.Searched', type: 'search' },
    
    // ========== Shell 命令 ==========
    'Bash': { actionKey: 'StepProgress.Executed', type: 'command' },
    'run_command': { actionKey: 'StepProgress.Executed', type: 'command' },
    'BashOutput': { actionKey: 'StepProgress.Fetched', type: 'command' },
    'KillShell': { actionKey: 'StepProgress.Stopped', type: 'command' },
    'command_status': { actionKey: 'StepProgress.Checked', type: 'command' },
    'send_command_input': { actionKey: 'StepProgress.Executed', type: 'command' },
    
    // ========== 网络/浏览器 ==========
    'WebSearch': { actionKey: 'StepProgress.Searched', type: 'browser' },
    'browser_subagent': { actionKey: 'StepProgress.Browsed', type: 'browser' },
    'read_url_content': { actionKey: 'StepProgress.Fetched', type: 'browser' },
    'read_browser_page': { actionKey: 'StepProgress.Browsed', type: 'browser' },
    
    // ========== 子代理/任务 ==========
    'Task': { actionKey: 'StepProgress.Delegated', type: 'task' },
    'task_boundary': { actionKey: 'StepProgress.Planned', type: 'task' },
    
    // ========== 计划/TODO ==========
    'TodoWrite': { actionKey: 'StepProgress.Planned', type: 'plan' },
    'ExitPlanMode': { actionKey: 'StepProgress.Planned', type: 'plan' },
    
    // ========== 扩展工具 ==========
    'Skill': { actionKey: 'StepProgress.Invoked', type: 'other' },
    'SlashCommand': { actionKey: 'StepProgress.Invoked', type: 'other' },
    
    // ========== 其他 ==========
    'notify_user': { actionKey: 'StepProgress.Notified', type: 'other' },
    'generate_image': { actionKey: 'StepProgress.Generated', type: 'other' },
};
```

### 3.3 MCP 工具动态处理

```typescript
/**
 * Get action info for MCP tools
 * Format: mcp__<server>__<tool>
 */
function getMcpActionInfo(toolName: string): ActionInfo {
    const parts = toolName.split('__');
    if (parts.length < 3) return { actionKey: 'StepProgress.Invoked', type: 'mcp' };
    
    const tool = parts.slice(2).join('__').toLowerCase();
    
    // 根据工具名推断动作
    if (tool.includes('read') || tool.includes('get') || tool.includes('fetch')) {
        return { actionKey: 'StepProgress.Fetched', type: 'mcp' };
    }
    if (tool.includes('write') || tool.includes('create') || tool.includes('post')) {
        return { actionKey: 'StepProgress.Created', type: 'mcp' };
    }
    if (tool.includes('search') || tool.includes('query') || tool.includes('find')) {
        return { actionKey: 'StepProgress.Searched', type: 'mcp' };
    }
    if (tool.includes('analyze') || tool.includes('process')) {
        return { actionKey: 'StepProgress.Analyzed', type: 'mcp' };
    }
    
    return { actionKey: 'StepProgress.Invoked', type: 'mcp' };
}

export function getActionInfo(toolName: string): ActionInfo {
    // Handle MCP tools
    if (toolName.startsWith('mcp__')) {
        return getMcpActionInfo(toolName);
    }
    
    return ACTION_MAP[toolName] ?? { actionKey: 'StepProgress.Invoked', type: 'other' };
}
```

### 3.4 Target 信息提取增强

```typescript
export function extractTargetInfo(toolCall: ToolCall): TargetInfo {
    const input = toolCall.input;
    const name = toolCall.name;
    
    // ... existing file/command extractions ...
    
    // Glob - 提取 pattern
    if (name === 'Glob') {
        const pattern = (input as any)?.pattern ?? (input as any)?.Pattern;
        if (pattern) {
            return { name: pattern, fullPath: pattern };
        }
    }
    
    // Grep - 提取 pattern 和 path
    if (name === 'Grep') {
        const pattern = (input as any)?.pattern ?? (input as any)?.Pattern;
        const path = (input as any)?.path ?? (input as any)?.Path ?? '.';
        if (pattern) {
            return { name: `"${truncate(pattern, 30)}" in ${extractFileName(path)}`, fullPath: path };
        }
    }
    
    // WebSearch - 提取 query
    if (name === 'WebSearch') {
        const query = (input as any)?.query ?? (input as any)?.Query;
        if (query) {
            return { name: truncate(query, 40), fullPath: query };
        }
    }
    
    // Task - 提取 description 或 subagent_type
    if (name === 'Task') {
        const desc = (input as any)?.description;
        const subagentType = (input as any)?.subagent_type ?? (input as any)?.subagentType;
        return { 
            name: desc ? truncate(desc, 50) : (subagentType ?? 'Task'),
            fullPath: desc,
        };
    }
    
    // TodoWrite - 显示任务数量
    if (name === 'TodoWrite') {
        const tasks = (input as any)?.tasks ?? (input as any)?.todos ?? [];
        const count = Array.isArray(tasks) ? tasks.length : 0;
        return { name: `${count} task${count !== 1 ? 's' : ''}` };
    }
    
    // MCP tools - 提取服务器和工具名
    if (name.startsWith('mcp__')) {
        const parts = name.split('__');
        const server = parts[1] || 'unknown';
        const tool = parts.slice(2).join('__') || name;
        return { name: `${server}:${tool}` };
    }
    
    // NotebookEdit - 提取路径和 cell index
    if (name === 'NotebookEdit') {
        const path = (input as any)?.path;
        const cellIndex = (input as any)?.cellIndex;
        if (path) {
            return {
                name: extractFileName(path) + (cellIndex !== undefined ? ` [cell ${cellIndex}]` : ''),
                fullPath: path,
            };
        }
    }
    
    return { name: toolCall.name };
}
```

---

## 4. 新增 i18n 键

### 4.1 英文 (en-US.ts)

```typescript
StepProgress: {
    // ... existing ...
    
    // New actions
    Delegated: 'Delegated',
    Stopped: 'Stopped',
    
    // Types
    TypeFile: 'File',
    TypeCommand: 'Command',
    TypeSearch: 'Search',
    TypeBrowser: 'Web',
    TypeTask: 'Task',
    TypePlan: 'Plan',
    TypeMcp: 'MCP',
    TypeNotebook: 'Notebook',
    TypeOther: 'Tool',
},
```

### 4.2 中文 (zh-CN.ts)

```typescript
StepProgress: {
    // ... existing ...
    
    // New actions
    Delegated: '委派',
    Stopped: '停止',
    
    // Types
    TypeFile: '文件',
    TypeCommand: '命令',
    TypeSearch: '搜索',
    TypeBrowser: '网络',
    TypeTask: '任务',
    TypePlan: '计划',
    TypeMcp: 'MCP',
    TypeNotebook: '笔记本',
    TypeOther: '工具',
},
```

---

## 5. 图标系统增强

### 5.1 类型图标映射

```typescript
const TYPE_ICONS: Record<StepEntryType, string> = {
    file: 'FileIcon',
    command: 'TerminalIcon',
    search: 'SearchIcon',
    browser: 'GlobeIcon',
    task: 'RocketIcon',
    plan: 'ListCheckIcon',
    mcp: 'PlugIcon',
    notebook: 'NotebookIcon',
    other: 'ToolIcon',
};
```

### 5.2 需新增的图标

| 图标名 | 用途 | 建议来源 |
|--------|------|----------|
| `RocketIcon` | Task 子代理 | Lucide `rocket` |
| `ListCheckIcon` | TodoWrite/Plan | Lucide `list-checks` |
| `PlugIcon` | MCP 工具 | Lucide `plug` |
| `NotebookIcon` | NotebookEdit | Lucide `book-open` |

---

## 6. 特殊工具 UI 处理

### 6.1 Task (子代理) 的展示

Task 工具需要特殊处理，因为它会启动子代理并产生嵌套的工具调用。

**展示方案：**
1. 当检测到 `Task` 工具时，创建一个可折叠的"子任务"区块
2. 后续具有相同 `parent_tool_use_id` 的工具调用归入该区块
3. 展示子代理类型 (如 `Explore`, `CodeReview`)

```typescript
interface TaskStepEntry extends StepEntry {
    subagentType?: string;
    childEntries?: StepEntry[];
}
```

**UI 效果：**
```
▶ Task: Explore codebase
   ├─ Read package.json
   ├─ Glob **/*.ts
   └─ Read src/index.ts
```

### 6.2 TodoWrite (任务列表) 的展示

TodoWrite 产生的任务列表需要结构化展示。

**展示方案：**
1. 在 Step Progress 中显示为"计划"类型
2. 点击展开后显示任务列表，支持嵌套
3. 任务状态用不同颜色/图标区分

**UI 效果：**
```
▼ Planned 5 tasks
   ☑ Implement login API         [completed]
   ◷ Add validation              [in_progress]
   ○ Write tests                 [pending]
   ○ Update documentation        [pending]
   ✗ Deploy to staging           [failed]
```

### 6.3 MCP 工具的展示

MCP 工具需要显示服务器来源。

**展示方案：**
1. 图标使用 `PlugIcon`
2. 显示格式：`[server] tool_name`
3. 悬停显示完整工具名

**UI 效果：**
```
🔌 Fetched [web_reader] webReader
   URL: https://example.com
```

### 6.4 Bash 命令的展示

Bash 命令需要特殊处理：
- 等待确认的显示"待审批"状态
- 后台命令显示"后台运行"状态
- 长命令显示截断，点击展开

**UI 效果：**
```
⚡ Executed npm install
   ├─ Status: completed (2.3s)
   └─ Output: 147 packages installed

⏳ Pending npm run build
   [Approve] [Reject]
```

---

## 7. 输出结果展示优化

### 7.1 结果类型识别

```typescript
type ResultDisplayType = 
    | 'text'        // 普通文本
    | 'json'        // JSON 对象
    | 'files'       // 文件列表
    | 'diff'        // 差异对比
    | 'error'       // 错误信息
    | 'search'      // 搜索结果
    | 'truncated';  // 截断内容

function detectResultType(result: unknown): ResultDisplayType {
    if (!result) return 'text';
    if (typeof result === 'string') {
        if (result.startsWith('Error:') || result.includes('error')) return 'error';
        if (result.length > 5000) return 'truncated';
        return 'text';
    }
    if (Array.isArray(result)) {
        if (result.every(r => typeof r === 'string' && r.includes('/'))) return 'files';
        return 'json';
    }
    return 'json';
}
```

### 7.2 结果渲染组件

```typescript
function ToolResultDisplay({ result, type }: { result: unknown; type: ResultDisplayType }) {
    switch (type) {
        case 'files':
            return <FileListResult files={result as string[]} />;
        case 'search':
            return <SearchResult matches={result as SearchMatch[]} />;
        case 'diff':
            return <DiffView diff={result as string} />;
        case 'error':
            return <ErrorResult message={result as string} />;
        case 'truncated':
            return <TruncatedResult content={result as string} />;
        case 'json':
            return <JsonView data={result} />;
        default:
            return <TextResult text={String(result)} />;
    }
}
```

---

## 8. 实施计划

### Phase 1: 工具映射完善 (0.5 天)
- [ ] 更新 `actionMapper.ts` 添加所有工具
- [ ] 更新 `extractTargetInfo` 支持新工具
- [ ] 添加 MCP 动态处理

### Phase 2: i18n 和图标 (0.5 天)
- [ ] 添加新的 i18n 键
- [ ] 添加新图标组件 (Rocket, ListCheck, Plug, Notebook)
- [ ] 更新类型图标映射

### Phase 3: Task 子代理 UI (1 天)
- [ ] 实现 Task 嵌套展示
- [ ] 处理 `parent_tool_use_id` 关联
- [ ] 子代理类型标签

### Phase 4: TodoWrite UI (0.5 天)
- [ ] 实现任务列表折叠展示
- [ ] 任务状态图标
- [ ] 嵌套任务支持

### Phase 5: 结果展示优化 (1 天)
- [ ] 结果类型检测
- [ ] 文件列表渲染
- [ ] 搜索结果高亮
- [ ] 长内容截断

**预计总工期**: 3.5 天

---

## 9. 验证清单

- [ ] 所有 15+ 内置工具正确映射
- [ ] MCP 工具动态识别正常
- [ ] Task 子代理嵌套显示正确
- [ ] TodoWrite 任务列表渲染正确
- [ ] Bash 确认 UI 可用
- [ ] 图标正确显示
- [ ] i18n 中英文完整
- [ ] 长结果正确截断
- [ ] 错误状态清晰可辨

---

## 10. 附录：工具输入/输出示例

### A. Read 工具

```json
// Input
{ "path": "/src/index.ts", "StartLine": 1, "EndLine": 50 }

// Output
"import React from 'react';\n..."
```

### B. Task 工具

```json
// Input
{
    "description": "Explore the authentication system",
    "prompt": "Analyze auth flow and list files",
    "subagent_type": "Explore"
}

// Output
{
    "summary": "Found 5 auth-related files",
    "files": ["auth.ts", "login.tsx", ...]
}
```

### C. TodoWrite 工具

```json
// Input
{
    "tasks": [
        { "id": "t1", "content": "Implement login", "status": "pending" },
        { "id": "t2", "content": "Add tests", "status": "pending" }
    ]
}

// Output (通常无输出或确认信息)
"Tasks updated successfully"
```

### D. MCP 工具 (web_reader)

```json
// Input
{ "url": "https://example.com" }

// Output
{
    "title": "Example Domain",
    "content": "This domain is for use in...",
    "links": ["https://www.iana.org/domains/example"]
}
```
