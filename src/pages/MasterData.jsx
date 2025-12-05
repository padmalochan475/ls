import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../lib/firebase';
import { collection, getDocs, getDoc, addDoc, deleteDoc, doc, updateDoc, query, where, writeBatch, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import ConfirmModal from '../components/ConfirmModal';
import '../styles/design-system.css';
import { Settings, Users, BookOpen, Clock, MapPin, Layers, Box, Download, Plus, Search, Edit2, Trash2, Grid, List, User, Briefcase, Hash, Calendar, Eye, Check, ChevronDown } from 'lucide-react';

const MasterData = ({ initialTab }) => {
    const { userProfile } = useAuth();
    const [activeTab, setActiveTab] = useState(initialTab || 'faculty');

    useEffect(() => {
        if (initialTab) setActiveTab(initialTab);
    }, [initialTab]);
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({});
    const [editingId, setEditingId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [newYearInput, setNewYearInput] = useState('');

    const handleAddYear = async () => {
        if (!newYearInput.trim()) return;
        try {
            const configRef = doc(db, 'settings', 'config');
            const currentData = data[0];
            const currentYears = currentData.academicYears || [];

            if (currentYears.includes(newYearInput.trim())) {
                alert('Academic Year already exists!');
                return;
            }

            const updatedYears = [...currentYears, newYearInput.trim()].sort().reverse();

            await updateDoc(configRef, {
                academicYears: updatedYears,
                [`yearConfigs.${newYearInput.trim()}`]: { maxFacultyLoad: 18 } // Default config
            });

            setNewYearInput('');
            setNewYearInput('');
            // fetchData(); // Removed: Handled by listener
        } catch (e) {
            console.error("Error adding year:", e);
            alert("Failed to add academic year.");
        }
    };

    // Dependencies
    const [deptOptions, setDeptOptions] = useState([]);
    const [usersList, setUsersList] = useState([]);

    const isAdmin = userProfile && userProfile.role === 'admin';

    // Define Tabs and their corresponding Firestore collections
    const tabs = [
        { id: 'faculty', label: 'Faculty', icon: <Users size={18} />, collection: 'faculty' },
        { id: 'departments', label: 'Departments', icon: <Layers size={18} />, collection: 'departments' },
        { id: 'subjects', label: 'Subjects', icon: <BookOpen size={18} />, collection: 'subjects' },
        { id: 'rooms', label: 'Rooms', icon: <MapPin size={18} />, collection: 'rooms' },
        { id: 'groups', label: 'Groups', icon: <Box size={18} />, collection: 'groups' },
        { id: 'days', label: 'Days', icon: <Calendar size={18} />, collection: 'days' },
        { id: 'timeslots', label: 'Time Slots', icon: <Clock size={18} />, collection: 'timeslots' },
        { id: 'semesters', label: 'Semesters', icon: <Hash size={18} />, collection: 'semesters' },
        { id: 'settings', label: 'Settings', icon: <Settings size={18} />, collection: 'settings' },
    ];

    const activeCollection = tabs.find(t => t.id === activeTab)?.collection;

    // Real-Time Data Listener
    useEffect(() => {
        if (!activeCollection) return;
        setLoading(true);
        setSearchTerm(''); // Reset search on tab change

        let unsubscribe = () => { };

        try {
            if (activeTab === 'settings') {
                const docRef = doc(db, 'settings', 'config');
                unsubscribe = onSnapshot(docRef, (docSnap) => {
                    if (docSnap.exists()) {
                        setData([{ id: 'config', ...docSnap.data() }]);
                    }
                    setLoading(false);
                });
            } else {
                unsubscribe = onSnapshot(collection(db, activeCollection), (snapshot) => {
                    const items = [];
                    snapshot.forEach((doc) => {
                        items.push({ id: doc.id, ...doc.data() });
                    });

                    // Sort items logic (Client-side sort for now, cheap for Master Data)
                    if (activeCollection === 'days') {
                        items.sort((a, b) => a.order - b.order);
                    } else if (activeCollection === 'timeslots') {
                        items.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
                    } else {
                        items.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }));
                    }

                    setData(items);
                    setLoading(false);
                }, (error) => {
                    console.error("Error fetching data:", error);
                    setLoading(false);
                });
            }
        } catch (err) {
            console.error("Listener setup error:", err);
            setLoading(false);
        }

        return () => unsubscribe();
    }, [activeTab, activeCollection]);

    const fetchDependencies = async () => {
        try {
            const [deptSnap, usersSnap] = await Promise.all([
                getDocs(collection(db, 'departments')),
                getDocs(collection(db, 'users'))
            ]);
            setDeptOptions(deptSnap.docs.map(d => d.data().name));
            setUsersList(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
            console.error("Error fetching dependencies:", e);
        }
    };

    useEffect(() => {
        if (isModalOpen) fetchDependencies();
    }, [isModalOpen]);

    const handleUpdateConfig = async (year, newLoad) => {
        if (!newLoad || isNaN(newLoad)) {
            alert("Please enter a valid number for faculty load.");
            return;
        }
        try {
            const configRef = doc(db, 'settings', 'config');
            const currentData = data[0];
            const currentConfigs = currentData.yearConfigs || {};

            await updateDoc(configRef, {
                [`yearConfigs.${year}`]: {
                    ...(currentConfigs[year] || {}),
                    maxFacultyLoad: parseInt(newLoad)
                }
            });

            // fetchData(); // Removed: Handled by listener
        } catch (e) {
            console.error("Error updating config:", e);
            alert("Failed to update settings.");
        }
    };




    // Delete Confirmation State
    const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, id: null, type: 'item' });

    const confirmDelete = (id, e) => {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        setDeleteConfirm({ isOpen: true, id, type: 'item' });
    };

    const handleDeleteYear = (yearToDelete) => {
        setDeleteConfirm({ isOpen: true, id: yearToDelete, type: 'year' });
    };

    const executeDelete = async () => {
        const { id, type } = deleteConfirm;
        if (!id) return;
        setDeleteConfirm({ isOpen: false, id: null, type: 'item' });

        try {
            if (type === 'year') {
                const configRef = doc(db, 'settings', 'config');
                const currentData = data[0]; // Assuming data is loaded
                const currentYears = currentData.academicYears || [];
                const currentConfigs = currentData.yearConfigs || {};

                if (id === currentData.activeAcademicYear) {
                    alert("Cannot delete the currently active academic year. Please switch to another year first.");
                    return;
                }

                const updatedYears = currentYears.filter(y => y !== id);
                const updatedConfigs = { ...currentConfigs };
                delete updatedConfigs[id];

                await updateDoc(configRef, {
                    academicYears: updatedYears,
                    yearConfigs: updatedConfigs
                });
                // fetchData();

            } else {
                // Item Deletion
                if (!activeCollection) return;

                // Dependency Check for Faculty within Item Delete
                if (activeTab === 'faculty') {
                    const facultyItem = data.find(d => d.id === id);
                    if (facultyItem) {
                        const q1 = query(collection(db, 'schedule'), where('faculty', '==', facultyItem.name));
                        const q2 = query(collection(db, 'schedule'), where('faculty2', '==', facultyItem.name));
                        const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);

                        if (!snap1.empty || !snap2.empty) {
                            alert(`Cannot delete ${facultyItem.name}. They have active assignments. Please remove their assignments first.`);
                            return;
                        }
                    }
                }
                await deleteDoc(doc(db, activeCollection, id));
                // fetchData();
            }
        } catch (error) {
            console.error("Error deleting:", error);
            alert(`Error deleting: ${error.message}`);
        }
    };

    const openModal = (item = null) => {
        setFormData(item || {});
        setEditingId(item ? item.id : null);
        setIsModalOpen(true);
    };

    const handleUserSelect = (userId) => {
        const selectedUser = usersList.find(u => u.id === userId);
        if (selectedUser) {
            setFormData({
                ...formData,
                name: selectedUser.name || '',
                empId: selectedUser.empId || '',
                email: selectedUser.email || '',
                // Keep existing fields if any
                department: formData.department || '',
                designation: formData.designation || '',
                photoURL: selectedUser.photoURL || ''
            });
        }
    };

    // Helper to format time for comparison/update
    const formatTimeForSchedule = (time) => {
        if (!time) return '';
        return new Date(`2000-01-01T${time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    };

    const handleCascadeUpdate = async (collectionName, oldData, newData) => {
        const batch = writeBatch(db);
        let updateCount = 0;

        try {
            if (collectionName === 'timeslots') {
                const oldTimeStr = `${formatTimeForSchedule(oldData.startTime)} - ${formatTimeForSchedule(oldData.endTime)}`;
                const newTimeStr = `${formatTimeForSchedule(newData.startTime)} - ${formatTimeForSchedule(newData.endTime)}`;

                if (oldTimeStr !== newTimeStr) {
                    const q = query(collection(db, 'schedule'), where('time', '==', oldTimeStr));
                    const snap = await getDocs(q);
                    snap.forEach(doc => {
                        batch.update(doc.ref, { time: newTimeStr });
                        updateCount++;
                    });
                }
            } else if (collectionName === 'faculty') {
                if (oldData.name !== newData.name) {
                    // Update faculty 1
                    const q1 = query(collection(db, 'schedule'), where('faculty', '==', oldData.name));
                    const snap1 = await getDocs(q1);
                    snap1.forEach(doc => {
                        batch.update(doc.ref, { faculty: newData.name });
                        updateCount++;
                    });

                    // Update faculty 2
                    const q2 = query(collection(db, 'schedule'), where('faculty2', '==', oldData.name));
                    const snap2 = await getDocs(q2);
                    snap2.forEach(doc => {
                        batch.update(doc.ref, { faculty2: newData.name });
                        updateCount++;
                    });
                }
            } else if (collectionName === 'subjects') {
                if (oldData.name !== newData.name) {
                    const q = query(collection(db, 'schedule'), where('subject', '==', oldData.name));
                    const snap = await getDocs(q);
                    snap.forEach(doc => {
                        batch.update(doc.ref, { subject: newData.name });
                        updateCount++;
                    });
                }
            } else if (collectionName === 'rooms') {
                if (oldData.name !== newData.name) {
                    const q = query(collection(db, 'schedule'), where('room', '==', oldData.name));
                    const snap = await getDocs(q);
                    snap.forEach(doc => {
                        batch.update(doc.ref, { room: newData.name });
                        updateCount++;
                    });
                }
            }

            if (updateCount > 0) {
                await batch.commit();
                console.log(`Updated ${updateCount} related schedule entries.`);
            }
        } catch (err) {
            console.error("Error in cascade update:", err);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!activeCollection) {
            alert("Error: No active collection selected.");
            return;
        }
        try {
            if (editingId) {
                // Perform cascade update if needed
                const originalItem = data.find(i => i.id === editingId);
                if (originalItem) {
                    await handleCascadeUpdate(activeCollection, originalItem, formData);
                }

                await updateDoc(doc(db, activeCollection, editingId), formData);
            } else {
                await addDoc(collection(db, activeCollection), formData);
            }
            setIsModalOpen(false);
            setFormData({});
            setEditingId(null);
            // fetchData(); // Removed: Handled by listener
        } catch (error) {
            console.error("Error saving document: ", error);
            alert(`Failed to save: ${error.message}`);
        }
    };

    const filteredData = data.filter(item =>
        Object.values(item).some(val =>
            String(val).toLowerCase().includes(searchTerm.toLowerCase())
        )
    );

    // --- Render Helpers ---

    const renderCardContent = (item) => {
        switch (activeTab) {
            case 'faculty':
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            width: '48px', height: '48px', borderRadius: '50%',
                            background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '1.2rem', fontWeight: 'bold', color: 'white'
                        }}>
                            {item.photoURL ? (
                                <img
                                    src={item.photoURL}
                                    alt={item.name}
                                    style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                                />
                            ) : (
                                item.name.charAt(0)
                            )}
                        </div>
                        <div>
                            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{item.name}</div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{item.designation} • {item.department}</div>
                            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
                                ID: {item.empId} {item.shortCode && `• Code: ${item.shortCode}`}
                            </div>
                        </div>
                    </div>
                );
            case 'departments':
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            padding: '10px', borderRadius: '12px',
                            background: 'rgba(16, 185, 129, 0.1)', color: '#34d399'
                        }}>
                            <Layers size={24} />
                        </div>
                        <div>
                            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{item.name}</div>
                            <div style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', fontFamily: 'monospace', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', display: 'inline-block', marginTop: '4px' }}>
                                {item.code}
                            </div>
                        </div>
                    </div>
                );
            case 'subjects':
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{item.name}</div>
                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '10px', background: item.type === 'lab' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.2)', color: item.type === 'lab' ? '#fbbf24' : '#60a5fa' }}>
                                {item.type === 'lab' ? 'LAB' : 'THEORY'}
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                            <span style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>{item.code}</span>
                            {item.shortCode && <span style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>{item.shortCode}</span>}
                            <span>•</span>
                            <span>{item.department}</span>
                            <span>•</span>
                            <span>{item.semester}</span>
                        </div>
                    </div>
                );
            case 'rooms':
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            padding: '10px', borderRadius: '12px',
                            background: 'rgba(236, 72, 153, 0.1)', color: '#f472b6'
                        }}>
                            <MapPin size={24} />
                        </div>
                        <div>
                            <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{item.name}</div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                                {item.type ? (item.type.charAt(0).toUpperCase() + item.type.slice(1)) : 'Unknown Type'} • Capacity: {item.capacity}
                            </div>
                        </div>
                    </div>
                );
            case 'groups':
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            padding: '10px', borderRadius: '12px',
                            background: 'rgba(249, 115, 22, 0.1)', color: '#fb923c'
                        }}>
                            <Box size={24} />
                        </div>
                        <div>
                            <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{item.name}</div>
                            {item.subGroups && item.subGroups.length > 0 && (
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                                    {item.subGroups.map((sg, idx) => (
                                        <span key={idx} style={{
                                            fontSize: '0.75rem',
                                            background: 'rgba(255,255,255,0.1)',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            color: 'var(--color-text-muted)'
                                        }}>
                                            {sg}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                );
            case 'days':
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            padding: '10px', borderRadius: '12px',
                            background: 'rgba(16, 185, 129, 0.1)', color: '#34d399'
                        }}>
                            <Calendar size={24} />
                        </div>
                        <div>
                            <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{item.name}</div>
                            <div style={{ fontSize: '0.85rem', color: item.isVisible ? '#34d399' : '#f87171' }}>
                                {item.isVisible ? 'Visible' : 'Hidden'} • Order: {item.order}
                            </div>
                        </div>
                    </div>
                );
            case 'timeslots':
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            padding: '10px', borderRadius: '12px',
                            background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa'
                        }}>
                            <Clock size={24} />
                        </div>
                        <div>
                            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{item.label}</div>
                            <div style={{ fontSize: '0.9rem', color: 'white', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px', marginTop: '4px', display: 'inline-block' }}>
                                {new Date(`2000-01-01T${item.startTime}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} - {new Date(`2000-01-01T${item.endTime}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                            </div>
                        </div>
                    </div>
                );
            case 'semesters':
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            padding: '10px', borderRadius: '12px',
                            background: 'rgba(139, 92, 246, 0.1)', color: '#a78bfa'
                        }}>
                            <Hash size={24} />
                        </div>
                        <div>
                            <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{item.name}</div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                                Semester Number: {item.number}
                            </div>
                        </div>
                    </div>
                );
            default:
                return <div>{JSON.stringify(item)}</div>;
        }
    };

    const renderFormFields = () => {
        switch (activeTab) {
            case 'faculty':
                return (
                    <>
                        <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)', marginBottom: '0.5rem' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: '#93c5fd', marginBottom: '0.5rem' }}>Auto-fill from Registered User</label>
                            <select
                                className="glass-input"
                                onChange={(e) => handleUserSelect(e.target.value)}
                                style={{ background: 'rgba(0, 0, 0, 0.3)', color: 'white' }}
                            >
                                <option value="" style={{ background: '#1e293b', color: 'white' }}>Select a User...</option>
                                {usersList.map(u => (
                                    <option key={u.id} value={u.id} style={{ background: '#1e293b', color: 'white' }}>
                                        {u.name} ({u.empId})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <input className="glass-input" placeholder="Full Name" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                        {/* Hidden field to store profile picture URL */}
                        {formData.photoURL && <input type="hidden" value={formData.photoURL} />}
                        <input className="glass-input" placeholder="Employee ID (Optional / Temp)" value={formData.empId || ''} onChange={e => setFormData({ ...formData, empId: e.target.value })} />
                        <input className="glass-input" placeholder="Short Code (e.g. PLM)" value={formData.shortCode || ''} onChange={e => setFormData({ ...formData, shortCode: e.target.value })} />
                        <input className="glass-input" placeholder="Email" type="email" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                        <select className="glass-input" value={formData.department || ''} onChange={e => setFormData({ ...formData, department: e.target.value })}>
                            <option value="" style={{ background: '#1e293b', color: 'white' }}>Select Department</option>
                            {deptOptions.map(d => <option key={d} value={d} style={{ background: '#1e293b', color: 'white' }}>{d}</option>)}
                        </select>
                        <input className="glass-input" placeholder="Designation" value={formData.designation || ''} onChange={e => setFormData({ ...formData, designation: e.target.value })} />
                    </>
                );
            case 'departments':
                return (
                    <>
                        <input className="glass-input" placeholder="Department Name" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                        <input className="glass-input" placeholder="Code (e.g. CSE)" value={formData.code || ''} onChange={e => setFormData({ ...formData, code: e.target.value })} required />
                    </>
                );
            case 'subjects':
                return (
                    <>
                        <input className="glass-input" placeholder="Subject Code" value={formData.code || ''} onChange={e => setFormData({ ...formData, code: e.target.value })} />
                        <input className="glass-input" placeholder="Short Code (e.g. DS)" value={formData.shortCode || ''} onChange={e => setFormData({ ...formData, shortCode: e.target.value })} />
                        <input className="glass-input" placeholder="Subject Name" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                        <select className="glass-input" value={formData.type || 'theory'} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                            <option value="theory" style={{ background: '#1e293b', color: 'white' }}>Theory</option>
                            <option value="lab" style={{ background: '#1e293b', color: 'white' }}>Lab</option>
                        </select>
                    </>
                );
            case 'rooms':
                return (
                    <>
                        <input className="glass-input" placeholder="Room Name" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                        <input className="glass-input" placeholder="Capacity" type="number" value={formData.capacity || ''} onChange={e => setFormData({ ...formData, capacity: e.target.value })} />
                        <select className="glass-input" value={formData.type || 'lab'} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                            <option value="lab" style={{ background: '#1e293b', color: 'white' }}>Lab</option>
                            <option value="lecture" style={{ background: '#1e293b', color: 'white' }}>Lecture Hall</option>
                            <option value="seminar" style={{ background: '#1e293b', color: 'white' }}>Seminar Hall</option>
                        </select>
                    </>
                );
            case 'groups':
                return (
                    <>
                        <input className="glass-input" placeholder="Group Name (e.g. Group A)" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>Sub-Groups</label>

                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <input
                                    id="subgroup-input"
                                    className="glass-input"
                                    placeholder="Add Sub-Group (e.g. 1)"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            const val = e.target.value.trim();
                                            if (val) {
                                                const current = formData.subGroups || [];
                                                if (!current.includes(val)) {
                                                    setFormData({ ...formData, subGroups: [...current, val] });
                                                }
                                                e.target.value = '';
                                            }
                                        }
                                    }}
                                />
                                <button
                                    type="button"
                                    className="btn"
                                    onClick={() => {
                                        const input = document.getElementById('subgroup-input');
                                        const val = input.value.trim();
                                        if (val) {
                                            const current = formData.subGroups || [];
                                            if (!current.includes(val)) {
                                                setFormData({ ...formData, subGroups: [...current, val] });
                                            }
                                            input.value = '';
                                        }
                                    }}
                                    style={{ padding: '0.5rem', background: 'var(--color-accent)' }}
                                >
                                    <Plus size={18} />
                                </button>
                            </div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                {formData.subGroups && formData.subGroups.map((sg, idx) => (
                                    <span key={idx} style={{
                                        background: 'rgba(59, 130, 246, 0.2)',
                                        color: '#93c5fd',
                                        padding: '2px 8px',
                                        borderRadius: '12px',
                                        fontSize: '0.85rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}>
                                        {formData.name ? `${formData.name}-${sg}` : sg}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const newGroups = formData.subGroups.filter((_, i) => i !== idx);
                                                setFormData({ ...formData, subGroups: newGroups });
                                            }}
                                            style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', padding: 0, display: 'flex' }}
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        </div>
                    </>
                );
            case 'days':
                return (
                    <>
                        <input className="glass-input" placeholder="Day Name (e.g. Monday)" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                        <input className="glass-input" type="number" placeholder="Order (1 for Monday, 7 for Sunday)" value={formData.order || ''} onChange={e => setFormData({ ...formData, order: parseInt(e.target.value) })} required />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white' }}>
                            <input
                                type="checkbox"
                                checked={formData.isVisible !== false}
                                onChange={e => setFormData({ ...formData, isVisible: e.target.checked })}
                                style={{ width: '18px', height: '18px' }}
                            />
                            <label>Visible in Schedule</label>
                        </div>
                    </>
                );
            case 'timeslots':
                return (
                    <>
                        <input className="glass-input" placeholder="Label" value={formData.label || ''} onChange={e => setFormData({ ...formData, label: e.target.value })} required />
                        <div style={{ display: 'flex', gap: '2rem' }}>
                            {/* Start Time Picker */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Start Time</label>
                                <div style={{ display: 'flex', gap: '5px' }}>
                                    <select
                                        className="glass-input"
                                        style={{ padding: '0.5rem', minWidth: '60px' }}
                                        value={(() => {
                                            const h = parseInt((formData.startTime || '09:00').split(':')[0]);
                                            return h % 12 || 12;
                                        })()}
                                        onChange={e => {
                                            const currentH = parseInt((formData.startTime || '09:00').split(':')[0]);
                                            const currentM = (formData.startTime || '09:00').split(':')[1];
                                            const isPM = currentH >= 12;
                                            let newH = parseInt(e.target.value);
                                            if (isPM && newH < 12) newH += 12;
                                            if (!isPM && newH === 12) newH = 0;
                                            setFormData({ ...formData, startTime: `${newH.toString().padStart(2, '0')}:${currentM}` });
                                        }}
                                    >
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(x => <option key={x} value={x} style={{ background: '#1e293b' }}>{x}</option>)}
                                    </select>
                                    <select
                                        className="glass-input"
                                        style={{ padding: '0.5rem', minWidth: '60px' }}
                                        value={(formData.startTime || '09:00').split(':')[1]}
                                        onChange={e => {
                                            const currentH = (formData.startTime || '09:00').split(':')[0];
                                            setFormData({ ...formData, startTime: `${currentH}:${e.target.value}` });
                                        }}
                                    >
                                        {['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].map(x => <option key={x} value={x} style={{ background: '#1e293b' }}>{x}</option>)}
                                    </select>
                                    <select
                                        className="glass-input"
                                        style={{ padding: '0.5rem', minWidth: '70px' }}
                                        value={parseInt((formData.startTime || '09:00').split(':')[0]) >= 12 ? 'PM' : 'AM'}
                                        onChange={e => {
                                            let h = parseInt((formData.startTime || '09:00').split(':')[0]);
                                            const m = (formData.startTime || '09:00').split(':')[1];
                                            if (e.target.value === 'PM' && h < 12) h += 12;
                                            if (e.target.value === 'AM' && h >= 12) h -= 12;
                                            setFormData({ ...formData, startTime: `${h.toString().padStart(2, '0')}:${m}` });
                                        }}
                                    >
                                        <option value="AM" style={{ background: '#1e293b' }}>AM</option>
                                        <option value="PM" style={{ background: '#1e293b' }}>PM</option>
                                    </select>
                                </div>
                            </div>

                            {/* End Time Picker */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>End Time</label>
                                <div style={{ display: 'flex', gap: '5px' }}>
                                    <select
                                        className="glass-input"
                                        style={{ padding: '0.5rem', minWidth: '60px' }}
                                        value={(() => {
                                            const h = parseInt((formData.endTime || '10:00').split(':')[0]);
                                            return h % 12 || 12;
                                        })()}
                                        onChange={e => {
                                            const currentH = parseInt((formData.endTime || '10:00').split(':')[0]);
                                            const currentM = (formData.endTime || '10:00').split(':')[1];
                                            const isPM = currentH >= 12;
                                            let newH = parseInt(e.target.value);
                                            if (isPM && newH < 12) newH += 12;
                                            if (!isPM && newH === 12) newH = 0;
                                            setFormData({ ...formData, endTime: `${newH.toString().padStart(2, '0')}:${currentM}` });
                                        }}
                                    >
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(x => <option key={x} value={x} style={{ background: '#1e293b' }}>{x}</option>)}
                                    </select>
                                    <select
                                        className="glass-input"
                                        style={{ padding: '0.5rem', minWidth: '60px' }}
                                        value={(formData.endTime || '10:00').split(':')[1]}
                                        onChange={e => {
                                            const currentH = (formData.endTime || '10:00').split(':')[0];
                                            setFormData({ ...formData, endTime: `${currentH}:${e.target.value}` });
                                        }}
                                    >
                                        {['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].map(x => <option key={x} value={x} style={{ background: '#1e293b' }}>{x}</option>)}
                                    </select>
                                    <select
                                        className="glass-input"
                                        style={{ padding: '0.5rem', minWidth: '70px' }}
                                        value={parseInt((formData.endTime || '10:00').split(':')[0]) >= 12 ? 'PM' : 'AM'}
                                        onChange={e => {
                                            let h = parseInt((formData.endTime || '10:00').split(':')[0]);
                                            const m = (formData.endTime || '10:00').split(':')[1];
                                            if (e.target.value === 'PM' && h < 12) h += 12;
                                            if (e.target.value === 'AM' && h >= 12) h -= 12;
                                            setFormData({ ...formData, endTime: `${h.toString().padStart(2, '0')}:${m}` });
                                        }}
                                    >
                                        <option value="AM" style={{ background: '#1e293b' }}>AM</option>
                                        <option value="PM" style={{ background: '#1e293b' }}>PM</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </>
                );
            case 'semesters':
                return (
                    <>
                        <input className="glass-input" placeholder="Semester Name (e.g. 3rd Sem)" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                        <input className="glass-input" type="number" placeholder="Semester Number (e.g. 3)" value={formData.number || ''} onChange={e => setFormData({ ...formData, number: parseInt(e.target.value) })} required />
                    </>
                );
            default: return null;
        }
    };

    return (
        <div className="animate-fade-in" style={{ paddingBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h2 style={{
                        fontSize: '2.5rem', fontWeight: '800', margin: 0,
                        background: 'linear-gradient(to right, #fff, #94a3b8)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        letterSpacing: '-1px'
                    }}>
                        Master Data
                    </h2>
                    <p style={{ color: 'var(--color-text-muted)', margin: '0.5rem 0 0 0', fontSize: '1.1rem' }}>
                        Configure your academic resources
                    </p>
                </div>

                {isAdmin && activeTab !== 'settings' && (
                    <button
                        onClick={() => openModal()}
                        style={{
                            padding: '0.75rem 1.5rem',
                            background: 'linear-gradient(135deg, var(--color-accent) 0%, #2563eb 100%)',
                            border: 'none', borderRadius: '12px', color: 'white',
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            cursor: 'pointer', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                            fontWeight: 600, transition: 'all 0.2s'
                        }}
                    >
                        <Plus size={20} />
                        Add New
                    </button>
                )}
            </div>

            {/* Navigation & Search */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Tabs */}
                <div style={{
                    display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '0.5rem',
                    borderBottom: '1px solid rgba(255,255,255,0.1)'
                }}>
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                padding: '0.75rem 1rem',
                                background: 'transparent',
                                border: 'none',
                                borderBottom: activeTab === tab.id ? '2px solid var(--color-accent)' : '2px solid transparent',
                                color: activeTab === tab.id ? 'white' : 'var(--color-text-muted)',
                                cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                fontSize: '1rem', fontWeight: activeTab === tab.id ? 600 : 400,
                                whiteSpace: 'nowrap', transition: 'all 0.2s'
                            }}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>

                {activeTab === 'settings' ? (
                    <div className="settings-panel animate-fade-in" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                        {/* Left Column: View Data For */}
                        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', height: 'fit-content' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                <div style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}>
                                    <Eye size={20} color="#fff" />
                                </div>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>View Data For</h3>
                            </div>

                            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.95rem', lineHeight: '1.5' }}>
                                Select the year you want to manage (Assignments, Schedule, etc).
                            </p>

                            <div style={{ position: 'relative' }}>
                                <select
                                    className="glass-input"
                                    style={{
                                        width: '100%', padding: '1rem', paddingRight: '2.5rem',
                                        appearance: 'none', cursor: 'pointer',
                                        fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-accent)'
                                    }}
                                    value={data[0]?.activeAcademicYear || ''}
                                    onChange={async (e) => {
                                        try {
                                            await updateDoc(doc(db, 'settings', 'config'), { activeAcademicYear: e.target.value });
                                            fetchData();
                                        } catch (err) {
                                            console.error(err);
                                            alert('Failed to update active year');
                                        }
                                    }}
                                >
                                    {data[0]?.academicYears?.map(year => (
                                        <option key={year} value={year} style={{ color: 'black' }}>{year}</option>
                                    ))}
                                </select>
                                <ChevronDown size={20} style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: 0.7 }} />
                            </div>

                            <div style={{
                                background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '1.25rem',
                                border: '1px solid rgba(255,255,255,0.05)', marginTop: '1rem'
                            }}>
                                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>Current System Default:</div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#4ade80', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    {data[0]?.activeAcademicYear} <span style={{ fontSize: '0.8rem', background: 'rgba(74, 222, 128, 0.1)', padding: '2px 8px', borderRadius: '12px' }}>(Active)</span>
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Create & Manage */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            {/* Create New Year */}
                            <div className="glass-panel" style={{ padding: '2rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                    <div style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}>
                                        <Plus size={20} color="#fff" />
                                    </div>
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Create New Year</h3>
                                </div>

                                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
                                    Add a new academic year to the system.
                                </p>

                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <input
                                        type="text"
                                        placeholder="e.g. 2025-2026"
                                        className="glass-input"
                                        value={newYearInput}
                                        onChange={(e) => setNewYearInput(e.target.value)}
                                        style={{ flex: 1, minWidth: '250px' }}
                                    />
                                    <button
                                        className="btn"
                                        onClick={handleAddYear}
                                        style={{
                                            background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                                            padding: '0 2rem', fontSize: '1rem', fontWeight: 600,
                                            boxShadow: '0 4px 15px rgba(139, 92, 246, 0.3)'
                                        }}
                                    >
                                        Add
                                    </button>
                                </div>
                            </div>

                            {/* Manage Years */}
                            <div className="glass-panel" style={{ padding: '2rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                    <div style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}>
                                        <Settings size={20} color="#fff" />
                                    </div>
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Manage Years</h3>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '300px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                                    {data[0]?.academicYears?.map(year => {
                                        const config = data[0].yearConfigs?.[year] || {};
                                        const load = config.maxFacultyLoad || 18;
                                        const isDefault = year === data[0].activeAcademicYear;

                                        return (
                                            <div key={year} style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px',
                                                border: isDefault ? '1px solid rgba(74, 222, 128, 0.3)' : '1px solid rgba(255,255,255,0.05)'
                                            }}>
                                                <div>
                                                    <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'white' }}>
                                                        {year} {isDefault && <span style={{ fontSize: '0.75rem', color: '#4ade80', marginLeft: '0.5rem' }}>(Default)</span>}
                                                    </div>
                                                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                                                        Max Load: {load} hrs/week
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <input
                                                        type="number"
                                                        defaultValue={load}
                                                        className="glass-input"
                                                        style={{ width: '70px', padding: '0.5rem', fontSize: '0.9rem' }}
                                                        id={`load-${year}`}
                                                    />
                                                    <button
                                                        className="btn"
                                                        style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.1)' }}
                                                        onClick={() => {
                                                            const val = document.getElementById(`load-${year}`).value;
                                                            handleUpdateConfig(year, val);
                                                        }}
                                                        title="Save Config"
                                                    >
                                                        <Check size={16} />
                                                    </button>
                                                    {!isDefault && (
                                                        <button
                                                            className="btn"
                                                            style={{ padding: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', color: '#f87171' }}
                                                            onClick={() => handleDeleteYear(year)}
                                                            title="Delete Year"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Search */}
                        <div className="glass-panel" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <Search size={20} color="var(--color-text-muted)" />
                            <input
                                type="text"
                                placeholder={`Search ${tabs.find(t => t.id === activeTab)?.label}...`}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{
                                    background: 'transparent', border: 'none', color: 'white',
                                    fontSize: '1rem', width: '100%', outline: 'none'
                                }}
                            />
                        </div>

                        {/* Grid Content */}
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-text-muted)' }}>Loading...</div>
                        ) : filteredData.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-text-muted)', background: 'rgba(255,255,255,0.02)', borderRadius: '16px' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>📂</div>
                                <div>No items found.</div>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                                {filteredData.map(item => (
                                    <div key={item.id} className="glass-panel" style={{
                                        padding: '1.5rem',
                                        display: 'flex', flexDirection: 'column', gap: '1rem',
                                        position: 'relative', overflow: 'hidden',
                                        border: '1px solid rgba(255,255,255,0.05)',
                                        transition: 'transform 0.2s, box-shadow 0.2s',
                                        cursor: 'default'
                                    }}
                                        onMouseEnter={e => {
                                            e.currentTarget.style.transform = 'translateY(-4px)';
                                            e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.3)';
                                            e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                                        }}
                                        onMouseLeave={e => {
                                            e.currentTarget.style.transform = 'translateY(0)';
                                            e.currentTarget.style.boxShadow = 'none';
                                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                        }}
                                    >
                                        {/* Card Content */}
                                        <div style={{ flex: 1 }}>
                                            {renderCardContent(item)}
                                        </div>

                                        {/* Actions */}
                                        {isAdmin && (
                                            <div style={{
                                                display: 'flex', justifyContent: 'flex-end', gap: '0.5rem',
                                                paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)'
                                            }}>
                                                <button
                                                    onClick={() => openModal(item)}
                                                    style={{
                                                        background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa',
                                                        border: 'none', borderRadius: '6px', padding: '6px 12px',
                                                        cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500,
                                                        display: 'flex', alignItems: 'center', gap: '4px'
                                                    }}
                                                >
                                                    <Edit2 size={14} /> Edit
                                                </button>
                                                <button
                                                    onClick={(e) => confirmDelete(item.id, e)}
                                                    style={{
                                                        background: 'rgba(239, 68, 68, 0.1)', color: '#f87171',
                                                        border: 'none', borderRadius: '6px', padding: '6px 12px',
                                                        cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500,
                                                        display: 'flex', alignItems: 'center', gap: '4px'
                                                    }}
                                                >
                                                    <Trash2 size={14} /> Delete
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
                }}>
                    <div className="glass-panel" style={{ width: '450px', padding: '2.5rem', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
                        <h3 style={{ marginBottom: '2rem', fontSize: '1.5rem', fontWeight: 700 }}>{editingId ? 'Edit' : 'Add'} {tabs.find(t => t.id === activeTab)?.label.slice(0, -1)}</h3>
                        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {renderFormFields()}
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                                <button type="button" onClick={() => setIsModalOpen(false)} className="btn" style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>Cancel</button>
                                <button type="submit" className="btn" style={{ flex: 1, background: 'var(--color-accent)', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)' }}>Save</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* Delete Confirmation Modal */}
            {deleteConfirm.isOpen && createPortal(
                <ConfirmModal
                    isOpen={deleteConfirm.isOpen}
                    onClose={() => setDeleteConfirm({ isOpen: false, id: null, type: 'item' })}
                    onConfirm={executeDelete}
                    title={deleteConfirm.type === 'year' ? "Delete Academic Year" : "Delete Item"}
                    message={deleteConfirm.type === 'year'
                        ? `Are you sure you want to delete the academic year ${deleteConfirm.id}? This cannot be undone.`
                        : "Are you sure you want to delete this item? This action cannot be undone."
                    }
                    isDangerous={true}
                />,
                document.body
            )}
        </div>
    );
};

export default MasterData;
