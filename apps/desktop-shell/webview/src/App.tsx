/**
 * VCoder Desktop App
 * Two-column layout: persistent sidebar + main content area
 */

import { useEffect, useMemo, useCallback, useRef, useState, type CSSProperties } from 'react';
import { useStore, flushTextBuffer } from '@vcoder/ui/store/useStore';
import { useSmartScroll } from '@vcoder/ui/hooks/useSmartScroll';
import { useVirtualList } from '@vcoder/ui/hooks/useVirtualList';
import { PlanBlock } from '@vcoder/ui/components/PlanBlock';
import { TaskRunsBlock } from '@vcoder/ui/components/TaskRunsBlock';
import { VirtualMessageItem } from '@vcoder/ui/components/VirtualMessageItem';
import { InputArea, type InputAreaHandle } from '@vcoder/ui/components/InputArea';
import { EcosystemPanel } from '@vcoder/ui/components/EcosystemPanel';
import { AgentTeamsPanel } from '@vcoder/ui/components/AgentTeamsPanel';
import type { EcosystemData } from '@vcoder/ui/types';
import { JumpToBottom } from '@vcoder/ui/components/JumpToBottom';
import { Welcome } from '@vcoder/ui/components/Welcome';
import { PermissionDialog, type PermissionRequest } from '@vcoder/ui/components/PermissionDialog';
import { PermissionRulesPanel } from '@vcoder/ui/components/PermissionRulesPanel';
import { MessageSkeleton } from '@vcoder/ui/components/Skeleton';
import { StickyUserPrompt } from '@vcoder/ui/components/StickyUserPrompt';
import { TodoTaskManager } from '@vcoder/ui/components/TodoTaskManager';
import type { EnhancedTodoItem, TaskItem } from '@vcoder/ui/components/TodoTaskManager';
import { useToast } from '@vcoder/ui/utils/Toast';
import { postMessage } from '@vcoder/ui/bridge';
import { performanceMonitor } from '@vcoder/ui/utils/messageQueue';
import { loadPersistedState, savePersistedState } from '@vcoder/ui/utils/persist';
import type { ExtensionMessage } from '@vcoder/ui/types';
import { DesktopSidebar } from './components/DesktopSidebar';
import '@vcoder/ui/styles/index.scss';
import './App.scss';

// Enable virtual list when message count exceeds this threshold
const VIRTUAL_LIST_THRESHOLD = 50;
const ESTIMATED_MESSAGE_HEIGHT = 120;

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return loadPersistedState().sidebarCollapsed ?? false;
  });
  const [showPermissionRules, setShowPermissionRules] = useState(false);
  const [showEcosystem, setShowEcosystem] = useState(false);
  const [showAgentTeams, setShowAgentTeams] = useState(false);
  const [ecosystemData, setEcosystemData] = useState<EcosystemData | null>(null);
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null);
  const [activeUserMessageId, setActiveUserMessageId] = useState<string | null>(null);
  const [stickyPromptHeight, setStickyPromptHeight] = useState(0);
  const { showError } = useToast();
  const inputAreaRef = useRef<InputAreaHandle>(null);
  const activeMessageRafRef = useRef<number | null>(null);

  const {
    currentSessionId,
    messages,
    tasks,
    subagentRuns,
    planMode,
    permissionMode,
    error,
    isLoading,
    setUiLanguage,
    setSessions,
    setCurrentSession,
    handleUpdate,
    setLoading,
    setHistorySessions,
    loadHistorySession,
    viewMode,
    setAgents,
    setCurrentAgent,
    setPermissionRules,
  } = useStore();

  // Determine if virtual list should be enabled
  // Disable virtual list for history mode to avoid height estimation issues
  const useVirtual = viewMode === 'live' && messages.length > VIRTUAL_LIST_THRESHOLD;
  const hideUserMessagesInList = false;
  const enableStickyUserPrompt = false;

  // Smart auto-scroll: only scroll when at bottom, show jump button when scrolled up
  const { containerRef, endRef, onScroll: smartScrollHandler, autoScroll, jumpToBottom } = useSmartScroll(messages, {
    enabled: viewMode === 'live',
    autoScrollBehavior: 'auto',
    jumpBehavior: 'smooth',
  });

  // Virtual list for long sessions
  const { 
    containerRef: virtualContainerRef, 
    range, 
    onScroll: virtualScrollHandler,
    reset: resetVirtualList,
  } = useVirtualList({
    itemCount: messages.length,
    estimatedItemHeight: ESTIMATED_MESSAGE_HEIGHT,
    getItemEstimatedHeight: (index) => {
      if (!hideUserMessagesInList) return ESTIMATED_MESSAGE_HEIGHT;
      return messages[index]?.role === 'user' ? 0 : ESTIMATED_MESSAGE_HEIGHT;
    },
    overscan: 5,
  });

  const recomputeActiveUserMessage = useCallback(() => {
    if (!enableStickyUserPrompt) return;
    if (typeof document === 'undefined' || typeof document.elementFromPoint !== 'function') return;
    const container = (useVirtual ? virtualContainerRef.current : containerRef.current) as HTMLDivElement | null;
    if (!container) return;

    // If the conversation doesn't scroll (or user is at bottom), the "active" user prompt
    // should be the latest one; otherwise new user prompts appear to "disappear" because
    // user messages are hidden from the list.
    const isScrollable = container.scrollHeight - container.clientHeight > 2;
    if (!isScrollable || autoScroll) {
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      setActiveUserMessageId((prev) => (prev === (lastUser?.id ?? null) ? prev : (lastUser?.id ?? null)));
      return;
    }

    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const x = rect.left + Math.min(rect.width - 1, Math.max(1, rect.width / 2));
    const y = rect.top + 6;
    const hit = document.elementFromPoint(x, y);
    const wrapper = hit instanceof Element ? (hit.closest('[data-message-index]') as HTMLElement | null) : null;
    const indexStr = wrapper?.dataset?.messageIndex ?? container.querySelector<HTMLElement>('[data-message-index]')?.dataset?.messageIndex;
    const topIndex = indexStr ? Number.parseInt(indexStr, 10) : NaN;
    if (!Number.isFinite(topIndex)) {
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      setActiveUserMessageId((prev) => (prev === (lastUser?.id ?? null) ? prev : (lastUser?.id ?? null)));
      return;
    }

    for (let i = Math.min(topIndex, messages.length - 1); i >= 0; i--) {
      if (messages[i]?.role === 'user') {
        setActiveUserMessageId((prev) => (prev === messages[i].id ? prev : messages[i].id));
        return;
      }
    }

    const firstUser = messages.find((m) => m.role === 'user');
    setActiveUserMessageId((prev) => (prev === (firstUser?.id ?? null) ? prev : (firstUser?.id ?? null)));
  }, [autoScroll, containerRef, enableStickyUserPrompt, messages, useVirtual, virtualContainerRef]);

  const scheduleRecomputeActiveUserMessage = useCallback(() => {
    if (!enableStickyUserPrompt) return;
    const anyGlobal = globalThis as unknown as { requestAnimationFrame?: (cb: () => void) => number };
    if (typeof anyGlobal.requestAnimationFrame !== 'function') return;
    if (activeMessageRafRef.current !== null) return;
    activeMessageRafRef.current = anyGlobal.requestAnimationFrame(() => {
      activeMessageRafRef.current = null;
      recomputeActiveUserMessage();
    });
  }, [enableStickyUserPrompt, recomputeActiveUserMessage]);

  // Combine scroll handlers
  const handleScroll = useCallback(() => {
    smartScrollHandler();
    if (useVirtual) {
      virtualScrollHandler();
    }
    scheduleRecomputeActiveUserMessage();
  }, [scheduleRecomputeActiveUserMessage, smartScrollHandler, useVirtual, virtualScrollHandler]);

  // Reset virtual list state and UI when session changes
  useEffect(() => {
    resetVirtualList();
    // Reset smart scroll to top
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
    if (virtualContainerRef.current) {
      virtualContainerRef.current.scrollTop = 0;
    }
    // Reset active user message when switching sessions
    setActiveUserMessageId(null);
  }, [currentSessionId, resetVirtualList, containerRef, virtualContainerRef]);

  useEffect(() => {
    return () => {
      const anyGlobal = globalThis as unknown as { cancelAnimationFrame?: (id: number) => void };
      if (activeMessageRafRef.current !== null && typeof anyGlobal.cancelAnimationFrame === 'function') {
        anyGlobal.cancelAnimationFrame(activeMessageRafRef.current);
      }
      activeMessageRafRef.current = null;
    };
  }, []);

  // Recompute active user message when overlay height or messages change
  useEffect(() => {
    scheduleRecomputeActiveUserMessage();
  }, [enableStickyUserPrompt, messages.length, scheduleRecomputeActiveUserMessage, useVirtual]);

  // Messages to render (all or windowed)
  const visibleMessages = useMemo(() => {
    if (!useVirtual) {
      return messages;
    }
    return messages.slice(range.start, range.end);
  }, [messages, useVirtual, range.start, range.end]);

  // Listen for messages from extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
      const message = event.data;

      // Handle batch messages with performance tracking
      if (message.type === 'batch') {
        const startTime = performance.now();
        const batchSize = message.messages.length;

        // Process all messages in the batch
        for (const msg of message.messages) {
          handleSingleMessage(msg);
        }

        // Record batch processing metrics
        const processingTime = performance.now() - startTime;
        performanceMonitor.recordBatch(batchSize, processingTime);

        return;
      }

      // Single message - record as batch of 1
      const startTime = performance.now();
      handleSingleMessage(message);
      const processingTime = performance.now() - startTime;
      performanceMonitor.recordBatch(1, processingTime);
    };

    const handleSingleMessage = (message: ExtensionMessage) => {
      if (message.type === 'batch') {
        return; // Already handled above
      }

      switch (message.type) {
        case 'update':
          handleUpdate(message.data);
          break;
        case 'complete':
          {
            // Flush any pending text updates before marking complete
            const state = useStore.getState();
            const sessionId = message.data?.sessionId as string | undefined;
            const targetSessionId = sessionId ?? state.currentSessionId ?? undefined;
            flushTextBuffer(state, targetSessionId);

            if (targetSessionId === state.currentSessionId) {
              setLoading(false);
            }

            const sessionState = targetSessionId ? state.sessionStates.get(targetSessionId) : null;
            const lastMsg = sessionState?.messages[sessionState.messages.length - 1] ?? state.messages[state.messages.length - 1];
            if (lastMsg) {
              state.updateMessage(lastMsg.id, { isComplete: true }, targetSessionId);
            }
          }
          break;
        case 'sessions':
          setSessions(message.data);
          break;
        case 'currentSession':
          setCurrentSession(message.data.sessionId);
          break;
        case 'workspaceFiles':
          useStore.getState().setWorkspaceFiles(message.data);
          break;
        case 'showHistory':
          // Expand sidebar when requested to show history
          setSidebarCollapsed(false);
          postMessage({ type: 'listHistory' });
          break;
        case 'showEcosystem':
          setShowEcosystem(true);
          break;
        case 'ecosystemData':
          setEcosystemData(message.data);
          break;
        case 'historySessions':
          setHistorySessions(message.data);
          break;
        case 'historyMessages':
          loadHistorySession(message.sessionId, message.data);
          break;
        case 'uiLanguage':
          setUiLanguage(message.data.uiLanguage, 'extension');
          break;
        case 'permissionRequest':
          setPermissionRequest(message.data);
          break;
        case 'permissionRules':
          setPermissionRules(message.data);
          break;
        case 'agents':
          setAgents(message.data);
          break;
        case 'currentAgent':
          setCurrentAgent(message.data.agentId);
          break;
        case 'modeStatus':
          // Sync prompt mode and full mode status from backend
          useStore.getState().setPromptMode(message.data.isPersistent ? 'persistent' : 'oneshot');
          useStore.getState().setModeStatus(message.data);
          break;
        case 'reviewStats':
          {
            const { sessionId: statsSessionId, stats } = message.data;
            const store = useStore.getState();
            const newSessionStates = new Map(store.sessionStates);
            const sessionState = newSessionStates.get(statsSessionId);
            if (sessionState) {
              newSessionStates.set(statsSessionId, {
                ...sessionState,
                reviewStats: stats,
                updatedAt: Date.now(),
              });
              useStore.setState({ sessionStates: newSessionStates });
            }
          }
          break;
        case 'error':
          // Handle error messages from extension
          setLoading(false);
          showError(
            message.data.title || 'Error',
            message.data.message,
            message.data.action ? {
              label: message.data.action.label,
              onClick: () => {
                postMessage({
                  type: 'executeCommand',
                  command: message.data.action!.command
                });
              }
            } : undefined
          );
          break;
      }
    };

    window.addEventListener('message', handleMessage);

    // Request initial session list, agents, and history for sidebar
    postMessage({ type: 'listSessions' });
    postMessage({ type: 'refreshAgents' });
    postMessage({ type: 'listHistory' });
    
    // Sync all persisted settings to backend on startup
    const state = useStore.getState();
    // Sync model
    postMessage({ type: 'setModel', model: state.model });
    // Sync permission mode
    postMessage({ type: 'setPermissionMode', mode: state.permissionMode });
    // Sync thinking mode
    const DEFAULT_MAX_THINKING_TOKENS = 16000;
    postMessage({
      type: 'setThinking',
      enabled: state.thinkingEnabled,
      maxThinkingTokens: state.thinkingEnabled ? DEFAULT_MAX_THINKING_TOKENS : 0,
    });
    // Sync prompt mode
    postMessage({ type: 'setPromptMode', mode: state.promptMode });

    return () => window.removeEventListener('message', handleMessage);
  }, [handleUpdate, setCurrentSession, setLoading, setSessions, showError]);

  // Persist sidebar collapsed state
  useEffect(() => {
    savePersistedState({ sidebarCollapsed });
  }, [sidebarCollapsed]);

  // Handle suggestion card clicks from Welcome screen
  useEffect(() => {
    const handler = (e: Event) => {
      const content = (e as CustomEvent<{ content: string }>).detail?.content;
      if (content) {
        inputAreaRef.current?.setText(content, { focus: true });
      }
    };
    window.addEventListener('vcoder:fillInput', handler);
    return () => window.removeEventListener('vcoder:fillInput', handler);
  }, []);

  const isEmpty = messages.length === 0;
  const isInitializing = isEmpty && isLoading;

  // Memoize message body to avoid re-rendering the entire list when only scroll UI
  // state changes (e.g. JumpToBottom visibility).
  const messagesBody = useMemo(() => {
    if (isEmpty) {
      return isInitializing ? <MessageSkeleton count={2} /> : <Welcome />;
    }

    if (useVirtual) {
      return (
        <>
          {/* Top padding for virtual scrolling */}
          <div style={{ height: range.topPadding }} />
          {visibleMessages.map((msg, idx) => (
            <VirtualMessageItem 
              key={msg.id} 
              message={msg} 
              index={range.start + idx}
              hideUserMessage={hideUserMessagesInList}
            />
          ))}
          {/* Bottom padding for virtual scrolling */}
          <div style={{ height: range.bottomPadding }} />
        </>
      );
    }

    return messages.map((msg, idx) => (
      <VirtualMessageItem key={msg.id} message={msg} index={idx} hideUserMessage={hideUserMessagesInList} />
    ));
  }, [
    isEmpty,
    isInitializing,
    isLoading,
    hideUserMessagesInList,
    messages,
    range.bottomPadding,
    range.start,
    range.topPadding,
    useVirtual,
    visibleMessages,
  ]);

  const activeUserMessage = useMemo(() => {
    if (!enableStickyUserPrompt) return null;
    if (!activeUserMessageId) return null;
    const found = messages.find((m) => m.id === activeUserMessageId);
    return found?.role === 'user' ? found : null;
  }, [activeUserMessageId, enableStickyUserPrompt, messages]);

  const handleStickyPromptHeightChange = useCallback((height: number) => {
    setStickyPromptHeight(height);
  }, []);

  const messagesContainerStyle = useMemo(
    () => ({
      '--vc-sticky-user-prompt-offset': `${enableStickyUserPrompt ? stickyPromptHeight : 0}px`,
    }) as CSSProperties,
    [enableStickyUserPrompt, stickyPromptHeight]
  );

  // Extract TODOs from TodoWrite tool calls across all messages
  const todoItems = useMemo(() => {
    // Find the latest TodoWrite call across all messages
    let latestTodoWrite: Record<string, unknown> | null = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (!msg.toolCalls) continue;
      for (let j = msg.toolCalls.length - 1; j >= 0; j--) {
        const tc = msg.toolCalls[j];
        if (tc.name === 'TodoWrite' && tc.input) {
          latestTodoWrite = tc.input as Record<string, unknown>;
          break;
        }
      }
      if (latestTodoWrite) break;
    }
    if (!latestTodoWrite) return [];

    const items = latestTodoWrite.tasks ?? latestTodoWrite.todos ?? latestTodoWrite.items;
    if (!Array.isArray(items)) return [];

    return items.map((task, index) => {
      if (typeof task === 'string') {
        return {
          id: `todo-${index}`,
          content: task,
          status: 'pending' as const,
          priority: 'medium' as const,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      }
      const t = task as Record<string, unknown>;
      return {
        id: String(t.id ?? `todo-${index}`),
        content: String(t.content ?? t.title ?? t.description ?? ''),
        status: (t.status as 'pending' | 'in_progress' | 'completed' | 'cancelled') ?? 'pending',
        priority: (t.priority as 'high' | 'medium' | 'low') ?? 'medium',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    }) as EnhancedTodoItem[];
  }, [messages]);

  // Extract TASKs from Task tool calls across all messages
  const taskItems = useMemo(() => {
    const items: TaskItem[] = [];
    for (const msg of messages) {
      if (!msg.toolCalls) continue;
      for (const tc of msg.toolCalls) {
        if (tc.name === 'Task') {
          items.push({
            id: tc.id,
            description: String((tc.input as Record<string, unknown>)?.description ?? 'Subagent task'),
            subagentType: (tc.input as Record<string, unknown>)?.subagent_type as string,
            status: tc.status === 'completed' ? 'success' :
                    tc.status === 'failed' ? 'error' :
                    tc.status === 'running' ? 'running' : 'pending',
            startTime: undefined,
            endTime: undefined,
          });
        }
      }
    }
    return items;
  }, [messages]);

  const hasTodoOrTask = todoItems.length > 0 || taskItems.length > 0;

  return (
    <div className="app app--desktop">
      {/* Persistent left sidebar */}
      <DesktopSidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        onShowEcosystem={() => setShowEcosystem(true)}
      />

      {/* Main content area */}
      <div className="app__main">
        {tasks.length > 0 && (planMode || permissionMode === 'plan') && (
            <PlanBlock plan={tasks} sticky={true} />
        )}

        {subagentRuns.length > 0 && (planMode || permissionMode === 'plan') && (
            <TaskRunsBlock runs={subagentRuns} sticky={true} />
        )}

        {hasTodoOrTask && (
          <div className="sticky-todo-task-manager">
            <TodoTaskManager
              todos={todoItems}
              tasks={taskItems}
              expandByDefault={false}
              showFilters={true}
              sortable={true}
            />
          </div>
        )}

        <div className="messages-panel">
          {enableStickyUserPrompt && (
            <StickyUserPrompt
              message={activeUserMessage}
              disabled={isLoading || viewMode === 'history'}
              onApplyToComposer={(text) => inputAreaRef.current?.setText(text, { focus: true })}
              onHeightChange={handleStickyPromptHeightChange}
            />
          )}
          <div
            className={`messages-container${isEmpty ? ' messages-container--empty' : ''}`}
            ref={useVirtual ? virtualContainerRef : containerRef}
            onScroll={handleScroll}
            style={messagesContainerStyle}
          >
            {messagesBody}
            <div ref={endRef} />
          </div>
        </div>

        {/* Jump to bottom button - shows when user scrolls up */}
        <JumpToBottom visible={!autoScroll && messages.length > 0} onClick={jumpToBottom} />

        {error && (
          <div className="error-banner">
            <span className="error-icon">⚠️</span>
            <div className="error-content">
              <span className="error-message">{error.message}</span>
              {error.action && (
                <button
                  className="error-action-btn"
                  onClick={() => {
                    postMessage({
                      type: 'executeCommand',
                      command: error.action?.command
                    });
                    useStore.getState().setError(null);
                  }}
                >
                  {error.action.label}
                </button>
              )}
            </div>
            <button className="error-dismiss" onClick={() => useStore.getState().setError(null)}>
              ×
            </button>
          </div>
        )}

        <InputArea ref={inputAreaRef} />
      </div>

      {/* Overlay panels */}
      <EcosystemPanel
        visible={showEcosystem}
        onClose={() => setShowEcosystem(false)}
        data={ecosystemData}
        onRefresh={() => postMessage({ type: 'getEcosystemData' })}
      />

      <AgentTeamsPanel
        visible={showAgentTeams}
        onClose={() => setShowAgentTeams(false)}
      />

      <PermissionRulesPanel
        visible={showPermissionRules}
        onClose={() => setShowPermissionRules(false)}
      />

      <PermissionDialog
        request={permissionRequest}
        onClose={() => setPermissionRequest(null)}
      />
    </div>
  );
}

export default App;
