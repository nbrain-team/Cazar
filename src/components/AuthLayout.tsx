import { Outlet } from 'react-router-dom';

export const AuthLayout = () => {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)'
    }}>
      <Outlet />
    </div>
  );
}; 