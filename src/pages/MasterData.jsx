import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext'; // Import useAuth
import '../styles/design-system.css';

const MasterData = () => {
    const { userProfile } = useAuth(); // Get user profile
    const [activeTab, setActiveTab] = useState('faculty');
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({});
    const [editingId, setEditingId] = useState(null);

    // ... (rest of the state and functions remain same)

    // Helper to check if user is admin
    const isAdmin = userProfile && userProfile.role === 'admin';

    // ... (fetchData, handleSave, handleDelete, openModal remain same)

    // Collections mapping
    const collections = {
        faculty: 'faculty',
        rooms: 'rooms',
        subjects: 'subjects',
        timeslots: 'timeslots'
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const querySnapshot = await getDocs(collection(db, collections[activeTab]));
            const items = [];
            querySnapshot.forEach((doc) => {
                items.push({ id: doc.id, ...doc.data() });
            });
            setData(items);
        } catch (error) {
            console.error("Error fetching data: ", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [activeTab]);

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            if (editingId) {
                await updateDoc(doc(db, collections[activeTab], editingId), formData);
            } else {
                await addDoc(collection(db, collections[activeTab]), formData);
            }
            setIsModalOpen(false);
            setFormData({});
            setEditingId(null);
            fetchData();
        } catch (error) {
            console.error("Error saving document: ", error);
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this item?')) {
            try {
                await deleteDoc(doc(db, collections[activeTab], id));
                fetchData();
            } catch (error) {
                console.error("Error deleting document: ", error);
            }
        }
    };

    const openModal = (item = null) => {
        if (item) {
            setFormData(item);
            setEditingId(item.id);
        } else {
            setFormData({});
            setEditingId(null);
        }
        setIsModalOpen(true);
    };

    const renderFormFields = () => {
        switch (activeTab) {
            case 'faculty':
                return (
                    <>
                        <input className="glass-input" placeholder="Name" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                        <input className="glass-input" placeholder="Emp ID" value={formData.empId || ''} onChange={e => setFormData({ ...formData, empId: e.target.value })} required />
                        <input className="glass-input" placeholder="Email" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                        <input className="glass-input" placeholder="Department" value={formData.department || ''} onChange={e => setFormData({ ...formData, department: e.target.value })} />
                    </>
                );
            case 'rooms':
                return (
                    <>
                        <input className="glass-input" placeholder="Room Name/Number" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                        <input className="glass-input" placeholder="Capacity" type="number" value={formData.capacity || ''} onChange={e => setFormData({ ...formData, capacity: e.target.value })} />
                        <select className="glass-input" value={formData.type || 'lab'} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                            <option value="lab">Lab</option>
                            <option value="lecture">Lecture Hall</option>
                        </select>
                    </>
                );
            case 'subjects':
                return (
                    <>
                        <input className="glass-input" placeholder="Subject Code" value={formData.code || ''} onChange={e => setFormData({ ...formData, code: e.target.value })} required />
                        <input className="glass-input" placeholder="Subject Name" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                        <input className="glass-input" placeholder="Semester" type="number" value={formData.semester || ''} onChange={e => setFormData({ ...formData, semester: e.target.value })} />
                        <select className="glass-input" value={formData.type || 'lab'} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                            <option value="lab">Lab</option>
                            <option value="theory">Theory</option>
                        </select>
                    </>
                );
            case 'timeslots':
                return (
                    <>
                        <input className="glass-input" placeholder="Label (e.g., Slot A)" value={formData.label || ''} onChange={e => setFormData({ ...formData, label: e.target.value })} required />
                        <input className="glass-input" type="time" value={formData.startTime || ''} onChange={e => setFormData({ ...formData, startTime: e.target.value })} required />
                        <input className="glass-input" type="time" value={formData.endTime || ''} onChange={e => setFormData({ ...formData, endTime: e.target.value })} required />
                    </>
                );
            default:
                return null;
        }
    };

    const renderTableHeader = () => {
        switch (activeTab) {
            case 'faculty': return <><th>Name</th><th>Emp ID</th><th>Dept</th>{isAdmin && <th>Actions</th>}</>;
            case 'rooms': return <><th>Name</th><th>Capacity</th><th>Type</th>{isAdmin && <th>Actions</th>}</>;
            case 'subjects': return <><th>Code</th><th>Name</th><th>Sem</th><th>Type</th>{isAdmin && <th>Actions</th>}</>;
            case 'timeslots': return <><th>Label</th><th>Start</th><th>End</th>{isAdmin && <th>Actions</th>}</>;
            default: return null;
        }
    };

    const renderTableRow = (item) => {
        switch (activeTab) {
            case 'faculty': return <><td style={{ padding: '1rem' }}>{item.name}</td><td style={{ padding: '1rem' }}>{item.empId}</td><td style={{ padding: '1rem' }}>{item.department}</td></>;
            case 'rooms': return <><td style={{ padding: '1rem' }}>{item.name}</td><td style={{ padding: '1rem' }}>{item.capacity}</td><td style={{ padding: '1rem' }}>{item.type}</td></>;
            case 'subjects': return <><td style={{ padding: '1rem' }}>{item.code}</td><td style={{ padding: '1rem' }}>{item.name}</td><td style={{ padding: '1rem' }}>{item.semester}</td><td style={{ padding: '1rem' }}>{item.type}</td></>;
            case 'timeslots': return <><td style={{ padding: '1rem' }}>{item.label}</td><td style={{ padding: '1rem' }}>{item.startTime}</td><td style={{ padding: '1rem' }}>{item.endTime}</td></>;
            default: return null;
        }
    };

    return (
        <div style={{ paddingBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
                <h2 style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>Master Data Management</h2>
                {isAdmin && (
                    <button className="btn" style={{ background: 'var(--color-accent)', color: 'white' }} onClick={() => openModal()}>
                        + Add New {activeTab.slice(0, -1)}
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: 'var(--space-lg)', borderBottom: '1px solid var(--glass-border)' }}>
                {Object.keys(collections).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                            padding: '0.75rem 1.5rem',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: activeTab === tab ? '2px solid var(--color-accent)' : '2px solid transparent',
                            color: activeTab === tab ? 'white' : 'var(--color-text-muted)',
                            cursor: 'pointer',
                            fontSize: '1rem',
                            textTransform: 'capitalize',
                            transition: 'all 0.2s'
                        }}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Data Table */}
            <div className="glass-panel" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--color-text-muted)' }}>
                            {renderTableHeader()}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center' }}>Loading...</td></tr>
                        ) : data.length === 0 ? (
                            <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>No records found.</td></tr>
                        ) : (
                            data.map(item => (
                                <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    {renderTableRow(item)}
                                    {isAdmin && (
                                        <td style={{ padding: '1rem' }}>
                                            <button onClick={() => openModal(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: '0.5rem' }}>✏️</button>
                                            <button onClick={() => handleDelete(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>🗑️</button>
                                        </td>
                                    )}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
                }}>
                    <div className="glass-panel" style={{ width: '400px', padding: '2rem' }}>
                        <h3 style={{ marginBottom: '1.5rem' }}>{editingId ? 'Edit' : 'Add'} {activeTab.slice(0, -1)}</h3>
                        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {renderFormFields()}
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

export default MasterData;
