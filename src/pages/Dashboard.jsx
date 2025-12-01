import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Calendar, Users, Clock, MapPin } from 'lucide-react';

const StatCard = ({ title, value, icon, trend, color }) => (
    <div className="glass-panel" style={{ padding: 'var(--space-lg)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-10px', right: '-10px', fontSize: '5rem', opacity: 0.05 }}>
            {icon}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-sm)' }}>
            <div style={{ padding: 'var(--space-xs)', borderRadius: 'var(--radius-md)', background: `rgba(${color}, 0.1)`, color: `rgb(${color})` }}>
                {icon}
            </div>
            {trend && (
                <span style={{ fontSize: '0.75rem', color: 'var(--color-success)', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 6px', borderRadius: 'var(--radius-full)' }}>
                    {trend}
                </span>
            )}
        </div>
        <div style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: 'var(--space-xs)' }}>{value}</div>
        <div style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>{title}</div>
    </div>
);

const Dashboard = () => {
    const { userProfile, activeAcademicYear } = useAuth();
    const [todaySchedule, setTodaySchedule] = useState([]);
    const [facultyList, setFacultyList] = useState([]);
    const [selectedFaculty, setSelectedFaculty] = useState(userProfile?.name || '');
    const [loading, setLoading] = useState(true);

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = days[new Date().getDay()];

    useEffect(() => {
        const fetchFaculty = async () => {
            const snap = await getDocs(collection(db, 'faculty'));
            setFacultyList(snap.docs.map(d => d.data().name));
        };
        fetchFaculty();
    }, []);

    useEffect(() => {
        const fetchTodaySchedule = async () => {
            if (!activeAcademicYear) return;
            setLoading(true);
            try {
                // Query schedule for active year and today
                const q = query(
                    collection(db, 'schedule'),
                    where('academicYear', '==', activeAcademicYear),
                    where('day', '==', today)
                );
                const snap = await getDocs(q);
                const allToday = snap.docs.map(d => d.data());

                // Filter by selected faculty (client-side for flexibility)
                // If selectedFaculty is empty, show logged-in user's schedule
                const targetFaculty = selectedFaculty || userProfile?.name;
                const filtered = allToday.filter(item => item.faculty === targetFaculty);

                setTodaySchedule(filtered);
            } catch (err) {
                console.error("Error fetching schedule:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchTodaySchedule();
    }, [activeAcademicYear, selectedFaculty, userProfile]);

    // Mock Stats (In real app, these would be queried)
    const stats = [
        { title: 'Total Assignments', value: '124', icon: '📝', trend: '+12%', color: '59, 130, 246' },
        { title: 'Active Faculty', value: facultyList.length, icon: '👨‍🏫', trend: '+2', color: '16, 185, 129' },
        { title: 'Lab Rooms', value: '12', icon: '🏢', color: '245, 158, 11' },
        { title: 'Academic Year', value: activeAcademicYear, icon: '📅', color: '239, 68, 68' },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>

            {/* Header / Filter */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0 }}>Dashboard</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Viewing schedule for:</span>
                    <select
                        className="glass-input"
                        value={selectedFaculty}
                        onChange={(e) => setSelectedFaculty(e.target.value)}
                        style={{ minWidth: '200px' }}
                    >
                        <option value={userProfile?.name}>My Schedule (Me)</option>
                        {facultyList.filter(f => f !== userProfile?.name).map(f => (
                            <option key={f} value={f}>{f}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-lg)' }}>
                {stats.map((stat, index) => (
                    <StatCard key={index} {...stat} />
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-lg)' }}>
                {/* Today's Schedule */}
                <div className="glass-panel" style={{ padding: '0', minHeight: '400px' }}>
                    <div style={{ padding: 'var(--space-lg)', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Calendar size={20} /> Today's Schedule ({today})
                        </h3>
                        <span style={{ fontSize: '0.8rem', background: 'var(--color-accent)', padding: '2px 8px', borderRadius: '12px' }}>
                            {todaySchedule.length} Classes
                        </span>
                    </div>
                    <div style={{ padding: 'var(--space-md)' }}>
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '2rem' }}>Loading...</div>
                        ) : todaySchedule.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                                <p style={{ fontSize: '3rem', margin: 0 }}>☕</p>
                                <p>No classes scheduled for today.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {todaySchedule.sort((a, b) => a.time.localeCompare(b.time)).map((item, index) => (
                                    <div key={index} className="glass-panel" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid var(--color-accent)' }}>
                                        <div style={{ minWidth: '120px', fontWeight: 'bold', color: 'var(--color-accent)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Clock size={16} /> {item.time}</div>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{item.subject}</div>
                                            <div style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>{item.dept} - {item.sem} ({item.group})</div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.1)', padding: '0.5rem', borderRadius: '8px' }}>
                                            <MapPin size={16} /> {item.room}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Quick Actions & Tips */}
                <div className="glass-panel" style={{ padding: 'var(--space-lg)' }}>
                    <h3 style={{ marginTop: 0 }}>Quick Actions</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--space-sm)' }}>
                        <button className="btn glass-panel" style={{ textAlign: 'center', padding: 'var(--space-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-sm)' }}>
                            <span style={{ fontSize: '1.25rem' }}>📤</span>
                            <span>Export Report</span>
                        </button>
                    </div>

                    <div style={{ marginTop: 'var(--space-xl)', padding: 'var(--space-md)', background: 'rgba(59, 130, 246, 0.1)', borderRadius: 'var(--radius-md)', borderLeft: '3px solid var(--color-accent)' }}>
                        <h4 style={{ margin: '0 0 var(--space-xs) 0', fontSize: '0.875rem', color: 'var(--color-accent)' }}>💡 Pro Tip</h4>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                            Use the dropdown above to check where your colleagues are teaching right now.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
