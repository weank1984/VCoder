# 工具调用分组汇总功能

## 概述

实现了类似 Cursor 的工具调用分组汇总显示功能，当一个步骤包含多个工具调用时，在折叠状态下显示汇总统计信息，而不是逐个列出每个工具调用。

## 设计目标

### 用户体验
- **减少视觉杂乱**: 多个相似操作合并为一行汇总信息
- **快速扫描**: 用户可以快速了解 AI 执行了什么操作
- **按需展开**: 点击可展开查看具体操作细节

### UI 风格
遵循 Cursor 的设计风格：
```
折叠状态: Explored 3 files 2 searches
展开状态: 
  - Grepped bash|command [type:tsx]
  - Grepped Shell|执行命令 [type:tsx]
  - Searched Where is bash command...
```

## 分组策略说明

### 为什么要自动分组？

**问题**: 如果不分组，UI 会显示大量重复的条目：
```
❌ 不分组的效果：
分析了 apiClient.ts     ✓
分析了 next.config.ts   ✓
分析了 tailwind.config.js ✓
分析了 site.ts          ✓
（占用4行，视觉杂乱）
```

**解决方案**: 自动分组相同类型的操作：
```
✅ 分组后的效果：
分析了 4 个文件 ✓
（只占1行，点击展开查看详情）
```

### 什么操作应该分组？

**只读操作**应该分组（信息查询类）：
- ✅ Read（读取文件）
- ✅ Grep（搜索内容）
- ✅ Glob（查找文件）
- ✅ Search（语义搜索）
- ✅ List（列出目录）

**原因**: 这些操作本质上是"收集信息"，用户关心的是"读了多少个文件"而不是每个文件的细节。

### 什么操作应该独立？

**修改操作**应该保持独立（有副作用）：
- ❌ Bash（执行命令）- 有输出需要查看
- ❌ Write/Edit（修改文件）- 需要审查差异
- ❌ TodoWrite（任务规划）- 需要查看计划

**原因**: 这些操作有重要的输出或副作用，用户需要逐个查看和确认。

### 分组边界

分组会在以下情况中断：
1. **操作类型改变**: Read → Grep 会创建新步骤
2. **遇到独立操作**: Read → Bash → Read 会创建3个步骤
3. **遇到 task_boundary**: 显式的任务边界

```
示例：
Read file1.ts  ┐
Read file2.ts  ├─ 步骤1: "分析了 2 个文件"
Bash: npm test ── 步骤2: "执行了 npm test"
Read file3.ts ─── 步骤3: "分析了 file3.ts"
```

## 实现细节

### 1. 智能分组逻辑 (`aggregateToSteps`)

#### 自动分组规则
连续的相同类型操作会自动分组到一个步骤中：

- **可分组的操作**: Read, Grep, Glob, Search 等只读操作
- **独立步骤的操作**: Bash命令, Write/Edit文件操作, TodoWrite任务管理

```typescript
// 示例：4个连续的 Read 操作会被分组
Read apiClient.ts
Read next.config.ts      } → 自动分组为一个步骤
Read tailwind.config.js  }   显示："分析了 4 个文件"
Read site.ts
```

#### 分组条件
两个工具调用可以分组当且仅当：
1. 工具类型相同（都是 file、search 等）
2. 动作相同（都是 Analyzed、Searched 等）
3. 都不是独立步骤类型（非 Bash、Write 等）

### 2. 汇总显示逻辑 (`generateToolCallsSummary`)

#### 汇总规则
- 按工具类型（file, search, command 等）统计数量
- 按预定义顺序排序: file > search > command > browser > task > plan > mcp > notebook > other

#### 显示规则

**情况 1: 所有操作类型相同**
```typescript
// 3个Read操作 -> "Analyzed 3 files"
// 2个Grep操作 -> "2 searches"
```

**情况 2: 混合操作类型**
```typescript
// 3个Read + 2个Grep -> "Explored 3 files 2 searches"
// 第一个组显示动作，后续组只显示数量
```

### 2. 显示时机

```typescript
const displayTitle = useMemo(() => {
    // 单个工具调用: "Analyzed main.py"
    if (step.isSingleEntry && step.entries.length === 1) {
        return `${actionText} ${target.name}`;
    }
    
    // 多个工具调用且折叠: "Explored 3 files 2 searches"
    if (isCollapsed && step.entries.length > 1) {
        return generateToolCallsSummary(step.entries, t);
    }
    
    // 默认: 使用步骤标题
    return step.title;
}, [step, t, isCollapsed]);
```

### 3. 样式更新

添加了 `.aggregated` 样式类来区分汇总显示和普通标题：

```scss
.step-title {
    &.aggregated {
        font-weight: 400;
        color: var(--vcoder-text-secondary);
    }
}
```

## 示例场景

### 场景 1: 文件分析（自动分组）
```
输入：4个连续的 Read 操作
- Read apiClient.ts
- Read next.config.ts
- Read tailwind.config.js
- Read site.ts

输出：1个步骤，折叠显示
折叠: 分析了 4 个文件 ✓
展开:
  - Read apiClient.ts
  - Read next.config.ts
  - Read tailwind.config.js
  - Read site.ts
```

### 场景 2: 混合操作（自动分组）
```
输入：混合类型的操作
- Grepped bash|command [type:tsx]
- Grepped Shell|执行命令 [type:tsx]
- Searched "terminal output"
- Read TerminalOutput.tsx
- Read TerminalOutput.scss

输出：2个步骤
步骤1 - 折叠: 浏览了 3 files 2 searches
步骤2 - 折叠: 分析了 2 个文件
```

### 场景 3: 命令执行（保持独立）
```
输入：2个 Bash 命令
- Bash: npm install
- Bash: npm run build

输出：2个独立步骤
步骤1 - 折叠: 执行了 npm install
步骤2 - 折叠: 执行了 npm run build

原因：命令执行应该保持独立，便于查看输出
```

### 场景 4: 文件编辑（保持独立）
```
输入：2个 Edit 操作
- Edit main.ts (+5 -2)
- Edit utils.ts (+3 -1)

输出：2个独立步骤
步骤1 - 折叠: 编辑了 main.ts
步骤2 - 折叠: 编辑了 utils.ts

原因：文件修改应该保持独立，便于审查差异
```

## 国际化支持

所有汇总文本都使用 i18n 系统：

**英文**
- "Analyzed 3 files"
- "2 searches"
- "Executed 1 command"

**中文**
- "分析了 3 个文件"
- "2 次搜索"
- "执行了 1 个命令"

## 技术细节

### 相关文件
- `packages/extension/webview/src/components/StepProgress/StepItem.tsx` - 主要实现
- `packages/extension/webview/src/components/StepProgress/index.scss` - 样式
- `packages/extension/webview/src/i18n/locales/zh-CN.ts` - 中文翻译
- `packages/extension/webview/src/i18n/locales/en-US.ts` - 英文翻译

### 性能考虑
- 使用 `useMemo` 缓存汇总计算结果
- 仅在折叠状态且有多个工具调用时才进行汇总
- 避免不必要的重新渲染

## 未来改进

1. **更智能的分组**: 考虑工具调用的上下文关系
2. **动画过渡**: 添加展开/折叠动画
3. **自定义汇总规则**: 允许用户配置汇总显示规则
4. **更详细的预览**: 在汇总行显示更多上下文信息

## 参考

- Cursor 对话流 UI 设计
- Claude AI Assistant 工具调用展示
