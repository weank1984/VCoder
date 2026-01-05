/**
 * V-Coder Webview App
 */

import { useEffect, useState, useMemo } from 'react';
import { useStore } from './store/useStore';
import { useSmartScroll } from './hooks/useSmartScroll';
import { useVirtualList, clearHeightCache } from './hooks/useVirtualList';
import { PlanBlock } from './components/PlanBlock';
import { TaskRunsBlock } from './components/TaskRunsBlock';
import { ChatBubble } from './components/ChatBubble';
import { VirtualMessageItem } from './components/VirtualMessageItem';
import { InputArea } from './components/InputArea';
import { HistoryPanel } from './components/HistoryPanel';
import { JumpToBottom } from './components/JumpToBottom';
import { Welcome } from './components/Welcome';
import { postMessage } from './utils/vscode';
import type { ExtensionMessage } from './types';
import './styles/index.scss';
import './App.scss';

// Enable virtual list when message count exceeds this threshold
const VIRTUAL_LIST_THRESHOLD = 50;
const ESTIMATED_MESSAGE_HEIGHT = 120;

function App() {
  const [showHistory, setShowHistory] = useState(false);

  const {
    currentSessionId,
    messages,
    tasks,
    subagentRuns,
    planMode,
    permissionMode,
    error,
    setUiLanguage,
    setSessions,
    setCurrentSession,
    handleUpdate,
    setLoading,
    setHistorySessions,
    loadHistorySession,
    historySessions,
  } = useStore();

  // Determine if virtual list should be enabled
  const useVirtual = messages.length > VIRTUAL_LIST_THRESHOLD;

  // Smart auto-scroll: only scroll when at bottom, show jump button when scrolled up
  const { containerRef, endRef, onScroll: smartScrollHandler, autoScroll, jumpToBottom } = useSmartScroll(messages);

  // Virtual list for long sessions
  const { 
    containerRef: virtualContainerRef, 
    range, 
    onScroll: virtualScrollHandler 
  } = useVirtualList({
    itemCount: messages.length,
    estimatedItemHeight: ESTIMATED_MESSAGE_HEIGHT,
    overscan: 5,
  });

  // Combine scroll handlers
  const handleScroll = () => {
    smartScrollHandler();
    if (useVirtual) {
      virtualScrollHandler();
    }
  };

  // Clear height cache when session changes
  useEffect(() => {
    clearHeightCache();
  }, [currentSessionId]);

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

      switch (message.type) {
        case 'update':
          handleUpdate(message.data);
          break;
        case 'complete':
          {
            setLoading(false);
            const state = useStore.getState();
            const lastMsg = state.messages[state.messages.length - 1];
            if (lastMsg) {
              state.updateMessage(lastMsg.id, { isComplete: true });
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
      }
    };

    window.addEventListener('message', handleMessage);

    // Request initial session list
    postMessage({ type: 'listSessions' });
    
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
  }, [handleUpdate, setCurrentSession, setLoading, setSessions]);


  const isEmpty = messages.length === 0;

  return (
    <div className="app">
      {tasks.length > 0 && (planMode || permissionMode === 'plan') && (
          <PlanBlock plan={tasks} sticky={true} />
      )}

      {subagentRuns.length > 0 && (planMode || permissionMode === 'plan') && (
          <TaskRunsBlock runs={subagentRuns} sticky={true} />
      )}

      <div 
        className={`messages-container${isEmpty ? ' messages-container--empty' : ''}`} 
        ref={useVirtual ? virtualContainerRef : containerRef}
        onScroll={handleScroll}
      >
        {isEmpty ? (
          <Welcome />
        ) : useVirtual ? (
          <>
            {/* Top padding for virtual scrolling */}
            <div style={{ height: range.topPadding }} />
            {visibleMessages.map((msg, idx) => (
              <VirtualMessageItem 
                key={msg.id} 
                message={msg} 
                index={range.start + idx}
              />
            ))}
            {/* Bottom padding for virtual scrolling */}
            <div style={{ height: range.bottomPadding }} />
          </>
        ) : (
          messages.map((msg) => (
            <ChatBubble key={msg.id} message={msg} />
          ))
        )}
        <div ref={endRef} />
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

      <InputArea />
    </div>
  );
}

export default App;
