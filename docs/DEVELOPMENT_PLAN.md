# VCoder Development Plan

> **Version**: 1.0
> **Last Updated**: 2025-01-19
> **Target**: VCoder V0.5 → V0.6 RC → V1.0 Release

---

## Executive Summary

**VCoder** is a VSCode extension that integrates Claude Code CLI capabilities into VSCode, providing an AI-assisted programming environment with chat, thought visualization, tool tracking, Plan Mode, multi-session support, and MCP integration.

### Tech Stack Overview

| Category | Technology | Purpose |
|----------|-----------|---------|
| **Platform** | VSCode Extension API | Extension host (TypeScript) |
| **Frontend** | React 19.2.0 + Vite | WebView UI |
| **State** | Zustand 5.0.9 (custom) | State management |
| **Backend** | Node.js Server + ACP | Agent communication |
| **Protocol** | @agentclientprotocol/sdk 0.12.0 | JSON-RPC 2.0 |
| **Build** | Turborepo 2.7.2 + pnpm 9.0.0 | Monorepo orchestration |
| **Test** | Vitest 4.0.16 | Unit testing |
| **Lint** | ESLint 9.39.2 + TypeScript 8.51.0 | Code quality |

### Project Structure

```
vcoder/
├── packages/
│   ├── extension/       # VSCode extension (CommonJS)
│   │   └── webview/    # React webview (ESM, Vite)
│   ├── server/         # Agent server (ACP implementation)
│   └── shared/         # Shared types (ACP protocol)
├── tests/              # Vitest tests (43/46 passing, 93.5%)
├── docs/               # Documentation
└── ui_refactor/        # Design assets
```

---

## Architecture Overview

### System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     VSCode Extension Host                     │
│  ┌─────────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ ACP Client      │  │ Services     │  │ Providers    │  │
│  │ (JSON-RPC)      │  │ - ServerMgr  │  │ - ChatView   │  │
│  └────────┬────────┘  │ - Terminal   │  │ - Permission│  │
│           │           │ - FileSystem │  └──────────────┘  │
│           │           │ - AuditLog   │                    │
├───────────┼───────────────────────────────────────────────────┤
│           │           stdio (ACP Protocol)                   │
├───────────┼───────────────────────────────────────────────────┤
│           │                                                 │
│  ┌────────▼────────┐    MCP (HTTP/SSE)    ┌──────────────┐ │
│  │ Agent Server    │◄────────────────────►│ Built-in MCP │ │
│  │ - ACP Server    │                      │ Server       │ │
│  │ - Claude Wrapper│                      └──────────────┘ │
│  └────────┬────────┘                                       │
│           │                                                │
├───────────┼───────────────────────────────────────────────────┤
│           │                                                │
│  ┌────────▼────────┐                                      │
│  │ Claude Code CLI │                                      │
│  └─────────────────┘                                      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ React WebView (UI)                                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐          │
│  │ Zustand  │  │ Components│  │ Custom Hooks     │          │
│  │ Store    │  │ - 50+ UI │  │ - VirtualList    │          │
│  └──────────┘  └──────────┘  │ - SmartScroll    │          │
│                               └──────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **User Input** → WebView (React)
2. **WebView** → Extension (via `postMessage`)
3. **Extension** → ACP Client (JSON-RPC request)
4. **ACP Client** → Agent Server (stdio)
5. **Agent Server** → Claude Code CLI
6. **Claude CLI** → Agent Server (streaming events)
7. **Agent Server** → ACP Client (JSON-RPC notification)
8. **ACP Client** → Extension
9. **Extension** → WebView (update state)
10. **WebView** → Re-render with new data

### Storage Architecture

| Storage Type | Location | Purpose |
|-------------|----------|---------|
| **Claude CLI History** | `~/.claude/projects/<projectKey>/*.jsonl` | Read-only CLI transcripts |
| **Session State** | VSCode `workspaceState` | Active session data |
| **Audit Logs** | `<globalStorage>/audit-logs/audit.jsonl` | Structured audit trail |
| **Webview State** | VSCode Webview API | UI preferences |
| **Settings** | VSCode Configuration | User settings |

---

## Development Environment Setup

### Prerequisites

```bash
# Node.js version
Node.js >= 20.19.0 or >= 22.12.0

# Package manager
pnpm 9.0.0

# External dependency
Claude Code CLI (@anthropic-ai/claude-code)
```

### Installation

```bash
# Clone repository
git clone <repository-url>
cd vcoder

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Start development mode
pnpm dev
```

### Development Workflow

```bash
# Build all packages
pnpm build

# Watch mode (TypeScript compilation)
pnpm dev

# Run tests
pnpm test              # Run once
pnpm test:watch        # Watch mode
pnpm test:coverage     # With coverage report

# Lint
pnpm lint

# Clean build artifacts
pnpm clean
```

### VSCode Extension Development

```bash
# Package VSIX
pnpm -C packages/extension package:server
vsce package --no-dependencies

# Install locally
code --install-extension vcoder-*.vsix

# Run tests
pnpm test
```

---

## Code Standards & Patterns

### TypeScript Conventions

**Naming:**
- Files: `kebab-case.ts` (e.g., `serverManager.ts`)
- Classes: `PascalCase` (e.g., `ServerManager`)
- Interfaces: `PascalCase` (e.g., `SessionState`)
- Functions/Variables: `camelCase` (e.g., `createId()`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `MIN_FLUSH_INTERVAL`)
- Type Parameters: `T`, `K`, `V`

**Type Safety:**
```typescript
// ❌ AVOID
const data: any = response;

// ✅ PREFER
const data: unknown = response;
if (isRecord(data)) {
  // Use guarded type
}

// Type guards
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// Assertion signatures
function assertSession(value: unknown): asserts value is Session {
  if (!isSession(value)) throw new Error('Not a session');
}
```

**Imports:**
```typescript
// Type-only imports
import type { Session, Message } from '@vcoder/shared';

// Regular imports
import { ACPMethods } from '@vcoder/shared';
```

### React Patterns

**Component Structure:**
```typescript
// packages/extension/webview/src/components/Example/Example.tsx
import React from 'react';
import classnames from 'classnames';

interface ExampleProps {
  className?: string;
  children?: React.ReactNode;
  onAction?: () => void;
}

const Example: React.FC<ExampleProps> = (props) => {
  const { className, children, onAction } = props;

  const handleClick = () => {
    onAction?.();
  };

  return (
    <div className={classnames('vc-example', className)} onClick={handleClick}>
      {children}
    </div>
  );
};

export default Example;
```

**Hooks Pattern:**
```typescript
// Custom hook
export function useVirtualList<T>(
  items: T[],
  options: { enabled: boolean; estimateHeight: (item: T) => number }
) {
  const { enabled, estimateHeight } = options;

  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 10 });

  useEffect(() => {
    if (!enabled) return;

    // Implementation
  }, [items, enabled, estimateHeight]);

  return { visibleRange, scrollRef };
}
```

**State Updates (Immutability):**
```typescript
// ❌ WRONG - mutation
state.messages.push(newMessage);
setState(state);

// ✅ RIGHT - immutability
setState((state) => ({
  ...state,
  messages: [...state.messages, newMessage],
}));
```

### ACP Protocol Patterns

**Request (Client → Server):**
```typescript
const response = await acpClient.request({
  jsonrpc: '2.0',
  id: requestId++,
  method: ACPMethods.SESSION_NEW,
  params: { model: 'claude-haiku-4-5-20251001' },
});
```

**Notification (Server → Client):**
```typescript
acpClient.on('notification', (notification) => {
  const { method, params } = notification;

  if (method === 'session/update') {
    handleUpdate(params);
  }
});
```

### Error Handling Patterns

**Error Classification:**
```typescript
import { parseError } from './utils/errorHandling';

try {
  await someOperation();
} catch (error) {
  const errorDetails = parseError(error);

  // errorDetails.type: 'network' | 'timeout' | 'permission' | ...
  // errorDetails.retryable: boolean
  // errorDetails.suggestions: string[]

  if (errorDetails.retryable) {
    await retryWithBackoff(someOperation, { maxRetries: 3 });
  }
}
```

**JSON-RPC Errors:**
```typescript
// Standard error codes
const errorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
};

// Custom errors
const customErrors = {
  AGENT_CRASHED: -32000,
  CONNECTION_LOST: -32001,
  TOOL_TIMEOUT: -32002,
  PERMISSION_DENIED: -32003,
};
```

### Styling Patterns

**SCSS with CSS Variables:**
```scss
// packages/extension/webview/src/components/Example/Example.scss
@import '../../styles/variables.scss';

.vc-example {
  background: var(--vc-bg-surface);
  color: var(--vc-color-text);
  padding: var(--vc-spacing-md);
  border-radius: var(--vc-border-radius-md);

  &--small {
    padding: var(--vc-spacing-sm);
    font-size: var(--vc-font-size-sm);
  }

  &__child {
    margin-bottom: var(--vc-spacing-xs);
  }
}
```

**React Integration:**
```typescript
import './Example.scss';

<Example className="vc-example vc-example--small">
  <div className="vc-example__child">Content</div>
</Example>
```

---

## Testing Strategy

### Test Organization

```
tests/
├── shared/
│   └── protocol.test.ts          # Protocol type validation
├── server/
│   ├── acp.test.ts              # ACP server tests
│   ├── claude-wrapper-*.test.ts # CLI wrapper tests
│   └── transcriptStore.test.ts   # History loading tests
└── extension/
    ├── acp-client.test.ts       # Client communication tests
    ├── webview-*.test.ts       # Webview state/logic tests
    └── webview-settings.test.ts # Settings state tests
```

### Writing Tests

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '../../packages/extension/webview/src/store/useStore';

describe('Feature Name', () => {
  beforeEach(() => {
    // Reset state before each test
    useStore.getState().reset();
  });

  it('should do something', async () => {
    // Arrange
    const store = useStore.getState();

    // Act
    store.addMessage({ id: '1', role: 'user', content: 'test' });

    // Assert
    expect(store.messages).toHaveLength(1);
    expect(store.messages[0].content).toBe('test');
  });

  it('should handle async operations', async () => {
    // Mock dependencies
    vi.mock('../../packages/extension/src/services/serverManager');

    // Setup mock streams
    const mockStdout = new Readable();
    process.nextTick(() => {
      mockStdout.push(JSON.stringify({ result: 'success' }) + '\n');
    });

    // Act
    const result = await asyncOperation();

    // Assert
    expect(result).toBe('success');
  });
});
```

### Running Tests

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage

# Specific test file
pnpm test tests/server/acp.test.ts
```

### Coverage Goals

| Package | Current | Target |
|---------|---------|--------|
| @vcoder/shared | 100% (15/15) | 100% |
| @vcoder/server | 100% (14/14) | 100% |
| vcoder extension | 82% (14/17) | 95%+ |

---

## Build & Deployment

### Build Process

```bash
# Build order (Turbo handles dependencies)
pnpm build

# Equivalent to:
1. shared     → tsc
2. server     → tsc -b
3. extension  → tsc
4. webview    → tsc -b && vite build
5. package    → cp -r server/dist extension/server/
```

### Output Structure

```
packages/extension/
├── out/                    # Main extension build
│   ├── extension.js
│   ├── acp/
│   ├── providers/
│   └── services/
├── webview/dist/
│   ├── index.js            # ~1.2MB bundle
│   ├── index.css
│   ├── index.html
│   └── assets/            # Shiki themes (~340 files)
└── server/                 # Embedded server
    └── dist/
```

### Packaging VSIX

```bash
# Build + package server
cd packages/extension
npm run build && npm run package:server

# Create VSIX
vsce package --no-dependencies --out vcoder-*.vsix
```

### CI/CD Pipeline

**GitHub Actions** (`.github/workflows/ci.yml`):

```yaml
on:
  push:
    branches: [main, master]
  pull_request:

jobs:
  build-test:
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.0.0
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm test
      - run: pnpm -C packages/extension package:server
      - run: vsce package --no-dependencies --out vcoder-ci.vsix
      - uses: actions/upload-artifact@v4
        with:
          name: vcoder-vsix
          path: vcoder-ci.vsix
```

**Release Workflow** (`.github/workflows/release.yml`):

```yaml
on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  release:
    steps:
      - (same as CI workflow)
      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: vcoder-*.vsix
```

### Publishing to Marketplaces

**VS Marketplace:**
```bash
# Set PAT in GitHub secrets: VSCE_PAT
vsce publish
```

**Open VSX:**
```bash
# Set PAT in GitHub secrets: OVSX_PAT
ovsx publish
```

---

## API Reference

### ACP Methods (Client → Server)

#### Initialization
```typescript
initialize: {
  protocolVersion: number;
  clientInfo: { name: string; version: string };
  clientCapabilities?: {
    terminal?: boolean;
    fs?: { readTextFile?: boolean; writeTextFile?: boolean };
    editor?: { openFile?: boolean; getSelection?: boolean };
  };
}
```

#### Session Management
```typescript
session/new: {
  model?: string;
  permissionMode?: 'default' | 'plan' | 'acceptEdits' | 'bypassPermissions';
  planMode?: boolean;
  thinkingEnabled?: boolean;
}

session/list: void;
session/switch: { sessionId: string };
session/delete: { sessionId: string };
session/cancel: { sessionId?: string };
session/prompt: { sessionId: string; prompt: string };
session/modeStatus: { sessionId: string };
session/stopPersistent: { sessionId: string };
```

#### File Operations
```typescript
file/accept: { sessionId: string; changeId: string };
file/reject: { sessionId: string; changeId: string };
```

#### Bash
```typescript
bash/confirm: { sessionId: string; requestId: string };
bash/skip: { sessionId: string; requestId: string };
```

#### Plan & Tools
```typescript
plan/confirm: { sessionId: string };
tool/confirm: {
  sessionId: string;
  toolCallId: string;
  decision: 'allow' | 'deny';
  always?: boolean;
};
```

#### History (Read-only)
```typescript
history/list: { workspacePath?: string };
history/load: { workspacePath: string; sessionId: string };
history/delete: { workspacePath: string; sessionId: string };
```

### Notifications (Server → Client)

```typescript
session/update: {
  sessionId: string;
  type:
    | 'thought'
    | 'text'
    | 'tool_use'
    | 'tool_result'
    | 'file_change'
    | 'mcp_call'
    | 'task_list'
    | 'bash_request'
    | 'plan_ready'
    | 'error'
    | 'confirmation_request';
  content: Record<string, unknown>;
}

session/complete: {
  sessionId: string;
  reason: 'completed' | 'cancelled' | 'error';
  usage?: { inputTokens: number; outputTokens: number };
}
```

### Built-in MCP Server Endpoints

```
GET  /mcp/health      - Health check
GET  /mcp/tools       - List available tools
POST /mcp/call        - Execute tool
GET  /mcp/stream      - SSE connection
```

### VSCode Extension Commands

```typescript
vcoder.newChat              - Create new session
vcoder.showHistory          - Show history panel
vcoder.openSettings         - Open settings UI
vcoder.setUiLanguage        - Set UI language
vcoder.setApiKey            - Set Anthropic API key
vcoder.restart              - Restart server
vcoder.showServerStatus      - Show server status
vcoder.showLogs             - Show output channel
vcoder.exportSession        - Export session to file
vcoder.importSession        - Import session from file
vcoder.exportAuditLogs      - Export audit logs
vcoder.showAuditStats       - Display audit stats
vcoder.switchAgent          - Switch AI agents
```

---

## Current Issues & Roadmap

### Known Issues (from `docs/PROJECT_ISSUES.md`)

| Priority | Issue | Impact | Fix Complexity |
|----------|-------|--------|---------------|
| P0 | Multi-session isolation not working | High | Medium |
| P0 | ACP transport lifecycle issues | High | Medium |
| P1 | Capability stacking without orchestration | Medium | High |
| P1 | Permission system fragmentation | Medium | Medium |
| P2 | Session switching doesn't refresh context | Low | Low |
| P2 | Diff/file change inconsistency | Low | Low |
| P2 | Built-in MCP Server overreach | Low | Low |

### V0.6 RC Features

1. **Agent Selector UI** - Switch between Claude Code, custom agents
2. **Permission Rules Management UI** - Configure permission rules
3. **Webview Communication Batching** - Optimize message passing
4. **Large File Handling** - Efficient processing of large files
5. **LSP Tools Integration** - Language Server Protocol support

### V1.0 Release Features

1. Full ACP/MCP-driven experience
2. Multi-backend support (Claude Code, custom agents)
3. Enhanced Plan Mode with task breakdown
4. Workflow reuse and templates
5. Improved error recovery and user feedback
6. Performance optimizations (virtualization, caching)

---

## Implementation Guidelines

### Adding New ACP Methods

1. **Update Protocol** (`packages/shared/src/protocol.ts`):
   ```typescript
   export const ACPMethods = {
     // ... existing methods
     YOUR_NEW_METHOD: 'your/method',
   } as const;

   export interface YourNewMethodParams {
     // params interface
   }

   export interface YourNewMethodResult {
     // result interface
   }
   ```

2. **Implement Server Handler** (`packages/server/src/acp/server.ts`):
   ```typescript
   case ACPMethods.YOUR_NEW_METHOD: {
     const params = request.params as YourNewMethodParams;
     const result = await handleYourNewMethod(params);
     sendResponse({ result });
     break;
   }
   ```

3. **Update Client** (`packages/extension/src/acp/client.ts`):
   ```typescript
   async yourNewMethod(params: YourNewMethodParams): Promise<YourNewMethodResult> {
     const response = await this.request({
       method: ACPMethods.YOUR_NEW_METHOD,
       params,
     });
     return response.result as YourNewMethodResult;
   }
   ```

4. **Add Tests** (`tests/server/acp.test.ts`, `tests/extension/acp-client.test.ts`)

### Adding New UI Components

1. **Create Component Directory**:
   ```
   packages/extension/webview/src/components/NewComponent/
   ├── index.tsx
   ├── index.scss
   └── types.ts (optional)
   ```

2. **Implement Component**:
   ```typescript
   // index.tsx
   import React from 'react';
   import classnames from 'classnames';
   import './index.scss';

   interface NewComponentProps {
     // props
   }

   const NewComponent: React.FC<NewComponentProps> = (props) => {
     // implementation
   };

   export default NewComponent;
   ```

3. **Add Styles**:
   ```scss
   // index.scss
   @import '../../styles/variables.scss';

   .vc-new-component {
     // styles with CSS variables
   }
   ```

4. **Export from Index** (`packages/extension/webview/src/components/index.ts`)

5. **Add Tests** (if applicable)

### Adding New MCP Tools

1. **Update Tool Registry** (`packages/extension/src/services/builtinMcpServer.ts`):
   ```typescript
   private getTools(): Tool[] {
     return [
       // ... existing tools
       {
         name: 'your/new_tool',
         description: 'Tool description',
         inputSchema: { /* JSON Schema */ },
       },
     ];
   }
   ```

2. **Implement Handler**:
   ```typescript
   case 'your/new_tool':
     return this.handleYourNewTool(params);
   ```

3. **Add Documentation** to tool schema

### Adding New Settings

1. **Update package.json** (`packages/extension/package.json`):
   ```json
   {
     "contributes": {
       "configuration": {
         "properties": {
           "vcoder.yourSetting": {
             "type": "string",
             "default": "default-value",
             "description": "Setting description"
           }
         }
       }
     }
   }
   ```

2. **Update Store** (`packages/extension/webview/src/store/useStore.ts`):
   ```typescript
   interface AppStore {
     yourSetting: string;
     setYourSetting: (value: string) => void;
   }
   ```

3. **Add Persistence** (`packages/extension/webview/src/utils/persist.ts`)

---

## Security Considerations

### API Key Management

- Stored in VSCode Secret Storage (`context.secrets`)
- Never logged or exposed in error messages
- Passed via environment variable to agent processes
- Redacted from audit logs

### Permission System

| Permission Mode | Behavior |
|-----------------|----------|
| `default` | Ask for permissions |
| `plan` | Show plan, confirm execution |
| `acceptEdits` | Auto-accept file edits |
| `bypassPermissions` | Skip all confirmations |

### Workspace Trust

- File/terminal operations require `vscode.workspace.isTrusted`
- Operations outside workspace require `vcoder.security.allowOutsideWorkspace` setting
- Path resolution enforces workspace boundaries

### Audit Logging

- All file operations, terminal commands, and API calls logged
- Sensitive data (API keys, tokens, passwords) automatically redacted
- Log rotation: 10MB max, keeps 5 rotated logs
- Export available for compliance/forensics

### MCP Server Security

- Rate limiting: 100 requests/minute per client ID
- Transport types: `stdio`, `http`, `sse`
- Tool execution sandboxed via subprocess
- Permission rules configurable per tool

---

## Performance Optimization

### Virtual Scrolling

- Enabled when message count > 50
- Custom `useVirtualList` hook
- Estimated item heights for performance
- Overscan for smooth scrolling

### Text Batching

- Streaming updates batched with `requestAnimationFrame`
- 16ms minimum flush interval
- Reduces React re-renders during streaming

### State Persistence

- Debounced writes (500ms for sessions, 1s for audit logs)
- Only persists necessary fields (not transient state)
- In-memory caching of active sessions

### Build Optimization

- Turborepo caching for fast rebuilds
- Vite optimized for VSCode webview
- Single CSS bundle (no code splitting)
- Shiki syntax highlighting languages lazy-loaded

---

## Troubleshooting

### Common Issues

**Issue: "Extension not activating"**
- Check Node.js version (>= 20.19.0)
- Verify dependencies installed: `pnpm install`
- Check extension logs: `vcoder.showLogs` command

**Issue: "Server won't start"**
- Check Claude Code CLI installation
- Verify API key: `vcoder.setApiKey`
- Check server logs in output channel

**Issue: "Tests failing"**
- Ensure dependencies installed: `pnpm install`
- Check TypeScript compilation: `pnpm build`
- Run specific test: `pnpm test tests/<test-file>`

**Issue: "Build fails"**
- Clean build artifacts: `pnpm clean && pnpm build`
- Check TypeScript errors: `pnpm -C packages/extension lint`
- Verify package versions: `pnpm outdated`

### Debug Mode

Enable debug output:
```typescript
// In VSCode settings.json
{
  "vcoder.debug": true,
  "vcoder.debugThinking": true
}
```

### Logs Location

| Log Type | Location |
|----------|----------|
| Extension Output | VSCode Output Channel → "VCoder" |
| Audit Logs | `<globalStorage>/audit-logs/audit.jsonl` |
| Server Logs | Child process stderr (captured in output channel) |
| Claude CLI Logs | `~/.claude/logs/` (if enabled) |

---

## Best Practices

### DO

- ✅ Follow existing code patterns and conventions
- ✅ Write tests for new functionality
- ✅ Use type guards for runtime validation
- ✅ Handle errors gracefully with user-friendly messages
- ✅ Use immutability for state updates
- ✅ Batch streaming updates for performance
- ✅ Follow BEM naming for SCSS classes
- ✅ Use CSS variables for theming
- ✅ Document new features in README
- ✅ Update protocol documentation when changing ACP methods

### DON'T

- ❌ Use `any` - prefer `unknown` with type guards
- ❌ Suppress TypeScript errors with `@ts-ignore`
- ❌ Mutate state directly - create new references
- ❌ Skip error handling - use `parseError()` utility
- ❌ Hardcode colors - use CSS variables
- ❌ Commit sensitive data (API keys, tokens)
- ❌ Break backward compatibility without migration
- ❌ Add large dependencies without review
- ❌ Skip tests - aim for >90% coverage
- ❌ Ignore linting errors

---

## Resources

### Documentation

- **Main README**: `/Users/kwean/workspace/VCoder/README.md`
- **Tests README**: `/Users/kwean/workspace/VCoder/tests/README.md`
- **PRD V0.1**: `/Users/kwean/workspace/VCoder/docs/V0.1/PRD.md`
- **PRD V0.2**: `/Users/kwean/workspace/VCoder/docs/V0.2/PRD.md`
- **Technical Design**: `/Users/kwean/workspace/VCoder/docs/V0.1/TECHNICAL_DESIGN.md`
- **Technical Solution**: `/Users/kwean/workspace/VCoder/docs/V0.2/TECH-SOLUTION.md`
- **UI Design System**: `/Users/kwean/workspace/VCoder/docs/UI_DESIGN_SYSTEM.md`
- **UI Components**: `/Users/kwean/workspace/VCoder/packages/extension/webview/UI_COMPONENTS.md`
- **Project Issues**: `/Users/kwean/workspace/VCoder/docs/PROJECT_ISSUES.md`

### External Links

- **VSCode Extension API**: https://code.visualstudio.com/api
- **React Documentation**: https://react.dev
- **Vitest Documentation**: https://vitest.dev
- **Vite Documentation**: https://vitejs.dev
- **Turborepo Documentation**: https://turbo.build/repo
- **ACP Protocol**: (internal specification)
- **Claude Code CLI**: https://docs.anthropic.com/en/docs/claude-code/overview

### Team Contacts

- **Project Maintainer**: [Contact Info]
- **Architecture**: See `docs/V0.2/TECH-SOLUTION.md`
- **Design**: See `docs/UI_DESIGN_SYSTEM.md`

---

## Appendix

### Quick Reference

**Key Files:**
```
Extension entry:     packages/extension/src/extension.ts
WebView entry:       packages/extension/webview/src/main.tsx
Server entry:        packages/server/src/index.ts
Protocol types:      packages/shared/src/protocol.ts
Store:              packages/extension/webview/src/store/useStore.ts
ACP client:          packages/extension/src/acp/client.ts
ACP server:          packages/server/src/acp/server.ts
```

**Commands:**
```bash
pnpm build           # Build all
pnpm dev             # Watch mode
pnpm test            # Run tests
pnpm lint            # Lint all
vsce package         # Package VSIX
```

**Test Coverage:**
```bash
pnpm test:coverage   # Generate report
# HTML report: coverage/index.html
```

**Directory Structure:**
```
packages/
├── extension/src/
│   ├── acp/              # ACP client
│   ├── providers/        # VSCode providers
│   ├── services/         # Core logic
│   └── webview/src/
│       ├── components/   # React components
│       ├── hooks/        # Custom hooks
│       ├── store/        # State management
│       └── utils/        # Utilities
├── server/src/
│   ├── acp/             # ACP server
│   ├── claude/          # CLI wrapper
│   └── history/         # Transcript storage
└── shared/src/
    └── protocol.ts      # ACP protocol types
```

---

**END OF DEVELOPMENT PLAN**
