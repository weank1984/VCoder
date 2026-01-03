# Claude Code CLI 启用 Thinking（方式二：`MAX_THINKING_TOKENS`）

**适用场景**：使用 Claude Code CLI（例如被 Z Code / VSCode 插件封装调用）时，希望强制开启/提高“思考（thinking / extended thinking）”输出与预算。

## 结论

- Claude Code CLI 没有 `--thinking` 之类的显式开关（`claude --help` 中不存在该参数）。
- **方式二可用**：为 Claude Code 进程设置环境变量 `MAX_THINKING_TOKENS`（正整数）即可启用 extended thinking，并作为 thinking token 预算上限。
- 要在输出中“看见”thinking，需要使用 `stream-json` 并建议加上 `--include-partial-messages` 来获得 `thinking_delta` 增量块。

## 单次命令验证（已验证）

```bash
MAX_THINKING_TOKENS=16000 \
  claude -p --max-budget-usd 0.05 \
  --output-format stream-json --verbose --include-partial-messages \
  "请先思考再回答：最后只输出 OK"
```

预期现象（示例字段）：

- 会出现 `content_block_start` 且 `content_block.type === "thinking"`
- 之后会持续出现 `content_block_delta` 且 `delta.type === "thinking_delta"`

快速过滤（仅看 thinking 相关事件）：

```bash
MAX_THINKING_TOKENS=16000 \
  claude -p --max-budget-usd 0.05 \
  --output-format stream-json --verbose --include-partial-messages \
  "请先思考再回答：最后只输出 OK" \
  | rg -n '\"type\":\"thinking\"|\"thinking_delta\"' | head
```

## 在 VSCode / 插件封装中如何生效

Claude Code CLI 作为子进程运行时，只会继承“启动该子进程的父进程”的环境变量。

常见做法：

1. **从带环境变量的终端启动 VSCode（最稳）**

```bash
MAX_THINKING_TOKENS=16000 code .
```

2. **在插件/服务端的 `spawn()` 环境中显式注入**

确保子进程 `env` 里包含 `MAX_THINKING_TOKENS`（例如 `env: { ...process.env, MAX_THINKING_TOKENS: "16000" }`）。

## 备注

- `MAX_THINKING_TOKENS` 越大，可能带来更慢的响应/更高的消耗；建议从 `8000` / `16000` 量级试起。
- 如果 UI 侧要展示“思考过程”，需要正确解析 `stream-json` 事件流中的 `thinking` / `thinking_delta`（而不是仅看最终文本）。

