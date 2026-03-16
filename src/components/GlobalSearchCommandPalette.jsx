import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Command, X, File, Users, Settings, BookOpen, MapPin, User, ArrowRight, Loader2, Calendar } from 'lucide-react';
import { useMasterData } from '../contexts/MasterDataContext';
import { useAuth } from '../contexts/AuthContext';
import { useScheduleData } from '../hooks/useScheduleData';
import { db } from '../lib/firebase';
import { collection, query, orderBy, startAt, endAt, limit, getDocs } from 'firebase/firestore';

const GlobalSearchCommandPalette = ({ isOpen, onClose }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedTerm, setDebouncedTerm] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [isSearching, setIsSearching] = useState(false);
    const [asyncResults, setAsyncResults] = useState([]);

    const navigate = useNavigate();
    const inputRef = useRef(null);

    const { faculty, subjects, rooms, departments } = useMasterData();
    const { schedule } = useScheduleData();
    const { userProfile } = useAuth();
    const isAdmin = userProfile?.role === 'admin';

    // Premium Debounce Logic for async network searching
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedTerm(searchTerm.trim().toLowerCase());
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        if (!debouncedTerm || debouncedTerm.length < 2) {
            setAsyncResults([]);
            setIsSearching(false);
            return;
        }

        const fetchAsyncData = async () => {
            setIsSearching(true);
            try {
                // Capitalize for Firebase standard string matching if needed, or query both
                const upperTerm = debouncedTerm.toUpperCase();

                // Fetch Students by RegNo or Name dynamically (limit 3 to keep UI clean)
                const studentsRef = collection(db, 'students');
                const nameQuery = query(studentsRef, orderBy('name'), startAt(upperTerm), endAt(upperTerm + '\uf8ff'), limit(3));
                const regQuery = query(studentsRef, orderBy('regNo'), startAt(upperTerm), endAt(upperTerm + '\uf8ff'), limit(2));

                const [nameSnap, regSnap] = await Promise.all([getDocs(nameQuery), getDocs(regQuery)]);

                const dynamic = [];
                const seen = new Set();

                const processDoc = (doc) => {
                    if (!seen.has(doc.id)) {
                        seen.add(doc.id);
                        const data = doc.data();
                        dynamic.push({
                            id: `stu_${doc.id}`,
                            title: `${data.name} (${data.regNo})`,
                            path: '/students',
                            icon: <Users size={16} />,
                            type: 'Student',
                            groupId: 'network'
                        });
                    }
                };

                nameSnap.forEach(processDoc);
                regSnap.forEach(processDoc);

                setAsyncResults(dynamic);
            } catch (error) {
                console.error("Search Error:", error);
            } finally {
                setIsSearching(false);
            }
        };

        fetchAsyncData();
    }, [debouncedTerm]);

    useEffect(() => {
        if (isOpen) {
            setSearchTerm('');
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    // Add Keyboard listener for Cmd+K / Ctrl+K
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                if (isOpen) onClose();
                else {
                    // This command is caught by the parent or Layout mostly, 
                    // but we can put a custom event or let Layout handle it.
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Build Search Results
    const generateResults = () => {
        if (!searchTerm.trim()) return [];

        const term = searchTerm.toLowerCase();
        let results = [];

        // 1. Navigation / Pages (Instant)
        const pages = [
            { id: 'p1', title: 'Dashboard', path: '/', icon: <Command size={16} />, type: 'Page' },
            { id: 'p2', title: 'Assignments', path: '/assignments', icon: <File size={16} />, type: 'Page' },
            { id: 'p3', title: 'Schedule', path: '/schedule', icon: <Calendar size={16} />, type: 'Page' },
            { id: 'p5', title: 'Analytics', path: '/analytics', icon: <Command size={16} />, type: 'Page' },
            { id: 'p6', title: 'Students', path: '/students', icon: <Users size={16} />, type: 'Page' },
            { id: 'p7', title: 'Resources', path: '/resources', icon: <BookOpen size={16} />, type: 'Page' },
        ];

        if (isAdmin) {
            pages.push({ id: 'p4', title: 'Master Data', path: '/master-data', icon: <Settings size={16} />, type: 'Page' });
            pages.push({ id: 'p8', title: 'Admin Panel', path: '/admin', icon: <Settings size={16} />, type: 'Page' });
        }

        pages.forEach(p => {
            if (p.title.toLowerCase().includes(term)) results.push(p);
        });

        // 2. Active Scheduled Classes (Instant from local context cache)
        if (schedule && schedule.length) {
            let matches = 0;
            schedule.forEach(s => {
                const searchString = `${s.subject} ${s.faculty} ${s.room} ${s.dept} ${s.section}`.toLowerCase();
                if (searchString.includes(term) && matches < 3) {
                    matches++;
                    results.push({
                        id: `sch_${s.id}`,
                        title: `${s.subject} (${s.room})`,
                        path: '/schedule',
                        icon: <Calendar size={16} />,
                        type: 'Class'
                    });
                }
            });
        }

        // 3. Master Data (Faculty, Subjects, Rooms)
        let masterMatches = 0;
        if (faculty && faculty.length) {
            faculty.forEach(f => {
                if (f.name?.toLowerCase().includes(term) && masterMatches < 2) {
                    masterMatches++;
                    results.push({ id: `f_${f.id}`, title: f.name, path: '/assignments', icon: <User size={16} />, type: 'Faculty' });
                }
            });
        }
        if (subjects && subjects.length) {
            subjects.forEach(s => {
                if ((s.name?.toLowerCase().includes(term) || s.shortCode?.toLowerCase().includes(term)) && masterMatches < 4) {
                    masterMatches++;
                    results.push({ id: `s_${s.id}`, title: s.name, path: '/assignments', icon: <BookOpen size={16} />, type: 'Subject' });
                }
            });
        }

        // Limit local to top 6, then merge with network payload (students)
        results = results.slice(0, 6);

        // Append async network results 
        if (asyncResults.length > 0) {
            results = [...results, ...asyncResults];
        }

        return results;
    };

    const results = generateResults();

    useEffect(() => {
        setSelectedIndex(0);
    }, [searchTerm]);

    const handleKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (results[selectedIndex]) {
                handleSelect(results[selectedIndex]);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
        }
    };

    const handleSelect = (item) => {
        navigate(item.path);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: '10vh',
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            animation: 'fadeIn 0.2s ease-out'
        }} onClick={onClose}>
            <div
                style={{
                    width: '100%',
                    maxWidth: '600px',
                    margin: '0 20px',
                    background: 'rgba(23, 23, 28, 0.85)',
                    borderRadius: '16px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.05)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    animation: 'slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Search Header */}
                <div style={{ display: 'flex', alignItems: 'center', padding: '1.25rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <Search size={20} color="rgba(255,255,255,0.5)" />
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Search assignments, faculty, pages..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={handleKeyDown}
                        style={{
                            flex: 1,
                            background: 'transparent',
                            border: 'none',
                            color: 'white',
                            fontSize: '1.1rem',
                            marginLeft: '12px',
                            outline: 'none',
                            fontFamily: 'inherit'
                        }}
                    />
                    <style>{`
                            @keyframes spinSlow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                        `}</style>
                    {isSearching ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px' }}>
                            <Loader2 size={16} color="rgba(255,255,255,0.4)" style={{ animation: 'spinSlow 1.5s linear infinite' }} />
                        </div>
                    ) : (
                        <button
                            onClick={onClose}
                            style={{
                                background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px',
                                color: 'rgba(255,255,255,0.6)', padding: '4px', cursor: 'pointer', display: 'flex',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>

                {/* Results Body */}
                {searchTerm.trim() ? (
                    <div style={{ padding: '0.75rem', maxHeight: '400px', overflowY: 'auto' }}>
                        {results.length > 0 ? (
                            results.map((item, index) => (
                                <div
                                    key={item.id}
                                    onClick={() => handleSelect(item)}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        padding: '0.75rem 1rem',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        background: index === selectedIndex ? 'rgba(96, 165, 250, 0.15)' : 'transparent',
                                        transition: 'background 0.1s ease'
                                    }}
                                >
                                    <div style={{
                                        width: '32px', height: '32px', borderRadius: '8px',
                                        background: 'rgba(255,255,255,0.05)', display: 'flex',
                                        alignItems: 'center', justifyContent: 'center', marginRight: '1rem',
                                        color: index === selectedIndex ? '#60a5fa' : 'rgba(255,255,255,0.6)'
                                    }}>
                                        {item.icon}
                                    </div>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontSize: '0.95rem', fontWeight: 600, color: index === selectedIndex ? 'white' : 'rgba(255,255,255,0.9)' }}>
                                            {item.title}
                                        </span>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{
                                            fontSize: '0.75rem', fontWeight: 600,
                                            color: item.type === 'Student' ? '#10b981' : item.type === 'Class' ? '#f59e0b' : 'rgba(255,255,255,0.4)',
                                            padding: '2px 8px', background: 'rgba(255,255,255,0.05)',
                                            border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px'
                                        }}>
                                            {item.type}
                                        </span>
                                        {index === selectedIndex && <ArrowRight size={14} color="#60a5fa" />}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div style={{ padding: '2rem', textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>
                                {isSearching ? "Searching global database..." : `No results found for "${searchTerm}"`}
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ padding: '1rem 0', display: 'flex', justifyContent: 'center', gap: '2rem', borderTop: 'none' }}>
                        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>
                            <kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)' }}>↑</kbd> <kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)' }}>↓</kbd> to navigate
                        </div>
                        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>
                            <kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)' }}>Enter</kbd> to select
                        </div>
                        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>
                            <kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)' }}>Esc</kbd> to close
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes slideDown {
                    from { opacity: 0; transform: translateY(-20px) scale(0.98); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
        </div>
    );
};

export default GlobalSearchCommandPalette;
