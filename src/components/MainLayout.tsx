import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import type { ReactNode } from 'react';
import { SmartChatPanel } from './SmartChatPanel';

interface MainLayoutProps {
  children?: ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent;
      if (ce.detail?.open !== undefined) {
        setChatOpen(!!ce.detail.open);
      } else {
        setChatOpen(prev => !prev);
      }
    };
    window.addEventListener('toggle-smart-chat', handler as EventListener);
    return () => window.removeEventListener('toggle-smart-chat', handler as EventListener);
  }, []);

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <Sidebar expanded={sidebarExpanded} onToggle={() => setSidebarExpanded(!sidebarExpanded)} />
      <div style={{ 
        flex: 1, 
        marginLeft: sidebarExpanded ? 'var(--sidebar-width-expanded)' : 'var(--sidebar-width-collapsed)',
        transition: 'margin-left 0.3s ease',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative'
      }}>
        <Header />
        <main style={{ 
          flex: 1, 
          overflow: 'auto',
          backgroundColor: 'var(--bg)',
          display: 'grid',
          gridTemplateColumns: chatOpen ? '70% 30%' : '100%',
          transition: 'grid-template-columns 0.25s ease'
        }}>
          <div style={{ overflow: 'auto' }}>
            {children || <Outlet />}
          </div>
          {chatOpen && (
            <div style={{ borderLeft: '1px solid var(--border)', background: 'var(--card-bg)', display: 'flex', flexDirection: 'column' }}>
              <SmartChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}; 