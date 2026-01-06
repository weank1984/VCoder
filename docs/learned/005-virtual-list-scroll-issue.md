# 005 - 虚拟列表滚动问题

## 问题现象

加载历史对话后，向下滑动时出现卡顿、闪现、无法继续加载。

## 根本原因

**虚拟列表 (Virtual List) 与会话切换的状态不同步**

| 问题点 | 原因 | 影响 |
|--------|------|------|
| scrollTop 未重置 | 加载新会话时滚动位置保留旧值 | 从错误位置计算可见区域 |
| 全局高度缓存 | 按 index 缓存不区分会话 | 跨会话高度混淆 |
| 高度估算偏差 | 估算 120px，实际可能 400-600px | padding 计算严重失真 |
| 容器 ref 切换 | 虚拟/普通模式使用不同 ref | 自动滚动失效 |

## 解决方案

### 1. 为虚拟列表添加 reset 函数

```typescript
const reset = useCallback(() => {
    setScrollTop(0);
    heightCache.clear();
    if (containerRef.current) {
        containerRef.current.scrollTop = 0;
    }
}, []);
```

### 2. 历史模式禁用虚拟列表

```typescript
// 历史模式禁用虚拟列表，避免高度估算问题
const useVirtual = viewMode === 'live' && messages.length > VIRTUAL_LIST_THRESHOLD;
```

### 3. 会话切换时重置状态

```typescript
useEffect(() => {
    resetVirtualList();
    if (containerRef.current) {
        containerRef.current.scrollTop = 0;
    }
}, [currentSessionId, resetVirtualList]);
```

## 经验总结

1. **虚拟列表适合流式/渐进式内容**，不适合一次性加载大量内容（如历史对话）
2. **全局状态缓存需要按上下文 key 管理**，避免跨场景污染
3. **状态切换时必须重置相关副作用**，特别是 scrollTop、缓存等
4. **高度估算需要保守**，或在首次渲染时禁用虚拟化

## 修改文件

- `packages/extension/webview/src/hooks/useVirtualList.ts`
- `packages/extension/webview/src/App.tsx`
