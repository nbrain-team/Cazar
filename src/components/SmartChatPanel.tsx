import React, { useEffect, useRef, useState } from 'react';
import { X, Send } from 'lucide-react';
import { SmartChatService } from '../services/smartChatService';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface SmartChatPanelProps {
  open: boolean;
  onClose: () => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export function SmartChatPanel({ open, onClose }: SmartChatPanelProps) {
  // Add styles for animations
  React.useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes thinking {
        0%, 60%, 100% { content: ''; }
        20% { content: '.'; }
        40% { content: '..'; }
        80% { content: '...'; }
      }
      .thinking-dots::after {
        content: '';
        animation: thinking 1.4s infinite;
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', text: 'Hi! I can help with operations metrics and HOS compliance. Try asking about:\n\n• **Operations:** "Compare DCR vs SWC‑POD for DYY5 vs VNY1"\n• **HOS Compliance:** "Do I have any drivers at risk of violating 7 days of work in a row?"\n• **Deep Research:** "Deep research: top 5 speeding event rate"' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [open, messages]);

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    
    const userMsg: ChatMessage = { role: 'user', text: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    
    // Add thinking message with animated dots
    const thinkingMsg: ChatMessage = { 
      role: 'assistant', 
      text: '🤔 Analyzing your question<span class="thinking-dots"></span>' 
    };
    setMessages(prev => [...prev, thinkingMsg]);
    
    try {
      const answer = await SmartChatService.ask(trimmed, { explain: false });
      // Remove thinking message and add real answer
      setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', text: answer }]);
    } catch (error) {
      // Replace thinking message with error
      setMessages(prev => [...prev.slice(0, -1), { 
        role: 'assistant', 
        text: '❌ Sorry, I encountered an error processing your request. Please try again.' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const formatFriendly = (text: string) => {
    // Light-touch formatting: ensure line breaks and bullets render nicely
    return text.replaceAll(' - ', '\n- ');
  };

  return (
    <div
      className="smart-chat-panel"
      style={{
        transform: open ? 'translateX(0)' : 'translateX(-10px)',
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'auto' : 'none'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Smart Chat</h3>
        <button className="btn btn-secondary" onClick={onClose} style={{ padding: '0.25rem 0.5rem' }}>
          <X size={16} />
        </button>
      </div>
      <div ref={containerRef} style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {messages.map((m, idx) => (
          <div key={idx} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
            <div className="card" style={{ background: m.role === 'user' ? 'var(--primary-light)' : 'var(--card-bg)', padding: '0.75rem 1rem' }}>
              {m.role === 'assistant' ? (
                m.text.includes('thinking-dots') ? (
                  <div dangerouslySetInnerHTML={{ __html: m.text }} />
                ) : (
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ children }) => <h2 style={{ fontSize: '1.5rem', marginTop: '1rem', marginBottom: '0.5rem' }}>{children}</h2>,
                      h2: ({ children }) => <h3 style={{ fontSize: '1.25rem', marginTop: '1rem', marginBottom: '0.5rem' }}>{children}</h3>,
                      h3: ({ children }) => <h4 style={{ fontSize: '1.1rem', marginTop: '0.75rem', marginBottom: '0.25rem' }}>{children}</h4>,
                      hr: () => <hr style={{ margin: '1rem 0', border: 'none', borderTop: '1px solid var(--border)' }} />,
                      blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid var(--primary)', paddingLeft: '1rem', margin: '0.5rem 0', color: 'var(--text-secondary)' }}>{children}</blockquote>,
                      ul: ({ children }) => <ul style={{ marginLeft: '1.5rem', marginBottom: '0.5rem' }}>{children}</ul>,
                      ol: ({ children }) => <ol style={{ marginLeft: '1.5rem', marginBottom: '0.5rem' }}>{children}</ol>,
                      p: ({ children }) => <p style={{ marginBottom: '0.5rem' }}>{children}</p>
                    }}
                  >
                    {m.text}
                  </ReactMarkdown>
                )
              ) : (
                <div style={{ fontSize: '0.9rem' }}>{m.text}</div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem', borderTop: '1px solid var(--border)' }}>
        <input
          className="input"
          placeholder="Ask for a comparison, ranking, or type ‘deep research: ...’ for RAG"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send(); }}
        />
        <button 
          className="btn btn-primary" 
          onClick={send}
          disabled={isLoading}
          style={{ opacity: isLoading ? 0.6 : 1 }}
        >
          {isLoading ? (
            <>
              <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span>
            </>
          ) : (
            <Send size={16} />
          )}
          {isLoading ? 'Thinking...' : 'Ask'}
        </button>
      </div>
    </div>
  );
} 