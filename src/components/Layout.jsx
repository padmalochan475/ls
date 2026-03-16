import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { doc, updateDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import {
    LayoutDashboard,
    FilePlus,
    UserPlus,
    Users,
    Calendar,
    Settings,
    ChartBar,
    Shield,
    Menu,
    X,
    LogOut,

    Download,
    Bell,
    BellOff,
    Lightbulb,
    AlertCircle,
    Library,
    BookOpen,
    Search
} from 'lucide-react';
import AcademicYearSelector from './AcademicYearSelector';
import { useNotifications } from '../contexts/NotificationContext';
import '../styles/design-system.css';
import OneSignal from 'react-onesignal';
import Logo from './Logo';
import GlobalSearchCommandPalette from './GlobalSearchCommandPalette';

// Layout Component wrapping the application

// eslint-disable-next-line sonarjs/cognitive-complexity
const Layout = ({ children }) => {
    const location = useLocation();
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
    const { userProfile, currentUser, logout, isSystemSyncing } = useAuth();
    const { permission, registerForPush } = useNotifications();

    // useEffect removed to prevent toast spam on refresh. NotificationContext handles sync automatically.

    // Heartbeat for "Online" Status & Device Tracking
    useEffect(() => {
        if (!currentUser) return;

        const updateHeartbeat = async () => {
            try {
                // Get or Create Device ID
                let deviceId = localStorage.getItem('lams_device_id');
                if (!deviceId) {
                    deviceId = window.crypto && window.crypto.randomUUID
                        ? window.crypto.randomUUID()
                        : Math.random().toString(36).substring(2) + Date.now().toString(36); // eslint-disable-line sonarjs/pseudo-random
                    localStorage.setItem('lams_device_id', deviceId);
                }

                // Update Firestore
                // We update both root lastSeen (for simple queries) and the specific session
                await updateDoc(doc(db, 'users', currentUser.uid), {
                    lastSeen: new Date().toISOString(),
                    isOnline: true,
                    [`sessions.${deviceId}`]: new Date().toISOString()
                });
            } catch (e) {
                console.error("Heartbeat failed", e);
            }
        };

        // Initial call
        updateHeartbeat();

        // Interval
        const interval = setInterval(updateHeartbeat, 20000); // Every 20 seconds
        return () => clearInterval(interval);
    }, [currentUser]);

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

    // Global Command+K Listener
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setIsSearchOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // PWA Install Prompt
    const [installPrompt, setInstallPrompt] = useState(null);

    useEffect(() => {
        const handler = (e) => {
            e.preventDefault();
            setInstallPrompt(e);
        };
        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleInstallClick = async () => {
        if (!installPrompt) return;
        installPrompt.prompt();
        const { outcome } = await installPrompt.userChoice;
        if (outcome === 'accepted') {
            setInstallPrompt(null);
        }
    };


    const isAdmin = userProfile && userProfile.role === 'admin';

    const [pendingCount, setPendingCount] = useState(0);

    // Fetch Pending Substitutions Count (Source: incomingRequests)
    useEffect(() => {
        if (!currentUser || !userProfile?.empId) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setPendingCount(0);
            return;
        }

        // We fetch all requests for this faculty and filter in memory to avoid index requirements
        const q = query(
            collection(db, 'substitution_requests'),
            where('targetFacultyId', '==', userProfile.empId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const pending = snapshot.docs.filter(doc => {
                const data = doc.data();
                return data.status === 'pending' && !data.targetResponse;
            }).length;
            setPendingCount(pending);
        }, (err) => {
            console.error("Sidebar Badge Sync Error:", err);
            setPendingCount(0);
        });

        return () => unsubscribe();
    }, [currentUser, userProfile?.empId]);

    const navItems = [
        { path: '/', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
        { path: '/assignments', label: 'Assignments', icon: <FilePlus size={20} /> },
        { path: '/schedule', label: 'Schedule', icon: <Calendar size={20} /> },
        ...(isAdmin ? [{ path: '/master-data', label: 'Master Data', icon: <Settings size={20} /> }] : []),
        { path: '/analytics', label: 'Analytics', icon: <ChartBar size={20} /> },
        {
            path: '/substitutions',
            label: 'Substitutions',
            icon: <UserPlus size={20} />,
            badge: pendingCount > 0 ? pendingCount : null
        },
        { path: '/students', label: 'Student Management', icon: <Users size={20} /> },
        { path: '/resources', label: 'Resources', icon: <Library size={20} /> },
        { path: '/syllabus', label: 'Syllabus', icon: <BookOpen size={20} />, isNew: true },
        { path: '/suggestions', label: 'Suggestions', icon: <Lightbulb size={20} /> },
    ];


    const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

    return (
        <div className="layout-wrapper" style={{ display: 'flex', minHeight: '100vh', background: 'transparent' }}>

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

            {/* Global Sync Shield */}
            {isSystemSyncing && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    color: 'white', animation: 'fadeIn 0.3s'
                }}>
                    <div className="spin-slow" style={{
                        width: '60px', height: '60px', borderRadius: '50%',
                        border: '3px solid transparent', borderTopColor: '#60a5fa', borderLeftColor: '#c084fc',
                        marginBottom: '1rem'
                    }} />
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Syncing Active Year...</h3>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Ensuring data consistency</p>
                </div>
            )}


            {/* Sidebar */}
            <aside
                className="glass-panel-static"
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
                <div style={{ padding: '0 var(--space-xs)', marginBottom: 'var(--space-xl)' }}>
                    <Logo
                        size={40}
                        iconSize={24}
                        showText={isSidebarOpen || isMobile}
                        textClass={(isSidebarOpen || isMobile) ? 'logo-text-visible' : 'logo-text-hidden'} // Optional class handling if needed
                    />
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
                            {(isSidebarOpen || isMobile) && (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1 }}>
                                    <span style={{ fontWeight: 500 }}>{item.label}</span>
                                    {item.badge !== null && item.badge !== undefined && typeof item.badge === 'number' && item.badge > 0 && (
                                        <span style={{
                                            fontSize: '0.7rem',
                                            background: '#ef4444',
                                            color: 'white',
                                            padding: '2px 8px',
                                            borderRadius: '10px',
                                            fontWeight: '900',
                                            marginLeft: '8px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            boxShadow: '0 0 12px rgba(239, 68, 68, 0.5)',
                                            animation: 'pulse 2s infinite',
                                            justifyContent: 'center',
                                            flexShrink: 0,
                                            whiteSpace: 'nowrap'
                                        }}>
                                            <AlertCircle size={10} strokeWidth={3} />
                                            {item.badge}
                                        </span>
                                    )}
                                    {item.isNew && (
                                        <span style={{
                                            fontSize: '0.6rem',
                                            background: 'var(--color-accent)',
                                            color: 'white',
                                            padding: '2px 6px',
                                            borderRadius: '10px',
                                            fontWeight: '700',
                                            marginLeft: '8px'
                                        }}>NEW</span>
                                    )}
                                </div>
                            )}

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
                    {/* Install App Button (Visible only if installable) */}
                    {installPrompt && (
                        <button
                            onClick={handleInstallClick}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: 'var(--space-sm) var(--space-md)',
                                borderRadius: 'var(--radius-md)',
                                textDecoration: 'none',
                                color: '#4ade80', // Success Green
                                background: 'rgba(74, 222, 128, 0.1)',
                                border: '1px solid rgba(74, 222, 128, 0.2)',
                                transition: 'all 0.2s ease',
                                justifyContent: (isSidebarOpen || isMobile) ? 'flex-start' : 'center',
                                marginTop: 'var(--space-sm)',
                                cursor: 'pointer',
                                width: '100%',
                                flexShrink: 0
                            }}
                        >
                            <span style={{ marginRight: (isSidebarOpen || isMobile) ? 'var(--space-md)' : 0, display: 'flex' }}><Download size={20} /></span>
                            {(isSidebarOpen || isMobile) && <span style={{ fontWeight: 600 }}>Install App</span>}
                        </button>
                    )}

                    {/* Notifications Status / Toggle */}


                    {permission === 'granted' ? (
                        <button
                            onClick={async () => {
                                try {
                                    const eid = OneSignal.User.externalId;
                                    const currentUid = currentUser?.uid;

                                    if (eid === currentUid) {
                                        toast.success("Notifications Active & Linked! ✅", {
                                            icon: '🔔',
                                            style: { background: '#10b981', color: 'white' }
                                        });
                                    } else {
                                        if (confirm("⚠️ Connection Issue Detected.\n\nYour device is not fully linked to your account.\n\nClick OK to Fix.")) {
                                            await OneSignal.logout();
                                            await OneSignal.login(currentUid);
                                            toast.success("Connection Repaired! 🚀");
                                        }
                                    }
                                } catch (e) {
                                    console.error(e);
                                    toast.error("Could not verify status");
                                }
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: 'var(--space-sm) var(--space-md)',
                                borderRadius: 'var(--radius-md)',
                                textDecoration: 'none',
                                color: '#4ade80', // Green
                                background: 'rgba(74, 222, 128, 0.1)',
                                border: '1px solid rgba(74, 222, 128, 0.2)',
                                transition: 'all 0.2s ease',
                                justifyContent: (isSidebarOpen || isMobile) ? 'flex-start' : 'center',
                                marginTop: 'var(--space-sm)',
                                width: '100%',
                                flexShrink: 0,
                                cursor: 'pointer'
                            }}
                        >
                            <span style={{ marginRight: (isSidebarOpen || isMobile) ? 'var(--space-md)' : 0, display: 'flex' }}><Bell size={20} /></span>
                            {(isSidebarOpen || isMobile) && <span style={{ fontWeight: 600 }}>Active (Check)</span>}
                        </button>
                    ) : (
                        <button
                            onClick={() => {
                                registerForPush();
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: 'var(--space-sm) var(--space-md)',
                                borderRadius: 'var(--radius-md)',
                                textDecoration: 'none',
                                color: '#f59e0b', // Amber
                                background: 'rgba(245, 158, 11, 0.1)',
                                border: '1px solid rgba(245, 158, 11, 0.2)',
                                transition: 'all 0.2s ease',
                                justifyContent: (isSidebarOpen || isMobile) ? 'flex-start' : 'center',
                                marginTop: 'var(--space-sm)',
                                cursor: 'pointer',
                                width: '100%',
                                flexShrink: 0
                            }}
                        >
                            <span style={{ marginRight: (isSidebarOpen || isMobile) ? 'var(--space-md)' : 0, display: 'flex' }}><BellOff size={20} /></span>
                            {(isSidebarOpen || isMobile) && <span style={{ fontWeight: 600 }}>Enable Alerts</span>}
                        </button>
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
                            {userProfile?.photoURL ? (
                                <img src={userProfile.photoURL} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                userProfile?.name?.charAt(0) || 'G'
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
            <main className="layout-main" style={{
                flex: 1,
                minWidth: 0,
                padding: isMobile ? '0 var(--space-md) var(--space-md) var(--space-md)' : 'var(--space-md) var(--space-xl)',
                overflowY: 'auto',
                overflowX: 'hidden',
                marginLeft: 0,
                transition: 'all 0.3s ease',
                position: 'relative'
            }}>
                <header className="premium-top-navbar">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <h2 className="navbar-brand" style={{ margin: 0 }}>
                            {(() => {
                                const found = navItems.find(i => i.path === location.pathname);
                                if (found) return found.label;
                                if (location.pathname === '/admin') return 'Admin Panel';
                                if (location.pathname === '/profile') return 'My Profile';
                                return 'Dashboard';
                            })()}
                        </h2>
                    </div>

                    <button className="navbar-search hide-on-mobile" onClick={() => setIsSearchOpen(true)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Search size={16} />
                            <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)' }}>Search assignments, pages...</span>
                        </div>
                        <div className="search-kbd-badge">
                            <kbd>⌘</kbd><kbd>K</kbd>
                        </div>
                    </button>

                    <div style={{ position: 'relative', display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'flex-end' }}>
                        <div className="hide-on-mobile"><AcademicYearSelector /></div>

                        {/* Premium Mobile Search Button */}
                        {isMobile && (
                            <button
                                onClick={() => setIsSearchOpen(true)}
                                style={{
                                    width: '36px', height: '36px', borderRadius: '50%',
                                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: 'white', cursor: 'pointer',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                                }}
                                title="Search"
                            >
                                <Search size={16} />
                            </button>
                        )}

                        <div style={{ position: 'relative' }}>
                            <div
                                onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                                title="My Profile"
                                style={{
                                    width: '36px', height: '36px', borderRadius: '50%',
                                    background: 'var(--color-bg-secondary)', border: '1px solid var(--color-accent-subtle)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.875rem', fontWeight: 'bold', color: 'var(--color-accent)', overflow: 'hidden',
                                    boxShadow: '0 4px 12px var(--color-accent-subtle)', cursor: 'pointer',
                                    transition: 'transform 0.2s',
                                    transform: isProfileDropdownOpen ? 'scale(0.95)' : 'scale(1)'
                                }}
                            >
                                {userProfile?.photoURL ? (
                                    <img src={userProfile.photoURL} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    userProfile?.name?.charAt(0) || 'G'
                                )}
                            </div>

                            {/* Dropdown Menu */}
                            {isProfileDropdownOpen && (
                                <>
                                    <div
                                        style={{ position: 'fixed', inset: 0, zIndex: 999 }}
                                        onClick={() => setIsProfileDropdownOpen(false)}
                                    />
                                    <div style={{
                                        position: 'absolute',
                                        top: 'calc(100% + 12px)',
                                        right: 0,
                                        width: '220px',
                                        background: 'rgba(23, 23, 28, 0.85)',
                                        backdropFilter: 'blur(20px) saturate(200%)',
                                        WebkitBackdropFilter: 'blur(20px) saturate(200%)',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: '12px',
                                        boxShadow: '0 20px 40px -10px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05)',
                                        zIndex: 1000,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        animation: 'slideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                                        overflow: 'hidden'
                                    }}>
                                        <div style={{ padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'white', letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {userProfile?.name || 'User'}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {userProfile?.email}
                                            </div>
                                        </div>
                                        <div style={{ padding: '6px' }}>
                                            <Link
                                                to="/profile"
                                                onClick={() => setIsProfileDropdownOpen(false)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px',
                                                    borderRadius: '6px', color: 'rgba(255,255,255,0.8)', textDecoration: 'none',
                                                    fontSize: '0.85rem', fontWeight: 500, transition: 'all 0.2s',
                                                }}
                                                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#fff' }}
                                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.8)' }}
                                            >
                                                <Settings size={14} /> My Profile
                                            </Link>
                                            <button
                                                onClick={async () => {
                                                    setIsProfileDropdownOpen(false);
                                                    try { await logout(); } catch (err) { console.error(err); toast.error('Logout failed.') }
                                                }}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px',
                                                    borderRadius: '6px', color: '#f87171', background: 'transparent',
                                                    border: 'none', width: '100%', cursor: 'pointer',
                                                    fontSize: '0.85rem', fontWeight: 600, transition: 'all 0.2s', marginTop: '4px'
                                                }}
                                                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; e.currentTarget.style.color = '#fca5a5' }}
                                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#f87171' }}
                                            >
                                                <LogOut size={14} /> Log Out
                                            </button>
                                        </div>
                                    </div>

                                    <style>{`
                                        @keyframes slideDown {
                                            from { opacity: 0; transform: translateY(-10px) scale(0.95); }
                                            to { opacity: 1; transform: translateY(0) scale(1); }
                                        }
                                    `}</style>
                                </>
                            )}
                        </div>
                    </div>
                </header>

                <GlobalSearchCommandPalette
                    isOpen={isSearchOpen}
                    onClose={() => setIsSearchOpen(false)}
                />

                <div>
                    {children}
                </div>
            </main>
        </div>
    );
};

export default Layout;
