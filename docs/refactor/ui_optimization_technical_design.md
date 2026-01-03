# UI 优化方案技术文档（Webview）

本文档面向 `packages/extension/webview` 的 UI 重构/优化落地，目标是把 `docs/refactor/ui_analysis_report.md` 中发现的问题，转化为可实现、可验收、可迭代的技术方案。必要处给出伪代码/接口草案，便于直接实现。

## 1. 背景与范围

**当前 Webview UI 所在目录**
- Webview 前端：`packages/extension/webview/*`
- VSCode 注入与资源加载：`packages/extension/src/providers/chatViewProvider.ts`

**参考实现（用于“做法借鉴”，非直接迁移）**
- `demo/webview/*`

**约束**
- VSCode Webview CSP：默认 `default-src 'none'`，脚本走 `nonce`，静态资源需要 `webview.asWebviewUri()`。
- 性能：VSCode 扩展宿主环境中 GPU/CPU 资源有限，长会话与流式更新需避免频繁 reflow/重渲染。
- 安全：Markdown/HTML 渲染必须明确 XSS 策略。

## 2. 目标与非目标

**目标**
1. 主题一致：亮/暗/高对比主题下视觉一致，变量体系统一，消除未定义 token 与硬编码。
2. 滚动可控：流式输出时不干扰用户上翻阅读，提供“跳到最新”。
3. Markdown 能力增强：GFM（表格/任务列表/删除线/自动链接）、代码块体验（复制/插入编辑器）、高亮随主题切换。
4. 性能可扩展：长会话可用（虚拟列表/增量渲染/批处理），流式 UI 不抖动。
5. 可观测：启动异常可定位（ErrorBoundary）、性能基本指标可采集（TTI/渲染耗时）。
6. 可维护：减少样式入口冲突、减少副作用散落、形成可复用的基础组件/规范。

**非目标（本期不做或延后）**
- 全量迁移到 `demo/webview` 的 Thread/Turn/Item 协议模型（可作为后续增强）。
- 引入复杂 UI 框架（优先保持依赖轻量）。

---

## 3. 现状摘要（与问题对应）

### 3.1 变量/主题
- `packages/extension/webview/src/styles/theme.scss` 已定义 `--vc-*` tokens（与 demo 接近）。
- 但同时存在另一套 `--vcoder-*` tokens（`packages/extension/webview/src/index.scss`），且 `packages/extension/webview/src/styles/index.scss` 中引用了未定义的 `--vc-text-color`。
- `--vc-bg-container` 被多处引用，但未在 token 中定义（影响气泡/背景）。

### 3.2 Markdown/代码块
- `packages/extension/webview/src/components/MarkdownContent.tsx` 使用 `react-markdown` + `react-syntax-highlighter`，并固定 `vscDarkPlus`，亮色主题体验差。
- 未启用 `remark-gfm`，表格/任务列表/删除线/自动链接能力不足。
- 用户消息未渲染 Markdown（仅 assistant 渲染）。

### 3.3 自动滚动
- `packages/extension/webview/src/App.tsx` 中 `useEffect([messages]) => scrollIntoView(smooth)`，会强制把用户拉回底部。

---

## 4. 总体方案概览（分层）

1. **Design Tokens 层（CSS）**
   - 统一 `--vc-*` 为唯一主题 token 体系；如保留 `--vcoder-*`，则明确边界并做桥接映射。
2. **Theme 感知层（JS 可选）**
   - 仅当组件需要 JS 感知主题（例如选择高亮 theme、Mermaid）时，增加 `useVscodeThemeMode()`。
3. **渲染层（React）**
   - Markdown：统一渲染管线与组件（GFM + 代码块 actions + 主题高亮）。
   - 列表：改造消息列表为“底部吸附可控”并预留虚拟列表接口。
4. **性能层**
   - 流式消息批处理：将高频 updates 合并到 rAF/节流周期，减少 setState 次数与布局次数。
5. **可观测层**
   - ErrorBoundary + TTI + ready 事件回传（webview -> extension）。
6. **持久化层（VSCode state）**
   - 持久化 `model/planMode/currentSessionId/draft/showHistory` 等 UI 状态，reload 后恢复。

---

## 5. 详细设计

### 5.1 主题与 Design Tokens 统一（P0）

**原则**
- `theme.scss` 是“唯一真源”，组件只消费 `--vc-*`。
- 所有组件使用的 token 必须在 `theme.scss` 中有定义（或提供 fallback）。

**建议改造**
1) 统一 text token：
- 将 `packages/extension/webview/src/styles/index.scss` 中的 `color: var(--vc-text-color);` 替换为 `var(--vc-color-text)`（对齐 `theme.scss`）。

2) 补齐容器背景 token：
- 在 `packages/extension/webview/src/styles/theme.scss` 为亮/暗主题补充：
  - `--vc-bg-container: var(--vscode-editorWidget-background, var(--vscode-editor-background));`
  -（可选）`--vc-bg-elevated`、`--vc-bg-surface` 等，明确使用场景。

3) 清理/桥接 `--vcoder-*`：
- `packages/extension/webview/src/index.scss` 定义的 `--vcoder-*` 若继续使用，需要提供桥接：
  - `--vcoder-surface: var(--vc-bg);`
  - `--vcoder-border: var(--vc-color-border-secondary);`
- 或者：将 `index.scss` 的 root token 精简为 reset + `color-scheme`，避免与 `--vc-*` 体系混用。

**验收**
- 在 VSCode 亮/暗主题下：气泡背景、输入框、计划块、工具块、链接颜色均无“透明/黑块/对比度过低”现象。

---

### 5.2 Theme 感知（P0/P1）

需要 JS 感知主题的典型场景：
- 选择 SyntaxHighlighter 的亮/暗 theme
- Mermaid（若后续引入）根据主题切换渲染

**伪代码：useVscodeThemeMode**
```ts
type ThemeMode = 'light' | 'dark';

function getModeFromBodyClass(classList: DOMTokenList): ThemeMode {
  if (classList.contains('vscode-light') || classList.contains('vscode-high-contrast-light')) return 'light';
  return 'dark';
}

export function useVscodeThemeMode(): ThemeMode {
  const [mode, setMode] = useState(() => getModeFromBodyClass(document.body.classList));
  useEffect(() => {
    const obs = new MutationObserver(() => setMode(getModeFromBodyClass(document.body.classList)));
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return mode;
}
```

---

### 5.3 Markdown/GFM 与代码块交互（P0/P1）

**目标**
- assistant / user 消息渲染规则一致（至少支持相同的 Markdown 能力开关）。
- GFM：表格、任务列表、删除线、自动链接。
- 代码块：复制 + 插入编辑器（通过 webview message）。
- 高亮主题随 VSCode 主题切换。
- 流式更新期间尽量避免 code block 重渲染抖动。

**建议实现**
1) Markdown 管线
- 增加 `remark-gfm`（依赖增加可控）。
- 默认不启用 `rehype-raw`（避免直接渲染 HTML）。

2) 代码高亮 theme 自适配（伪代码）
```ts
import { vscDarkPlus, vscLightPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
const theme = mode === 'light' ? vscLightPlus : vscDarkPlus;
```

3) 代码块 actions：复制 + 插入编辑器
- Webview -> Extension message：
  - `postMessage({ type: 'insertText', text })`
- Extension 侧处理：
  - 使用 `vscode.window.activeTextEditor?.insertSnippet(...)` 或 `TextEditorEdit.insert(...)`。

**伪代码：Insert**
```ts
// webview
postMessage({ type: 'insertText', text: codeString });

// extension
case 'insertText': {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  await editor.edit((edit) => edit.insert(editor.selection.active, message.text));
  break;
}
```

4) 流式友好渲染策略（两档）
- 轻量档（先做）：当 `isComplete=false` 时减少重型渲染（例如代码块折叠/延迟高亮），完成后再完整渲染。
- 进阶档：参考 demo 对 code 节点打 “完整性” 标识并缓存已完成代码块渲染结果，避免重复渲染。

**伪代码：轻量档**
```ts
function MarkdownContent({ content, isComplete }) {
  const mode = useVscodeThemeMode();
  const syntaxTheme = mode === 'light' ? vscLightPlus : vscDarkPlus;

  const renderCode = (props) => {
    if (!isComplete) return <pre>{props.children}</pre>; // 先不高亮
    return <SyntaxHighlighter style={syntaxTheme} ...>{...}</SyntaxHighlighter>;
  };

  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: renderCode }}>{content}</ReactMarkdown>;
}
```

**验收**
- 亮/暗主题：代码块高亮与整体背景协调。
- GFM：表格/任务列表/删除线渲染正确。
- 插入编辑器：能把代码块内容写入当前编辑器光标处。

---

### 5.4 消息列表滚动策略（P0）

**目标**
- 用户在底部阅读时：自动跟随流式输出。
- 用户上翻阅读时：不被强制拉回底部；出现“跳到最新”按钮。

**伪代码：Bottom lock + Jump**
```ts
const AUTO_SCROLL_THRESHOLD_PX = 80;

function isNearBottom(el: HTMLElement) {
  const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
  return dist < AUTO_SCROLL_THRESHOLD_PX;
}

function useSmartAutoScroll(messages) {
  const listRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const onScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setAutoScroll(isNearBottom(el));
  }, []);

  useEffect(() => {
    if (!autoScroll) return;
    listRef.current?.lastElementChild?.scrollIntoView({ block: 'end' });
  }, [messages, autoScroll]);

  const jumpToBottom = () => {
    setAutoScroll(true);
    listRef.current?.lastElementChild?.scrollIntoView({ block: 'end' });
  };

  return { listRef, onScroll, autoScroll, jumpToBottom };
}
```

**落地点**
- `packages/extension/webview/src/App.tsx`：替换当前 `scrollIntoView` effect；`messages-container` 绑定 `onScroll`；增加一个浮动按钮组件。

---

### 5.5 流式更新性能：批处理与节流（P1）

**问题来源**
- `handleUpdate` 被高频调用时会触发大量 `set()`，导致 React 频繁渲染与布局抖动。

**策略**
1) rAF 批处理：把流式文本 append 写入 buffer，每帧 flush 一次。
2) 或固定节流（例如 50~100ms）：对 UI 更新频率做上限。

**伪代码：rAF flush**
```ts
let buffer = '';
let rafId: number | null = null;

function appendStreamChunk(chunk: string) {
  buffer += chunk;
  if (rafId != null) return;
  rafId = requestAnimationFrame(() => {
    useStore.getState().appendToLastMessage(buffer);
    buffer = '';
    rafId = null;
  });
}
```

**落地点**
- `packages/extension/webview/src/store/useStore.ts`：对 `handleUpdate(type='text')` 改为走 `appendStreamChunk()`。

---

### 5.6 长会话性能：虚拟列表（P1/P2）

**目标**
- 200+ 消息依然可流畅滚动与选择复制。

**方案**
- 优先轻量实现：自研窗口化（只渲染可见区附近的消息）或引入成熟库（例如 `react-window`）。
- 消息高度可变时，需要测量/缓存高度；初期可先用“近似高度 + overscan”版本。

**伪代码：窗口化渲染接口**
```ts
type VirtualRange = { start: number; end: number; topPad: number; bottomPad: number };
const { range, onScroll } = useVirtualList({ itemCount: messages.length, estimateHeight: 80 });

return (
  <div onScroll={onScroll}>
    <div style={{ height: range.topPad }} />
    {messages.slice(range.start, range.end).map(renderMessage)}
    <div style={{ height: range.bottomPad }} />
  </div>
);
```

---

### 5.7 启动健壮性与可观测性（P1）

**目标**
- 单组件错误不至于白屏。
- 采集基本性能指标（TTI），便于排查“慢/卡/白屏”。

**方案**
1) ErrorBoundary：包裹 App 根节点。
2) TTI：`performance.mark` + `requestAnimationFrame` 后 measure。
3) ready 事件：webview -> extension `postMessage({type:'uiReady', metrics:{tti}})`。

**伪代码：TTI**
```ts
performance.mark('ui:start');
root.render(<App />);
requestAnimationFrame(() => {
  performance.mark('ui:rendered');
  performance.measure('ui:tti', 'ui:start', 'ui:rendered');
  postMessage({ type: 'uiReady', metrics: { tti: performance.getEntriesByName('ui:tti')[0]?.duration } });
});
```

**落地点**
- Webview：`packages/extension/webview/src/main.tsx`
- Extension：`packages/extension/src/providers/chatViewProvider.ts` 的 `onDidReceiveMessage` 处理 `uiReady`，输出日志或写入 telemetry（如后续接入）。

---

### 5.8 UI 状态持久化（P2）

**目标**
- reload 后恢复：`model`、`planMode`、`currentSessionId`、输入草稿、history 面板开关。

**方案**
- 复用 `packages/extension/webview/src/utils/vscode.ts` 的 `getState/setState`。
- 在 store 初始化时读取 persisted state；在 store 变化时（订阅）写回。

**伪代码：persist**
```ts
type Persisted = Pick<AppState, 'model' | 'planMode' | 'currentSessionId' | 'viewMode'> & { draft?: string };
const persisted = getState<Persisted>() ?? {};
useStore.setState({ ...persisted }, true);

useStore.subscribe((state) => {
  const next: Persisted = pick(state, ['model', 'planMode', 'currentSessionId', 'viewMode']);
  setState(next);
});
```

---

## 6. 安全策略（Markdown/HTML）

**默认策略**
- 不启用 `rehype-raw`，不渲染模型输出的任意 HTML。

**如必须支持 HTML（谨慎）**
- 采用 `rehype-sanitize` 白名单；只允许最小集合（例如 `a`, `code`, `pre`, `em`, `strong`, `p`, `ul`, `ol`, `li`, `table` 等）。
- 对 `a` 强制 `rel="noopener noreferrer"`。

---

## 7. 实施计划与交付物

### P0（优先，1-2 天）
- Token 统一：修复 `--vc-text-color`/补齐 `--vc-bg-container`/明确全局样式入口
- 滚动策略：底部吸附 + “跳到最新”
- Markdown：GFM + 高亮主题自适配（至少亮/暗）

### P1（增强，3-5 天）
- 流式批处理（rAF/节流）
- ErrorBoundary + TTI + `uiReady` 回传
- 代码块“插入编辑器”交互

### P2（优化，按需）
- 虚拟列表
- store 持久化更多 UI 状态
- Mermaid/数学公式（按需加载 + 安全策略）

---

## 8. 测试与验收清单

1) 主题：
- VSCode 亮色/暗色/高对比切换，气泡/输入框/计划块/工具块无视觉断层；无未定义 CSS 变量导致的异常。

2) Markdown：
- 表格、任务列表、删除线、链接渲染正确；代码块复制可用；亮/暗主题高亮正确。

3) 滚动：
- 用户上翻时不自动拉回；点击“跳到最新”可回到底部并恢复自动滚动。

4) 性能：
- 流式输出时 UI 更新频率稳定；长会话滚动不卡顿（P2 后验收）。

5) 安全：
- 不允许任意 HTML 注入；链接具备安全属性；无明显 XSS 面。

