## 2024-05-23 - React.memo Optimization
**Learning:** `React.memo` is critical for list items in a virtualized list, even if the list itself is virtualized. Without it, adding a new item can cause all visible items to re-render if the parent state updates, defeating some benefits of virtualization. `MarkdownContent` is particularly expensive due to regex/parsing, so memoizing it provides significant wins.
**Action:** Always verify if expensive components inside a list (especially those with complex rendering logic like Markdown) are memoized.
