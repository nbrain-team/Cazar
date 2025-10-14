import { useState, useEffect } from 'react';
import { Users, Plus, Shield, Database, Mail, DollarSign, Globe, HardDrive, Trash2, Edit, Check, X } from 'lucide-react';

interface User {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: 'admin' | 'user';
  is_active: boolean;
  created_at: string;
  last_login: string | null;
  permissions: string[];
}

interface DataSource {
  id: string;
  name: string;
  icon: React.ReactNode;
  color: string;
}

const DATA_SOURCES: DataSource[] = [
  { id: 'pinecone', name: 'Vector Knowledge Base', icon: <Database size={18} />, color: '#10b981' },
  { id: 'microsoft', name: 'Microsoft 365', icon: <Mail size={18} />, color: '#0078d4' },
  { id: 'adp', name: 'ADP Payroll', icon: <DollarSign size={18} />, color: '#ef4444' },
  { id: 'web', name: 'Web Search', icon: <Globe size={18} />, color: '#f59e0b' },
  { id: 'postgres', name: 'PostgreSQL', icon: <HardDrive size={18} />, color: '#3b82f6' },
];

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // New user form state
  const [newUser, setNewUser] = useState({
    username: '',
    email: '',
    full_name: '',
    password: '',
    role: 'user' as 'admin' | 'user',
    permissions: [] as string[]
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/users');
      const data = await response.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
      });

      if (response.ok) {
        setShowAddUser(false);
        setNewUser({
          username: '',
          email: '',
          full_name: '',
          password: '',
          role: 'user',
          permissions: []
        });
        fetchUsers();
      }
    } catch (error) {
      console.error('Error creating user:', error);
    }
  };

  const handleUpdatePermissions = async (userId: string, permissions: string[]) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions })
      });

      if (response.ok) {
        fetchUsers();
      }
    } catch (error) {
      console.error('Error updating permissions:', error);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        fetchUsers();
      }
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  };

  const togglePermission = (dataSourceId: string) => {
    setNewUser(prev => ({
      ...prev,
      permissions: prev.permissions.includes(dataSourceId)
        ? prev.permissions.filter(p => p !== dataSourceId)
        : [...prev.permissions, dataSourceId]
    }));
  };

  const toggleUserPermission = (user: User, dataSourceId: string) => {
    const newPermissions = user.permissions.includes(dataSourceId)
      ? user.permissions.filter(p => p !== dataSourceId)
      : [...user.permissions, dataSourceId];
    
    handleUpdatePermissions(user.id, newPermissions);
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Shield size={32} style={{ color: 'var(--primary)' }} />
            Admin Panel
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>Manage users and data source permissions</p>
        </div>
        
        <button
          onClick={() => setShowAddUser(true)}
          className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <Plus size={20} />
          Add User
        </button>
      </div>

      {/* Users List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
          Loading users...
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--gray-light)', borderBottom: '2px solid var(--border)' }}>
              <tr>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>User</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>Role</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>Data Source Access</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '1rem', textAlign: 'center', fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '1rem' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{user.full_name || user.username}</div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{user.email}</div>
                    </div>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      background: user.role === 'admin' ? 'var(--primary-light)' : 'var(--gray-light)',
                      color: user.role === 'admin' ? 'var(--primary)' : 'var(--text-secondary)'
                    }}>
                      {user.role.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {DATA_SOURCES.map(ds => {
                        const hasPermission = user.permissions.includes(ds.id);
                        return (
                          <div
                            key={ds.id}
                            onClick={() => toggleUserPermission(user, ds.id)}
                            style={{
                              padding: '0.25rem 0.5rem',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              cursor: 'pointer',
                              background: hasPermission ? ds.color + '20' : 'var(--gray-light)',
                              color: hasPermission ? ds.color : 'var(--text-secondary)',
                              border: `1px solid ${hasPermission ? ds.color : 'var(--border)'}`,
                              transition: 'all 0.2s'
                            }}
                            title={`Click to ${hasPermission ? 'revoke' : 'grant'} ${ds.name} access`}
                          >
                            {hasPermission && <Check size={12} />}
                            {ds.icon}
                          </div>
                        );
                      })}
                    </div>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      background: user.is_active ? '#10b98120' : '#ef444420',
                      color: user.is_active ? '#10b981' : '#ef4444'
                    }}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                      <button
                        onClick={() => alert('Edit functionality coming soon!')}
                        style={{
                          padding: '0.5rem',
                          background: 'transparent',
                          border: '1px solid var(--border)',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          color: 'var(--text-secondary)',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--primary-light)';
                          e.currentTarget.style.borderColor = 'var(--primary)';
                          e.currentTarget.style.color = 'var(--primary)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.borderColor = 'var(--border)';
                          e.currentTarget.style.color = 'var(--text-secondary)';
                        }}
                        title="Edit user"
                      >
                        <Edit size={16} />
                      </button>
                      {user.role !== 'admin' && (
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          style={{
                            padding: '0.5rem',
                            background: 'transparent',
                            border: '1px solid var(--border)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            color: 'var(--text-secondary)',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#ef444420';
                            e.currentTarget.style.borderColor = '#ef4444';
                            e.currentTarget.style.color = '#ef4444';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                            e.currentTarget.style.borderColor = 'var(--border)';
                            e.currentTarget.style.color = 'var(--text-secondary)';
                          }}
                          title="Delete user"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {users.length === 0 && (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <Users size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
              <p>No users yet. Click "Add User" to create one.</p>
            </div>
          )}
        </div>
      )}

      {/* Add User Modal */}
      {showAddUser && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="card" style={{ width: '600px', maxWidth: '90vw', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>Add New User</h2>
              <button
                onClick={() => setShowAddUser(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={24} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Basic Info */}
              <div>
                <label className="label">Username *</label>
                <input
                  type="text"
                  className="input"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  placeholder="john.smith"
                />
              </div>

              <div>
                <label className="label">Email *</label>
                <input
                  type="email"
                  className="input"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="john.smith@company.com"
                />
              </div>

              <div>
                <label className="label">Full Name</label>
                <input
                  type="text"
                  className="input"
                  value={newUser.full_name}
                  onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                  placeholder="John Smith"
                />
              </div>

              <div>
                <label className="label">Password *</label>
                <input
                  type="password"
                  className="input"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  placeholder="••••••••"
                />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  Minimum 8 characters
                </p>
              </div>

              <div>
                <label className="label">Role</label>
                <select
                  className="input"
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value as 'admin' | 'user' })}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {/* Data Source Permissions */}
              <div>
                <label className="label" style={{ marginBottom: '0.75rem', display: 'block' }}>Data Source Permissions</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {DATA_SOURCES.map(ds => (
                    <label
                      key={ds.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.75rem',
                        background: newUser.permissions.includes(ds.id) ? ds.color + '10' : 'var(--gray-light)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        border: `2px solid ${newUser.permissions.includes(ds.id) ? ds.color : 'transparent'}`,
                        transition: 'all 0.2s'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={newUser.permissions.includes(ds.id)}
                        onChange={() => togglePermission(ds.id)}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <div style={{ color: ds.color }}>{ds.icon}</div>
                      <span style={{ flex: 1, fontWeight: 500 }}>{ds.name}</span>
                      {newUser.permissions.includes(ds.id) && <Check size={18} style={{ color: ds.color }} />}
                    </label>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button
                  onClick={handleCreateUser}
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={!newUser.username || !newUser.email || !newUser.password}
                >
                  Create User
                </button>
                <button
                  onClick={() => setShowAddUser(false)}
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

