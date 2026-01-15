# VCoder 技术架构图

**文档版本**: V1.0  
**创建日期**: 2026-01-14  
**基于**: zcode 实现分析 + VCoder V0.5 开发方案

---

## 1. 整体系统架构

```mermaid
flowchart TB
    subgraph VSCode["VSCode IDE"]
        subgraph Extension["VCoder Extension (Node.js)"]
            ACP["ACP Client<br/>• initialize<br/>• session/new<br/>• session/prompt"]
            PP["Permission Provider<br/>• 权限规则引擎<br/>• 模式管理<br/>• UI 弹窗"]
            CP["Capability Provider<br/>• fs/*<br/>• terminal/*<br/>• editor/*"]
            SS["Session & Audit Store<br/>• 会话持久化<br/>• JSONL 日志<br/>• 导出/回放"]
            
            APM["AgentProcessManager<br/>• 多 Agent 生命周期管理<br/>• 崩溃检测与自动重启<br/>• 健康检查与心跳"]
            
            MCP_Server["Built-in MCP Server<br/>(HTTP/SSE @ 127.0.0.1:port)<br/>• workspace/searchText<br/>• workspace/listFiles<br/>• git/status, git/diff<br/>• lsp/getDefinition (TODO)"]
            
            CVP["ChatView Provider<br/>(Webview Bridge)<br/>• agentMessageChunk<br/>• toolCall / toolCallUpdate<br/>• diffPreview<br/>• permissionRequest"]
            
            ACP --> APM
            PP --> APM
            CP --> APM
        end
        
        subgraph Webview["Webview (React UI)"]
            Chat["Chat Panel<br/>• 消息流<br/>• 流式渲染<br/>• @ 引用"]
            Timeline["Tool Timeline<br/>• 工具卡片<br/>• 状态指示<br/>• MCP 展示"]
            Permission["Permission Dialog<br/>• Allow<br/>• Always<br/>• Reject"]
            Diff["Diff Viewer<br/>• Unified<br/>• Accept<br/>• Reject"]
            Terminal["Terminal Output<br/>• 增量输出<br/>• Kill 按钮<br/>• Exit Code"]
        end
        
        CVP <--> Webview
    end
    
    subgraph Agent["ACP Agent 进程<br/>(如 @zed-industries/claude-code-acp)"]
        ACP_Server["ACP Server (JSON-RPC)<br/>• 接收 Client Methods<br/>• 发送 Agent→Client Requests"]
        
        MCP_ACP["内置 MCP Server 'acp'<br/>• mcp__acp__Read<br/>• mcp__acp__Write<br/>• mcp__acp__BashOutput"]
        
        SDK["Claude Agent SDK<br/>(@anthropic-ai/claude-agent-sdk)<br/>• canUseTool 回调<br/>• query() 流式会话<br/>• disabledTools 配置"]
        
        ACP_Server --> MCP_ACP
        MCP_ACP --> SDK
    end
    
    subgraph CLI["Claude Code CLI<br/>(--output-format stream-json)"]
        Engine["核心执行引擎<br/>• LLM 推理与 tool_use<br/>• control_request (权限请求)<br/>• control_response (权限决策)<br/>• 连接外部 MCP Servers"]
    end
    
    subgraph External["外部服务"]
        MCP1["External MCP Server<br/>(工单系统/浏览器自动化)"]
        MCP2["External MCP Server<br/>(知识库/RAG)"]
        Anthropic["Anthropic API<br/>(Claude Model)"]
    end
    
    APM <-->|"stdio (NDJSON JSON-RPC)"| Agent
    SDK <-->|"stdin/stdout (NDJSON)"| CLI
    CLI --> MCP1
    CLI --> MCP2
    CLI --> Anthropic
    
    style VSCode fill:#1e1e1e,stroke:#007acc,color:#fff
    style Extension fill:#252526,stroke:#007acc,color:#fff
    style Webview fill:#2d2d2d,stroke:#007acc,color:#fff
    style Agent fill:#1a1a2e,stroke:#16213e,color:#fff
    style CLI fill:#0f3460,stroke:#16213e,color:#fff
    style External fill:#1a1a2e,stroke:#e94560,color:#fff
```

---

## 2. 协议与通信架构

```mermaid
flowchart TB
    subgraph AppLayer["应用层 - 业务语义"]
        direction LR
        WebviewApp["Webview"]
        ExtApp["Extension"]
        
        WebviewApp -->|"sendPrompt<br/>acceptDiff / rejectDiff<br/>killTerminal<br/>setMode"| ExtApp
        ExtApp -->|"agentMessageChunk<br/>toolCall / toolCallUpdate<br/>permissionRequest<br/>diffPreview"| WebviewApp
    end
    
    subgraph ACPLayer["ACP 层 - Agent Client Protocol<br/>(stdio NDJSON JSON-RPC)"]
        direction LR
        Client["Extension (Client)"]
        Server["Agent (Server)"]
        
        Client -->|"initialize<br/>session/new<br/>session/prompt"| Server
        Server -->|"session/update (notify)<br/>session/request_permission (request)<br/>readTextFile (request)<br/>writeTextFile (request)"| Client
    end
    
    subgraph ControlLayer["Control 层 - Claude Agent SDK 控制协议<br/>(stdin/stdout NDJSON)"]
        direction LR
        AgentCtrl["ACP Agent"]
        CLICtrl["Claude Code CLI"]
        
        CLICtrl -->|"control_request<br/>{type: 'control_request',<br/>request: {subtype: 'can_use_tool'}}"| AgentCtrl
        AgentCtrl -->|"control_response<br/>{type: 'control_response',<br/>response: {behavior: 'allow'}}"| CLICtrl
    end
    
    subgraph MCPLayer["MCP 层 - Model Context Protocol<br/>(HTTP/SSE 或 stdio)"]
        direction LR
        CLIMcp["Claude Code CLI"]
        MCPServer["MCP Server"]
        
        CLIMcp <-->|"tools/list<br/>tools/call<br/>resources/list"| MCPServer
    end
    
    AppLayer --> ACPLayer
    ACPLayer --> ControlLayer
    ControlLayer --> MCPLayer
    
    style AppLayer fill:#2d5a27,stroke:#4caf50,color:#fff
    style ACPLayer fill:#1565c0,stroke:#42a5f5,color:#fff
    style ControlLayer fill:#6a1b9a,stroke:#ab47bc,color:#fff
    style MCPLayer fill:#e65100,stroke:#ff9800,color:#fff
```

---

## 3. 权限交互时序图

```mermaid
sequenceDiagram
    autonumber
    participant W as Webview (UI)
    participant E as Extension (Client)
    participant A as ACP Agent
    participant S as Claude SDK
    participant C as Claude CLI
    
    W->>E: sendPrompt
    E->>A: session/prompt
    A->>S: query()
    S->>C: 启动 CLI
    
    Note over C: LLM 推理
    Note over C: 决定调用工具 (tool_use)
    
    C->>S: control_request<br/>(can_use_tool)
    S->>A: canUseTool callback
    A->>E: session/request_permission
    E->>W: permissionRequest
    
    Note over W: 用户查看权限请求
    
    rect rgb(40, 40, 60)
        Note over W: 🔒 权限请求对话框<br/>工具: Write<br/>文件: src/app.ts<br/><br/>[Allow] [Always Allow] [Reject]
    end
    
    W->>E: userDecision (allow)
    E->>A: outcome: allow
    A->>S: behavior: allow
    S->>C: control_response
    
    Note over C: 执行工具
    
    C->>S: tool_result
    S->>A: 工具执行结果
    A->>E: session/update (tool_call)
    E->>W: toolCallUpdate
```

---

## 4. 能力协商与工具代理机制

### 4.1 能力协商流程

```mermaid
flowchart TB
    Start["Extension 启动"] --> Build["构建 clientCapabilities"]
    
    Build --> Caps["clientCapabilities:<br/>{<br/>  fs: {<br/>    readTextFile: true,<br/>    writeTextFile: true<br/>  },<br/>  terminal: true,<br/>  editor: { openFile: true }<br/>}"]
    
    Caps -->|"initialize()"| Agent["ACP Agent"]
    
    subgraph Agent["ACP Agent 能力决策"]
        Decision["能力 → 工具映射决策"]
        
        FS_Read{"fs.readTextFile?"}
        FS_Write{"fs.writeTextFile?"}
        Term{"terminal?"}
        
        Decision --> FS_Read
        Decision --> FS_Write
        Decision --> Term
        
        FS_Read -->|Yes| DisableRead["禁用: Read<br/>启用: mcp__acp__Read"]
        FS_Write -->|Yes| DisableWrite["禁用: Write, Edit, MultiEdit<br/>启用: mcp__acp__Write, mcp__acp__Edit"]
        Term -->|Yes| DisableBash["禁用: Bash, BashOutput, KillShell<br/>启用: mcp__acp__BashOutput, mcp__acp__KillShell"]
    end
    
    DisableRead --> MCPServer
    DisableWrite --> MCPServer
    DisableBash --> MCPServer
    
    MCPServer["启动内置 MCP Server 'acp'<br/><br/>mcpServers['acp'] = {<br/>  type: 'sdk',<br/>  tools: [<br/>    mcp__acp__Read → client.readTextFile(),<br/>    mcp__acp__Write → client.writeTextFile(),<br/>    mcp__acp__BashOutput → client.terminal*()<br/>  ]<br/>}"]
    
    style Caps fill:#1565c0,stroke:#42a5f5,color:#fff
    style Agent fill:#6a1b9a,stroke:#ab47bc,color:#fff
    style MCPServer fill:#2e7d32,stroke:#66bb6a,color:#fff
```

### 4.2 工具代理调用链路

```mermaid
flowchart LR
    LLM["Claude LLM"] -->|"tool_use: mcp__acp__Write<br/>{file_path, content}"| CLI["Claude Code CLI"]
    
    CLI -->|"识别 MCP 工具调用"| MCPCall["路由到 MCP Server 'acp'"]
    
    MCPCall -->|"MCP tools/call"| Handler["ACP Agent MCP Handler<br/><br/>handler('mcp__acp__Write') {<br/>  return client.writeTextFile({<br/>    path, content<br/>  });<br/>}"]
    
    Handler -->|"ACP writeTextFile"| Extension["VSCode Extension<br/><br/>handleWriteTextFile() {<br/>  1. 生成 Diff<br/>  2. 发送到 Webview 审阅<br/>  3. 等待用户决策<br/>  4. 执行写入<br/>}"]
    
    Extension -->|"vscode.workspace.fs.writeFile()"| FS["Workspace<br/>文件系统"]
    
    style LLM fill:#e65100,stroke:#ff9800,color:#fff
    style CLI fill:#0f3460,stroke:#42a5f5,color:#fff
    style MCPCall fill:#6a1b9a,stroke:#ab47bc,color:#fff
    style Handler fill:#1565c0,stroke:#42a5f5,color:#fff
    style Extension fill:#2e7d32,stroke:#66bb6a,color:#fff
    style FS fill:#37474f,stroke:#78909c,color:#fff
```

---

## 5. 数据流与状态管理

### 5.1 会话状态模型

```mermaid
classDiagram
    class SessionState {
        +string id
        +string agentId
        +string cwd
        +number createdAt
        +number updatedAt
        +string permissionMode
        +string draft
        +Metadata metadata
    }
    
    class Message {
        +string role
        +string content
        +number timestamp
        +Chunk[] chunks
    }
    
    class ToolCall {
        +string id
        +string toolName
        +string kind
        +string status
        +object rawInput
        +object output
        +Location[] locations
        +string diff
    }
    
    class TerminalHandle {
        +string id
        +string command
        +string cwd
        +string status
        +number exitCode
        +RingBuffer outputBuffer
        +number lastReadOffset
    }
    
    class PermissionRule {
        +string toolName
        +string category
        +string scope
        +string policy
    }
    
    class Metadata {
        +string agentVersion
        +string[] mcpServers
    }
    
    SessionState "1" *-- "*" Message : messages
    SessionState "1" *-- "*" ToolCall : toolCalls
    SessionState "1" *-- "*" TerminalHandle : terminalHandles
    SessionState "1" *-- "*" PermissionRule : permissionRules
    SessionState "1" *-- "1" Metadata : metadata
```

### 5.2 审计日志结构 (JSONL)

```mermaid
flowchart LR
    subgraph Events["审计事件类型"]
        E1["prompt<br/>用户输入"]
        E2["tool_call_start<br/>工具调用开始"]
        E3["tool_call_end<br/>工具调用结束"]
        E4["permission_request<br/>权限请求"]
        E5["permission_response<br/>权限响应"]
        E6["file_write<br/>文件写入"]
        E7["terminal_start<br/>终端启动"]
        E8["terminal_exit<br/>终端退出"]
    end
    
    subgraph Format["JSONL 格式示例"]
        L1["{ts, sid, evt:'prompt', prompt:'...'}"]
        L2["{ts, sid, evt:'tool_call_start', toolName, input}"]
        L3["{ts, sid, evt:'tool_call_end', toolName, dur, result}"]
        L4["{ts, sid, evt:'permission_request', toolName, input}"]
        L5["{ts, sid, evt:'permission_response', decision, latency}"]
        L6["{ts, sid, evt:'file_write', path, size, diffHash}"]
    end
    
    E1 --> L1
    E2 --> L2
    E3 --> L3
    E4 --> L4
    E5 --> L5
    E6 --> L6
    
    style Events fill:#1565c0,stroke:#42a5f5,color:#fff
    style Format fill:#2e7d32,stroke:#66bb6a,color:#fff
```

---

## 6. 模块依赖关系

### 6.1 Extension 模块依赖图

```mermaid
flowchart TB
    Ext["extension.ts<br/>(激活入口)"]
    
    Ext --> CVP["ChatViewProvider<br/>• 注册 Webview<br/>• 消息桥接"]
    Ext --> APM["AgentProcessManager<br/>• spawn Agent<br/>• 进程生命周期<br/>• 崩溃恢复"]
    Ext --> MCP["BuiltinMcpServer<br/>• HTTP/SSE 服务<br/>• 工具注册与调用"]
    
    CVP --> ACP["ACP Client<br/>• 双向 JSON-RPC<br/>• initialize / session/*<br/>• 处理 Agent→Client 请求"]
    APM --> ACP
    
    ACP --> PP["PermissionProvider<br/>• 规则引擎<br/>• 模式管理<br/>• UI 协调"]
    ACP --> FSP["FileSystemProvider<br/>• readTextFile<br/>• writeTextFile<br/>• diff 生成"]
    ACP --> TP["TerminalProvider<br/>• node-pty<br/>• create/kill<br/>• output 缓冲"]
    
    PP --> SS["SessionStore<br/>• 会话持久化<br/>• VSCode Memento"]
    FSP --> SS
    TP --> SS
    MCP --> SS
    
    SS --> AL["AuditLogger<br/>• JSONL 写入<br/>• 日志轮转<br/>• 脱敏处理<br/>• 导出功能"]
    
    style Ext fill:#e65100,stroke:#ff9800,color:#fff
    style ACP fill:#1565c0,stroke:#42a5f5,color:#fff
    style SS fill:#2e7d32,stroke:#66bb6a,color:#fff
    style AL fill:#6a1b9a,stroke:#ab47bc,color:#fff
```

### 6.2 Webview 组件依赖图

```mermaid
flowchart TB
    App["App.tsx<br/>(根组件)"]
    
    App --> SP["SessionPanel<br/>• 会话列表<br/>• 新建/切换/删除"]
    App --> CP["ChatPanel<br/>• 消息流<br/>• 输入框<br/>• 工具时间线"]
    App --> SetP["SettingsPanel<br/>• Agent 配置<br/>• MCP 配置<br/>• 权限模式"]
    
    CP --> ML["MessageList<br/>• 虚拟滚动<br/>• 流式渲染<br/>• 代码高亮"]
    CP --> IA["InputArea<br/>• @ 文件引用<br/>• 快捷键<br/>• 草稿保存"]
    CP --> TT["ToolTimeline<br/>• 工具卡片列表<br/>• 状态指示"]
    
    TT --> PD["PermissionDialog<br/>• Allow/Reject<br/>• Always Allow<br/>• 快捷键支持"]
    TT --> DV["DiffViewer<br/>• Unified Diff<br/>• Accept/Reject<br/>• 语法高亮"]
    TT --> TO["TerminalOutput<br/>• 增量输出<br/>• ANSI 渲染<br/>• Kill 按钮"]
    TT --> MTD["McpToolDisplay<br/>• 工具名 & 参数<br/>• 结果摘要<br/>• 展开/折叠"]
    
    style App fill:#e65100,stroke:#ff9800,color:#fff
    style CP fill:#1565c0,stroke:#42a5f5,color:#fff
    style TT fill:#6a1b9a,stroke:#ab47bc,color:#fff
```

---

## 7. 安全边界与信任模型

### 7.1 安全边界划分

```mermaid
flowchart TB
    subgraph UserDomain["用户控制域 (User-Controlled)"]
        subgraph ExtSec["VSCode Extension 安全职责"]
            S1["✓ Workspace Trust 检查"]
            S2["✓ 路径访问控制 (仅限 workspaceFolders)"]
            S3["✓ 权限审批 UI (session/request_permission)"]
            S4["✓ 写入前 Diff 审阅"]
            S5["✓ 命令执行确认"]
            S6["✓ 审计日志记录"]
            S7["✓ 敏感信息脱敏"]
        end
        
        subgraph WebSec["Webview UI 安全职责"]
            W1["✓ 权限请求展示 (工具名、参数、影响范围)"]
            W2["✓ Diff 可视化 (变更内容一目了然)"]
            W3["✓ 终端命令预览"]
            W4["✓ 操作确认 UI"]
        end
        
        ExtSec <-->|"用户决策<br/>(Allow/Reject)"| WebSec
    end
    
    TrustBoundary["═══════════ 信任边界 ═══════════"]
    
    subgraph SandboxDomain["受限执行域 (Sandboxed Execution)"]
        subgraph AgentLimit["ACP Agent 进程限制"]
            A1["✗ 不能直接访问文件系统"]
            A2["✗ 不能直接执行命令"]
            A3["✗ 所有敏感操作必须先请求权限"]
            A4["✗ 内置工具已被禁用"]
            A5["✓ 可调用 mcp__acp__* 代理工具"]
            A6["✓ 可连接预配置的 MCP Server"]
        end
        
        subgraph CLILimit["Claude Code CLI 限制"]
            C1["✗ --disallowed-tools Read,Write,Edit,Bash"]
            C2["✗ 必须通过 control_request 获取权限"]
            C3["✗ 无法绕过权限检查"]
        end
    end
    
    UserDomain --> TrustBoundary
    TrustBoundary --> SandboxDomain
    
    style UserDomain fill:#2e7d32,stroke:#66bb6a,color:#fff
    style SandboxDomain fill:#c62828,stroke:#ef5350,color:#fff
    style TrustBoundary fill:#ff8f00,stroke:#ffc107,color:#000
```

### 7.2 权限模式对照表

```mermaid
flowchart LR
    subgraph Modes["权限模式"]
        Plan["Plan<br/>分析规划"]
        Default["Default<br/>(Always Ask)<br/>日常开发"]
        Accept["Accept Edits<br/>快速迭代"]
        Bypass["Bypass Permissions<br/>受控环境 (高风险)"]
    end
    
    subgraph Actions["操作权限"]
        Read["文件读取"]
        Write["文件写入"]
        Terminal["终端执行"]
    end
    
    Plan -->|"✓ 允许"| Read
    Plan -->|"✗ 禁止<br/>(仅生成计划)"| Write
    Plan -->|"✗ 禁止"| Terminal
    
    Default -->|"✓ 允许"| Read
    Default -->|"? 每次询问<br/>+ Diff 审阅"| Write
    Default -->|"? 每次询问"| Terminal
    
    Accept -->|"✓ 允许"| Read
    Accept -->|"✓ 自动允许<br/>(仍显示 Diff)"| Write
    Accept -->|"? 每次询问"| Terminal
    
    Bypass -->|"✓ 允许"| Read
    Bypass -->|"✓ 自动允许"| Write
    Bypass -->|"✓ 自动允许<br/>(仅非 root)"| Terminal
    
    style Plan fill:#1565c0,stroke:#42a5f5,color:#fff
    style Default fill:#2e7d32,stroke:#66bb6a,color:#fff
    style Accept fill:#ff8f00,stroke:#ffc107,color:#000
    style Bypass fill:#c62828,stroke:#ef5350,color:#fff
```

---

## 8. 部署架构

```mermaid
flowchart TB
    subgraph Workstation["开发者工作站"]
        subgraph VSCodeMain["VSCode 主进程"]
            subgraph ExtHost["Extension Host 进程"]
                VCoder["VCoder Extension<br/>• ACP Client<br/>• Built-in MCP Server<br/>• Permission Provider<br/>• Terminal Provider (node-pty)"]
                OtherExt["其他 Extensions<br/>• GitLens<br/>• ESLint<br/>• Prettier"]
            end
            
            subgraph WebviewProc["Webview 渲染进程<br/>(Chromium sandbox)"]
                ReactApp["React Application<br/>Chat UI / Tool Timeline /<br/>Permission Dialog / Diff Viewer"]
            end
        end
        
        subgraph ChildProcs["子进程群"]
            AgentProc["ACP Agent 进程<br/>(claude-code-acp)<br/><br/>stdio ◄──► Extension"]
            
            subgraph CLIProc["Claude Code CLI<br/>(子进程)"]
            end
            
            subgraph PTYProcs["PTY 子进程群"]
                PTY1["term_001: /bin/zsh"]
                PTY2["term_002: npm test"]
                PTY3["term_003: ..."]
            end
            
            AgentProc --> CLIProc
        end
        
        subgraph LocalServices["本地服务"]
            MCPLocal["Built-in MCP Server<br/>127.0.0.1:${random_port}<br/><br/>GET  /mcp/health<br/>GET  /mcp/tools<br/>POST /mcp/call<br/>GET  /mcp/stream (SSE)"]
        end
        
        subgraph FileSystem["文件系统"]
            Storage["~/Library/Application Support/Code/User/globalStorage/vcoder/<br/>├── sessions/     # 会话持久化<br/>├── audit/        # 审计日志<br/>└── config/       # 用户配置"]
        end
        
        VCoder <--> AgentProc
        VCoder <--> PTYProcs
        VCoder --> MCPLocal
        VCoder --> Storage
    end
    
    subgraph External["外部服务"]
        Anthropic["Anthropic API"]
        ExtMCP["External MCP Servers"]
        Enterprise["企业内部服务"]
    end
    
    CLIProc -->|HTTPS| External
    
    style Workstation fill:#1e1e1e,stroke:#007acc,color:#fff
    style VSCodeMain fill:#252526,stroke:#007acc,color:#fff
    style ChildProcs fill:#1a1a2e,stroke:#16213e,color:#fff
    style External fill:#0f3460,stroke:#e94560,color:#fff
```

---

## 9. 完整数据流概览

```mermaid
flowchart TB
    User["👤 用户"] -->|"1. 输入 prompt"| Webview
    
    subgraph Webview["Webview UI"]
        Input["InputArea"]
        Chat["ChatPanel"]
        Tools["ToolTimeline"]
        Dialog["PermissionDialog"]
    end
    
    Input -->|"2. sendPrompt"| Extension
    
    subgraph Extension["VSCode Extension"]
        ACP["ACP Client"]
        PP["PermissionProvider"]
        FSP["FileSystemProvider"]
        TP["TerminalProvider"]
    end
    
    ACP -->|"3. session/prompt"| Agent
    
    subgraph Agent["ACP Agent"]
        SDK["Claude Agent SDK"]
        MCPACP["MCP Server 'acp'"]
    end
    
    SDK -->|"4. query()"| CLI["Claude Code CLI"]
    CLI -->|"5. LLM 推理"| Anthropic["Anthropic API"]
    Anthropic -->|"6. tool_use"| CLI
    
    CLI -->|"7. control_request<br/>(can_use_tool)"| SDK
    SDK -->|"8. canUseTool"| MCPACP
    MCPACP -->|"9. session/request_permission"| ACP
    ACP -->|"10. permissionRequest"| Dialog
    
    Dialog -->|"11. 用户决策"| ACP
    ACP -->|"12. outcome"| MCPACP
    MCPACP -->|"13. behavior"| SDK
    SDK -->|"14. control_response"| CLI
    
    CLI -->|"15. mcp__acp__Write"| MCPACP
    MCPACP -->|"16. writeTextFile"| FSP
    FSP -->|"17. 生成 Diff"| Tools
    Tools -->|"18. 用户 Accept"| FSP
    FSP -->|"19. 写入文件"| FS["📁 文件系统"]
    
    FSP -->|"20. success"| MCPACP
    MCPACP -->|"21. tool_result"| CLI
    CLI -->|"22. 继续推理"| Anthropic
    
    Anthropic -->|"23. 最终回复"| CLI
    CLI -->|"24. 流式输出"| SDK
    SDK -->|"25. session/update"| ACP
    ACP -->|"26. agentMessageChunk"| Chat
    
    Chat -->|"27. 显示结果"| User
    
    style User fill:#4caf50,stroke:#2e7d32,color:#fff
    style Webview fill:#2196f3,stroke:#1565c0,color:#fff
    style Extension fill:#9c27b0,stroke:#6a1b9a,color:#fff
    style Agent fill:#ff9800,stroke:#e65100,color:#fff
    style CLI fill:#f44336,stroke:#c62828,color:#fff
    style Anthropic fill:#00bcd4,stroke:#00838f,color:#fff
    style FS fill:#607d8b,stroke:#37474f,color:#fff
```

---

## 总结

本架构基于对 zcode (`@zed-industries/claude-code-acp`) 的深入分析，核心设计原则：

| 原则 | 说明 |
|------|------|
| **结构化权限协议** | 不依赖 TTY 的 `y/n` 输入，而是通过 `session/request_permission` 实现无头环境下的可靠交互 |
| **能力协商与工具代理** | 通过 `clientCapabilities` 声明宿主能力，禁用内置工具并改用 `mcp__acp__*` 代理，实现更强的可控性 |
| **分层安全边界** | Extension 掌握所有敏感操作的最终决策权，Agent 只能通过定义好的 Client Methods 请求执行 |
| **可观测性** | 完整的审计日志记录所有工具调用、权限决策、文件变更 |

---

**文档结束**
