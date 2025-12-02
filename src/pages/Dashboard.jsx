import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Calendar, Users, Clock, MapPin, CalendarDays, Zap, BookOpen, GraduationCap } from 'lucide-react';

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
    const [facultyList, setFacultyList] = useState([]);
    const [selectedFaculty, setSelectedFaculty] = useState(userProfile?.name || '');
    const [loading, setLoading] = useState(true);

    const weekDates = getWeekDates();
    const todayDayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];
    const todayDate = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    useEffect(() => {
        const fetchFaculty = async () => {
            const snap = await getDocs(collection(db, 'faculty'));
            setFacultyList(snap.docs.map(d => d.data().name));
        };
        fetchFaculty();
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            if (!activeAcademicYear) return;
            setLoading(true);
            try {
                const q = query(
                    collection(db, 'schedule'),
                    where('academicYear', '==', activeAcademicYear)
                );
                const snap = await getDocs(q);
                const allData = snap.docs.map(d => d.data());

                // 1. Filter for Today's Schedule
                let todayFiltered = [];
                if (selectedFaculty === 'All Assignments') {
                    todayFiltered = allData.filter(item => item.day === todayDayName);
                } else {
                    const targetFaculty = selectedFaculty || userProfile?.name;
                    todayFiltered = allData.filter(item => item.day === todayDayName && item.faculty === targetFaculty);
                }
                setTodaySchedule(todayFiltered);

                // 2. Filter for Weekly Schedule
                if (selectedFaculty !== 'All Assignments') {
                    const targetFaculty = selectedFaculty || userProfile?.name;
                    const facultyData = allData.filter(item => item.faculty === targetFaculty);

                    const grouped = {};
                    weekDates.forEach(({ dayName }) => {
                        grouped[dayName] = facultyData.filter(item => item.day === dayName).sort((a, b) => a.time.localeCompare(b.time));
                    });
                    setWeeklySchedule(grouped);
                } else {
                    setWeeklySchedule({});
                }

            } catch (err) {
                console.error("Error fetching schedule:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [activeAcademicYear, selectedFaculty, userProfile, todayDayName]);

    // Premium Stats
    const stats = [
        { title: 'Total Classes', value: '124', icon: <BookOpen size={24} />, trend: '+12%', gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' },
        { title: 'Active Faculty', value: facultyList.length, icon: <Users size={24} />, trend: 'Online', gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' },
        { title: 'Lab Rooms', value: '12', icon: <Zap size={24} />, gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' },
        { title: 'Academic Year', value: activeAcademicYear.split('-')[0], icon: <GraduationCap size={24} />, gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' },
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
                        {todayDate}
                    </p>
                </div>

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
                        {userProfile?.role === 'admin' && <option value="All Assignments" style={{ color: 'black' }}>All Assignments (Admin)</option>}
                        <option value={userProfile?.name} style={{ color: 'black' }}>My Schedule</option>
                        {facultyList.filter(f => f !== userProfile?.name).map(f => (
                            <option key={f} value={f} style={{ color: 'black' }}>{f}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
                {stats.map((stat, index) => (
                    <StatCard key={index} {...stat} />
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    {/* Today's Schedule Card */}
                    <div className="glass-panel" style={{ padding: '0', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{
                            padding: '1.5rem',
                            background: 'rgba(255,255,255,0.03)',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.25rem' }}>
                                <div style={{ padding: '0.5rem', background: 'rgba(59, 130, 246, 0.2)', borderRadius: '8px', color: '#60a5fa' }}><Clock size={20} /></div>
                                Today's Classes
                            </h3>
                            <span style={{ fontSize: '0.85rem', background: 'rgba(255,255,255,0.1)', padding: '4px 12px', borderRadius: '20px', fontWeight: 500 }}>
                                {todaySchedule.length} Sessions
                            </span>
                        </div>

                        <div style={{ padding: '1.5rem' }}>
                            {loading ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>Loading schedule...</div>
                            ) : todaySchedule.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                                    <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>☕</div>
                                    <p style={{ fontSize: '1.1rem' }}>No classes scheduled for today.</p>
                                    <p style={{ fontSize: '0.9rem', opacity: 0.7 }}>Enjoy your free time!</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {todaySchedule.sort((a, b) => a.time.localeCompare(b.time)).map((item, index) => (
                                        <div key={index} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '1.5rem',
                                            padding: '1.25rem',
                                            background: 'rgba(255,255,255,0.02)',
                                            borderRadius: '16px',
                                            border: '1px solid rgba(255,255,255,0.05)',
                                            transition: 'transform 0.2s',
                                            cursor: 'default'
                                        }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                                        >
                                            <div style={{ minWidth: '100px', textAlign: 'center' }}>
                                                <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'white' }}>{item.time.split(' - ')[0]}</div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{item.time.split(' - ')[1]}</div>
                                            </div>
                                            <div style={{ width: '2px', height: '40px', background: 'var(--color-accent)', opacity: 0.5 }}></div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 'bold', fontSize: '1.2rem', marginBottom: '0.25rem' }}>{item.subject}</div>
                                                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Users size={14} /> {item.dept} - {item.sem} ({item.group})</span>
                                                    {selectedFaculty === 'All Assignments' && (
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#60a5fa' }}>👨‍🏫 {item.faculty}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div style={{
                                                padding: '0.5rem 1rem',
                                                background: 'rgba(255,255,255,0.05)',
                                                borderRadius: '12px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                                fontSize: '0.9rem',
                                                fontWeight: 500
                                            }}>
                                                <MapPin size={16} /> {item.room}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Weekly Schedule (Hidden if All Assignments selected) */}
                    {selectedFaculty !== 'All Assignments' && (
                        <div className="glass-panel" style={{ padding: '0', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.25rem' }}>
                                    <div style={{ padding: '0.5rem', background: 'rgba(16, 185, 129, 0.2)', borderRadius: '8px', color: '#6ee7b7' }}><CalendarDays size={20} /></div>
                                    Weekly Overview
                                </h3>
                            </div>
                            <div style={{ padding: '1.5rem' }}>
                                {weekDates.map(({ dayName, dateString }) => {
                                    const classes = weeklySchedule[dayName] || [];
                                    if (classes.length === 0) return null;
                                    return (
                                        <div key={dayName} style={{ marginBottom: '2rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                                                <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>{dayName}</h4>
                                                <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px' }}>{dateString}</span>
                                                <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                                                {classes.map((item, idx) => (
                                                    <div key={idx} style={{
                                                        padding: '1rem',
                                                        background: 'rgba(255,255,255,0.02)',
                                                        borderRadius: '12px',
                                                        border: '1px solid rgba(255,255,255,0.03)',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '0.5rem'
                                                    }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <span style={{ fontWeight: 'bold', color: 'var(--color-accent)', fontSize: '0.9rem' }}>{item.time}</span>
                                                            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={12} /> {item.room}</span>
                                                        </div>
                                                        <div style={{ fontWeight: 600, fontSize: '1rem' }}>{item.subject}</div>
                                                        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{item.dept} - {item.sem} ({item.group})</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                                {Object.values(weeklySchedule).every(arr => arr?.length === 0) && !loading && (
                                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                                        No weekly classes found.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Sidebar / Quick Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="glass-panel" style={{ padding: '1.5rem', background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 100%)' }}>
                        <h3 style={{ marginTop: 0, fontSize: '1.1rem' }}>Quick Actions</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <button className="btn" style={{
                                padding: '1rem',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.05)',
                                display: 'flex', alignItems: 'center', gap: '1rem',
                                justifyContent: 'flex-start'
                            }}>
                                <span style={{ fontSize: '1.2rem' }}>📅</span>
                                <div style={{ textAlign: 'left' }}>
                                    <div style={{ fontWeight: 600 }}>View Full Schedule</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Check conflict matrix</div>
                                </div>
                            </button>
                        </div>
                    </div>

                    <div style={{
                        padding: '1.5rem',
                        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(37, 99, 235, 0.1) 100%)',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid rgba(59, 130, 246, 0.2)'
                    }}>
                        <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Zap size={16} /> Pro Tip
                        </h4>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)', lineHeight: '1.5' }}>
                            You can click on any class in the "Schedule" page to edit its details or check for conflicts instantly.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
