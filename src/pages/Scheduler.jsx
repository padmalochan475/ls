import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, addDoc, query, where, deleteDoc, doc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import '../styles/design-system.css';

const Scheduler = () => {
    const { userProfile } = useAuth();
    const [viewMode, setViewMode] = useState('horizontal');
    const [selectedDept, setSelectedDept] = useState('CSE');
    const [selectedSem, setSelectedSem] = useState('3rd');

    // Data States
    const [schedule, setSchedule] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [faculty, setFaculty] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [loading, setLoading] = useState(true);

    // Modal States
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({
        day: 'Monday',
        time: '09:00 - 10:00',
        subject: '',
        room: '',
        faculty: '',
        group: 'All'
    });
    const [error, setError] = useState('');

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const timeSlots = [
        '09:00 - 10:00', '10:00 - 11:00', '11:00 - 12:00',
        '12:00 - 01:00', '01:00 - 02:00', '02:00 - 03:00',
        '03:00 - 04:00', '04:00 - 05:00'
    ];

    // Fetch Initial Data
    useEffect(() => {
        const fetchMasterData = async () => {
            try {
                const [roomsSnap, facultySnap, subjectsSnap] = await Promise.all([
                    getDocs(collection(db, 'rooms')),
                    getDocs(collection(db, 'faculty')),
                    getDocs(collection(db, 'subjects'))
                ]);

                setRooms(roomsSnap.docs.map(d => d.data().name));
                setFaculty(facultySnap.docs.map(d => d.data().name));
                setSubjects(subjectsSnap.docs.map(d => d.data().name));
            } catch (err) {
                console.error("Error loading master data:", err);
            }
        };

        fetchMasterData();
    }, []);

    // Fetch Schedule
    const fetchSchedule = async () => {
        setLoading(true);
        try {
            // In a real app, you might filter by Dept/Sem here
            const q = query(collection(db, 'schedule'));
            const querySnapshot = await getDocs(q);
            const items = [];
            querySnapshot.forEach((doc) => {
                items.push({ id: doc.id, ...doc.data() });
            });
            setSchedule(items);
        } catch (err) {
            console.error("Error loading schedule:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSchedule();
    }, [selectedDept, selectedSem]);

    const getAssignment = (day, time) => {
        return schedule.find(item => item.day === day && item.time === time);
    };

    const checkConflict = async (newBooking) => {
        // 1. Check Room Conflict
        // Is there already a booking for this Room at this Day & Time?
        const roomConflict = schedule.find(item =>
            item.day === newBooking.day &&
            item.time === newBooking.time &&
            item.room === newBooking.room
        );

        if (roomConflict) {
            return `Conflict! Room "${newBooking.room}" is already booked for "${roomConflict.subject}" at this time.`;
        }

        // 2. Check Faculty Conflict
        // Is this Faculty member already teaching somewhere else at this Day & Time?
        const facultyConflict = schedule.find(item =>
            item.day === newBooking.day &&
            item.time === newBooking.time &&
            item.faculty === newBooking.faculty
        );

        if (facultyConflict) {
            return `Conflict! ${newBooking.faculty} is already teaching "${facultyConflict.subject}" in ${facultyConflict.room} at this time.`;
        }

        return null; // No conflict
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setError('');

        // Run Conflict Detection
        const conflictError = await checkConflict(formData);
        if (conflictError) {
            setError(conflictError);
            return;
        }

        try {
            await addDoc(collection(db, 'schedule'), {
                ...formData,
                dept: selectedDept,
                sem: selectedSem
            });
            setIsModalOpen(false);
            setFormData({ ...formData, subject: '', room: '', faculty: '' }); // Reset fields
            fetchSchedule();
        } catch (err) {
            console.error("Error saving schedule:", err);
            setError("Failed to save schedule.");
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm("Are you sure you want to remove this class?")) {
            try {
                await deleteDoc(doc(db, 'schedule', id));
                fetchSchedule();
            } catch (err) {
                console.error("Error deleting:", err);
            }
        }
    };

    const openModal = (day, time) => {
        setFormData({
            ...formData,
            day,
            time,
            subject: '',
            room: '',
            faculty: ''
        });
        setError('');
        setIsModalOpen(true);
    };

    const isAdmin = userProfile && userProfile.role === 'admin';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', height: '100%' }}>
            {/* Toolbar */}
            <div className="glass-panel" style={{ padding: 'var(--space-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
                <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Weekly Schedule</h2>
                    <div style={{ height: '24px', width: '1px', background: 'var(--glass-border)' }}></div>
                    <select className="glass-input" value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)} style={{ padding: 'var(--space-xs) var(--space-sm)', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.2)', color: 'white', border: '1px solid var(--glass-border)' }}>
                        <option value="CSE">CSE</option>
                        <option value="ECE">ECE</option>
                        <option value="ME">ME</option>
                    </select>
                    <select className="glass-input" value={selectedSem} onChange={(e) => setSelectedSem(e.target.value)} style={{ padding: 'var(--space-xs) var(--space-sm)', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.2)', color: 'white', border: '1px solid var(--glass-border)' }}>
                        <option value="3rd">3rd Sem</option>
                        <option value="5th">5th Sem</option>
                        <option value="7th">7th Sem</option>
                    </select>
                </div>

                <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                    <button className="btn" onClick={() => setViewMode('horizontal')} style={{ background: viewMode === 'horizontal' ? 'var(--color-accent)' : 'transparent', border: '1px solid var(--glass-border)', padding: 'var(--space-xs) var(--space-sm)', fontSize: '0.875rem' }}>Horizontal</button>
                    <button className="btn" onClick={() => setViewMode('vertical')} style={{ background: viewMode === 'vertical' ? 'var(--color-accent)' : 'transparent', border: '1px solid var(--glass-border)', padding: 'var(--space-xs) var(--space-sm)', fontSize: '0.875rem' }}>Vertical</button>
                </div>
            </div>

            {/* Grid */}
            <div className="glass-panel" style={{ padding: 0, overflow: 'auto', flex: 1 }}>
                <div style={{ display: 'grid', gridTemplateColumns: `100px repeat(${timeSlots.length}, minmax(160px, 1fr))`, minWidth: '100%' }}>
                    {/* Header Row */}
                    <div style={{ padding: 'var(--space-md)', background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid var(--glass-border)', borderRight: '1px solid var(--glass-border)', position: 'sticky', left: 0, zIndex: 10, backdropFilter: 'blur(10px)' }}>
                        Day / Time
                    </div>
                    {timeSlots.map(slot => (
                        <div key={slot} style={{ padding: 'var(--space-md)', background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid var(--glass-border)', borderRight: '1px solid var(--glass-border)', textAlign: 'center', fontWeight: 600, fontSize: '0.875rem' }}>
                            {slot}
                        </div>
                    ))}

                    {/* Rows */}
                    {days.map(day => (
                        <React.Fragment key={day}>
                            <div style={{ padding: 'var(--space-md)', borderBottom: '1px solid var(--glass-border)', borderRight: '1px solid var(--glass-border)', fontWeight: 600, background: 'rgba(255,255,255,0.02)', position: 'sticky', left: 0, zIndex: 5, backdropFilter: 'blur(10px)' }}>
                                {day}
                            </div>
                            {timeSlots.map(time => {
                                const assignment = getAssignment(day, time);
                                return (
                                    <div key={`${day}-${time}`} style={{ padding: 'var(--space-xs)', borderBottom: '1px solid var(--glass-border)', borderRight: '1px solid var(--glass-border)', minHeight: '100px', position: 'relative' }}>
                                        {assignment ? (
                                            <div className="animate-fade-in" style={{
                                                background: 'rgba(59, 130, 246, 0.2)',
                                                border: '1px solid rgba(59, 130, 246, 0.4)',
                                                borderRadius: 'var(--radius-sm)',
                                                padding: 'var(--space-xs)',
                                                height: '100%',
                                                fontSize: '0.75rem',
                                                cursor: 'pointer',
                                                transition: 'transform 0.2s',
                                                ':hover': { transform: 'scale(1.02)' }
                                            }}>
                                                <div style={{ fontWeight: 'bold', color: '#93c5fd', marginBottom: '2px' }}>{assignment.subject}</div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-muted)' }}>
                                                    <span>{assignment.room}</span>
                                                    <span>{assignment.group}</span>
                                                </div>
                                                <div style={{ marginTop: '4px', fontStyle: 'italic', color: 'white' }}>{assignment.faculty}</div>
                                                {isAdmin && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDelete(assignment.id); }}
                                                        style={{ position: 'absolute', top: '2px', right: '2px', background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: '0.7rem' }}
                                                    >
                                                        ✕
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            isAdmin && (
                                                <div style={{ height: '100%', width: '100%', opacity: 0, transition: 'opacity 0.2s', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                    onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                                    onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}
                                                    onClick={() => openModal(day, time)}
                                                >
                                                    <span style={{ fontSize: '1.5rem', color: 'var(--color-text-muted)' }}>+</span>
                                                </div>
                                            )
                                        )}
                                    </div>
                                );
                            })}
                        </React.Fragment>
                    ))}
                </div>
            </div>

            {/* Booking Modal */}
            {isModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
                }}>
                    <div className="glass-panel" style={{ width: '400px', padding: '2rem' }}>
                        <h3 style={{ marginBottom: '1.5rem' }}>Add Class</h3>
                        <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>{formData.day} @ {formData.time}</p>

                        {error && (
                            <div style={{ padding: '0.5rem', background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.875rem' }}>
                                ⚠️ {error}
                            </div>
                        )}

                        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <select className="glass-input" value={formData.subject} onChange={e => setFormData({ ...formData, subject: e.target.value })} required>
                                <option value="">Select Subject</option>
                                {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>

                            <select className="glass-input" value={formData.room} onChange={e => setFormData({ ...formData, room: e.target.value })} required>
                                <option value="">Select Room</option>
                                {rooms.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>

                            <select className="glass-input" value={formData.faculty} onChange={e => setFormData({ ...formData, faculty: e.target.value })} required>
                                <option value="">Select Faculty</option>
                                {faculty.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>

                            <input
                                className="glass-input"
                                placeholder="Group (e.g. G1, All)"
                                value={formData.group}
                                onChange={e => setFormData({ ...formData, group: e.target.value })}
                            />

                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button type="button" onClick={() => setIsModalOpen(false)} className="btn" style={{ flex: 1, background: 'rgba(255,255,255,0.1)' }}>Cancel</button>
                                <button type="submit" className="btn" style={{ flex: 1, background: 'var(--color-accent)' }}>Save</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Scheduler;
