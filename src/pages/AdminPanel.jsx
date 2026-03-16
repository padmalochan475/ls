import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { db, auth } from '../lib/firebase';
import { collection, doc, updateDoc, deleteDoc, getDoc, onSnapshot, query, where, getDocs, writeBatch } from 'firebase/firestore';
// EmailAuthProvider removed (unused)
import { useAuth } from '../contexts/AuthContext';
import ConfirmModal from '../components/ConfirmModal';
import { Users, UserPlus, ShieldAlert, Activity, Search, Trash2, CheckCircle, Shield, GraduationCap, Settings, MessageSquare, User } from 'lucide-react';
import toast from 'react-hot-toast';
import emailjs from '@emailjs/browser';
import '../styles/design-system.css';
import { normalizeStr } from '../utils/timeUtils';
import { useWritePermission } from '../hooks/useWritePermission';
import NotificationManager from '../components/admin/NotificationManager';
import CelebrationManager from '../components/admin/CelebrationManager';
import SubstitutionManager from '../components/SubstitutionManager';
import AdminOtpModal from '../components/admin/AdminOtpModal';
import { sendWhatsAppNotification } from '../utils/whatsappUtils';

// eslint-disable-next-line sonarjs/cognitive-complexity
const AdminPanel = () => {
    const { userProfile } = useAuth();
    const { checkWritePermission } = useWritePermission();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // 'all', 'pending', 'approved'
    const [selectedUser, setSelectedUser] = useState(null);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, id: null });
    const [searchTerm, setSearchTerm] = useState('');

    // New States for Suggestions Tab
    const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'suggestions'
    const [suggestions, setSuggestions] = useState([]);
    const [suggestionsLoading, setSuggestionsLoading] = useState(false);

    // Analytics Metrics
    const stats = useMemo(() => {
        const total = users.length;
        const pending = users.filter(u => u.status === 'pending').length;
        const approved = users.filter(u => u.status === 'approved').length;
        const admins = users.filter(u => u.role === 'admin').length;
        const faculty = users.filter(u => u.role === 'user' || !u.role).length; // Default to user/faculty

        // Online & Idle Calculation
        const now = new Date();
        let onlineCount = 0;
        let idleCount = 0;
        let onlineUsersList = [];
        let totalActiveDevices = 0;

        users.forEach(u => {
            let userActiveDevices = 0;

            // Check Sessions Map if available
            if (u.sessions) {
                Object.values(u.sessions).forEach(timestamp => {
                    const diffMinutes = (now - new Date(timestamp)) / 1000 / 60;
                    if (diffMinutes < 2) {
                        userActiveDevices++;
                    }
                });
            }

            // Fallback to lastSeen if sessions empty/missing (backward compatibility)
            if (userActiveDevices === 0 && u.lastSeen) {
                const diffMinutes = (now - new Date(u.lastSeen)) / 1000 / 60;
                if (diffMinutes < 2) userActiveDevices = 1;
            }

            if (userActiveDevices > 0) {
                // isUserOnline = true;
                onlineCount++;
                totalActiveDevices += userActiveDevices; // Sum up all devices
                onlineUsersList.push({
                    name: u.name,
                    id: u.id,
                    role: u.role,
                    email: u.email,
                    deviceCount: userActiveDevices
                });
            } else if (u.lastSeen && (now - new Date(u.lastSeen)) / 1000 / 60 < 10) {
                idleCount++;
            }
        });

        // 3. User Growth (Mock Data for Demo, Real data requires 'createdAt' history)
        // We can simulate growth based on 'createdAt' field if it exists
        const growthData = users
            .filter(u => u.createdAt)
            .reduce((acc, u) => {
                const date = new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short' });
                const existing = acc.find(item => item.name === date);
                if (existing) {
                    existing.users += 1;
                } else {
                    acc.push({ name: date, users: 1 });
                }
                return acc;
            }, [])
            // Sort by month (basic implementation, assumes same year or sorts by string which is flawed but ok for demo)
            // A better way is needed for proper sorting, but this is a quick fix.
            // Let's just limit to last 6 entries to look nice.
            .slice(-6);

        // 4. Role Distribution
        const roleData = [
            { name: 'Admins', value: admins },
            { name: 'Faculty', value: faculty },
        ];

        // 5. Status Distribution
        const statusData = [
            { name: 'Active', value: approved },
            { name: 'Pending', value: pending },
        ];

        return { total, pending, approved, admins, faculty, roleData, statusData, growthData, online: onlineCount, idle: idleCount, onlineUsersList, totalActiveDevices };
    }, [users]);

    // Realtime Activity State
    const [realtimeData, setRealtimeData] = useState(() => {
        return Array.from({ length: 20 }, (_, i) => ({
            name: i,
            value: 0
        }));
    });

    useEffect(() => {
        const interval = setInterval(() => {
            setRealtimeData(prev => {
                const newData = [...prev.slice(1)];
                // Use the latest calculated online count
                const currentOnline = stats.online || 0;

                newData.push({
                    name: (prev[prev.length - 1]?.name || 0) + 1,
                    value: currentOnline
                });
                return newData;
            });
        }, 3000); // Update every 3 seconds to show timeline
        return () => clearInterval(interval);
    }, [stats.online]);

    const COLORS = ['#8b5cf6', '#3b82f6', '#f59e0b', '#10b981'];

    // Real-Time Users Listener
    useEffect(() => {
        if (!userProfile) return;
        setTimeout(() => setLoading(true), 0);
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
    }, [userProfile]);

    // Suggestions Listener (Always Active for Instant Switching)
    useEffect(() => {
        if (!userProfile) return;
        setSuggestionsLoading(true);
        const q = collection(db, 'suggestions');
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = [];
            snapshot.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
            // Sort by date desc
            list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setSuggestions(list);
            setSuggestionsLoading(false);
        }, (err) => {
            console.error("Suggestions Sync Error:", err);
            setSuggestionsLoading(false);
        });
        return () => unsubscribe();
    }, [userProfile]);

    const updateSuggestionStatus = async (id, status) => {
        // STRICT PERMISSION CHECK
        if (!checkWritePermission()) return;

        try {
            await updateDoc(doc(db, 'suggestions', id), { status });
            toast.success(`Marked as ${status}`);
        } catch {
            toast.error("Failed to update status");
        }
    };

    const deleteSuggestion = async (id) => {
        // STRICT PERMISSION CHECK
        if (!checkWritePermission()) return;

        if (!window.confirm("Are you sure you want to permanently delete this suggestion?")) return;
        try {
            await deleteDoc(doc(db, 'suggestions', id));
            toast.success("Suggestion deleted");
        } catch (e) {
            console.error(e);
            toast.error("Failed to delete suggestion");
        }
    };

    const handleStatusChange = async (userId, newStatus) => {
        // STRICT PERMISSION CHECK
        if (!checkWritePermission()) return;

        // Prevent modifying yourself
        if (userId === auth.currentUser?.uid) {
            alert("Security Alert: You cannot modify your own status.");
            return;
        }

        try {
            await updateDoc(doc(db, 'users', userId), { status: newStatus });
            
            // Send WhatsApp Notification if approved
            if (newStatus === 'approved') {
                const targetUser = users.find(u => u.id === userId);
                if (targetUser && targetUser.mobile && targetUser.whatsappEnabled !== false) {
                    const approveMsg = `✅ *Account Approved* ✅\n\nHi ${targetUser.name},\nYour LAMS account has been verified and approved by the Administrator.\n\nYou can now log in and access the portal.`;
                    sendWhatsAppNotification(targetUser.mobile, approveMsg);
                }
            }
        } catch (error) {
            console.error("Error updating status: ", error);
            alert("Failed to update status.");
        }
    };

    // ... (inside component)
    const [otpModal, setOtpModal] = useState({ isOpen: false, otp: '', userId: '', newRole: '' });
    const [isVerifying, setIsVerifying] = useState(false);

    // EmailJS Configuration
    const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
    const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
    const EMAILJS_ADMIN_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_ADMIN_TEMPLATE_ID || EMAILJS_TEMPLATE_ID; // Fallback to default if not set
    const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

    const sendEmailOtp = async (email, name, otpCode, templateId = EMAILJS_TEMPLATE_ID) => {
        if (!EMAILJS_SERVICE_ID || !EMAILJS_PUBLIC_KEY || !templateId) {
            console.error("EmailJS Configuration Missing");
            return { success: false, error: { text: "Missing API Keys in .env" } };
        }

        const templateParams = {
            to_name: name,
            passcode: otpCode,
            time: new Date().toLocaleString(),
            to_email: email,
            email: email,
            message: "Action Required: Granting Administrator Privileges. Please verify your identity."
        };
        try {
            await emailjs.send(EMAILJS_SERVICE_ID, templateId, templateParams, EMAILJS_PUBLIC_KEY);
            return { success: true };
        } catch (error) {
            console.error("EmailJS Error:", error);
            return { success: false, error };
        }
    };

    const handleRoleChange = async (userId, newRole) => {
        // STRICT PERMISSION CHECK
        if (!checkWritePermission()) return;

        // Prevent modifying yourself
        if (userId === auth.currentUser?.uid) {
            alert("Security Alert: You cannot modify your own role.");
            return;
        }

        // Security Check for Admin Promotion
        if (newRole === 'admin') {
            const adminEmail = auth.currentUser?.email;
            const adminName = userProfile?.name || 'Admin';

            if (!adminEmail) {
                toast.error("Security Error: Your account has no email linked.");
                return;
            }

            const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString(); // eslint-disable-line sonarjs/pseudo-random
            const toastId = toast.loading("Sending Verification Code...");

            // Use the specific ADMIN TEMPLATE ID here
            const result = await sendEmailOtp(adminEmail, adminName, generatedOtp, EMAILJS_ADMIN_TEMPLATE_ID);
            toast.dismiss(toastId);

            if (!result.success) {
                toast.error(`Failed to send Verification Email: ${result.error?.text || "Unknown Error"}`);
                return;
            }

            toast.success(`Verification Code sent!`);
            setOtpModal({ isOpen: true, otp: generatedOtp, userId, newRole });
        } else {
            // Normal role downgrade/change doesn't need OTP (optional choice, easier UX)
            updateUserRole(userId, newRole);
        }
    };

    const handleVerifyOtp = (inputCode) => {
        if (inputCode === otpModal.otp) {
            setIsVerifying(true);
            setTimeout(() => {
                updateUserRole(otpModal.userId, otpModal.newRole);
                setIsVerifying(false);
                setOtpModal({ isOpen: false, otp: '', userId: '', newRole: '' });
            }, 1000); // Fake delay for UX "Verifying..."
        } else {
            toast.error("Invalid Code. Please try again.");
        }
    };

    const updateUserRole = async (userId, newRole) => {
        try {
            await updateDoc(doc(db, 'users', userId), { role: newRole });
            toast.success("User role updated successfully!");
        } catch (error) {
            console.error("Error updating role: ", error);
            alert("Failed to update role.");
        }
    };

    const handleDeleteUser = (userId) => {
        // Prevent deleting yourself
        if (userId === auth.currentUser?.uid) {
            alert("Security Alert: You cannot delete your own account.");
            return;
        }
        setConfirmModal({ isOpen: true, id: userId });
    };

    const executeDeleteUser = async () => {
        // STRICT PERMISSION CHECK
        if (!checkWritePermission()) {
            setConfirmModal({ isOpen: false, id: null });
            return;
        }

        const userId = confirmModal.id;
        if (!userId) return;
        setConfirmModal({ isOpen: false, id: null });

        try {
            // 1. Get User Data first to find links
            const userDoc = await getDoc(doc(db, 'users', userId));
            if (userDoc.exists()) {
                const userData = userDoc.data();

                // 2. Remove Secure Lookup
                if (userData.empId) {
                    await deleteDoc(doc(db, 'emp_lookups', userData.empId));
                }

                // 3. Unlink Faculty Record
                // If this user was a faculty member, we must free up the faculty entry
                if (userData.empId) {
                    const q = query(collection(db, 'faculty'), where('uid', '==', userId));
                    const facSnap = await getDocs(q);
                    facSnap.forEach(async (d) => {
                        await updateDoc(d.ref, {
                            uid: null,
                            isRegistered: false,
                            // We keep the email in master data as it might be their official contact
                            // but we strip the linkage
                        });
                    });
                }
            }

            // 4. Finally Delete User
            await deleteDoc(doc(db, 'users', userId));
            toast.success("User deleted and unlinked successfully.");
        } catch (error) {
            console.error("Error deleting user: ", error);
            alert("Failed to delete user.");
        }
    };

    const filteredUsers = users.filter(user => {
        const matchesFilter = filter === 'all' || user.status === filter;
        const matchesSearch = normalizeStr(user.name).includes(normalizeStr(searchTerm)) ||
            normalizeStr(user.email).includes(normalizeStr(searchTerm)) ||
            normalizeStr(user.empId).includes(normalizeStr(searchTerm));
        return matchesFilter && matchesSearch;
    });

    // Edit User State
    const [editingUser, setEditingUser] = useState(null);
    const [editForm, setEditForm] = useState({ name: '', empId: '', dob: '', joiningDate: '' });

    const openEditModal = (user) => {
        setEditingUser(user);
        setEditForm({
            name: user.name || '',
            empId: user.empId || '',
            dob: user.dob || '', // YYYY-MM-DD
            joiningDate: user.joiningDate || '' // YYYY-MM-DD
        });
    };

    const handleSaveUser = async () => {
        // STRICT PERMISSION CHECK
        if (!checkWritePermission()) return;

        if (!editingUser) return;
        try {
            // 1. Update User Doc
            await updateDoc(doc(db, 'users', editingUser.id), {
                name: editForm.name,
                empId: editForm.empId,
                dob: editForm.dob,
                joiningDate: editForm.joiningDate
            });

            // 2. Sync Security & Faculty (If EmpID Changed)
            if (editingUser.empId !== editForm.empId) {
                const batch = writeBatch(db);

                // A. Update Secure Lookup
                if (editForm.empId) {
                    batch.set(doc(db, 'emp_lookups', editForm.empId), {
                        uid: editingUser.id,
                        email: editingUser.email,
                        syncedAt: new Date().toISOString(),
                        source: 'admin-panel-edit'
                    });
                }
                // Remove old lookup if it existed
                if (editingUser.empId) {
                    batch.delete(doc(db, 'emp_lookups', editingUser.empId));
                }

                // B. Update Faculty Record (find by UID)
                const q = query(collection(db, 'faculty'), where('uid', '==', editingUser.id));
                const facSnap = await getDocs(q);
                facSnap.forEach((doc) => {
                    batch.update(doc.ref, {
                        empId: editForm.empId,
                        name: editForm.name // sync name too
                    });
                });

                await batch.commit();
            } else if (editingUser.name !== editForm.name) {
                // Sync Name only if ID didn't change (ID change handles name sync above)
                const q = query(collection(db, 'faculty'), where('uid', '==', editingUser.id));
                const facSnap = await getDocs(q);
                if (!facSnap.empty) {
                    const batch = writeBatch(db);
                    facSnap.forEach((doc) => {
                        batch.update(doc.ref, { name: editForm.name });
                    });
                    await batch.commit();
                }
            }
            toast.success("User updated successfully!");
            setEditingUser(null);
        } catch (error) {
            console.error("Error updating user:", error);
            toast.error("Failed to update user.");
        }
    };

    if (!userProfile || userProfile.role !== 'admin') {
        return <div style={{ color: 'white', padding: '2rem', textAlign: 'center' }}>Access Denied. Admins only.</div>;
    }

    return (
        <div style={{ paddingBottom: '4rem', maxWidth: '1600px', margin: '0 auto' }}>
            <AdminOtpModal
                isOpen={otpModal.isOpen}
                onClose={() => setOtpModal({ ...otpModal, isOpen: false })}
                onVerify={handleVerifyOtp}
                email={userProfile?.email}
                isSending={isVerifying}
            />

            <style>
                {`
                @keyframes pulse-ring {
                    0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.4); }
                    70% { box-shadow: 0 0 0 10px rgba(245, 158, 11, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
                }
                .pulse-card { animation: pulse-ring 2s infinite; }

                .admin-header {
                    margin-bottom: 2rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-end;
                }
                .admin-stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
                    gap: 1.5rem;
                    margin-bottom: 2rem;
                }
                .admin-charts-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
                    gap: 1.5rem;
                    margin-bottom: 3rem;
                }

                @media (max-width: 768px) {
                    .admin-header {
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 1rem;
                    }
                    .admin-charts-grid, .admin-stats-grid {
                        grid-template-columns: 1fr;
                    }
                }
                `}
            </style>

            {/* Header Area */}
            <div className="admin-header">
                <div>
                    <h2 style={{
                        fontSize: '2.2rem', fontWeight: '800', margin: 0,
                        background: 'linear-gradient(to right, #ffffff, #94a3b8)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        letterSpacing: '-1px'
                    }}>
                        Admin Control Center
                    </h2>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '1.1rem', marginTop: '0.5rem' }}>
                        Manage users, permissions, and system health
                    </p>
                </div>

                {/* Tab Navigation */}
                <div className="mobile-scroll-tabs" style={{ display: 'flex', flexWrap: 'nowrap', background: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '12px' }}>
                    <button
                        onClick={() => setActiveTab('dashboard')}
                        style={{
                            padding: '10px 20px',
                            background: activeTab === 'dashboard' ? 'var(--color-accent)' : 'transparent',
                            color: activeTab === 'dashboard' ? 'white' : 'var(--color-text-muted)',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: 600,
                            display: 'flex', alignItems: 'center', gap: '8px',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <ShieldAlert size={18} /> Dashboard
                    </button>
                    <button
                        onClick={() => setActiveTab('suggestions')}
                        style={{
                            padding: '10px 20px',
                            background: activeTab === 'suggestions' ? 'var(--color-accent)' : 'transparent',
                            color: activeTab === 'suggestions' ? 'white' : 'var(--color-text-muted)',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: 600,
                            display: 'flex', alignItems: 'center', gap: '8px',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <MessageSquare size={18} /> Suggestions
                    </button>
                    <button
                        onClick={() => setActiveTab('substitutions')}
                        style={{
                            padding: '10px 20px',
                            background: activeTab === 'substitutions' ? 'var(--color-accent)' : 'transparent',
                            color: activeTab === 'substitutions' ? 'white' : 'var(--color-text-muted)',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: 600,
                            display: 'flex', alignItems: 'center', gap: '8px',
                            transition: 'all 0.2s ease',
                            borderLeft: '1px solid rgba(255,255,255,0.1)'
                        }}
                    >
                        <UserPlus size={18} /> Substitutions
                    </button>
                </div>
            </div>

            { }
            {activeTab === 'substitutions' ? (
                <SubstitutionManager />
            ) : activeTab === 'suggestions' ? ( // eslint-disable-line sonarjs/no-nested-conditional
                /* Suggestions View */
                <div className="glass-panel" style={{ padding: '2rem' }}>
                    <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <MessageSquare size={20} color="#fbbf24" /> User Feedback & Suggestions
                    </h3>

                    {suggestionsLoading ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading suggestions...</div>
                    ) : suggestions.length === 0 ? ( // eslint-disable-line sonarjs/no-nested-conditional
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>No suggestions found.</div>
                    ) : (
                        <div style={{ display: 'grid', gap: '1rem' }}>
                            {suggestions.map(s => (
                                <div key={s.id} style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    padding: '1.5rem',
                                    borderRadius: '12px',
                                    border: '1px solid rgba(255,255,255,0.05)',
                                    display: 'grid',
                                    gridTemplateColumns: '1fr auto',
                                    gap: '1rem'
                                }}>
                                    <div>
                                        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                                            <span style={{
                                                fontSize: '0.75rem',
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                background: 'rgba(59, 130, 246, 0.15)',
                                                color: '#60a5fa',
                                                border: '1px solid rgba(59, 130, 246, 0.3)'
                                            }}>
                                                {s.category}
                                            </span>
                                            <span style={{
                                                fontSize: '0.75rem',
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                background: s.priority === 'High' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.1)',
                                                color: s.priority === 'High' ? '#f87171' : 'var(--color-text-muted)',
                                            }}>
                                                {s.priority} Priority
                                            </span>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                                                by {s.userName} • {s.createdAt?.seconds ? new Date(s.createdAt.seconds * 1000).toLocaleDateString('en-GB') : 'Just now'}
                                            </span>
                                        </div>
                                        <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem' }}>{s.subject}</h4>
                                        <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.95rem', lineHeight: '1.5' }}>{s.description}</p>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: '140px' }}>
                                        <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Status & Actions</label>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <select
                                                value={s.status}
                                                onChange={(e) => updateSuggestionStatus(s.id, e.target.value)}
                                                className="glass-input"
                                                style={{ padding: '0.4rem', fontSize: '0.9rem', flex: 1 }}
                                            >
                                                <option value="New" style={{ background: '#1e293b' }}>New</option>
                                                <option value="In Review" style={{ background: '#1e293b' }}>In Review</option>
                                                <option value="Planned" style={{ background: '#1e293b' }}>Planned</option>
                                                <option value="Implemented" style={{ background: '#1e293b' }}>Implemented</option>
                                                <option value="Closed" style={{ background: '#1e293b' }}>Closed</option>
                                            </select>
                                            <button
                                                onClick={() => deleteSuggestion(s.id)}
                                                className="btn"
                                                style={{
                                                    padding: '0.5rem',
                                                    background: 'rgba(239, 68, 68, 0.15)',
                                                    color: '#ef4444',
                                                    border: '1px solid rgba(239, 68, 68, 0.2)'
                                                }}
                                                title="Delete Suggestion"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                /* Dashboard View START */
                <>

                    {/* 1. Stat Cards Row */}
                    <div className="admin-stats-grid">
                        {/* Total Users */}
                        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                            <div style={{ padding: '1rem', background: 'rgba(59, 130, 246, 0.2)', borderRadius: '12px', color: '#3b82f6' }}>
                                <Users size={32} />
                            </div>
                            <div>
                                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Total Users</div>
                                <div style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{stats.total}</div>
                            </div>
                        </div>

                        {/* Pending Actions - Pulsing if needed */}
                        <div className={`glass-panel ${stats.pending > 0 ? 'pulse-card' : ''}`} style={{
                            padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem',
                            border: stats.pending > 0 ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid var(--glass-border)'
                        }}>
                            <div style={{ padding: '1rem', background: 'rgba(245, 158, 11, 0.2)', borderRadius: '12px', color: '#f59e0b' }}>
                                <UserPlus size={32} />
                            </div>
                            <div>
                                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Pending Approval</div>
                                <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#f59e0b' }}>{stats.pending}</div>
                            </div>
                        </div>

                        {/* Admins */}
                        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                            <div style={{ padding: '1rem', background: 'rgba(139, 92, 246, 0.2)', borderRadius: '12px', color: '#8b5cf6' }}>
                                <Shield size={32} />
                            </div>
                            <div>
                                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Administrators</div>
                                <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#8b5cf6' }}>{stats.admins}</div>
                            </div>
                        </div>

                        {/* Faculty/Active */}
                        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                            <div style={{ padding: '1rem', background: 'rgba(16, 185, 129, 0.2)', borderRadius: '12px', color: '#10b981' }}>
                                <GraduationCap size={32} />
                            </div>
                            <div>
                                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Faculty Users</div>
                                <div style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{stats.faculty}</div>
                            </div>
                        </div>
                    </div>

                    {/* 2. Visualizations Row */}
                    <div className="admin-charts-grid">
                        {/* Realtime System Activity */}
                        <div className="glass-panel" style={{ padding: '1.5rem', minHeight: '350px', position: 'relative', overflow: 'hidden' }}>
                            <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <div style={{ width: '12px', height: '12px', background: '#10b981', borderRadius: '50%', boxShadow: '0 0 10px #10b981' }}></div>
                                        <div style={{ position: 'absolute', width: '100%', height: '100%', border: '1px solid #10b981', borderRadius: '50%', animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite' }}></div>
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Realtime System Activity</h3>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Live usage metrics</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white', lineHeight: 1 }}>{stats.online}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#10b981' }}>Users Online</div>
                                    </div>
                                    <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)' }}></div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white', lineHeight: 1 }}>{stats.totalActiveDevices}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#60a5fa' }}>Active Devices</div>
                                    </div>
                                </div>
                            </div>

                            {/* Online Users List */}
                            <div style={{ padding: '0 0.5rem 1rem 0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                {stats.onlineUsersList?.slice(0, 8).map((u, i) => (
                                    <div key={i} title={`${u.name}\n${u.deviceCount} Devices\n${u.email}`} style={{
                                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                                        padding: '4px 8px 4px 4px', background: 'rgba(255,255,255,0.05)', borderRadius: '20px',
                                        border: '1px solid rgba(255,255,255,0.1)', cursor: 'default'
                                    }}>
                                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#334155', overflow: 'hidden' }}>
                                            {u.photoURL ? <img src={u.photoURL} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <User size={14} style={{ margin: '5px' }} />}
                                        </div>
                                        <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>{u.name.split(' ')[0]}</span>
                                        {u.deviceCount > 1 && <span style={{ fontSize: '0.65rem', background: '#3b82f6', color: 'white', padding: '0 4px', borderRadius: '4px' }}>{u.deviceCount}</span>}
                                    </div>
                                ))}
                                {stats.onlineUsersList?.length > 8 && (
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', padding: '0 0.5rem' }}>
                                        +{stats.onlineUsersList.length - 8} more
                                    </div>
                                )}
                            </div>

                            <div style={{ height: '250px', marginLeft: '-20px' }}>
                                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                    <AreaChart data={realtimeData}>
                                        <defs>
                                            <linearGradient id="colorActivity" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <Tooltip
                                            contentStyle={{ background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', backdropFilter: 'blur(10px)' }}
                                            labelStyle={{ display: 'none' }}
                                            itemStyle={{ color: '#c4b5fd' }}
                                            formatter={(value) => [`${value}%`, 'System Load']}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="value"
                                            stroke="#8b5cf6"
                                            strokeWidth={3}
                                            fillOpacity={1}
                                            fill="url(#colorActivity)"
                                            isAnimationActive={true}
                                            animationDuration={1000}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Status/Role Distribution */}
                        <div className="glass-panel" style={{ padding: '1.5rem', minHeight: '350px' }}>
                            <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Activity size={20} color="#10b981" />
                                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>System Composition</h3>
                            </div>
                            <div style={{ display: 'flex', height: '250px' }}>
                                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                    <PieChart>
                                        <Pie
                                            data={stats.statusData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {stats.statusData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '8px' }} />
                                        <Legend verticalAlign="bottom" />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* 3. Filters & Search */}
                    <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', padding: '0.25rem', borderRadius: '12px' }}>
                            {['all', 'pending', 'approved'].map(type => (
                                <button
                                    key={type}
                                    onClick={() => setFilter(type)}
                                    className="btn"
                                    style={{
                                        background: filter === type ? 'var(--color-accent)' : 'transparent',
                                        color: filter === type ? 'white' : 'var(--color-text-muted)',
                                        padding: '0.5rem 1.25rem',
                                        borderRadius: '8px',
                                        boxShadow: filter === type ? '0 4px 12px rgba(0,0,0,0.2)' : 'none'
                                    }}
                                >
                                    {type.charAt(0).toUpperCase() + type.slice(1)}
                                </button>
                            ))}
                        </div>

                        <div className="glass-panel-static" style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', maxWidth: '300px' }}>
                            <Search size={18} color="var(--color-text-muted)" />
                            <input
                                type="text"
                                placeholder="Search users by name, email, ID..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{ background: 'transparent', border: 'none', color: 'white', flex: 1, outline: 'none' }}
                            />
                        </div>
                    </div>

                    {/* 4. Users Table */}
                    <div className="glass-panel" style={{ overflowX: 'auto', marginBottom: '3rem' }}>
                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                                    <th style={{ padding: '1.25rem', color: 'var(--color-text-muted)', fontWeight: 600, borderBottom: '1px solid var(--glass-border)' }}>User Profile</th>
                                    <th style={{ padding: '1.25rem', color: 'var(--color-text-muted)', fontWeight: 600, borderBottom: '1px solid var(--glass-border)' }}>Emp ID</th>
                                    <th style={{ padding: '1.25rem', color: 'var(--color-text-muted)', fontWeight: 600, borderBottom: '1px solid var(--glass-border)' }}>Status</th>
                                    <th style={{ padding: '1.25rem', color: 'var(--color-text-muted)', fontWeight: 600, borderBottom: '1px solid var(--glass-border)' }}>Role</th>
                                    <th style={{ padding: '1.25rem', color: 'var(--color-text-muted)', fontWeight: 600, borderBottom: '1px solid var(--glass-border)' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="6" style={{ padding: '4rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading Users...</td></tr>
                                ) : filteredUsers.length === 0 ? ( // eslint-disable-line sonarjs/no-nested-conditional
                                    <tr><td colSpan="6" style={{ padding: '4rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>No users found matching your criteria.</td></tr>
                                ) : (
                                    filteredUsers.map(user => (
                                        <tr key={user.id} style={{ transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            <td style={{ padding: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                    <div style={{
                                                        width: '42px', height: '42px', borderRadius: '50%', overflow: 'hidden',
                                                        background: 'linear-gradient(135deg, #1e293b, #0f172a)',
                                                        border: '1px solid var(--glass-border)',
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
                                                    <div>
                                                        <div style={{ fontWeight: 600, color: 'white' }}>{user.name}</div>
                                                        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{user.email || 'No Email'}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ padding: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.03)', color: '#94a3b8' }}>{user.empId}</td>
                                            <td style={{ padding: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                <span style={{
                                                    padding: '0.35rem 0.75rem', borderRadius: '99px', fontSize: '0.8rem', fontWeight: 600,
                                                    background: user.status === 'approved' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(251, 191, 36, 0.15)',
                                                    color: user.status === 'approved' ? '#34d399' : '#fbbf24',
                                                    border: user.status === 'approved' ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(251, 191, 36, 0.2)',
                                                    display: 'inline-flex', alignItems: 'center', gap: '0.25rem'
                                                }}>
                                                    {user.status === 'approved' ? <CheckCircle size={12} /> : <Activity size={12} />}
                                                    {user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                                                </span>
                                            </td>
                                            <td style={{ padding: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                <select
                                                    value={user.role}
                                                    onChange={(e) => handleRoleChange(user.id, e.target.value)}
                                                    className="glass-input"
                                                    style={{ padding: '0.4rem', fontSize: '0.9rem', width: 'auto', background: 'rgba(0,0,0,0.2)', borderColor: 'transparent' }}
                                                >
                                                    <option value="user" style={{ background: '#1e293b', color: 'white' }}>User</option>
                                                    <option value="admin" style={{ background: '#1e293b', color: 'white' }}>Admin</option>
                                                </select>
                                            </td>
                                            <td style={{ padding: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                                    {user.status === 'pending' && (
                                                        <button
                                                            onClick={() => handleStatusChange(user.id, 'approved')}
                                                            className="btn"
                                                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: '#10b981', boxShadow: '0 4px 10px rgba(16, 185, 129, 0.3)' }}
                                                        >
                                                            Approve
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleDeleteUser(user.id)}
                                                        className="btn"
                                                        style={{ padding: '0.4rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', opacity: user.id === userProfile?.uid ? 0.3 : 1 }}
                                                        disabled={user.id === userProfile?.uid}
                                                        title="Delete User"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => openEditModal(user)}
                                                        className="btn"
                                                        style={{ padding: '0.4rem', background: 'rgba(251, 191, 36, 0.1)', color: '#fbbf24' }}
                                                        title="Edit User"
                                                    >
                                                        <Settings size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => setSelectedUser(user)}
                                                        className="btn"
                                                        style={{ padding: '0.4rem', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}
                                                        title="View Details"
                                                    >
                                                        <Search size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="admin-section-divider">
                        <h2 className="section-header" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ padding: '8px', borderRadius: '12px', background: 'rgba(139, 92, 246, 0.1)', color: '#a78bfa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Settings size={24} />
                            </div>
                            System Manager
                        </h2>
                        <div style={{ marginTop: '1rem', background: 'rgba(255,255,255,0.02)', padding: '2rem', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
                            <NotificationManager users={users} />
                        </div>

                        <div style={{ marginTop: '2rem', background: 'rgba(255,255,255,0.02)', padding: '2rem', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
                            <CelebrationManager />
                        </div>
                    </div>
                </>
            )}

            {/* User Details Modal & Confirm Modal */}
            {selectedUser && createPortal(
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999
                }} onClick={() => setSelectedUser(null)}>
                    <div className="glass-panel" style={{ width: '450px', padding: '2.5rem', position: 'relative', border: '1px solid rgba(255,255,255,0.1)' }} onClick={e => e.stopPropagation()}>
                        <button
                            onClick={() => setSelectedUser(null)}
                            style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.5rem' }}
                        >
                            &times;
                        </button>
                        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                            <div style={{
                                width: '120px', height: '120px', borderRadius: '50%', overflow: 'hidden',
                                background: 'var(--color-bg-secondary)', border: '4px solid var(--color-accent)',
                                margin: '0 auto 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
                            }}>
                                {selectedUser.photoURL ? (
                                    <img src={selectedUser.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <span style={{ fontSize: '3rem', fontWeight: 'bold', color: 'var(--color-text-muted)' }}>
                                        {selectedUser.name?.charAt(0)}
                                    </span>
                                )}
                            </div>
                            <h2 style={{ margin: 0, fontSize: '1.8rem' }}>{selectedUser.name}</h2>
                            <span style={{
                                display: 'inline-block', marginTop: '0.5rem', padding: '0.25rem 0.75rem',
                                background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6',
                                borderRadius: '99px', fontSize: '0.9rem', fontWeight: 600
                            }}>
                                {selectedUser.role.toUpperCase()}
                            </span>
                        </div>
                        <div style={{ display: 'grid', gap: '1rem' }}>
                            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px' }}>
                                <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.25rem' }}>EMPLOYEE ID</label>
                                <div style={{ fontSize: '1.1rem', fontWeight: 500 }}>{selectedUser.empId}</div>
                            </div>
                            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px' }}>
                                <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.25rem' }}>EMAIL ADDRESS</label>
                                <div style={{ fontSize: '1.1rem', fontWeight: 500 }}>{selectedUser.email || 'N/A'}</div>
                            </div>
                            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px' }}>
                                <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.25rem' }}>CONTACT</label>
                                <div style={{ fontSize: '1.1rem', fontWeight: 500 }}>{selectedUser.mobile || 'N/A'}</div>
                            </div>
                            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px', borderLeft: selectedUser.status === 'approved' ? '3px solid #10b981' : '3px solid #fbbf24' }}>
                                <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.25rem' }}>ACCOUNT STATUS</label>
                                <div style={{ fontSize: '1.1rem', color: selectedUser.status === 'approved' ? '#6ee7b7' : '#fcd34d', fontWeight: 600 }}>
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
                    onCancel={() => setConfirmModal({ isOpen: false, id: null })}
                    onConfirm={executeDeleteUser}
                    title="Delete User"
                    message="Are you sure you want to PERMANENTLY delete this user? This cannot be undone."
                    isDangerous={true}
                />,
                document.body
            )}

            {/* Edit User Modal */}
            {editingUser && createPortal(
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(5px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
                }} onClick={() => setEditingUser(null)}>
                    <div style={{
                        background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', padding: '2rem',
                        borderRadius: '16px', maxWidth: '500px', width: '90%', position: 'relative',
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
                    }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ marginTop: 0, marginBottom: '1.5rem', fontSize: '1.5rem' }}>Edit User</h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {editingUser.empId && (
                                <div style={{ fontSize: '0.85rem', color: '#fcd34d', background: 'rgba(252, 211, 77, 0.1)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(252, 211, 77, 0.2)' }}>
                                    <span style={{ fontWeight: 'bold' }}>Note:</span> This user is linked to a Faculty record. Please edit their Name or ID in the <strong>Master Data</strong> section to ensure the Schedule is updated correctly.
                                </div>
                            )}

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#94a3b8', fontSize: '0.9rem' }}>Full Name {editingUser.empId ? '(Locked)' : ''}</label>
                                <input
                                    type="text"
                                    value={editForm.name}
                                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                    disabled={!!editingUser.empId}
                                    style={{
                                        width: '100%', padding: '0.75rem', borderRadius: '8px',
                                        background: editingUser.empId ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        color: editingUser.empId ? '#64748b' : 'white',
                                        cursor: editingUser.empId ? 'not-allowed' : 'text'
                                    }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#94a3b8', fontSize: '0.9rem' }}>Employee ID {editingUser.empId ? '(Locked)' : ''}</label>
                                <input
                                    type="text"
                                    value={editForm.empId}
                                    onChange={e => setEditForm({ ...editForm, empId: e.target.value })}
                                    disabled={!!editingUser.empId}
                                    style={{
                                        width: '100%', padding: '0.75rem', borderRadius: '8px',
                                        background: editingUser.empId ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        color: editingUser.empId ? '#64748b' : 'white',
                                        cursor: editingUser.empId ? 'not-allowed' : 'text'
                                    }}
                                />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', color: '#94a3b8', fontSize: '0.9rem' }}>Date of Birth</label>
                                    <input
                                        type="date"
                                        value={editForm.dob}
                                        onChange={e => setEditForm({ ...editForm, dob: e.target.value })}
                                        style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', colorScheme: 'dark' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', color: '#94a3b8', fontSize: '0.9rem' }}>Joining Date</label>
                                    <input
                                        type="date"
                                        value={editForm.joiningDate}
                                        onChange={e => setEditForm({ ...editForm, joiningDate: e.target.value })}
                                        style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', colorScheme: 'dark' }}
                                    />
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
                            <button
                                onClick={() => setEditingUser(null)}
                                style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'white', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveUser}
                                style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', background: '#3b82f6', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};



export default AdminPanel;
