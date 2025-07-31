import { useAuth } from '../context/AuthContext';
import { LogOut, User, Bell } from 'lucide-react';

export const Header = () => {
  const { user, logout } = useAuth();

  return (
    <header style={{
      height: '64px',
      backgroundColor: 'var(--header-bg)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 2rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
    }}>
      <div>
        <h1 style={{ 
          fontSize: '1.25rem', 
          fontWeight: 600,
          color: 'var(--text-primary)',
          margin: 0
        }}>
          Welcome back, {user?.name}
        </h1>
        <p style={{ 
          fontSize: '0.875rem', 
          color: 'var(--text-secondary)',
          margin: 0
        }}>
          {new Date().toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--icon-color)',
            padding: '0.5rem',
            borderRadius: '8px',
            position: 'relative',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--gray-light)';
            e.currentTarget.style.color = 'var(--primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = 'var(--icon-color)';
          }}
        >
          <Bell size={20} />
          <span style={{
            position: 'absolute',
            top: '6px',
            right: '6px',
            width: '8px',
            height: '8px',
            backgroundColor: 'var(--danger)',
            borderRadius: '50%'
          }}></span>
        </button>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.5rem 1rem',
          backgroundColor: 'var(--gray-light)',
          borderRadius: '8px'
        }}>
          <User size={20} />
          <div>
            <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 500 }}>
              {user?.name}
            </p>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {user?.role}
            </p>
          </div>
        </div>

        <button
          onClick={logout}
          className="btn btn-secondary"
          style={{ gap: '0.5rem' }}
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </header>
  );
}; 