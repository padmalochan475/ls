import React, { useState, useEffect } from 'react';
import { db, auth } from '../../lib/firebase';
import { collection, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { ShieldAlert, CheckCircle, Trash2, Link2Off, RefreshCw, Activity } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';

export default function SystemHealth() {
    const { userProfile } = useAuth();
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState({
        scanned: 0,
        healthy: 0,
        orphans: [], // { type, id, details }
        conflicts: [],
        pendingDeletions: []
    });

    const scanSystem = async () => {
        if (!userProfile || userProfile.role !== 'admin') return;
        setLoading(true);
        try {
            const usersSnap = await getDocs(collection(db, 'users'));
            const facultySnap = await getDocs(collection(db, 'faculty'));
            const lookupsSnap = await getDocs(collection(db, 'emp_lookups'));

            const uidMap = new Set();
            const usersWithFaculty = new Set();
            
            const orphans = [];
            const conflicts = [];
            const pendingDeletions = [];
            
            let healthy = 0;
            let scanned = usersSnap.size + facultySnap.size + lookupsSnap.size;

            usersSnap.forEach(doc => {
                const data = doc.data();
                uidMap.add(doc.id);
                
                if (data.deletionStatus === 'pending' || data.deletionStatus === 'failed') {
                    pendingDeletions.push({
                        type: 'USER',
                        id: doc.id,
                        details: `Status: ${data.deletionStatus}. Error: ${data.deletionError || 'N/A'}`,
                        email: data.email
                    });
                } else {
                    healthy++;
                }
            });

            const uidToFaculty = new Map();
            facultySnap.forEach(doc => {
                const data = doc.data();
                if (data.uid) {
                    if (!uidMap.has(data.uid)) {
                        orphans.push({
                            type: 'FACULTY_LINK',
                            id: doc.id,
                            details: `Linked to non-existent UID: ${data.uid}`,
                            empId: data.empId
                        });
                    } else {
                        usersWithFaculty.add(data.uid);
                    }
                    
                    if (uidToFaculty.has(data.uid)) {
                        conflicts.push({
                            type: 'FACULTY_DUPLICATE_LINK',
                            id: doc.id,
                            details: `Multiple faculty linked to UID: ${data.uid}`,
                            empId: data.empId
                        });
                    } else {
                        uidToFaculty.set(data.uid, doc.id);
                        healthy++;
                    }
                } else {
                    healthy++;
                }
            });

            lookupsSnap.forEach(doc => {
                const data = doc.data();
                if (!data.uid || !uidMap.has(data.uid)) {
                    orphans.push({
                        type: 'EMP_LOOKUP',
                        id: doc.id,
                        details: `Lookup points to non-existent UID: ${data.uid}`,
                        empId: doc.id
                    });
                } else {
                    healthy++;
                }
            });

            setStats({
                scanned,
                healthy,
                orphans,
                conflicts,
                pendingDeletions
            });
            toast.success("System scan complete");

        } catch (error) {
            console.error("Scan error:", error);
            toast.error("Failed to scan system");
        }
        setLoading(false);
    };

    const handleRepair = async (item, action) => {
        try {
            const token = await auth.currentUser.getIdToken();
            const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/repair-orphan`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    action: action,
                    targetUid: item.uid,
                    targetEmpId: item.empId
                })
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to repair');
            
            toast.success(data.message);
            scanSystem(); // rescan
        } catch (err) {
            toast.error(err.message);
        }
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <Activity size={24} color="#3b82f6" /> System Health & Reconciliation
                    </h2>
                    <p style={{ color: 'var(--color-text-muted)', margin: '0.5rem 0 0 0' }}>
                        Detect and repair orphaned records, broken links, and failed deletions.
                    </p>
                </div>
                <button 
                    onClick={scanSystem} 
                    disabled={loading}
                    className="btn"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--color-accent)' }}
                >
                    <RefreshCw size={16} className={loading ? 'spin' : ''} />
                    {loading ? 'Scanning...' : 'Scan System'}
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#3b82f6' }}>{stats.scanned}</div>
                    <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Records Scanned</div>
                </div>
                <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#10b981' }}>{stats.healthy}</div>
                    <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Healthy Links</div>
                </div>
                <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center', border: stats.orphans.length > 0 ? '1px solid #ef4444' : '' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: stats.orphans.length > 0 ? '#ef4444' : 'var(--color-text-muted)' }}>
                        {stats.orphans.length}
                    </div>
                    <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Orphans Found</div>
                </div>
                <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center', border: stats.pendingDeletions.length > 0 ? '1px solid #f59e0b' : '' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: stats.pendingDeletions.length > 0 ? '#f59e0b' : 'var(--color-text-muted)' }}>
                        {stats.pendingDeletions.length}
                    </div>
                    <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Failed Deletions</div>
                </div>
            </div>

            {stats.orphans.length > 0 && (
                <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem', borderLeft: '4px solid #ef4444' }}>
                    <h3 style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 0 }}>
                        <ShieldAlert size={18} /> Orphaned Records
                    </h3>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {stats.orphans.map((orphan, i) => (
                            <li key={i} style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <strong>{orphan.type}</strong> - {orphan.empId}
                                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>{orphan.details}</div>
                                </div>
                                {orphan.type === 'EMP_LOOKUP' && (
                                    <button onClick={() => handleRepair(orphan, 'DELETE_ORPHANED_LOOKUP')} className="btn" style={{ background: 'rgba(239,68,68,0.2)', color: '#ef4444', padding: '0.5rem 1rem' }}>
                                        <Trash2 size={16} /> Delete Lookup
                                    </button>
                                )}
                                {orphan.type === 'FACULTY_LINK' && (
                                    <button onClick={() => handleRepair(orphan, 'UNLINK_FACULTY')} className="btn" style={{ background: 'rgba(245,158,11,0.2)', color: '#fcd34d', padding: '0.5rem 1rem' }}>
                                        <Link2Off size={16} /> Unlink Faculty
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            
            {stats.pendingDeletions.length > 0 && (
                <div className="glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid #f59e0b' }}>
                    <h3 style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 0 }}>
                        <ShieldAlert size={18} /> Incomplete Deletions
                    </h3>
                    <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>These users have a pending or failed deletion status. You can retry deletion from the Users list.</p>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {stats.pendingDeletions.map((del, i) => (
                            <li key={i} style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px' }}>
                                <strong>{del.email || del.id}</strong>
                                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>{del.details}</div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            
            {stats.scanned > 0 && stats.orphans.length === 0 && stats.pendingDeletions.length === 0 && (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#10b981' }}>
                    <CheckCircle size={48} style={{ margin: '0 auto 1rem', opacity: 0.8 }} />
                    <h3 style={{ margin: 0 }}>All Systems Healthy</h3>
                    <p style={{ color: 'var(--color-text-muted)' }}>No orphans or broken links detected.</p>
                </div>
            )}
        </div>
    );
}
