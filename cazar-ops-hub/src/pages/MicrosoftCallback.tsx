import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

export default function MicrosoftCallback() {
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');
  const errorDescription = params.get('error_description');

  return (
    <div className="card" style={{ width: '100%', maxWidth: '520px', padding: '2rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Microsoft Sign-in</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          Redirect complete. You can register this URL in Azure as a Redirect URI.
        </p>
      </div>

      {error ? (
        <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
          <div>
            <strong>Authorization failed</strong>
            <p>{errorDescription || error}</p>
          </div>
        </div>
      ) : (
        <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
          <div>
            <strong>Authorization code received</strong>
            <p>State: {state || 'N/A'}</p>
          </div>
        </div>
      )}

      <div style={{ marginTop: '1rem' }}>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          No action required here yet. Once we wire up token exchange, this page will
          finalize sign-in automatically.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem' }}>
        <button className="btn btn-secondary" onClick={() => navigate('/login')}>Back to Login</button>
        <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>Go to Dashboard</button>
      </div>

      {/* Dev aide: show raw code for testing in non-production only */}
      {code && (
        <pre style={{ marginTop: '1rem', background: '#f8fafc', padding: '0.75rem', borderRadius: 8, overflow: 'auto' }}>
{code}
        </pre>
      )}
    </div>
  );
}



