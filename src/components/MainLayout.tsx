import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import type { ReactNode } from 'react';

interface MainLayoutProps {
  children?: ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <Sidebar expanded={sidebarExpanded} onToggle={() => setSidebarExpanded(!sidebarExpanded)} />
      <div style={{ 
        flex: 1, 
        marginLeft: sidebarExpanded ? 'var(--sidebar-width-expanded)' : 'var(--sidebar-width-collapsed)',
        transition: 'margin-left 0.3s ease',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        <Header />
        <main style={{ 
          flex: 1, 
          overflow: 'auto',
          backgroundColor: 'var(--bg)'
        }}>
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
}; 