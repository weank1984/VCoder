/**
 * Z-Code Webview App
 */

import React, { useEffect, useRef } from 'react';
import { useStore } from './store/useStore';
import { SessionHeader } from './components/SessionHeader';
import { TaskList } from './components/TaskList';
import { ChatBubble } from './components/ChatBubble';
import { InputArea } from './components/InputArea';
import { postMessage } from './utils/vscode';
import { ExtensionMessage } from './types';
import './App.css';

function App() {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    sessions,
    currentSessionId,
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
          setLoading(false);
          // Mark last message as complete
          const lastMsg = messages[messages.length - 1];
          if (lastMsg) {
            useStore.getState().updateMessage(lastMsg.id, { isComplete: true });
          }
          break;
        case 'sessions':
          setSessions(message.data);
          break;
      }
    };

    window.addEventListener('message', handleMessage);

    // Request initial session list
    postMessage({ type: 'listSessions' });

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSwitchSession = (sessionId: string) => {
    setCurrentSession(sessionId);
    postMessage({ type: 'switchSession', sessionId });
  };

  return (
    <div className="app">
      <SessionHeader
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSwitchSession={handleSwitchSession}
      />

      <TaskList tasks={tasks} visible={planMode} />

      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🤖</div>
            <h2>Welcome to Z-Code</h2>
            <p>Start a conversation with AI to get coding help</p>
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
