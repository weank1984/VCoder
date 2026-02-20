/**
 * VCoder Webview App
 */

import { useEffect, useMemo, useCallback, useRef, useState, type CSSProperties } from 'react';
import { useStore, flushTextBuffer } from './store/useStore';
import { useSmartScroll } from './hooks/useSmartScroll';
import { useVirtualList } from './hooks/useVirtualList';
import { PlanBlock } from './components/PlanBlock';
import { TaskRunsBlock } from './components/TaskRunsBlock';
import { VirtualMessageItem } from './components/VirtualMessageItem';
import { InputArea, type InputAreaHandle } from './components/InputArea';
import { HistoryPanel } from './components/HistoryPanel';
import { JumpToBottom } from './components/JumpToBottom';
import { Welcome } from './components/Welcome';
import { PermissionDialog, type PermissionRequest } from './components/PermissionDialog';
import { MessageSkeleton } from './components/Skeleton';
import { StickyUserPrompt } from './components/StickyUserPrompt';
import { useToast } from './utils/Toast';
import { postMessage } from './utils/vscode';
import { performanceMonitor } from './utils/messageQueue';
import type { ExtensionMessage } from './types';
import './styles/index.scss';
import './App.scss';

// Enable virtual list when message count exceeds this threshold
const VIRTUAL_LIST_THRESHOLD = 50;
const ESTIMATED_MESSAGE_HEIGHT = 120;

function App() {
  const [showHistory, setShowHistory] = useState(false);
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
    historySessions,
    viewMode,
    setAgents,
    setCurrentAgent,
  } = useStore();

  // Determine if virtual list should be enabled
  // Disable virtual list for history mode to avoid height estimation issues
  const useVirtual = viewMode === 'live' && messages.length > VIRTUAL_LIST_THRESHOLD;
  const hideUserMessagesInList = true;
  const enableStickyUserPrompt = true;

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
          setShowHistory(true);
          postMessage({ type: 'listHistory' }); // Refresh history list when opening
          break;
        case 'historySessions':
          setHistorySessions(message.data);
          break;
        case 'historyMessages':
          loadHistorySession(message.sessionId, message.data);
          setShowHistory(false);
          break;
        case 'uiLanguage':
          setUiLanguage(message.data.uiLanguage, 'extension');
          break;
        case 'permissionRequest':
          setPermissionRequest(message.data);
          break;
        case 'agents':
          setAgents(message.data);
          break;
        case 'currentAgent':
          setCurrentAgent(message.data.agentId);
          break;
        case 'error':
          // Handle error messages from extension
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

    // Request initial session list and agents
    postMessage({ type: 'listSessions' });
    postMessage({ type: 'refreshAgents' });
    
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

    return () => window.removeEventListener('message', handleMessage);
  }, [handleUpdate, setCurrentSession, setLoading, setSessions, showError]);


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

  return (
    <div className="app">
      {tasks.length > 0 && (planMode || permissionMode === 'plan') && (
          <PlanBlock plan={tasks} sticky={true} />
      )}

      {subagentRuns.length > 0 && (planMode || permissionMode === 'plan') && (
          <TaskRunsBlock runs={subagentRuns} sticky={true} />
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

      <HistoryPanel
        historySessions={historySessions}
        visible={showHistory}
        onClose={() => setShowHistory(false)}
      />

      <PermissionDialog 
        request={permissionRequest}
        onClose={() => setPermissionRequest(null)}
      />

      <InputArea ref={inputAreaRef} />
    </div>
  );
}

export default App;
