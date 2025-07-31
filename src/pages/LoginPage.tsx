import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ 
      width: '100%', 
      maxWidth: '400px',
      padding: '2rem'
    }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{ 
          fontSize: '2rem', 
          fontWeight: 'bold',
          color: 'var(--text-primary)',
          marginBottom: '0.5rem'
        }}>
          Cazar AI Ops Hub
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Sign in to your account
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: 500
          }}>
            Email
          </label>
          <input
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@cazar.com"
            required
          />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: 500
          }}>
            Password
          </label>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>

        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem',
            backgroundColor: '#fee2e2',
            color: '#dc2626',
            borderRadius: '8px',
            marginBottom: '1rem',
            fontSize: '0.875rem'
          }}>
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary"
          style={{ 
            width: '100%',
            justifyContent: 'center',
            padding: '0.75rem'
          }}
          disabled={loading}
        >
          {loading ? (
            <div className="spinner" style={{ width: '20px', height: '20px' }}></div>
          ) : (
            <>
              <LogIn size={18} />
              Sign In
            </>
          )}
        </button>

        <div style={{ 
          marginTop: '1rem', 
          textAlign: 'center',
          fontSize: '0.875rem',
          color: 'var(--text-secondary)'
        }}>
          Demo credentials: admin@cazar.com / password
        </div>
      </form>
    </div>
  );
} 