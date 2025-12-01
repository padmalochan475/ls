import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import '../styles/design-system.css';

const Layout = ({ children }) => {
    const location = useLocation();
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const { userProfile } = useAuth();

    const navItems = [
        { path: '/', label: 'Dashboard', icon: '📊' },
        { path: '/assignments', label: 'Assignments', icon: '➕' },
        { path: '/schedule', label: 'Schedule', icon: '📅' },
        { path: '/master-data', label: 'Master Data', icon: '⚙️' },
        { path: '/analytics', label: 'Analytics', icon: '📈' },
    ];

    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg-main)' }}>
            {/* Sidebar */}
            <aside
                className="glass-panel"
                style={{
                    width: isSidebarOpen ? '260px' : '80px',
                    margin: 'var(--space-md)',
                    padding: 'var(--space-md)',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'width 0.3s ease',
                    position: 'sticky',
                    top: 'var(--space-md)',
                    height: 'calc(100vh - 2 * var(--space-md))'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 'var(--space-xl)', padding: '0 var(--space-xs)' }}>
                    <div style={{
                        width: '40px',
                        height: '40px',
                        background: 'linear-gradient(135deg, var(--color-accent), #60a5fa)',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.5rem',
                        marginRight: isSidebarOpen ? 'var(--space-md)' : '0',
                        flexShrink: 0
                    }}>
                        🔬
                    </div>
                    {isSidebarOpen && (
                        <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0, background: 'linear-gradient(to right, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            LAB
                        </h1>
                    )}
                </div>

                <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                    {navItems.map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: 'var(--space-sm) var(--space-md)',
                                borderRadius: 'var(--radius-md)',
                                textDecoration: 'none',
                                color: location.pathname === item.path ? 'white' : 'var(--color-text-muted)',
                                background: location.pathname === item.path ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                                border: location.pathname === item.path ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
                                transition: 'all 0.2s ease',
                                justifyContent: isSidebarOpen ? 'flex-start' : 'center'
                            }}
                        >
                            <span style={{ fontSize: '1.25rem', marginRight: isSidebarOpen ? 'var(--space-md)' : 0 }}>{item.icon}</span>
                            {isSidebarOpen && <span style={{ fontWeight: 500 }}>{item.label}</span>}
                        </Link>
                    ))}

                    {/* Admin Only Link */}
                    {userProfile && userProfile.role === 'admin' && (
                        <Link
                            to="/admin"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: 'var(--space-sm) var(--space-md)',
                                borderRadius: 'var(--radius-md)',
                                textDecoration: 'none',
                                color: location.pathname === '/admin' ? 'white' : 'var(--color-text-muted)',
                                background: location.pathname === '/admin' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                                border: location.pathname === '/admin' ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
                                transition: 'all 0.2s ease',
                                justifyContent: isSidebarOpen ? 'flex-start' : 'center',
                                marginTop: 'var(--space-sm)',
                                borderTop: '1px solid rgba(255,255,255,0.1)'
                            }}
                        >
                            <span style={{ fontSize: '1.25rem', marginRight: isSidebarOpen ? 'var(--space-md)' : 0 }}>🛡️</span>
                            {isSidebarOpen && <span style={{ fontWeight: 500 }}>Admin Panel</span>}
                        </Link>
                    )}
                </nav>

                <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 'var(--space-md)', marginTop: 'auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--color-bg-secondary)', border: '1px solid var(--glass-border)' }}></div>
                        {isSidebarOpen && (
                            <div style={{ overflow: 'hidden' }}>
                                <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{userProfile ? userProfile.name : 'Guest'}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{userProfile ? userProfile.role : 'Sign in'}</div>
                            </div>
                        )}
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main style={{ flex: 1, padding: 'var(--space-md)', overflowY: 'auto' }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xl)' }}>
                    <div>
                        <h2 style={{ fontSize: '1.5rem', margin: 0 }}>{navItems.find(i => i.path === location.pathname)?.label || (location.pathname === '/admin' ? 'Admin Panel' : 'Dashboard')}</h2>
                        <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>Welcome back to your lab management workspace</p>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                        <button className="btn glass-panel" style={{ padding: 'var(--space-sm)' }}>🔔</button>
                        <button className="btn glass-panel" style={{ padding: 'var(--space-sm)' }}>⚙️</button>
                    </div>
                </header>

                <div className="animate-fade-in">
                    {children}
                </div>
            </main>
        </div>
    );
};

export default Layout;
