import { useState, useEffect } from 'react';
import { Plus, Trash2, Check, X, ExternalLink } from 'lucide-react';

interface ComplianceURL {
  url: string;
  category: string;
  enabled: boolean;
}

interface ComplianceURLManagerProps {
  onClose: () => void;
}

export const ComplianceURLManager: React.FC<ComplianceURLManagerProps> = ({ onClose }) => {
  const [urls, setUrls] = useState<ComplianceURL[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newCategory, setNewCategory] = useState('');

  useEffect(() => {
    fetchUrls();
  }, []);

  const fetchUrls = async () => {
    try {
      const response = await fetch('/api/smart-agent/compliance-urls');
      const data = await response.json();
      setUrls(data.urls || []);
    } catch (error) {
      console.error('Failed to fetch URLs:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveUrls = async () => {
    setSaving(true);
    try {
      await fetch('/api/smart-agent/compliance-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      });
      onClose();
    } catch (error) {
      console.error('Failed to save URLs:', error);
      alert('Failed to save compliance URLs');
    } finally {
      setSaving(false);
    }
  };

  const addUrl = () => {
    if (!newUrl.trim()) return;
    
    try {
      new URL(newUrl);
      setUrls([...urls, { url: newUrl, category: newCategory || 'General', enabled: true }]);
      setNewUrl('');
      setNewCategory('');
    } catch {
      alert('Please enter a valid URL');
    }
  };

  const removeUrl = (index: number) => {
    setUrls(urls.filter((_, i) => i !== index));
  };

  const toggleUrl = (index: number) => {
    const updated = [...urls];
    updated[index].enabled = !updated[index].enabled;
    setUrls(updated);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
    }}>
      <div style={{
        background: 'var(--card-bg)',
        borderRadius: 'var(--radius)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        width: '90%',
        maxWidth: '800px',
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
            Compliance URL Configuration
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--icon-color)',
              padding: '0.5rem',
              borderRadius: '4px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '1.5rem',
        }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            Configure which compliance and regulation websites the Smart Agent should search when looking for regulatory information.
          </p>

          {/* Add New URL */}
          <div style={{
            background: 'var(--gray-light)',
            padding: '1rem',
            borderRadius: '8px',
            marginBottom: '1.5rem',
          }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '0.875rem', fontWeight: 600 }}>
              Add New URL
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input
                type="url"
                placeholder="https://example.gov/regulations"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addUrl()}
                style={{
                  flex: 2,
                  padding: '0.5rem',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  outline: 'none',
                }}
              />
              <input
                type="text"
                placeholder="Category (e.g., DOT)"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addUrl()}
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  outline: 'none',
                }}
              />
              <button
                onClick={addUrl}
                style={{
                  padding: '0.5rem 1rem',
                  background: 'var(--primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontWeight: 500,
                }}
              >
                <Plus size={16} />
                Add
              </button>
            </div>
          </div>

          {/* URL List */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div className="spinner" />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {urls.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '2rem',
                  color: 'var(--text-secondary)',
                }}>
                  No compliance URLs configured. Add one above to get started.
                </div>
              ) : (
                urls.map((url, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                      padding: '1rem',
                      background: url.enabled ? 'white' : 'var(--gray-light)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      opacity: url.enabled ? 1 : 0.6,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={url.enabled}
                      onChange={() => toggleUrl(index)}
                      style={{
                        width: '18px',
                        height: '18px',
                        cursor: 'pointer',
                        accentColor: 'var(--primary)',
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        marginBottom: '0.25rem',
                      }}>
                        <span style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: 'var(--primary)',
                          background: 'var(--primary-light)',
                          padding: '0.125rem 0.5rem',
                          borderRadius: '4px',
                        }}>
                          {url.category}
                        </span>
                      </div>
                      <a
                        href={url.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: url.enabled ? 'var(--text-primary)' : 'var(--text-secondary)',
                          textDecoration: 'none',
                          fontSize: '0.875rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          wordBreak: 'break-all',
                        }}
                      >
                        {url.url}
                        <ExternalLink size={12} style={{ flexShrink: 0 }} />
                      </a>
                    </div>
                    <button
                      onClick={() => removeUrl(index)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--danger)',
                        padding: '0.5rem',
                        borderRadius: '4px',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#fee2e2'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '0.5rem',
        }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '0.5rem 1rem',
              background: 'var(--gray-light)',
              color: 'var(--text-primary)',
              border: 'none',
              borderRadius: '4px',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontWeight: 500,
              opacity: saving ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={saveUrls}
            disabled={saving}
            style={{
              padding: '0.5rem 1rem',
              background: 'var(--primary)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: saving ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontWeight: 500,
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? (
              <>
                <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
                Saving...
              </>
            ) : (
              <>
                <Check size={16} />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

