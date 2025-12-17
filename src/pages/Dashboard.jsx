import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Calendar, Users, Clock, MapPin, CalendarDays, Zap, BookOpen, GraduationCap, ChevronLeft, ChevronRight, LayoutTemplate, UserCircle, Check } from 'lucide-react';

// Helper to get dates for the current week
const getWeekDates = () => {
    const curr = new Date();
    const week = [];
    // Starting from Monday
    const first = curr.getDate() - curr.getDay() + 1;
    for (let i = 0; i < 6; i++) {
        const day = new Date(curr.setDate(first + i));
        week.push({
            dayName: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][i],
            dateString: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), // e.g. "Dec 2"
            fullDate: day
        });
    }
    return week;
};

const StatCard = ({ title, value, icon, trend, color, gradient }) => (
    <div className="glass-panel" style={{
        padding: '1.5rem',
        position: 'relative',
        overflow: 'hidden',
        background: gradient ? gradient : 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.05)'
    }}>
        <div style={{ position: 'absolute', top: '-10px', right: '-10px', fontSize: '6rem', opacity: 0.1, transform: 'rotate(15deg)' }}>
            {icon}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div style={{
                padding: '0.5rem',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(5px)',
                color: 'white'
            }}>
                {icon}
            </div>
            {trend && (
                <span style={{
                    fontSize: '0.75rem',
                    color: '#fff',
                    background: 'rgba(255, 255, 255, 0.2)',
                    padding: '2px 8px',
                    borderRadius: '20px',
                    fontWeight: 600
                }}>
                    {trend}
                </span>
            )}
        </div>
        <div style={{ fontSize: '2.5rem', fontWeight: '800', marginBottom: '0.25rem', letterSpacing: '-1px' }}>{value}</div>
        <div style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.9rem', fontWeight: 500 }}>{title}</div>
    </div>
);

const Dashboard = () => {
    const { userProfile, activeAcademicYear } = useAuth();
    const [todaySchedule, setTodaySchedule] = useState([]);
    const [weeklySchedule, setWeeklySchedule] = useState({});
    const [roomCount, setRoomCount] = useState(0);
    const [totalClasses, setTotalClasses] = useState(0);
    const [facultyList, setFacultyList] = useState([]);
    const [selectedFaculty, setSelectedFaculty] = useState('');

    // View Mode: 'admin' or 'personal'
    const [dashboardView, setDashboardView] = useState('personal');

    // Initialize View Mode based on Role
    useEffect(() => {
        if (userProfile) {
            if (userProfile.role === 'admin') {
                setDashboardView('admin');
            } else {
                setDashboardView('personal');
            }
        }
    }, [userProfile]);

    // Handle View Mode Change
    const toggleViewMode = () => {
        const newMode = dashboardView === 'admin' ? 'personal' : 'admin';
        setDashboardView(newMode);

        if (newMode === 'personal') {
            setSelectedFaculty(userProfile.name);
        } else {
            setSelectedFaculty('All Assignments');
        }
    };

    // Set default selection based on role/view when profile loads or view changes
    useEffect(() => {
        if (userProfile) {
            if (dashboardView === 'admin') {
                if (!selectedFaculty || selectedFaculty === userProfile.name) {
                    setSelectedFaculty('All Assignments');
                }
            } else {
                // Force non-admins or personal view to see only their own schedule
                setSelectedFaculty(userProfile.name);
            }
        }
    }, [userProfile, dashboardView]);

    const [currentDate, setCurrentDate] = useState(new Date());

    // Helper to format date for display
    const formattedDate = currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const currentDayName = currentDate.toLocaleDateString('en-US', { weekday: 'long' });

    // Helper to change date
    const changeDate = (days) => {
        const newDate = new Date(currentDate);
        newDate.setDate(currentDate.getDate() + days);
        setCurrentDate(newDate);
    };

    // Helper to check class status
    const getClassStatus = (timeRange) => {
        if (!timeRange || typeof timeRange !== 'string' || !timeRange.includes(' - ')) {
            return { label: 'Unknown', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.1)' };
        }

        const now = new Date();
        const isToday = currentDate.toDateString() === now.toDateString();
        const isPast = currentDate < now && !isToday;

        if (isPast) return { label: 'Completed', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' };
        if (!isToday) return { label: 'Scheduled', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.1)' };

        const [start, end] = timeRange.split(' - ');

        // Convert time strings to Date objects for today
        const getDateTime = (timeStr) => {
            if (!timeStr) return new Date();
            const parts = timeStr.split(':');
            if (parts.length < 2) return new Date();

            const [hours, minutes] = parts.map(Number);
            const date = new Date();
            date.setHours(hours, minutes, 0);
            return date;
        };

        const startTime = getDateTime(start);
        const endTime = getDateTime(end);

        if (now > endTime) return { label: 'Completed', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' };
        if (now >= startTime && now <= endTime) return { label: 'In Progress', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' };
        return { label: 'Upcoming', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' };
    };

    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState([]);
    const [weekDates, setWeekDates] = useState([]);

    useEffect(() => {
        const fetchMasterData = async () => {
            try {
                const [facultySnap, roomsSnap, daysSnap] = await Promise.all([
                    getDocs(collection(db, 'faculty')),
                    getDocs(collection(db, 'rooms')),
                    getDocs(collection(db, 'days'))
                ]);
                setFacultyList(facultySnap.docs.map(d => d.data().name));
                setRoomCount(roomsSnap.size);

                const daysData = daysSnap.docs.map(d => d.data()).filter(d => d.isVisible !== false).sort((a, b) => a.order - b.order);
                setDays(daysData.map(d => d.name));

                // Generate Week Dates based on fetched days
                const curr = new Date();
                const first = curr.getDate() - curr.getDay() + 1; // Monday
                const week = [];

                // Map standard day names to their index (0=Sun, 1=Mon, etc.) to calculate date offset
                const dayMap = { 'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6 };

                daysData.forEach(dayObj => {
                    const dayName = dayObj.name;
                    const targetDayIndex = dayMap[dayName];
                    if (targetDayIndex !== undefined) {
                        // Calculate difference from Monday (1)
                        // If today is Monday (1), and target is Tuesday (2), diff is 1.
                        // Date = first (Monday's date) + (targetIndex - 1)
                        const offset = targetDayIndex - 1;
                        const dayDate = new Date(curr);
                        dayDate.setDate(first + offset);

                        week.push({
                            dayName: dayName,
                            dateString: dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                            fullDate: dayDate
                        });
                    }
                });
                setWeekDates(week);

            } catch (err) {
                console.error("Error fetching master data:", err);
            }

        };
        fetchMasterData();
    }, []);

    // Real-time Schedule Listener
    useEffect(() => {
        if (!activeAcademicYear || weekDates.length === 0) {
            setLoading(false);
            return;
        }

        setLoading(true);

        const q = query(
            collection(db, 'schedule'),
            where('academicYear', '==', activeAcademicYear)
        );

        const unsubscribe = onSnapshot(q, (snap) => {
            const allData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setTotalClasses(allData.length);

            // Filter Logic
            let dailyFiltered = [];
            const isPersonalView = dashboardView === 'personal';

            const isMyAssignment = (item, targetName) => {
                // 1. Robust Check: Match by EmpID
                if (isPersonalView && userProfile?.empId) {
                    if (item.facultyEmpId === userProfile.empId) return true;
                    if (item.faculty2EmpId === userProfile.empId) return true;
                }
                // 2. Fallback Check: Match by Name
                if (!item.faculty) return false;
                return item.faculty === targetName || item.faculty.includes(targetName) || (item.faculty2 && item.faculty2.includes(targetName));
            };

            if (selectedFaculty === 'All Assignments') {
                dailyFiltered = allData.filter(item => item.day === currentDayName);
            } else {
                if (!selectedFaculty) {
                    dailyFiltered = [];
                } else {
                    dailyFiltered = allData.filter(item =>
                        item.day === currentDayName && isMyAssignment(item, selectedFaculty)
                    );
                }
            }
            setTodaySchedule(dailyFiltered);

            // Weekly Data Processing
            let facultyData = allData;
            if (selectedFaculty !== 'All Assignments' && selectedFaculty) {
                facultyData = allData.filter(item => isMyAssignment(item, selectedFaculty));
            } else if (!selectedFaculty) {
                facultyData = [];
            }

            const grouped = {};
            weekDates.forEach(({ dayName }) => {
                // If 'All Assignments', showing all. If specific, showing filtered.
                // Wait, the original logic for 'All Assignments' didn't populate 'grouped' for Weekly Schedule?
                // Let's check original logic:
                // "if (selectedFaculty !== 'All Assignments' && selectedFaculty)" -> Populate Grouped.
                // Else -> setWeeklySchedule({}).

                if (selectedFaculty !== 'All Assignments' && selectedFaculty) {
                    grouped[dayName] = facultyData.filter(item => item.day === dayName).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
                }
            });

            if (selectedFaculty === 'All Assignments') {
                setWeeklySchedule({});
            } else {
                setWeeklySchedule(grouped);
            }

            setLoading(false);
        }, (err) => {
            console.error("Error fetching dashboard data:", err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [activeAcademicYear, weekDates, currentDayName, selectedFaculty, dashboardView, userProfile]);

    // Helper to get relative date label
    const getDateLabel = (date) => {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) return 'Today';
        if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
        if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    // Dynamic Stats based on View Mode
    const stats = dashboardView === 'admin' ? [
        { title: 'Total Classes', value: totalClasses, icon: <BookOpen size={24} />, trend: 'This Year', gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' },
        { title: 'Active Faculty', value: facultyList.length, icon: <Users size={24} />, trend: 'Registered', gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' },
        { title: 'Lab Rooms', value: roomCount, icon: <Zap size={24} />, gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' },
        { title: 'Academic Year', value: activeAcademicYear ? activeAcademicYear.split('-')[0] : 'N/A', icon: <GraduationCap size={24} />, gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' },
    ] : [
        { title: "Today's Classes", value: todaySchedule.length, icon: <Clock size={24} />, trend: getDateLabel(currentDate), gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' },
        { title: 'Weekly Classes', value: Object.values(weeklySchedule).reduce((acc, curr) => acc + curr.length, 0), icon: <CalendarDays size={24} />, trend: 'This Week', gradient: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' },
        { title: 'Subjects', value: new Set(Object.values(weeklySchedule).flat().map(i => i.subject)).size, icon: <BookOpen size={24} />, gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' },
        { title: 'Academic Year', value: activeAcademicYear ? activeAcademicYear.split('-')[0] : 'N/A', icon: <GraduationCap size={24} />, gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

            {/* Premium Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '2.5rem', fontWeight: '800', letterSpacing: '-1px', background: 'linear-gradient(to right, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        Dashboard
                    </h2>
                    <p style={{ margin: '0.5rem 0 0 0', color: 'var(--color-text-muted)', fontSize: '1.1rem' }}>
                        {dashboardView === 'admin' ? 'Admin Overview & Management' : 'My Schedule & Stats'}
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    {/* Admin Toggle Switch */}
                    {userProfile?.role === 'admin' && (
                        <button
                            onClick={toggleViewMode}
                            className="glass-panel"
                            style={{
                                padding: '0.5rem 1rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                cursor: 'pointer',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: 'white',
                                transition: 'all 0.2s'
                            }}
                            title={dashboardView === 'admin' ? "Switch to Personal View" : "Switch to Admin View"}
                        >
                            {dashboardView === 'admin' ? <UserCircle size={20} /> : <LayoutTemplate size={20} />}
                            <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                                {dashboardView === 'admin' ? 'View as Faculty' : 'View as Admin'}
                            </span>
                        </button>
                    )}

                    {dashboardView === 'admin' ? (
                        <div className="glass-panel" style={{ padding: '0.5rem', display: 'flex', alignItems: 'center', gap: '1rem', borderRadius: '50px' }}>
                            <span style={{ paddingLeft: '1rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Schedule for:</span>
                            <select
                                value={selectedFaculty}
                                onChange={(e) => setSelectedFaculty(e.target.value)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'white',
                                    fontSize: '1rem',
                                    fontWeight: '600',
                                    outline: 'none',
                                    cursor: 'pointer',
                                    paddingRight: '1rem'
                                }}
                            >
                                <option value="All Assignments" style={{ background: '#1e293b', color: 'white' }}>All Assignments</option>
                                {facultyList.map(f => (
                                    <option key={f} value={f} style={{ background: '#1e293b', color: 'white' }}>
                                        {f === userProfile?.name ? `${f} (Me)` : f}
                                    </option>
                                ))}
                            </select>
                        </div>
                    ) : (
                        <div className="glass-panel" style={{ padding: '0.5rem 1.5rem', borderRadius: '50px', color: 'var(--color-text-muted)', fontSize: '0.9rem', fontWeight: 500 }}>
                            {userProfile?.name}'s Schedule
                        </div>
                    )}
                </div>
            </div>

            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
                {stats.map((stat, index) => (
                    <StatCard key={index} {...stat} />
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>

                {/* Up Next / Live Status Card (Faculty View Only) */}
                {dashboardView === 'personal' && todaySchedule.length > 0 && (
                    <div className="glass-panel" style={{
                        padding: '2rem',
                        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(37, 99, 235, 0.05) 100%)',
                        border: '1px solid rgba(59, 130, 246, 0.2)',
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        <div style={{ position: 'absolute', top: '-20px', right: '-20px', fontSize: '10rem', opacity: 0.05, transform: 'rotate(15deg)' }}>
                            <Clock />
                        </div>

                        {(() => {
                            const now = new Date();
                            // Simple time parser for comparison
                            const parseTime = (t) => {
                                if (!t) return new Date();
                                // Handle "10:00 AM - 11:00 AM" or "10:00 - 11:00"
                                const [rangeStart] = t.split(' - ');
                                // Remove AM/PM if present to get raw HH:MM
                                const timeOnly = rangeStart.replace(/(AM|PM)/i, '').trim();
                                const [hStr, mStr] = timeOnly.split(':');

                                let h = parseInt(hStr);
                                const m = parseInt(mStr);

                                // Adjust for PM if needed (12 PM is 12, 1 PM is 13)
                                const isPM = rangeStart.toUpperCase().includes('PM');
                                const isAM = rangeStart.toUpperCase().includes('AM');

                                if (isPM && h < 12) h += 12;
                                if (isAM && h === 12) h = 0;

                                const d = new Date();
                                d.setHours(h, m, 0);
                                return d;
                            };

                            // Find active or next class
                            const upcoming = todaySchedule
                                .map(item => ({ ...item, startTime: parseTime(item.time) }))
                                .filter(item => item.startTime > new Date(new Date().getTime() - 60 * 60 * 1000)) // Filter out classes older than 1 hour ago (roughly)
                                .sort((a, b) => a.startTime - b.startTime)[0];

                            if (!upcoming) return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                    <div style={{ padding: '1rem', background: 'rgba(16, 185, 129, 0.2)', borderRadius: '50%', color: '#10b981' }}>
                                        <Check size={32} />
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.5rem' }}>All Caught Up!</h3>
                                        <p style={{ margin: '0.5rem 0 0 0', color: 'var(--color-text-muted)' }}>No more classes scheduled for today.</p>
                                    </div>
                                </div>
                            );

                            const isNow = getClassStatus(upcoming.time).label === 'In Progress';

                            return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <div style={{
                                                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                                                padding: '0.25rem 0.75rem', borderRadius: '20px',
                                                background: isNow ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                                                color: isNow ? '#fbbf24' : '#60a5fa',
                                                fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '1rem'
                                            }}>
                                                {isNow ? <Zap size={14} /> : <Calendar size={14} />}
                                                {isNow ? 'Happening Now' : 'Up Next'}
                                            </div>
                                            <h2 style={{ margin: 0, fontSize: '2.5rem', fontWeight: 800, lineHeight: 1.2 }}>
                                                {upcoming.subject}
                                            </h2>
                                            <div style={{ fontSize: '1.2rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
                                                {upcoming.dept} - {upcoming.section}{upcoming.group && upcoming.group !== 'All' ? ` - ${upcoming.group}` : ''} - {upcoming.sem}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'white' }}>
                                                {upcoming.time.split(' - ')[0]}
                                            </div>
                                            <div style={{ fontSize: '1rem', color: 'var(--color-text-muted)' }}>
                                                Room <span style={{ color: '#f59e0b', fontWeight: 600 }}>{upcoming.room}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    {/* Daily Schedule Card */}
                    <div className="glass-panel" style={{ padding: '0', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{
                            padding: '1.5rem',
                            background: 'rgba(255,255,255,0.03)',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '1rem'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.25rem' }}>
                                    <div style={{ padding: '0.5rem', background: 'rgba(59, 130, 246, 0.2)', borderRadius: '8px', color: '#60a5fa' }}><Clock size={20} /></div>
                                    Daily Schedule
                                </h3>
                            </div>

                            {/* Date Controls */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                background: 'rgba(0, 0, 0, 0.2)',
                                padding: '0.5rem',
                                borderRadius: '16px',
                                border: '1px solid rgba(255, 255, 255, 0.05)'
                            }}>
                                <button
                                    onClick={() => changeDate(-1)}
                                    style={{
                                        padding: '0.6rem',
                                        borderRadius: '12px',
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        color: 'white',
                                        border: '1px solid rgba(255, 255, 255, 0.05)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                        e.currentTarget.style.transform = 'translateY(-1px)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                        e.currentTarget.style.transform = 'translateY(0)';
                                    }}
                                    title="Previous Day"
                                >
                                    <ChevronLeft size={20} />
                                </button>

                                <button
                                    onClick={() => setCurrentDate(new Date())}
                                    style={{
                                        padding: '0.6rem 1.5rem',
                                        borderRadius: '12px',
                                        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                        color: 'white',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontWeight: '600',
                                        fontSize: '0.95rem',
                                        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        textShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                        minWidth: '120px',
                                        justifyContent: 'center'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = 'translateY(-1px)';
                                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(37, 99, 235, 0.4)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = 'translateY(0)';
                                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.3)';
                                    }}
                                >
                                    <Calendar size={18} />
                                    {getDateLabel(currentDate)}
                                </button>

                                <button
                                    onClick={() => changeDate(1)}
                                    style={{
                                        padding: '0.6rem',
                                        borderRadius: '12px',
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        color: 'white',
                                        border: '1px solid rgba(255, 255, 255, 0.05)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                        e.currentTarget.style.transform = 'translateY(-1px)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                        e.currentTarget.style.transform = 'translateY(0)';
                                    }}
                                    title="Next Day"
                                >
                                    <ChevronRight size={20} />
                                </button>

                                <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)', margin: '0 0.25rem' }}></div>

                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="date"
                                        value={currentDate && !isNaN(currentDate.getTime()) ? currentDate.toISOString().split('T')[0] : ''}
                                        onChange={(e) => {
                                            if (!e.target.value) return;
                                            const d = new Date(e.target.value);
                                            if (!isNaN(d.getTime())) setCurrentDate(d);
                                        }}
                                        style={{
                                            background: 'rgba(255, 255, 255, 0.05)',
                                            border: '1px solid rgba(255, 255, 255, 0.1)',
                                            color: 'white',
                                            fontFamily: 'inherit',
                                            fontSize: '0.9rem',
                                            padding: '0.5rem 0.75rem',
                                            borderRadius: '12px',
                                            outline: 'none',
                                            cursor: 'pointer',
                                            colorScheme: 'dark',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
                                    />
                                </div>
                            </div>
                        </div>

                        <div style={{ padding: '1rem 1.5rem', background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.95rem', color: 'var(--color-text-muted)' }}>
                            Showing classes for <strong style={{ color: 'white' }}>{formattedDate}</strong>
                        </div>

                        <div style={{ padding: '1.5rem' }}>
                            {loading ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>Loading schedule...</div>
                            ) : todaySchedule.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                                    <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>☕</div>
                                    <p style={{ fontSize: '1.1rem' }}>No classes scheduled for {currentDayName}.</p>
                                    <p style={{ fontSize: '0.9rem', opacity: 0.7 }}>Enjoy your free time!</p>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                                    {todaySchedule.sort((a, b) => (a.time || '').localeCompare(b.time || '')).map((item, index) => {
                                        const status = getClassStatus(item.time);
                                        return (
                                            <div key={index} className="glass-panel"
                                                style={{
                                                    padding: '1.5rem',
                                                    background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.4) 0%, rgba(15, 23, 42, 0.6) 100%)',
                                                    border: '1px solid rgba(255,255,255,0.08)',
                                                    position: 'relative',
                                                    overflow: 'hidden',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '1.25rem',
                                                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2), 0 4px 6px -2px rgba(0, 0, 0, 0.1)',
                                                    transition: 'transform 0.2s, box-shadow 0.2s'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.transform = 'translateY(-4px)';
                                                    e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.15)';
                                                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                    e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.2), 0 4px 6px -2px rgba(0, 0, 0, 0.1)';
                                                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                                                }}
                                            >
                                                {/* Accent Bar */}
                                                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: status.color }}></div>

                                                {/* Header: Time, Badge */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                                        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '10px' }}>
                                                            <Clock size={18} color="white" />
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                            <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'white', letterSpacing: '0.5px' }}>{item.time}</span>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                                                                <MapPin size={14} color="#f59e0b" />
                                                                {item.room}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div style={{
                                                        padding: '0.35rem 0.85rem', borderRadius: '20px',
                                                        background: status.bg, color: status.color,
                                                        fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase',
                                                        letterSpacing: '0.5px', boxShadow: `0 2px 8px ${status.bg.replace('0.1', '0.2')}`
                                                    }}>
                                                        {status.label}
                                                    </div>
                                                </div>

                                                {/* Body: Subject */}
                                                <div>
                                                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.4rem', fontWeight: 800, color: 'white', lineHeight: 1.3 }}>{item.subject}</h4>
                                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                        <span style={{ background: 'rgba(255,255,255,0.05)', padding: '0.25rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', color: '#cbd5e1', fontWeight: 500 }}>
                                                            {item.dept}
                                                        </span>
                                                        <span style={{ background: 'rgba(255,255,255,0.05)', padding: '0.25rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', color: '#cbd5e1', fontWeight: 500 }}>
                                                            {item.section}{item.group && item.group !== 'All' ? ` - ${item.group}` : ''}
                                                        </span>
                                                        <span style={{ background: 'rgba(255,255,255,0.05)', padding: '0.25rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', color: '#cbd5e1', fontWeight: 500 }}>
                                                            {item.sem}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Footer: Faculty (Always Visible) */}
                                                <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                                                        <div style={{ padding: '0.5rem', background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)', borderRadius: '50%', color: 'white', display: 'flex', boxShadow: '0 2px 5px rgba(59, 130, 246, 0.4)' }}>
                                                            <UserCircle size={18} />
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                            <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'white' }}>{item.faculty}</span>
                                                            {item.faculty2 && (
                                                                <span style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                                    <span style={{ opacity: 0.6 }}>&</span> {item.faculty2}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>


                </div>
            </div>

            {/* Premium Weekly Timetable (Interactive Timeline) */}
            {selectedFaculty !== 'All Assignments' && (
                <div className="glass-panel" style={{ padding: '2rem', overflow: 'hidden', position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.5rem' }}>
                            <div style={{ padding: '0.5rem', background: 'rgba(139, 92, 246, 0.2)', borderRadius: '8px', color: '#a78bfa' }}>
                                <CalendarDays size={24} />
                            </div>
                            Weekly Planner
                        </h3>
                        <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{ width: '12px', height: '12px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.5)' }}></div>
                                <span>Completed</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{ width: '12px', height: '12px', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.5)' }}></div>
                                <span>Ongoing</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{ width: '12px', height: '12px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.5)' }}></div>
                                <span>Upcoming</span>
                            </div>
                        </div>
                    </div>

                    <div style={{ overflowX: 'auto', paddingBottom: '1rem' }}>
                        <div style={{ minWidth: '800px', position: 'relative' }}>
                            {/* Time Header */}
                            <div style={{ display: 'flex', marginLeft: '100px', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
                                {[8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map(hour => (
                                    <div key={hour} style={{ flex: 1, textAlign: 'left', fontSize: '0.85rem', color: 'var(--color-text-muted)', borderLeft: '1px solid rgba(255,255,255,0.05)', paddingLeft: '0.5rem' }}>
                                        {hour > 12 ? hour - 12 : hour} {hour >= 12 ? 'PM' : 'AM'}
                                    </div>
                                ))}
                            </div>

                            {/* Days Rows */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {weekDates.map(({ dayName, dateString, fullDate }) => {
                                    const classes = weeklySchedule[dayName] || [];
                                    const isToday = dayName === currentDayName;

                                    // Helper functions for time parsing
                                    const parseTime = (t) => {
                                        if (!t) return 8;
                                        try {
                                            const [timePart, modifier] = t.split(' - ')[0].split(' ');
                                            let [h, m] = timePart.split(':').map(Number);
                                            if (modifier === 'PM' && h < 12) h += 12;
                                            if (modifier === 'AM' && h === 12) h = 0;
                                            return h + (m / 60);
                                        } catch (e) {
                                            return 8;
                                        }
                                    };
                                    const parseDuration = (t) => {
                                        if (!t) return 1;
                                        try {
                                            const [startStr, endStr] = t.split(' - ');

                                            const getHours = (timeStr) => {
                                                const [timePart, modifier] = timeStr.split(' ');
                                                let [h, m] = timePart.split(':').map(Number);
                                                if (modifier === 'PM' && h < 12) h += 12;
                                                if (modifier === 'AM' && h === 12) h = 0;
                                                return h + (m / 60);
                                            };

                                            return getHours(endStr) - getHours(startStr);
                                        } catch (e) {
                                            return 1;
                                        }
                                    };

                                    // Process overlaps to assign lanes
                                    const processOverlaps = (items) => {
                                        // Sort by start time, then duration (longest first)
                                        const sorted = [...items].map(item => ({
                                            ...item,
                                            start: parseTime(item.time),
                                            duration: parseDuration(item.time),
                                            end: parseTime(item.time) + parseDuration(item.time)
                                        })).sort((a, b) => {
                                            if (a.start !== b.start) return a.start - b.start;
                                            return b.duration - a.duration;
                                        });

                                        const lanes = []; // Stores the end time of the last item in each lane

                                        const processed = sorted.map(item => {
                                            let laneIndex = -1;
                                            // Find the first lane where this item fits
                                            for (let i = 0; i < lanes.length; i++) {
                                                if (item.start >= lanes[i]) {
                                                    laneIndex = i;
                                                    lanes[i] = item.end;
                                                    break;
                                                }
                                            }
                                            // If no lane found, create a new one
                                            if (laneIndex === -1) {
                                                laneIndex = lanes.length;
                                                lanes.push(item.end);
                                            }
                                            return { ...item, laneIndex };
                                        });

                                        return { items: processed, maxLanes: lanes.length };
                                    };

                                    const { items: processedClasses, maxLanes } = processOverlaps(classes);
                                    const laneHeight = 55; // Height per concurrent event
                                    const minHeight = 60;
                                    const rowHeight = Math.max(minHeight, maxLanes * laneHeight);

                                    return (
                                        <div key={dayName} style={{ display: 'flex', alignItems: 'flex-start', minHeight: `${rowHeight}px`, position: 'relative' }}>
                                            {/* Day Label */}
                                            <div style={{
                                                width: '100px',
                                                flexShrink: 0,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                justifyContent: 'center',
                                                borderRight: '1px solid rgba(255,255,255,0.1)',
                                                paddingRight: '1rem',
                                                height: `${rowHeight}px`, // Match row height
                                                opacity: isToday ? 1 : 0.7
                                            }}>
                                                <div style={{ fontWeight: 700, color: isToday ? 'var(--color-accent)' : 'white' }}>{dayName.substring(0, 3)}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{dateString.split(' ')[1]}</div>
                                            </div>

                                            {/* Timeline Track */}
                                            <div style={{ flex: 1, position: 'relative', height: `${rowHeight}px`, background: isToday ? 'rgba(255,255,255,0.02)' : 'transparent', borderRadius: '8px' }}>
                                                {/* Grid Lines */}
                                                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
                                                    <div key={i} style={{ position: 'absolute', left: `${i * 10}%`, top: 0, bottom: 0, width: '1px', background: 'rgba(255,255,255,0.03)' }}></div>
                                                ))}

                                                {/* Classes */}
                                                {processedClasses.map((item, idx) => {
                                                    const startOffset = item.start - 8; // Start at 8 AM
                                                    // 10 hours total width (8am to 6pm)
                                                    const left = (startOffset / 10) * 100;
                                                    const width = (item.duration / 10) * 100;

                                                    // Determine Status
                                                    const now = new Date();
                                                    // Construct class start/end times using the row's date
                                                    const classStart = new Date(fullDate);
                                                    const [sH, sM] = item.time.split(' - ')[0].split(':').map(Number);
                                                    classStart.setHours(sH, sM, 0);

                                                    const classEnd = new Date(fullDate);
                                                    const [eH, eM] = item.time.split(' - ')[1].split(':').map(Number);
                                                    classEnd.setHours(eH, eM, 0);

                                                    let status = 'upcoming';
                                                    if (now > classEnd) status = 'completed';
                                                    else if (now >= classStart && now <= classEnd) status = 'ongoing';

                                                    // Styles based on Status
                                                    let bg = 'rgba(59, 130, 246, 0.15)';
                                                    let border = 'rgba(59, 130, 246, 0.3)';
                                                    let text = '#93c5fd';

                                                    if (status === 'completed') {
                                                        bg = 'rgba(16, 185, 129, 0.1)';
                                                        border = 'rgba(16, 185, 129, 0.2)';
                                                        text = '#6ee7b7';
                                                    } else if (status === 'ongoing') {
                                                        bg = 'rgba(245, 158, 11, 0.2)';
                                                        border = 'rgba(245, 158, 11, 0.4)';
                                                        text = '#fcd34d';
                                                    }

                                                    return (
                                                        <div
                                                            key={idx}
                                                            className="glass-panel"
                                                            style={{
                                                                position: 'absolute',
                                                                left: `${left}%`,
                                                                width: `${width}%`,
                                                                top: `${item.laneIndex * laneHeight + 5}px`, // Dynamic Top Position
                                                                height: `${laneHeight - 10}px`, // Fixed height per item with gap
                                                                padding: '0.5rem',
                                                                background: bg,
                                                                border: `1px solid ${border}`,
                                                                borderRadius: '6px',
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                justifyContent: 'center',
                                                                overflow: 'hidden',
                                                                cursor: 'pointer',
                                                                transition: 'all 0.2s',
                                                                zIndex: 10
                                                            }}
                                                            title={`${item.subject} (${item.time})`}
                                                            onMouseEnter={(e) => {
                                                                e.currentTarget.style.zIndex = 20;
                                                                e.currentTarget.style.transform = 'scale(1.02)';
                                                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                e.currentTarget.style.zIndex = 10;
                                                                e.currentTarget.style.transform = 'scale(1)';
                                                                e.currentTarget.style.boxShadow = 'none';
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', overflow: 'hidden' }}>
                                                                <span style={{ fontWeight: 700, fontSize: '0.8rem', color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                    {item.subject}
                                                                </span>
                                                                <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                                                    {item.dept}-{item.section}-{item.group === 'All' ? 'All' : item.group}
                                                                </span>
                                                            </div>
                                                            <div style={{ fontSize: '0.7rem', color: text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                {item.room}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Current Time Indicator (Vertical Line) */}
                            {(() => {
                                const now = new Date();
                                const currentHour = now.getHours() + now.getMinutes() / 60;
                                if (currentHour >= 8 && currentHour <= 18) {
                                    const left = ((currentHour - 8) / 10) * 100;
                                    return (
                                        <div style={{
                                            position: 'absolute',
                                            left: `${left}%`,
                                            top: '30px', // Below header
                                            bottom: 0,
                                            width: '2px',
                                            background: 'var(--color-danger)',
                                            zIndex: 5,
                                            pointerEvents: 'none'
                                        }}>
                                            <div style={{
                                                position: 'absolute',
                                                top: '-6px',
                                                left: '-4px',
                                                width: '10px',
                                                height: '10px',
                                                borderRadius: '50%',
                                                background: 'var(--color-danger)'
                                            }}></div>
                                        </div>
                                    );
                                }
                                return null;
                            })()}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
