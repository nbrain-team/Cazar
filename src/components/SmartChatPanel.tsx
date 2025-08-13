import { useEffect, useRef, useState } from 'react';
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
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', text: 'Hi! I can crunch operations metrics and do deep RAG research. Try: "Compare DCR vs SWC‑POD for DYY5 vs VNY1" or "Deep research: top 5 speeding event rate and where to improve".' }
  ]);
  const [input, setInput] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [open, messages]);

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    const userMsg: ChatMessage = { role: 'user', text: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    const answer = await SmartChatService.ask(trimmed, { explain: false });
    setMessages(prev => [...prev, { role: 'assistant', text: formatFriendly(answer) }]);
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
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
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
        <button className="btn btn-primary" onClick={send}>
          <Send size={16} />
          Ask
        </button>
      </div>
    </div>
  );
} 