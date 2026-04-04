'use client';

import { useEffect, useRef, useState } from 'react';

interface ChatMessage {
  text: string;
  from: 'agent' | 'user';
  time: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [typing, setTyping] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    connect();
    return () => { wsRef.current?.close(); };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Connect to the API server WebSocket, not the Next.js dev server
    const wsUrl = `${protocol}//localhost:4000/chat`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      setTimeout(connect, 3000);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'session') {
        sessionIdRef.current = data.session_id;
      }
      if (data.type === 'typing') {
        setTyping(true);
        setTimeout(() => setTyping(false), 2000);
      }
      if (data.type === 'message' && data.from === 'agent') {
        setTyping(false);
        setMessages(prev => [...prev, {
          text: data.text,
          from: 'agent',
          time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        }]);
      }
    };
  }

  function send() {
    const text = input.trim();
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    setMessages(prev => [...prev, {
      text,
      from: 'user',
      time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    }]);

    wsRef.current.send(JSON.stringify({ type: 'message', text }));
    setInput('');
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-brand-dark">Live Chat</h2>
          <p className="text-xs text-gray-400">Golden Gate Intake Agent — test the family chat experience</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-400'}`} />
          <span className="text-xs text-gray-400">{connected ? 'Connected' : 'Disconnecting...'}</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-gray-50 px-6 py-4">
        {messages.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-300 text-4xl mb-4">💬</p>
            <p className="text-sm text-gray-400">Chat will start automatically when connected.</p>
            <p className="text-xs text-gray-300 mt-2">This simulates the family chat experience on kcgoldengate.com</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex mb-3 ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.from === 'agent' && (
              <div className="w-8 h-8 rounded-full bg-brand-dark text-gold flex items-center justify-center text-xs font-bold mr-2 mt-1 shrink-0">
                GG
              </div>
            )}
            <div className={`max-w-[70%] ${msg.from === 'user' ? 'order-1' : ''}`}>
              <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                msg.from === 'agent'
                  ? 'bg-white border border-gray-200 text-gray-800 rounded-bl-md'
                  : 'bg-brand-dark text-white rounded-br-md'
              }`}>
                {msg.text}
              </div>
              <p className={`text-[10px] text-gray-300 mt-1 ${msg.from === 'user' ? 'text-right' : ''}`}>
                {msg.time}
              </p>
            </div>
          </div>
        ))}

        {typing && (
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-brand-dark text-gold flex items-center justify-center text-xs font-bold shrink-0">GG</div>
            <div className="bg-white border border-gray-200 px-4 py-2 rounded-2xl rounded-bl-md">
              <span className="text-gray-400 text-sm">typing</span>
              <span className="text-gray-400 animate-pulse">...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t px-4 py-3 flex items-center gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={connected ? 'Type a message...' : 'Connecting...'}
          disabled={!connected}
          className="flex-1 border border-gray-300 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:border-gold disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={!connected || !input.trim()}
          className="w-10 h-10 rounded-full bg-gold text-white flex items-center justify-center text-lg hover:bg-gold-dark disabled:opacity-50 transition-colors"
        >
          ➤
        </button>
      </div>
    </div>
  );
}
