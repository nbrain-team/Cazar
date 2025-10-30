import { useState, useRef, useEffect } from 'react';
import { Send, Share2, Calendar, Layers, Loader2, Database, Mail, DollarSign, Globe, HardDrive, Settings } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ComplianceURLManager } from '../components/ComplianceURLManager';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: Source[];
}

interface Source {
  type: 'pinecone' | 'microsoft' | 'adp' | 'web' | 'database';
  title: string;
  url?: string;
  snippet?: string;
}

interface DatabaseSource {
  id: string;
  name: string;
  icon: React.ReactNode;
  enabled: boolean;
  color: string;
}

export default function SmartAgentPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showDatabaseSelector, setShowDatabaseSelector] = useState(false);
  const [showComplianceManager, setShowComplianceManager] = useState(false);
  const [databases, setDatabases] = useState<DatabaseSource[]>([
    { id: 'pinecone', name: 'Vector Knowledge Base', icon: <Database size={20} />, enabled: false, color: '#10b981' },
    { id: 'microsoft', name: 'Microsoft 365', icon: <Mail size={20} />, enabled: true, color: '#0078d4' },
    { id: 'adp', name: 'ADP Payroll', icon: <DollarSign size={20} />, enabled: true, color: '#ef4444' },
    { id: 'web', name: 'Web Search', icon: <Globe size={20} />, enabled: false, color: '#f59e0b' },
    { id: 'postgres', name: 'PostgreSQL', icon: <HardDrive size={20} />, enabled: true, color: '#3b82f6' },
  ]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const enabledDbs = databases.filter(db => db.enabled).map(db => db.id);
      
      const response = await fetch('/api/smart-agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: inputValue,
          enabledDatabases: enabledDbs,
          conversationHistory: messages.slice(-10),
        }),
      });

      if (!response.ok) throw new Error('Failed to get response');

      const data = await response.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
        sources: data.sources || [],
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I apologize, but I encountered an error processing your request. Please try again.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const toggleDatabase = (id: string) => {
    setDatabases(prev =>
      prev.map(db => (db.id === id ? { ...db, enabled: !db.enabled } : db))
    );
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 80px)',
      padding: '2rem',
      gap: '1rem',
    }}>
      {/* Header */}
      <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
            Smart Agent
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Ask questions and get answers from your internal knowledge base, powered by AI.
          </p>
        </div>
        <button
          onClick={() => setShowComplianceManager(true)}
          style={{
            padding: '0.5rem 1rem',
            background: 'var(--gray-light)',
            color: 'var(--text-primary)',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontWeight: 500,
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--primary-light)';
            e.currentTarget.style.color = 'var(--primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--gray-light)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          title="Configure compliance URLs"
        >
          <Settings size={16} />
          Compliance URLs
        </button>
      </div>

      {/* Chat Container */}
      <div
        ref={chatContainerRef}
        style={{
          flex: 1,
          background: 'var(--card-bg)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow)',
          padding: '2rem',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
        }}
      >
        {messages.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--text-secondary)',
            textAlign: 'center',
          }}>
            <Database size={64} style={{ marginBottom: '1rem', opacity: 0.3 }} />
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Welcome to Smart Agent
            </h2>
            <p style={{ maxWidth: '500px' }}>
              Ask me anything about your operations, compliance regulations, payroll data, or team communications.
              I can search across multiple data sources to provide comprehensive answers.
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} style={{ display: 'flex', gap: '1rem' }}>
              {/* Avatar */}
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: message.role === 'user' ? 'var(--primary)' : 'var(--gray-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: message.role === 'user' ? 'white' : 'var(--text-primary)',
                fontWeight: 600,
                fontSize: '0.875rem',
              }}>
                {message.role === 'user' ? 'U' : 'AI'}
              </div>

              {/* Message Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {message.role === 'user' ? 'You' : 'Smart Agent'}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {message.timestamp.toLocaleTimeString()}
                  </span>
                </div>

                {/* Message Text */}
                <div style={{
                  color: 'var(--text-primary)',
                  lineHeight: 1.6,
                  fontSize: '0.95rem',
                }}>
                  {message.role === 'assistant' ? (
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm]}
                      components={{
                        table: ({node, ...props}) => (
                          <table style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            margin: '1rem 0',
                            fontSize: '0.875rem',
                          }} {...props} />
                        ),
                        th: ({node, ...props}) => (
                          <th style={{
                            background: 'var(--gray-light)',
                            padding: '0.75rem',
                            textAlign: 'left',
                            borderBottom: '2px solid var(--border)',
                            fontWeight: 600,
                          }} {...props} />
                        ),
                        td: ({node, ...props}) => (
                          <td style={{
                            padding: '0.75rem',
                            borderBottom: '1px solid var(--border)',
                          }} {...props} />
                        ),
                        code: ({node, ...props}) => (
                          <code style={{
                            background: 'var(--gray-light)',
                            padding: '0.2rem 0.4rem',
                            borderRadius: '4px',
                            fontSize: '0.875em',
                            fontFamily: 'monospace',
                          }} {...props} />
                        ),
                        pre: ({node, ...props}) => (
                          <pre style={{
                            background: 'var(--gray-light)',
                            padding: '1rem',
                            borderRadius: '8px',
                            overflow: 'auto',
                            margin: '1rem 0',
                          }} {...props} />
                        ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  ) : (
                    <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{message.content}</p>
                  )}
                </div>

                {/* Sources */}
                {message.sources && message.sources.length > 0 && (
                  <div style={{
                    marginTop: '1rem',
                    padding: '1rem',
                    background: 'var(--gray-light)',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                      Sources:
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {message.sources.map((source, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                          <span style={{
                            padding: '0.25rem 0.5rem',
                            background: 'white',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                          }}>
                            {source.type}
                          </span>
                          <div style={{ flex: 1 }}>
                            {source.url ? (
                              <a href={source.url} target="_blank" rel="noopener noreferrer" style={{
                                color: 'var(--primary)',
                                textDecoration: 'none',
                                fontWeight: 500,
                              }}>
                                {source.title}
                              </a>
                            ) : (
                              <span style={{ fontWeight: 500 }}>{source.title}</span>
                            )}
                            {source.snippet && (
                              <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                {source.snippet}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {isLoading && (
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'var(--gray-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Smart Agent is thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div style={{
        display: 'flex',
        gap: '1rem',
        background: 'var(--card-bg)',
        padding: '1rem',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow)',
      }}>
        {/* Message Input */}
        <textarea
          placeholder="Ask a question or type a command..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          style={{
            flex: 1,
            padding: '0.75rem',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            fontSize: '0.875rem',
            outline: 'none',
            resize: 'none',
            minHeight: '48px',
            maxHeight: '120px',
            fontFamily: 'inherit',
            background: 'var(--input-bg)',
          }}
          onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
          onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
        />

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            onClick={() => {/* Share functionality */}}
            style={{
              padding: '0.75rem',
              border: 'none',
              background: 'transparent',
              color: 'var(--icon-color)',
              cursor: 'pointer',
              borderRadius: '8px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--gray-light)';
              e.currentTarget.style.color = 'var(--primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--icon-color)';
            }}
            title="Share conversation"
          >
            <Share2 size={20} />
          </button>

          <button
            onClick={() => {/* Calendar functionality */}}
            style={{
              padding: '0.75rem',
              border: 'none',
              background: 'transparent',
              color: 'var(--icon-color)',
              cursor: 'pointer',
              borderRadius: '8px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--gray-light)';
              e.currentTarget.style.color = 'var(--primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--icon-color)';
            }}
            title="Schedule"
          >
            <Calendar size={20} />
          </button>

          <button
            onClick={() => setShowDatabaseSelector(!showDatabaseSelector)}
            style={{
              padding: '0.75rem',
              border: 'none',
              background: showDatabaseSelector ? 'var(--primary-light)' : 'transparent',
              color: showDatabaseSelector ? 'var(--primary)' : 'var(--icon-color)',
              cursor: 'pointer',
              borderRadius: '8px',
              transition: 'all 0.2s',
              position: 'relative',
            }}
            onMouseEnter={(e) => {
              if (!showDatabaseSelector) {
                e.currentTarget.style.background = 'var(--gray-light)';
                e.currentTarget.style.color = 'var(--primary)';
              }
            }}
            onMouseLeave={(e) => {
              if (!showDatabaseSelector) {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--icon-color)';
              }
            }}
            title="Select data sources"
          >
            <Layers size={20} />
          </button>

          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading}
            style={{
              padding: '0.75rem 1.5rem',
              border: 'none',
              background: 'var(--primary)',
              color: 'white',
              cursor: inputValue.trim() && !isLoading ? 'pointer' : 'not-allowed',
              borderRadius: '8px',
              transition: 'all 0.2s',
              opacity: inputValue.trim() && !isLoading ? 1 : 0.5,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontWeight: 500,
            }}
            onMouseEnter={(e) => {
              if (inputValue.trim() && !isLoading) {
                e.currentTarget.style.background = '#1e40af';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--primary)';
            }}
          >
            {isLoading ? <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={20} />}
          </button>
        </div>
      </div>

      {/* Database Selector Popup */}
      {showDatabaseSelector && (
        <div style={{
          position: 'fixed',
          bottom: '120px',
          right: '2rem',
          background: 'var(--card-bg)',
          borderRadius: 'var(--radius)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
          padding: '1.5rem',
          minWidth: '320px',
          zIndex: 1000,
        }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600 }}>
            Select Data Sources
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {databases.map((db) => (
              <label
                key={db.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  cursor: 'pointer',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  background: db.enabled ? 'var(--gray-light)' : 'transparent',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--gray-light)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = db.enabled ? 'var(--gray-light)' : 'transparent';
                }}
              >
                <input
                  type="checkbox"
                  checked={db.enabled}
                  onChange={() => toggleDatabase(db.id)}
                  style={{
                    width: '18px',
                    height: '18px',
                    cursor: 'pointer',
                    accentColor: 'var(--primary)',
                  }}
                />
                <div style={{ color: db.color }}>
                  {db.icon}
                </div>
                <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 500 }}>
                  {db.name}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Compliance URL Manager */}
      {showComplianceManager && (
        <ComplianceURLManager onClose={() => setShowComplianceManager(false)} />
      )}
    </div>
  );
}

