# Think 块增量流式传输

## 日期
2026-02-23

## 问题

1. **Think 块不是增量显示**：Server 端把 `thinking_delta` 累积成完整字符串，每 150ms 节流发送完整内容，UI 端整体替换。而 Text 块是 delta 直接转发 + UI 端 RAF 缓冲追加，有流畅打字机效果。

2. **Think 块重复文字风险**：`content_block_stop` 发送完整累积内容，`assistant` 事件也包含完整 thinking。虽有 `receivedStreamingThinking` 标志位去重，但 150ms 节流定时器回调可能与 `content_block_stop` 产生竞争，加上每次发送的是完整累积字符串，去重一旦失败就是整段重复。

## 解决方案

让 Think 走和 Text 完全一样的增量管线：

### Server 端 (`wrapper.ts`)
- `thinking_delta`：直接 emit delta 文本 `{ content: delta, isComplete: false }`，不累积
- `content_block_stop`：emit `{ content: '', isComplete: true }` 标记完成
- 删除 3 个不再需要的 Map：`thinkingContentByLocalSessionId`、`thinkingThrottleTimerByLocalSessionId`、`thinkingLastEmitTimeByLocalSessionId`
- 保留 `receivedStreamingThinkingByLocalSessionId` 用于 assistant 事件去重

### UI 端
- `helpers.ts`：新增 `queueThoughtUpdate` / `flushThoughtBuffer` 函数，复用 text 的 RAF + 自适应节流模式
- `helpers.ts`：`appendContentBlock` 中 thought 分支改为追加模式（`existing.content + block.content`）
- `messagesSlice.ts`：`setThought` 改为追加模式（`target.thought = (target.thought || '') + thought`）
- `messagesSlice.ts`：新增 `setThoughtComplete` action，仅设置 `thoughtIsComplete = true`
- `updateSlice.ts`：thought dispatch 走缓冲，完成时 flush + setThoughtComplete

## 关键设计决策

- 复用 text 的 RAF 缓冲模式（MIN_FLUSH_INTERVAL=16ms, MAX_BUFFER_SIZE=100），保证 UI 流畅
- 从根本上消除累积状态和节流定时器，避免竞争条件导致的重复
- assistant 事件回退路径保持不变，兼容不支持 streaming 的 CLI
