import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { db, auth } from '../lib/firebase';
import { collection, getDocs, doc, updateDoc, deleteDoc, getDoc, setDoc, arrayUnion, arrayRemove, onSnapshot } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext';
import ConfirmModal from '../components/ConfirmModal';
import '../styles/design-system.css';

const AdminPanel = () => {
    const { userProfile } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // 'all', 'pending', 'approved'
    const [selectedUser, setSelectedUser] = useState(null);

    // Real-Time Users Listener
    useEffect(() => {
        setLoading(true);
        const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
            const usersList = [];
            snapshot.forEach((doc) => {
                usersList.push({ id: doc.id, ...doc.data() });
            });
            setUsers(usersList);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching users:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleStatusChange = async (userId, newStatus) => {
        try {
            await updateDoc(doc(db, 'users', userId), { status: newStatus });
            // fetchUsers(); // Refresh list
        } catch (error) {
            console.error("Error updating status: ", error);
            alert("Failed to update status.");
        }
    };

    const handleRoleChange = async (userId, newRole) => {
        try {
            await updateDoc(doc(db, 'users', userId), { role: newRole });
            // fetchUsers();
        } catch (error) {
            console.error("Error updating role: ", error);
            alert("Failed to update role.");
        }
    };

    const [confirmModal, setConfirmModal] = useState({ isOpen: false, id: null });

    const handleDeleteUser = (userId) => {
        setConfirmModal({ isOpen: true, id: userId });
    };

    const executeDeleteUser = async () => {
        const userId = confirmModal.id;
        if (!userId) return;
        setConfirmModal({ isOpen: false, id: null });

        try {
            await deleteDoc(doc(db, 'users', userId));
            // fetchUsers();
        } catch (error) {
            console.error("Error deleting user: ", error);
            alert("Failed to delete user.");
        }
    };


    const [searchTerm, setSearchTerm] = useState('');

    const filteredUsers = users.filter(user => {
        const matchesFilter = filter === 'all' || user.status === filter;
        const matchesSearch = (user.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
            (user.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
            (user.empId?.toLowerCase() || '').includes(searchTerm.toLowerCase());
        return matchesFilter && matchesSearch;
    });

    if (!userProfile || userProfile.role !== 'admin') {
        return <div style={{ color: 'white', padding: '2rem', textAlign: 'center' }}>Access Denied. Admins only.</div>;
    }

    return (
        <div style={{ paddingBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 'bold', marginBottom: 'var(--space-lg)' }}>Admin Panel</h2>



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

            {/* Filters & Search */}
            <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
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

                <input
                    type="text"
                    placeholder="Search users..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="glass-input"
                    style={{ minWidth: '250px' }}
                />
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
                                    <td style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div style={{
                                            width: '40px', height: '40px', borderRadius: '50%', overflow: 'hidden',
                                            background: 'var(--color-bg-secondary)', border: '1px solid var(--glass-border)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            {user.photoURL ? (
                                                <img src={user.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                <span style={{ fontSize: '1rem', fontWeight: 'bold', color: 'var(--color-text-muted)' }}>
                                                    {user.name?.charAt(0)}
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => setSelectedUser(user)}
                                            style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', textDecoration: 'underline', fontSize: '1rem' }}
                                        >
                                            {user.name}
                                        </button>
                                    </td>
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
                                    <td style={{ padding: '1rem' }}>
                                        <select
                                            value={user.role}
                                            onChange={(e) => handleRoleChange(user.id, e.target.value)}
                                            className="glass-input"
                                            style={{ padding: '0.25rem', fontSize: '0.9rem', width: 'auto', opacity: user.email === 'padmalochan.maharana@tat.ac.in' ? 0.5 : 1 }}
                                            disabled={user.email === 'padmalochan.maharana@tat.ac.in'}
                                        >
                                            <option value="user" style={{ background: '#1e293b', color: 'white' }}>User</option>
                                            <option value="admin" style={{ background: '#1e293b', color: 'white' }}>Admin</option>
                                        </select>
                                    </td>
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
                                        <button
                                            onClick={() => handleDeleteUser(user.id)}
                                            className="btn"
                                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', background: '#ef4444', opacity: user.email === 'padmalochan.maharana@tat.ac.in' ? 0.5 : 1 }}
                                            disabled={user.email === 'padmalochan.maharana@tat.ac.in'}
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


            {/* User Details Modal */}
            {selectedUser && createPortal(
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999
                }} onClick={() => setSelectedUser(null)}>
                    <div className="glass-panel" style={{ width: '400px', padding: '2rem', position: 'relative' }} onClick={e => e.stopPropagation()}>
                        <button
                            onClick={() => setSelectedUser(null)}
                            style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.5rem' }}
                        >
                            &times;
                        </button>

                        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                            <div style={{
                                width: '100px', height: '100px', borderRadius: '50%', overflow: 'hidden',
                                background: 'var(--color-bg-secondary)', border: '2px solid var(--color-accent)',
                                margin: '0 auto 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                {selectedUser.photoURL ? (
                                    <img src={selectedUser.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <span style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--color-text-muted)' }}>
                                        {selectedUser.name?.charAt(0)}
                                    </span>
                                )}
                            </div>
                            <h2 style={{ margin: 0 }}>{selectedUser.name}</h2>
                            <p style={{ color: 'var(--color-text-muted)', margin: '0.5rem 0' }}>{selectedUser.role.toUpperCase()}</p>
                        </div>

                        <div style={{ display: 'grid', gap: '1rem' }}>
                            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px' }}>
                                <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.25rem' }}>Employee ID</label>
                                <div style={{ fontSize: '1.1rem' }}>{selectedUser.empId}</div>
                            </div>
                            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px' }}>
                                <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.25rem' }}>Email</label>
                                <div style={{ fontSize: '1.1rem' }}>{selectedUser.email || 'N/A'}</div>
                            </div>
                            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px' }}>
                                <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.25rem' }}>Mobile</label>
                                <div style={{ fontSize: '1.1rem' }}>{selectedUser.mobile || 'N/A'}</div>
                            </div>
                            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px' }}>
                                <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.25rem' }}>Account Status</label>
                                <div style={{ fontSize: '1.1rem', color: selectedUser.status === 'approved' ? '#6ee7b7' : '#fcd34d' }}>
                                    {selectedUser.status.toUpperCase()}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
            {createPortal(
                <ConfirmModal
                    isOpen={confirmModal.isOpen}
                    onClose={() => setConfirmModal({ isOpen: false, id: null })}
                    onConfirm={executeDeleteUser}
                    title="Delete User"
                    message="Are you sure you want to PERMANENTLY delete this user? This cannot be undone."
                    isDangerous={true}
                />,
                document.body
            )}
        </div>
    );
};

export default AdminPanel;
