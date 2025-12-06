import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
    LayoutDashboard,
    FilePlus,
    Calendar,
    Settings,
    BarChart3,
    Shield,
    Menu,
    X,
    LogOut,
    FlaskConical
} from 'lucide-react';
import '../styles/design-system.css';

const Layout = ({ children }) => {
    const location = useLocation();
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const { userProfile, logout, activeAcademicYear, setSelectedAcademicYear, academicYears } = useAuth();

    // Handle Window Resize
    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 768);
            if (window.innerWidth >= 768) {
                setIsMobileMenuOpen(false);
                setIsSidebarOpen(true);
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const isAdmin = userProfile && userProfile.role === 'admin';

    const navItems = [
        { path: '/', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
        { path: '/assignments', label: 'Assignments', icon: <FilePlus size={20} /> },
        { path: '/schedule', label: 'Schedule', icon: <Calendar size={20} /> },
        ...(isAdmin ? [{ path: '/master-data', label: 'Master Data', icon: <Settings size={20} /> }] : []),
        { path: '/analytics', label: 'Analytics', icon: <BarChart3 size={20} /> },
    ];

    const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg-main)' }}>

            {/* Mobile Menu Button */}
            <button
                className="mobile-menu-btn"
                onClick={toggleMobileMenu}
                style={{ display: isMobile ? 'flex' : 'none' }}
            >
                {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            {/* Mobile Overlay */}
            <div
                className={`sidebar-overlay ${isMobileMenuOpen ? 'open' : ''}`}
                onClick={() => setIsMobileMenuOpen(false)}
            />

            {/* Sidebar */}
            <aside
                className="glass-panel"
                style={{
                    // Base Styles
                    display: 'flex',
                    flexDirection: 'column',
                    padding: 'var(--space-md)',
                    background: 'var(--glass-bg)',
                    backdropFilter: 'blur(var(--glass-blur))',
                    WebkitBackdropFilter: 'blur(var(--glass-blur))',
                    borderRight: '1px solid var(--glass-border)',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    zIndex: 1100, // Must be higher than overlay (900) and toggle button (1000)

                    // Desktop vs Mobile Logic
                    ...(isMobile ? {
                        position: 'fixed',
                        top: 0,
                        bottom: 0,
                        left: 0,
                        width: '280px', // Wider for touch
                        margin: 0,
                        borderRadius: 0,
                        transform: isMobileMenuOpen ? 'translateX(0)' : 'translateX(-100%)',
                        boxShadow: isMobileMenuOpen ? '0 0 50px 10px rgba(0,0,0,0.5)' : 'none',
                        paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)', // Safe area for mobile
                    } : {
                        position: 'sticky',
                        top: 'var(--space-md)',
                        height: 'calc(100vh - 2 * var(--space-md))',
                        width: isSidebarOpen ? '260px' : '80px',
                        margin: 'var(--space-md)',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--glass-border)',
                        transform: 'none',
                        boxShadow: 'var(--glass-shadow)',
                    })
                }}
            >
                {/* Logo Area */}
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 'var(--space-xl)', padding: '0 var(--space-xs)' }}>
                    <div style={{
                        width: '40px',
                        height: '40px',
                        background: 'linear-gradient(135deg, var(--color-accent), #60a5fa)',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        marginRight: (isSidebarOpen || isMobile) ? 'var(--space-md)' : '0',
                        flexShrink: 0,
                        boxShadow: '0 0 15px var(--color-accent-glow)'
                    }}>
                        <FlaskConical size={24} />
                    </div>
                    {(isSidebarOpen || isMobile) && (
                        <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0, background: 'linear-gradient(to right, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            LAB
                        </h1>
                    )}
                </div>

                {/* Navigation */}
                <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)', overflowY: 'auto', minHeight: 0 }}>
                    {navItems.map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            onClick={() => isMobile && setIsMobileMenuOpen(false)}
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
                                justifyContent: (isSidebarOpen || isMobile) ? 'flex-start' : 'center',
                                position: 'relative',
                                overflow: 'hidden',
                                flexShrink: 0
                            }}
                        >
                            <span style={{ marginRight: (isSidebarOpen || isMobile) ? 'var(--space-md)' : 0, display: 'flex' }}>{item.icon}</span>
                            {(isSidebarOpen || isMobile) && <span style={{ fontWeight: 500 }}>{item.label}</span>}

                            {/* Active Indicator Glow */}
                            {location.pathname === item.path && (
                                <div style={{
                                    position: 'absolute',
                                    left: 0,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    width: '3px',
                                    height: '60%',
                                    background: 'var(--color-accent)',
                                    borderRadius: '0 4px 4px 0',
                                    boxShadow: '0 0 10px var(--color-accent)'
                                }} />
                            )}
                        </Link>
                    ))}

                    {/* Admin Only Link */}
                    {userProfile && userProfile.role === 'admin' && (
                        <Link
                            to="/admin"
                            onClick={() => isMobile && setIsMobileMenuOpen(false)}
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
                                justifyContent: (isSidebarOpen || isMobile) ? 'flex-start' : 'center',
                                marginTop: 'var(--space-sm)',
                                borderTop: '1px solid rgba(255,255,255,0.1)',
                                paddingTop: 'var(--space-md)',
                                flexShrink: 0
                            }}
                        >
                            <span style={{ marginRight: (isSidebarOpen || isMobile) ? 'var(--space-md)' : 0, display: 'flex' }}><Shield size={20} /></span>
                            {(isSidebarOpen || isMobile) && <span style={{ fontWeight: 500 }}>Admin Panel</span>}
                        </Link>
                    )}
                </nav>

                {/* User Profile */}
                <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 'var(--space-md)', marginTop: 'auto', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                        <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            background: 'var(--color-bg-secondary)',
                            border: '1px solid var(--glass-border)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.875rem',
                            fontWeight: 'bold',
                            color: 'var(--color-accent)',
                            overflow: 'hidden'
                        }}>
                            {userProfile && userProfile.photoURL ? (
                                <img src={userProfile.photoURL} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                userProfile ? userProfile.name.charAt(0) : 'G'
                            )}
                        </div>
                        {(isSidebarOpen || isMobile) && (
                            <Link to="/profile" style={{ overflow: 'hidden', flex: 1, textDecoration: 'none', color: 'inherit' }}>
                                <div style={{ fontSize: '0.875rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userProfile ? userProfile.name : 'Guest'}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{userProfile ? userProfile.role : 'Sign in'}</div>
                            </Link>
                        )}
                        {(isSidebarOpen || isMobile) && (
                            <button
                                onClick={logout}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--color-text-muted)',
                                    cursor: 'pointer',
                                    padding: '4px',
                                    borderRadius: '4px',
                                    display: 'flex'
                                }}
                                title="Logout"
                            >
                                <LogOut size={16} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Content Minimalist Credits */}
                {(isSidebarOpen || isMobile) && (
                    <div style={{
                        marginTop: '1rem',
                        textAlign: 'center',
                        padding: '0.5rem 0'
                    }}>
                        <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', display: 'block', marginBottom: '2px' }}>
                            Designed by
                        </span>
                        <span style={{
                            fontSize: '0.85rem',
                            fontWeight: '700',
                            background: 'linear-gradient(to right, #38bdf8, #c084fc, #f472b6, #38bdf8)',
                            backgroundSize: '200% auto',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            animation: 'shine 5s linear infinite',
                            letterSpacing: '0.01em',
                        }}>
                            Padmalochan Maharana
                        </span>
                    </div>
                )}
            </aside>

            {/* Main Content */}
            <main style={{
                flex: 1,
                padding: isMobile ? 'var(--space-xl) var(--space-md) var(--space-md) var(--space-md)' : 'var(--space-md)',
                overflowY: 'auto',
                marginLeft: isMobile ? 0 : 0,
                transition: 'all 0.3s ease'
            }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xl)', marginTop: isMobile ? 'var(--space-xl)' : 0 }}>
                    <div>
                        <h2 style={{ fontSize: '1.5rem', margin: 0 }}>
                            {navItems.find(i => i.path === location.pathname)?.label ||
                                (location.pathname === '/admin' ? 'Admin Panel' :
                                    location.pathname === '/profile' ? 'My Profile' : 'Dashboard')}
                        </h2>
                    </div>

                    {/* Global Academic Year Selector */}
                    <div style={{ position: 'relative', minWidth: '180px' }}>
                        <select
                            value={activeAcademicYear}
                            onChange={(e) => setSelectedAcademicYear(e.target.value)}
                            className="glass-input"
                            style={{
                                fontWeight: '600',
                                color: 'var(--color-accent)',
                                cursor: 'pointer'
                            }}
                        >
                            {academicYears.map(year => (
                                <option key={year} value={year} style={{ background: '#1e293b', color: 'white' }}>
                                    {year}
                                </option>
                            ))}
                        </select>
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
