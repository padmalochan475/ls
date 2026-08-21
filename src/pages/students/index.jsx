import React, { useState, useEffect, useMemo } from 'react';
import { Users, FileText, ArrowUpCircle, Layers, Upload, GraduationCap, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import StudentDirectory from './StudentDirectory';
import StudentAttendance from './StudentAttendance';
import StudentPromotions from './StudentPromotions';
import GroupManager from '../GroupManager';
import '../../styles/design-system.css';

/* ─────────────────────────────────────────────────────────────
   Premium Color Palette & Styles
───────────────────────────────────────────────────────────── */
const COLORS = {
  bgDeep: '#020617', // Extremely dark slate
  bgMid: '#0f172a',
  glass: 'rgba(30, 41, 59, 0.65)',
  glassHover: 'rgba(30, 41, 59, 0.85)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  accentBlue: '#3b82f6',
  accentCyan: '#06b6d4',
  textPrimary: '#f8fafc',
  textSecondary: '#cbd5e1',
  textMuted: '#64748b',
};

const premiumStyles = {
  page: {
    minHeight: '100vh',
    background: COLORS.bgDeep,
    backgroundImage: `
      radial-gradient(circle at 15% 10%, rgba(59, 130, 246, 0.15) 0%, transparent 40%),
      radial-gradient(circle at 85% 85%, rgba(6, 182, 212, 0.12) 0%, transparent 40%),
      radial-gradient(circle at 50% 50%, rgba(139, 92, 246, 0.08) 0%, transparent 50%)
    `,
    display: 'flex',
    fontFamily: "'Inter', system-ui, sans-serif",
    overflow: 'hidden',
  },

  /* ── Desktop Floating Sidebar ── */
  sidebarWrapper: {
    padding: '1.5rem',
    width: '260px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    zIndex: 20,
  },
  sidebar: {
    background: COLORS.glass,
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border: `1px solid ${COLORS.glassBorder}`,
    borderRadius: '24px',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
  },
  sidebarHeader: {
    padding: '1.75rem 1.5rem 1.5rem',
    borderBottom: `1px solid ${COLORS.glassBorder}`,
    background: 'linear-gradient(to bottom, rgba(255,255,255,0.03), transparent)',
  },
  logoContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  logoIcon: {
    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
    borderRadius: '12px',
    padding: '0.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)',
  },
  logoText: {
    fontSize: '1.25rem',
    fontWeight: 800,
    letterSpacing: '-0.03em',
    background: 'linear-gradient(to right, #ffffff, #94a3b8)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  
  navContainer: {
    padding: '1.5rem 1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
    flex: 1,
    overflowY: 'auto',
    scrollbarWidth: 'none',
  },
  
  /* ── User Profile Bottom ── */
  profileSection: {
    padding: '1.25rem',
    borderTop: `1px solid ${COLORS.glassBorder}`,
    background: 'rgba(0,0,0,0.2)',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  avatar: {
    width: '2.5rem',
    height: '2.5rem',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: '0.9rem',
    color: 'white',
    boxShadow: '0 4px 10px rgba(6, 182, 212, 0.3)',
  },

  /* ── Main Content Area ── */
  mainContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    padding: '1.5rem 1.5rem 1.5rem 0',
  },
  topHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.5rem 1rem 1.5rem',
  },
  contentWrapper: {
    flex: 1,
    background: COLORS.glass,
    backdropFilter: 'blur(20px)',
    border: `1px solid ${COLORS.glassBorder}`,
    borderRadius: '24px',
    overflow: 'hidden', // Let children scroll if needed
    position: 'relative',
    boxShadow: '0 20px 40px -10px rgba(0,0,0,0.4)',
  },

  /* ── Mobile Layout ── */
  mobileHeader: {
    padding: '1.25rem',
    background: 'rgba(2, 6, 23, 0.8)',
    backdropFilter: 'blur(20px)',
    borderBottom: `1px solid ${COLORS.glassBorder}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 30,
  },
  mobileTabContainer: {
    display: 'flex',
    overflowX: 'auto',
    padding: '1rem',
    gap: '0.75rem',
    scrollbarWidth: 'none',
    borderBottom: `1px solid ${COLORS.glassBorder}`,
    background: 'rgba(15, 23, 42, 0.4)',
  },
  mobileTab: (active) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.6rem 1.1rem',
    borderRadius: '9999px',
    fontSize: '0.85rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    background: active ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(6, 182, 212, 0.1))' : 'rgba(255, 255, 255, 0.03)',
    border: `1px solid ${active ? 'rgba(59, 130, 246, 0.4)' : 'rgba(255, 255, 255, 0.05)'}`,
    color: active ? '#60a5fa' : COLORS.textMuted,
    boxShadow: active ? '0 4px 12px rgba(59, 130, 246, 0.15)' : 'none',
  })
};

/* ─────────────────────────────────────────────────────────────
   Navigation Config
───────────────────────────────────────────────────────────── */
const NAV_ITEMS = [
  { key: 'directory',  label: 'Student Directory', icon: Users,         adminOnly: false },
  { key: 'attendance', label: 'Attendance & Print', icon: FileText,      adminOnly: false },
  { key: 'promote',    label: 'Promotions',        icon: ArrowUpCircle, adminOnly: true  },
  { key: 'groups',     label: 'Groups Manager',    icon: Layers,        adminOnly: true  },
];

/* ─────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────── */
function getInitials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

/* ─────────────────────────────────────────────────────────────
   Components
───────────────────────────────────────────────────────────── */
function NavItem({ item, active, onClick }) {
  const [hovered, setHovered] = useState(false);
  const Icon = item.icon;

  return (
    <button
      onClick={() => onClick(item.key)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.85rem',
        padding: '0.85rem 1rem',
        borderRadius: '14px',
        border: 'none',
        background: active 
          ? 'linear-gradient(90deg, rgba(59, 130, 246, 0.15), transparent)' 
          : (hovered ? 'rgba(255, 255, 255, 0.04)' : 'transparent'),
        color: active ? '#fff' : (hovered ? COLORS.textSecondary : COLORS.textMuted),
        cursor: 'pointer',
        transition: 'all 0.2s',
        position: 'relative',
        outline: 'none',
        textAlign: 'left'
      }}
    >
      {active && (
        <div style={{
          position: 'absolute', left: 0, top: '20%', bottom: '20%', width: '3px',
          background: 'linear-gradient(to bottom, #3b82f6, #06b6d4)',
          borderRadius: '0 4px 4px 0',
          boxShadow: '0 0 10px rgba(59,130,246,0.6)'
        }} />
      )}
      <div style={{
        background: active ? 'linear-gradient(135deg, #3b82f6, #06b6d4)' : (hovered ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)'),
        padding: '0.5rem',
        borderRadius: '10px',
        color: active ? '#fff' : (hovered ? '#e2e8f0' : '#94a3b8'),
        transition: 'all 0.2s',
        boxShadow: active ? '0 4px 12px rgba(59,130,246,0.3)' : 'none'
      }}>
        <Icon size={16} strokeWidth={active ? 2.5 : 2} />
      </div>
      <span style={{ fontWeight: active ? 600 : 500, fontSize: '0.9rem', letterSpacing: '0.01em' }}>
        {item.label}
      </span>
    </button>
  );
}

function TabContent({ activeTab }) {
  // We wrap the content in a div that fills the parent to ensure smooth scroll inside
  const contentStyle = { height: '100%', width: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' };
  
  switch (activeTab) {
    case 'directory':  return <div style={contentStyle} className="animate-fade-in"><StudentDirectory /></div>;
    case 'attendance': return <div style={contentStyle} className="animate-fade-in"><StudentAttendance /></div>;
    case 'promote':    return <div style={contentStyle} className="animate-fade-in"><StudentPromotions /></div>;
    case 'groups':     return <div style={contentStyle} className="animate-fade-in"><GroupManager /></div>;
    default:           return <div style={contentStyle} className="animate-fade-in"><StudentDirectory /></div>;
  }
}

export default function StudentsPage() {
  const { currentUser, userProfile, activeAcademicYear } = useAuth();
  const [activeTab, setActiveTab] = useState('directory');

  const isAdmin = userProfile?.role === 'admin';
  const visibleNav = useMemo(() => NAV_ITEMS.filter(item => !item.adminOnly || isAdmin), [isAdmin]);
  const currentTab = visibleNav.some(i => i.key === activeTab) ? activeTab : 'directory';

  return (
    <div className="lams-print-page-wrapper" style={{ ...premiumStyles.page, flexDirection: 'column', padding: '1.5rem', overflow: 'hidden' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: '#fff', letterSpacing: '-0.02em' }}>
            Student Management
          </h1>
          <p style={{ color: COLORS.textMuted, fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Manage and organize student records efficiently
          </p>
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.05)', border: `1px solid ${COLORS.glassBorder}`,
          padding: '0.5rem 1rem', borderRadius: '9999px', display: 'flex', alignItems: 'center', gap: '0.5rem'
        }}>
          <GraduationCap size={16} color={COLORS.accentCyan} />
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: COLORS.textSecondary }}>
            AY {activeAcademicYear || '2023-24'}
          </span>
        </div>
      </header>

      <nav style={{ 
        display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', 
        borderBottom: `1px solid ${COLORS.glassBorder}`, paddingBottom: '1rem', 
        overflowX: 'auto', scrollbarWidth: 'none' 
      }}>
        {visibleNav.map(item => {
          const active = currentTab === item.key;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => setActiveTab(item.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem',
                borderRadius: '12px', whiteSpace: 'nowrap',
                background: active ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(6, 182, 212, 0.1))' : 'transparent',
                color: active ? '#60a5fa' : COLORS.textMuted,
                fontWeight: active ? 600 : 500, fontSize: '0.95rem',
                cursor: 'pointer', transition: 'all 0.2s',
                boxShadow: active ? '0 4px 12px rgba(59, 130, 246, 0.15)' : 'none',
                border: `1px solid ${active ? 'rgba(59, 130, 246, 0.4)' : 'transparent'}`
              }}
            >
              <Icon size={16} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="lams-print-content-wrapper" style={{ ...premiumStyles.contentWrapper, flex: 1 }}>
         <TabContent activeTab={currentTab} />
      </div>
    </div>
  );
}
