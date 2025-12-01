import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, updateDoc, deleteDoc, getDoc, setDoc, arrayUnion } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import '../styles/design-system.css';

const AdminPanel = () => {
    const { userProfile, activeAcademicYear } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // 'all', 'pending', 'approved'

    // Academic Year State
    const [academicYears, setAcademicYears] = useState([]);
    const [newYear, setNewYear] = useState('');

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const querySnapshot = await getDocs(collection(db, 'users'));
            const usersList = [];
            querySnapshot.forEach((doc) => {
                usersList.push({ id: doc.id, ...doc.data() });
            });
            setUsers(usersList);
        } catch (error) {
            console.error("Error fetching users: ", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchSettings = async () => {
        try {
            const docSnap = await getDoc(doc(db, 'settings', 'config'));
            if (docSnap.exists()) {
                setAcademicYears(docSnap.data().academicYears || []);
            }
        } catch (err) {
            console.error("Error loading settings:", err);
        }
    };

    useEffect(() => {
        fetchUsers();
        fetchSettings();
    }, []);

    const handleStatusChange = async (userId, newStatus) => {
        try {
            await updateDoc(doc(db, 'users', userId), { status: newStatus });
            fetchUsers(); // Refresh list
        } catch (error) {
            console.error("Error updating status: ", error);
            alert("Failed to update status.");
        }
    };

    const handleRoleChange = async (userId, newRole) => {
        if (window.confirm(`Are you sure you want to change this user's role to ${newRole}?`)) {
            try {
                await updateDoc(doc(db, 'users', userId), { role: newRole });
                fetchUsers();
            } catch (error) {
                console.error("Error updating role: ", error);
                alert("Failed to update role.");
            }
        }
    };

    const handleDeleteUser = async (userId) => {
        if (window.confirm("Are you sure you want to DELETE this user? This cannot be undone.")) {
            try {
                await deleteDoc(doc(db, 'users', userId));
                fetchUsers();
            } catch (error) {
                console.error("Error deleting user: ", error);
                alert("Failed to delete user.");
            }
        }
    };

    const handleAddYear = async () => {
        if (!newYear) return;
        try {
            const settingsRef = doc(db, 'settings', 'config');
            await updateDoc(settingsRef, {
                academicYears: arrayUnion(newYear),
                activeAcademicYear: newYear // Auto-switch to new year
            });
            setNewYear('');
            fetchSettings();
            alert(`New Academic Year ${newYear} Started!`);
            window.location.reload(); // Reload to apply global context change
        } catch (err) {
            console.error("Error adding year:", err);
            // Handle case where doc doesn't exist yet
            await setDoc(doc(db, 'settings', 'config'), {
                academicYears: [newYear],
                activeAcademicYear: newYear
            });
            window.location.reload();
        }
    };

    const handleSwitchYear = async (year) => {
        if (window.confirm(`Switch active year to ${year}?`)) {
            await updateDoc(doc(db, 'settings', 'config'), {
                activeAcademicYear: year
            });
            window.location.reload();
        }
    };

    const filteredUsers = users.filter(user => {
        if (filter === 'all') return true;
        return user.status === filter;
    });

    if (!userProfile || userProfile.role !== 'admin') {
        return <div style={{ color: 'white', padding: '2rem', textAlign: 'center' }}>Access Denied. Admins only.</div>;
    }

    return (
        <div style={{ paddingBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 'bold', marginBottom: 'var(--space-lg)' }}>Admin Panel</h2>

            {/* Academic Year Settings */}
            <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem', border: '1px solid var(--color-accent)' }}>
                <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    📅 Academic Year Management
                    <span style={{ fontSize: '0.8rem', background: 'var(--color-accent)', padding: '2px 8px', borderRadius: '12px' }}>Active: {activeAcademicYear}</span>
                </h3>

                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'end' }}>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Start New Year</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input
                                className="glass-input"
                                placeholder="e.g. 2025-2026"
                                value={newYear}
                                onChange={(e) => setNewYear(e.target.value)}
                            />
                            <button className="btn btn-primary" onClick={handleAddYear}>Start</button>
                        </div>
                    </div>

                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Switch Active Year</label>
                        <select
                            className="glass-input"
                            value={activeAcademicYear}
                            onChange={(e) => handleSwitchYear(e.target.value)}
                            style={{ width: '100%' }}
                        >
                            {academicYears.map(year => (
                                <option key={year} value={year} style={{ color: 'black' }}>{year}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                    <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Total Users</h3>
                    <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>{users.length}</p>
                </div>
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                    <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Pending Approval</h3>
                    <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#fbbf24' }}>
                        {users.filter(u => u.status === 'pending').length}
                    </p>
                </div>
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                    <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Admins</h3>
                    <p style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--color-accent)' }}>
                        {users.filter(u => u.role === 'admin').length}
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
                <button
                    onClick={() => setFilter('all')}
                    className="btn"
                    style={{ background: filter === 'all' ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)' }}
                >
                    All Users
                </button>
                <button
                    onClick={() => setFilter('pending')}
                    className="btn"
                    style={{ background: filter === 'pending' ? '#fbbf24' : 'rgba(255,255,255,0.1)', color: filter === 'pending' ? 'black' : 'white' }}
                >
                    Pending
                </button>
                <button
                    onClick={() => setFilter('approved')}
                    className="btn"
                    style={{ background: filter === 'approved' ? '#10b981' : 'rgba(255,255,255,0.1)' }}
                >
                    Approved
                </button>
            </div>

            {/* Users Table */}
            <div className="glass-panel" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--color-text-muted)' }}>
                            <th style={{ padding: '1rem' }}>Name</th>
                            <th style={{ padding: '1rem' }}>Emp ID</th>
                            <th style={{ padding: '1rem' }}>Email</th>
                            <th style={{ padding: '1rem' }}>Status</th>
                            <th style={{ padding: '1rem' }}>Role</th>
                            <th style={{ padding: '1rem' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="6" style={{ padding: '2rem', textAlign: 'center' }}>Loading...</td></tr>
                        ) : filteredUsers.length === 0 ? (
                            <tr><td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>No users found.</td></tr>
                        ) : (
                            filteredUsers.map(user => (
                                <tr key={user.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <td style={{ padding: '1rem' }}>{user.name}</td>
                                    <td style={{ padding: '1rem' }}>{user.empId}</td>
                                    <td style={{ padding: '1rem' }}>{user.email || '-'}</td>
                                    <td style={{ padding: '1rem' }}>
                                        <span style={{
                                            padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem',
                                            background: user.status === 'approved' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(251, 191, 36, 0.2)',
                                            color: user.status === 'approved' ? '#6ee7b7' : '#fcd34d'
                                        }}>
                                            {user.status}
                                        </span>
                                    </td>
                                    <td style={{ padding: '1rem' }}>{user.role}</td>
                                    <td style={{ padding: '1rem', display: 'flex', gap: '0.5rem' }}>
                                        {user.status === 'pending' && (
                                            <button
                                                onClick={() => handleStatusChange(user.id, 'approved')}
                                                className="btn"
                                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', background: '#10b981' }}
                                            >
                                                Approve
                                            </button>
                                        )}
                                        {user.role !== 'admin' && (
                                            <button
                                                onClick={() => handleRoleChange(user.id, 'admin')}
                                                className="btn"
                                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', background: 'var(--color-accent)' }}
                                            >
                                                Make Admin
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleDeleteUser(user.id)}
                                            className="btn"
                                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', background: '#ef4444' }}
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AdminPanel;
