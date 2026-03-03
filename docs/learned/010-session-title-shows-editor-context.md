# Issue #010: 会话标题显示编辑器上下文元数据

**日期**: 2026-03-03
**状态**: ✅ 已解决

## 问题描述

新对话的标题显示为 `[Active file: lib/apiClient.ts, cursor at line 11]...` 等原始编辑器上下文信息，而不是用户实际输入的内容。

### 症状

- 近期会话列表中，标题显示 `[Active file: xxx, cursor at line N]...`
- 有时还包含 `[Diagnostics: ...]` 前缀
- 实际用户消息（如 "hi"、"你好"）被挤出了 50 字符截断范围

## 根因分析

### 数据流

```
用户输入 "hi"
  ↓
VSCode Extension (webviewMessageRouter.ts:68-85)
  自动注入编辑器上下文:
  "[Active file: lib/apiClient.ts, cursor at line 11]\n\nhi"
  ↓
ACP Server (server.ts:432-441)
  取前 50 字符作为标题 → "[Active file: lib/apiClient.ts, cursor at line 11]..."
  ↓
UI 显示异常标题
```

### 关键代码路径

1. **上下文注入** — `apps/vscode-extension/src/services/webviewMessageRouter.ts:68-85`
   - VSCode 扩展在发送 prompt 前，自动将 `[Active file: ...]` 和 `[Diagnostics: ...]` 前缀拼接到用户消息前面

2. **标题提取（活跃会话）** — `packages/server/src/acp/server.ts` 的 `handlePrompt` 和 `handlePromptPersistent`
   - 直接对 `params.content.trim()` 取前 50 字符，未剥离上下文前缀

3. **标题提取（历史会话）** — `packages/server/src/history/transcriptStore.ts` 的 `extractSessionMetadata` 和 `extractMetadataFromLargeFile`
   - 从 JSONL 转录文件中读取第一条用户消息作为标题，同样未剥离上下文前缀

4. **标题清理（UI 层）** — `packages/ui/src/utils/sanitizeTitle.ts`
   - 只剥离了 `<xml>` 标签（尖括号），未处理 `[方括号]` 上下文前缀

## 修复方案

在 3 个层级都添加了 `[Active file: ...]` / `[Diagnostics: ...]` 前缀剥离：

### 1. Server 端 — `server.ts`

新增 `stripEditorContextForTitle()` 函数，在 `handlePrompt` 和 `handlePromptPersistent` 中提取标题前调用。

### 2. History 端 — `transcriptStore.ts`

同样新增 `stripEditorContextForTitle()` 函数，在 `extractSessionMetadata` 和 `extractMetadataFromLargeFile` 中提取标题前调用。

### 3. UI 端 — `sanitizeTitle.ts`

新增 `stripEditorContext()` 函数并在 `sanitizeSessionTitle()` 中调用，作为最后一道防线。

### 剥离逻辑

```typescript
function stripEditorContextForTitle(content: string): string {
    let result = content;
    // 循环移除开头的 [Active file: ...] 和 [Diagnostics: ...] 块
    while (result.length > 0) {
        const match = result.match(/^\[(?:Active file|Diagnostics)[^\]]*\]\s*/s);
        if (!match) break;
        result = result.slice(match[0].length);
    }
    return result.trim();
}
```

## 经验教训

1. **上下文注入与标题提取之间存在耦合** — 当扩展层向消息注入元数据前缀时，所有下游使用消息内容的地方都需要感知并处理这些前缀。
2. **防御性编程需要多层** — 在 server 端和 UI 端都做了清理，确保即使某一层遗漏，标题依然正确。
3. **已有的 `classifyUserContent()` 只检测 XML 标签** — 它识别 `<system-reminder>`、`<teammate-message>` 等 XML 格式的内部消息，但不识别 `[方括号]` 格式的编辑器上下文。这是两种不同的内部消息格式。
4. **如果未来添加新的上下文前缀格式**，需要同步更新 `stripEditorContextForTitle` 的正则匹配模式。

## 涉及文件

| 文件 | 修改 |
|------|------|
| `packages/server/src/acp/server.ts` | `handlePrompt`/`handlePromptPersistent` 使用 `stripEditorContextForTitle` |
| `packages/server/src/history/transcriptStore.ts` | `extractSessionMetadata`/`extractMetadataFromLargeFile` 使用 `stripEditorContextForTitle` |
| `packages/ui/src/utils/sanitizeTitle.ts` | 新增 `stripEditorContext`，`sanitizeSessionTitle` 中调用 |
