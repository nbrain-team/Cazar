import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Clock, 
  Calendar, 
  Users, 
  FileText, 
  Settings,
  ChevronLeft,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';

interface SidebarProps {
  expanded: boolean;
  onToggle: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ expanded, onToggle }) => {
  const navItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/timecard', icon: Clock, label: 'Timecard' },
    { path: '/scheduling', icon: Calendar, label: 'Scheduling' },
    { path: '/drivers', icon: Users, label: 'Drivers' },
    { path: '/compliance', icon: ShieldCheck, label: 'COMPLIANCE' },
    { path: '/reports', icon: FileText, label: 'Reports' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className={`sidebar-placeholder ${expanded ? 'expanded' : 'collapsed'}`}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: expanded ? 'space-between' : 'center',
        padding: '1rem',
        marginBottom: '2rem'
      }}>
        {expanded && (
          <h2 style={{ 
            fontSize: '1.5rem', 
            fontWeight: 'bold',
            color: 'var(--primary)'
          }}>
            Cazar AI Hub
          </h2>
        )}
        <button
          onClick={onToggle}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--icon-color)',
            padding: '0.5rem',
            borderRadius: '8px',
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
          {expanded ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </button>
      </div>

      <nav style={{ flex: 1 }}>
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => isActive ? 'active' : ''}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: expanded ? '0.75rem 1rem' : '0.75rem',
              margin: '0.25rem',
              borderRadius: '8px',
              textDecoration: 'none',
              color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
              backgroundColor: isActive ? 'var(--primary-light)' : 'transparent',
              transition: 'all 0.2s ease',
              justifyContent: expanded ? 'flex-start' : 'center'
            })}
            onMouseEnter={(e) => {
              if (!e.currentTarget.classList.contains('active')) {
                e.currentTarget.style.backgroundColor = 'var(--gray-light)';
                e.currentTarget.style.color = 'var(--primary)';
              }
            }}
            onMouseLeave={(e) => {
              if (!e.currentTarget.classList.contains('active')) {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }
            }}
          >
            <item.icon size={20} />
            {expanded && <span style={{ fontWeight: 500 }}>{item.label}</span>}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}; 