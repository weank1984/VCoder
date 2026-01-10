## 2024-05-22 - Missing React.memo in Chat Components
**Learning:** Even if documentation or memory claims that components are "relied on" for performance via `React.memo`, always verify the implementation. In this codebase, `ChatBubble`, `MarkdownContent`, and `VirtualMessageItem` were documented as using `React.memo` but were implemented as standard functional components.
**Action:** Always check the component definition line when investigating React performance issues. Memoizing markdown rendering (`MarkdownContent`) provides significant savings during streaming updates of other messages.
