/**
 * V-Coder Webview App
 */

import { useEffect, useRef } from 'react';
import { useStore } from './store/useStore';
import { TaskList } from './components/TaskList';
import { ChatBubble } from './components/ChatBubble';
import { InputArea } from './components/InputArea';
import { postMessage } from './utils/vscode';
import type { ExtensionMessage } from './types';
import './App.css';

function App() {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    tasks,
    planMode,
    error,
    setSessions,
    setCurrentSession,
    handleUpdate,
    setLoading,
  } = useStore();

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
      }
    };

    window.addEventListener('message', handleMessage);

    // Request initial session list
    postMessage({ type: 'listSessions' });

    return () => window.removeEventListener('message', handleMessage);
  }, [handleUpdate, setCurrentSession, setLoading, setSessions]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="app">
      <TaskList tasks={tasks} visible={planMode} />

      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-card">
              <div className="empty-icon">🤖</div>
              <h2>欢迎使用 VCoder</h2>
              <p>输入你的问题，让 AI 帮你写代码、修 Bug、做重构</p>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <ChatBubble key={msg.id} message={msg} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="error-banner">
          <span className="error-icon">⚠️</span>
          <span className="error-message">{error}</span>
          <button className="error-dismiss" onClick={() => useStore.getState().setError(null)}>
            ×
          </button>
        </div>
      )}

      <InputArea />
    </div>
  );
}

export default App;
