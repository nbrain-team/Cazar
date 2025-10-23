import React, { useState, useEffect } from 'react';
import { MessageSquare, Users, Send, RefreshCw, Hash, Clock } from 'lucide-react';

interface TeamMember {
  id: string;
  name: string;
  email: string;
}

interface TeamsMessage {
  id: string;
  subject: string;
  content: string;
  from: string;
  createdDateTime: string;
  replyCount?: number;
}

interface Team {
  id: string;
  displayName: string;
  description?: string;
}

interface Channel {
  id: string;
  displayName: string;
  description?: string;
}

const MicrosoftAgentPage: React.FC = () => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<TeamsMessage[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form states
  const [newThreadTitle, setNewThreadTitle] = useState('');
  const [newThreadContent, setNewThreadContent] = useState('');
  const [selectedMember, setSelectedMember] = useState<string>('');
  const [replyContent, setReplyContent] = useState('');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  // Load teams on mount
  useEffect(() => {
    loadTeams();
  }, []);

  // Load channels when team is selected
  useEffect(() => {
    if (selectedTeam) {
      loadChannels(selectedTeam.id);
      loadMembers(selectedTeam.id);
    }
  }, [selectedTeam]);

  // Load messages when channel is selected
  useEffect(() => {
    if (selectedTeam && selectedChannel) {
      loadMessages(selectedTeam.id, selectedChannel.id);
    }
  }, [selectedTeam, selectedChannel]);

  const loadTeams = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/microsoft/teams');
      if (!response.ok) throw new Error('Failed to load teams');
      const data = await response.json();
      setTeams(data.teams || []);
      if (data.teams && data.teams.length > 0) {
        setSelectedTeam(data.teams[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load teams');
    } finally {
      setLoading(false);
    }
  };

  const loadChannels = async (teamId: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/microsoft/teams/${teamId}/channels`);
      if (!response.ok) throw new Error('Failed to load channels');
      const data = await response.json();
      setChannels(data.channels || []);
      if (data.channels && data.channels.length > 0) {
        setSelectedChannel(data.channels[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load channels');
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (teamId: string, channelId: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/microsoft/teams/${teamId}/channels/${channelId}/messages`);
      if (!response.ok) throw new Error('Failed to load messages');
      const data = await response.json();
      setMessages(data.messages || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  const loadMembers = async (teamId: string) => {
    try {
      const response = await fetch(`/api/microsoft/teams/${teamId}/members`);
      if (!response.ok) throw new Error('Failed to load members');
      const data = await response.json();
      setMembers(data.members || []);
    } catch (err) {
      console.error('Failed to load members:', err);
    }
  };

  const handleCreateThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeam || !selectedChannel) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/microsoft/teams/${selectedTeam.id}/channels/${selectedChannel.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: newThreadTitle,
          content: newThreadContent,
          mentionMember: selectedMember || undefined,
        }),
      });

      if (!response.ok) throw new Error('Failed to create thread');
      
      setNewThreadTitle('');
      setNewThreadContent('');
      setSelectedMember('');
      await loadMessages(selectedTeam.id, selectedChannel.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create thread');
    } finally {
      setLoading(false);
    }
  };

  const handleReplyToThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeam || !selectedChannel || !selectedThreadId) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/microsoft/teams/${selectedTeam.id}/channels/${selectedChannel.id}/messages/${selectedThreadId}/replies`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: replyContent,
            mentionMember: selectedMember || undefined,
          }),
        }
      );

      if (!response.ok) throw new Error('Failed to reply to thread');
      
      setReplyContent('');
      setSelectedMember('');
      setSelectedThreadId(null);
      await loadMessages(selectedTeam.id, selectedChannel.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reply to thread');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ 
          fontSize: '2rem', 
          fontWeight: 'bold', 
          marginBottom: '0.5rem',
          color: 'var(--text-primary)'
        }}>
          Microsoft Teams Agent
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Interact with Microsoft Teams - read messages, create threads, and mention team members
        </p>
      </div>

      {error && (
        <div style={{
          padding: '1rem',
          marginBottom: '1rem',
          backgroundColor: '#fee',
          border: '1px solid #fcc',
          borderRadius: '8px',
          color: '#c00'
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '2rem' }}>
        {/* Sidebar */}
        <div>
          {/* Team Selector */}
          <div style={{ 
            marginBottom: '1.5rem',
            padding: '1.5rem',
            backgroundColor: 'white',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ 
              fontSize: '1rem', 
              fontWeight: '600', 
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <Hash size={18} />
              Teams
            </h3>
            <select
              value={selectedTeam?.id || ''}
              onChange={(e) => {
                const team = teams.find(t => t.id === e.target.value);
                setSelectedTeam(team || null);
              }}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '6px',
                border: '1px solid #ddd',
                fontSize: '0.9rem'
              }}
            >
              {teams.map(team => (
                <option key={team.id} value={team.id}>
                  {team.displayName}
                </option>
              ))}
            </select>
          </div>

          {/* Channel Selector */}
          {selectedTeam && (
            <div style={{ 
              marginBottom: '1.5rem',
              padding: '1.5rem',
              backgroundColor: 'white',
              borderRadius: '12px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
              <h3 style={{ 
                fontSize: '1rem', 
                fontWeight: '600', 
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <MessageSquare size={18} />
                Channels
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {channels.map(channel => (
                  <button
                    key={channel.id}
                    onClick={() => setSelectedChannel(channel)}
                    style={{
                      padding: '0.75rem',
                      borderRadius: '6px',
                      border: 'none',
                      textAlign: 'left',
                      cursor: 'pointer',
                      backgroundColor: selectedChannel?.id === channel.id ? 'var(--primary-light)' : '#f5f5f5',
                      color: selectedChannel?.id === channel.id ? 'var(--primary)' : 'var(--text-primary)',
                      fontWeight: selectedChannel?.id === channel.id ? '600' : '400',
                      transition: 'all 0.2s'
                    }}
                  >
                    {channel.displayName}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Members List */}
          {selectedTeam && members.length > 0 && (
            <div style={{ 
              padding: '1.5rem',
              backgroundColor: 'white',
              borderRadius: '12px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
              <h3 style={{ 
                fontSize: '1rem', 
                fontWeight: '600', 
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <Users size={18} />
                Team Members ({members.length})
              </h3>
              <div style={{ 
                maxHeight: '300px', 
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem'
              }}>
                {members.map(member => (
                  <div 
                    key={member.id}
                    style={{
                      padding: '0.5rem',
                      fontSize: '0.875rem',
                      borderBottom: '1px solid #f0f0f0'
                    }}
                  >
                    <div style={{ fontWeight: '500' }}>{member.name}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                      {member.email}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main Content */}
        <div>
          {/* New Thread Form */}
          <div style={{
            padding: '2rem',
            backgroundColor: 'white',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            marginBottom: '2rem'
          }}>
            <h2 style={{ 
              fontSize: '1.25rem', 
              fontWeight: '600', 
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <Send size={20} />
              Start New Thread
            </h2>
            <form onSubmit={handleCreateThread}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '0.5rem',
                  fontWeight: '500',
                  fontSize: '0.9rem'
                }}>
                  Title
                </label>
                <input
                  type="text"
                  value={newThreadTitle}
                  onChange={(e) => setNewThreadTitle(e.target.value)}
                  placeholder="Thread title..."
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #ddd',
                    fontSize: '0.95rem'
                  }}
                  required
                />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '0.5rem',
                  fontWeight: '500',
                  fontSize: '0.9rem'
                }}>
                  Content
                </label>
                <textarea
                  value={newThreadContent}
                  onChange={(e) => setNewThreadContent(e.target.value)}
                  placeholder="Thread content..."
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #ddd',
                    fontSize: '0.95rem',
                    resize: 'vertical'
                  }}
                  required
                />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '0.5rem',
                  fontWeight: '500',
                  fontSize: '0.9rem'
                }}>
                  Mention Member (Optional)
                </label>
                <select
                  value={selectedMember}
                  onChange={(e) => setSelectedMember(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #ddd',
                    fontSize: '0.95rem'
                  }}
                >
                  <option value="">No mention</option>
                  {members.map(member => (
                    <option key={member.id} value={member.name}>
                      {member.name} ({member.email})
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={loading || !selectedChannel}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: 'var(--primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.95rem',
                  fontWeight: '600',
                  cursor: loading || !selectedChannel ? 'not-allowed' : 'pointer',
                  opacity: loading || !selectedChannel ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <Send size={16} />
                {loading ? 'Posting...' : 'Post Thread'}
              </button>
            </form>
          </div>

          {/* Messages List */}
          <div style={{
            padding: '2rem',
            backgroundColor: 'white',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.5rem'
            }}>
              <h2 style={{ 
                fontSize: '1.25rem', 
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <MessageSquare size={20} />
                Channel Messages
              </h2>
              <button
                onClick={() => selectedTeam && selectedChannel && loadMessages(selectedTeam.id, selectedChannel.id)}
                disabled={loading}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#f5f5f5',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: '500'
                }}
              >
                <RefreshCw size={16} className={loading ? 'spin' : ''} />
                Refresh
              </button>
            </div>

            {loading && messages.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                Loading messages...
              </div>
            ) : messages.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                No messages in this channel
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {messages.map(message => (
                  <div 
                    key={message.id}
                    style={{
                      padding: '1.5rem',
                      backgroundColor: '#f9f9f9',
                      borderRadius: '8px',
                      border: '1px solid #e0e0e0'
                    }}
                  >
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      marginBottom: '0.75rem',
                      alignItems: 'flex-start'
                    }}>
                      <div>
                        {message.subject && (
                          <h3 style={{ 
                            fontWeight: '600', 
                            fontSize: '1rem',
                            marginBottom: '0.25rem'
                          }}>
                            {message.subject}
                          </h3>
                        )}
                        <div style={{ 
                          fontSize: '0.875rem', 
                          color: 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem'
                        }}>
                          <span>{message.from}</span>
                          <span>•</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Clock size={14} />
                            {new Date(message.createdDateTime).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedThreadId(message.id)}
                        style={{
                          padding: '0.5rem 1rem',
                          backgroundColor: 'var(--primary)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '0.875rem',
                          cursor: 'pointer'
                        }}
                      >
                        Reply
                      </button>
                    </div>
                    <div 
                      style={{ 
                        fontSize: '0.95rem',
                        lineHeight: '1.6',
                        color: 'var(--text-primary)'
                      }}
                      dangerouslySetInnerHTML={{ __html: message.content }}
                    />
                    
                    {/* Reply Form */}
                    {selectedThreadId === message.id && (
                      <form onSubmit={handleReplyToThread} style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #ddd' }}>
                        <div style={{ marginBottom: '1rem' }}>
                          <textarea
                            value={replyContent}
                            onChange={(e) => setReplyContent(e.target.value)}
                            placeholder="Write your reply..."
                            rows={3}
                            style={{
                              width: '100%',
                              padding: '0.75rem',
                              borderRadius: '6px',
                              border: '1px solid #ddd',
                              fontSize: '0.9rem'
                            }}
                            required
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            type="submit"
                            disabled={loading}
                            style={{
                              padding: '0.5rem 1rem',
                              backgroundColor: 'var(--primary)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '0.875rem',
                              cursor: loading ? 'not-allowed' : 'pointer',
                              opacity: loading ? 0.6 : 1
                            }}
                          >
                            Send Reply
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedThreadId(null);
                              setReplyContent('');
                            }}
                            style={{
                              padding: '0.5rem 1rem',
                              backgroundColor: '#f5f5f5',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '0.875rem',
                              cursor: 'pointer'
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MicrosoftAgentPage;

