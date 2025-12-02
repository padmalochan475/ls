import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { db, auth } from '../lib/firebase';
import { collection, getDocs, doc, updateDoc, deleteDoc, getDoc, setDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext';
import '../styles/design-system.css';

const AdminPanel = () => {
    const { userProfile, activeAcademicYear, systemAcademicYear, academicYears, setSelectedAcademicYear } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // 'all', 'pending', 'approved'
    const [newYear, setNewYear] = useState('');

    // Delete Year State
    const [deleteYearModalOpen, setDeleteYearModalOpen] = useState(false);
    const [yearToDelete, setYearToDelete] = useState(null);
    const [confirmPassword, setConfirmPassword] = useState('');
    const [confirmText, setConfirmText] = useState('');
    const [deleteError, setDeleteError] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

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

    useEffect(() => {
        fetchUsers();
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

    const [updatingDefault, setUpdatingDefault] = useState(false);

    const handleSetAsDefault = async () => {
        if (activeAcademicYear === systemAcademicYear) return;

        setUpdatingDefault(true);
        try {
            console.log("Updating Firestore settings/config...");
            await setDoc(doc(db, 'settings', 'config'), {
                activeAcademicYear: activeAcademicYear
            }, { merge: true });
            console.log("Update successful!");
            alert(`System Default updated to ${activeAcademicYear}`);
        } catch (err) {
            console.error("Error updating default:", err);
            alert("Failed to update. Check console for details.");
        } finally {
            setUpdatingDefault(false);
        }
    };

    useEffect(() => {
        console.log("AdminPanel: academicYears updated from context:", academicYears);
    }, [academicYears]);

    const handleCreateYear = async () => {
        if (!newYear) return;
        if (academicYears.includes(newYear)) {
            alert("Year already exists!");
            return;
        }
        try {
            const settingsRef = doc(db, 'settings', 'config');
            // Check if doc exists first
            const docSnap = await getDoc(settingsRef);

            if (docSnap.exists()) {
                await updateDoc(settingsRef, {
                    academicYears: arrayUnion(newYear)
                });
            } else {
                await setDoc(settingsRef, {
                    academicYears: [newYear],
                    activeAcademicYear: newYear
                });
            }

            // Switch to the new year so the user sees it immediately
            setSelectedAcademicYear(newYear);
            setNewYear('');
            alert(`Created ${newYear}`);
        } catch (err) {
            console.error("Error creating year:", err);
            alert("Failed to create year.");
        }
    };

    const initiateDeleteYear = (year) => {
        if (year === systemAcademicYear) {
            alert("Cannot delete the System Default year. Please set another year as default first.");
            return;
        }
        setYearToDelete(year);
        setConfirmPassword('');
        setConfirmText('');
        setDeleteError('');
        setDeleteYearModalOpen(true);
    };

    const confirmDeleteYear = async (e) => {
        e.preventDefault();
        setDeleteError('');
        setIsDeleting(true);

        if (confirmText !== 'delete') {
            setDeleteError('Please type "delete" to confirm.');
            setIsDeleting(false);
            return;
        }

        try {
            // 1. Re-authenticate
            const user = auth.currentUser;
            const credential = EmailAuthProvider.credential(user.email, confirmPassword);
            await reauthenticateWithCredential(user, credential);

            // 2. Delete from Firestore
            const settingsRef = doc(db, 'settings', 'config');
            await updateDoc(settingsRef, {
                academicYears: arrayRemove(yearToDelete)
            });

            // 3. If deleted year was active (view only), switch to default
            if (activeAcademicYear === yearToDelete) {
                setSelectedAcademicYear(systemAcademicYear);
            }

            setDeleteYearModalOpen(false);
            alert(`Successfully deleted ${yearToDelete}`);
        } catch (err) {
            console.error("Delete failed:", err);
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
                setDeleteError("Incorrect password.");
            } else {
                setDeleteError("Failed to delete. " + err.message);
            }
        } finally {
            setIsDeleting(false);
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

            {/* Centralized Academic Year Control */}
            <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem', border: '1px solid var(--color-accent)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '2rem' }}>

                    {/* 1. View Selector (The "Lens") */}
                    <div style={{ flex: 1, minWidth: '250px' }}>
                        <h3 style={{ marginBottom: '0.5rem', fontSize: '1.1rem' }}>👁️ View Data For</h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                            Select the year you want to manage (Assignments, Schedule, etc).
                        </p>
                        <select
                            value={activeAcademicYear}
                            onChange={(e) => setSelectedAcademicYear(e.target.value)}
                            className="glass-input"
                            style={{ width: '100%', fontSize: '1.2rem', padding: '0.75rem', fontWeight: 'bold', color: 'var(--color-accent)' }}
                        >
                            {academicYears.map(year => (
                                <option key={year} value={year} style={{ color: 'black' }}>{year}</option>
                            ))}
                        </select>

                        <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Current System Default:</div>
                            <div style={{ fontSize: '1rem', fontWeight: 'bold', color: systemAcademicYear === activeAcademicYear ? '#10b981' : '#fbbf24' }}>
                                {systemAcademicYear}
                                {systemAcademicYear === activeAcademicYear ? ' (Active)' : ' (Different from View)'}
                            </div>
                            {systemAcademicYear !== activeAcademicYear && (
                                <button
                                    onClick={handleSetAsDefault}
                                    className="btn"
                                    disabled={updatingDefault}
                                    style={{ marginTop: '0.5rem', width: '100%', background: 'var(--color-accent)', opacity: updatingDefault ? 0.7 : 1 }}
                                >
                                    {updatingDefault ? 'Updating...' : `Set ${activeAcademicYear} as Default`}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* 2. Create & Manage Years */}
                    <div style={{ flex: 1, minWidth: '250px', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '2rem' }}>
                        <h3 style={{ marginBottom: '0.5rem', fontSize: '1.1rem' }}>➕ Create New Year</h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                            Add a new academic year to the system.
                        </p>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem' }}>
                            <input
                                value={newYear}
                                onChange={(e) => setNewYear(e.target.value)}
                                placeholder="e.g. 2026-2027"
                                className="glass-input"
                                style={{ flex: 1 }}
                            />
                            <button onClick={handleCreateYear} className="btn btn-primary">Add</button>
                        </div>

                        <h3 style={{ marginBottom: '0.5rem', fontSize: '1.1rem' }}>⚙️ Manage Years</h3>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {academicYears.map(year => (
                                <li key={year} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                                    <span>{year} {year === systemAcademicYear && <span style={{ fontSize: '0.7rem', color: '#10b981' }}>(Default)</span>}</span>
                                    {year !== systemAcademicYear && (
                                        <button
                                            onClick={() => initiateDeleteYear(year)}
                                            className="btn"
                                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5' }}
                                        >
                                            Delete
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
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

            {/* Delete Confirmation Modal */}
            {deleteYearModalOpen && createPortal(
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999
                }}>
                    <div className="glass-panel" style={{ width: '400px', padding: '2rem', border: '1px solid #ef4444' }}>
                        <h3 style={{ marginBottom: '1rem', color: '#fca5a5' }}>⚠️ Confirm Deletion</h3>
                        <p style={{ marginBottom: '1.5rem' }}>
                            Are you sure you want to delete <strong>{yearToDelete}</strong>?
                            This action cannot be undone.
                        </p>

                        {deleteError && (
                            <div style={{ padding: '0.5rem', background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.875rem' }}>
                                {deleteError}
                            </div>
                        )}

                        <form onSubmit={confirmDeleteYear} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Password</label>
                                <input
                                    type="password"
                                    className="glass-input"
                                    style={{ width: '100%' }}
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    required
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Type "delete" to confirm</label>
                                <input
                                    type="text"
                                    className="glass-input"
                                    style={{ width: '100%' }}
                                    value={confirmText}
                                    onChange={e => setConfirmText(e.target.value)}
                                    required
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setDeleteYearModalOpen(false)}
                                    className="btn"
                                    style={{ flex: 1, background: 'rgba(255,255,255,0.1)' }}
                                    disabled={isDeleting}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn"
                                    style={{ flex: 1, background: '#ef4444', color: 'white' }}
                                    disabled={isDeleting}
                                >
                                    {isDeleting ? 'Deleting...' : 'Delete Forever'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default AdminPanel;
