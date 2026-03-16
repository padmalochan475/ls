import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import OneSignal from 'react-onesignal';
import toast from 'react-hot-toast';
import { sendNotification } from '../../utils/notificationUtils';
import { Settings, Clock, AlertCircle, Calendar, Activity, Save, CheckCircle, XCircle, Bell, Megaphone, User, ChevronDown, Send } from 'lucide-react';

const NotificationManager = ({ users }) => {
    const { currentUser } = useAuth();
    const [settings, setSettings] = useState({ firstWarning: 15, secondWarning: 5, holidayTime: '09:00' });
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);

    // Manual Notification State
    const [targetUser, setTargetUser] = useState('all');
    const [notifTitle, setNotifTitle] = useState('');
    const [notifBody, setNotifBody] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    useEffect(() => {
        const fetchSettings = async () => {
            const docRef = doc(db, 'settings', 'notifications');
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                const data = snap.data();
                setSettings({
                    firstWarning: data.firstWarning || 15,
                    secondWarning: data.secondWarning || 5,
                    holidayTime: data.holidayTime || '09:00'
                });
            }
        };
        fetchSettings();
    }, []);

    const saveSettings = async () => {
        setIsSaving(true);
        setSaveMessage(null);
        try {
            await setDoc(doc(db, 'settings', 'notifications'), {
                firstWarning: parseInt(settings.firstWarning),
                secondWarning: parseInt(settings.secondWarning),
                holidayTime: settings.holidayTime
            });
            setSaveMessage({ type: 'success', text: 'Settings updated successfully!' });

            // Auto-hide after 3 seconds
            setTimeout(() => setSaveMessage(null), 3000);
        } catch (e) {
            console.error("Error saving settings:", e);
            setSaveMessage({ type: 'error', text: 'Failed to save settings.' });
        }
        setIsSaving(false);
    };

    const sendManualNotification = async () => {
        if (!notifTitle || !notifBody) {
            alert("Please provide a title and body.");
            return;
        }

        setIsSending(true);
        try {
            // Determine Targets
            let targetUids = [];
            if (targetUser === 'all') {
                targetUids = users.map(u => u.id).filter(Boolean);
            } else {
                // Try to find by ID (default behavior of select)
                const found = users.find(u => u.id === targetUser || u.empId === targetUser);
                if (found && found.id) targetUids = [found.id];
            }

            if (currentUser && OneSignal) {
                // Ensure sender is logged in (optional sanity check)
                OneSignal.login(currentUser.uid);
            }

            const result = await sendNotification({
                userIds: targetUids,
                title: notifTitle,
                body: notifBody,
                type: 'manual',
                data: { type: 'manual_alert', group: 'Manual' }
            });

            if (result.success) {
                toast.success(`Delivered to ${result.count} users successfully.`);
            } else {
                toast.error("Failed: " + result.message);
            }

            setNotifTitle('');
            setNotifBody('');
        } catch (e) {
            console.error("Error sending notification:", e);
            alert(`Failed: ${e.message}`);
        }
        setIsSending(false);
    };

    return (
        <div className="notification-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
            {/* Settings Card */}
            <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem' }}>
                    <div style={{ padding: '0.5rem', background: 'rgba(59, 130, 246, 0.2)', borderRadius: '8px', color: '#3b82f6' }}>
                        <Settings size={20} />
                    </div>
                    <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Notification Settings</h3>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1.5rem' }}>

                    {/* First Warning */}
                    <div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
                            <Clock size={14} /> First Warning
                        </label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type="number"
                                className="glass-input"
                                style={{ paddingRight: '2.5rem' }}
                                value={settings.firstWarning}
                                onChange={e => setSettings({ ...settings, firstWarning: e.target.value })}
                            />
                            <span style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>min</span>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>Alert {settings.firstWarning} mins before</p>
                    </div>

                    {/* Second Warning */}
                    <div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
                            <AlertCircle size={14} /> Second Warning
                        </label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type="number"
                                className="glass-input"
                                style={{ paddingRight: '2.5rem' }}
                                value={settings.secondWarning}
                                onChange={e => setSettings({ ...settings, secondWarning: e.target.value })}
                            />
                            <span style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>min</span>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>Alert {settings.secondWarning} mins before</p>
                    </div>

                    {/* Holiday Alert */}
                    <div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
                            <Calendar size={14} /> Holiday Alert
                        </label>
                        <input
                            type="time"
                            className="glass-input"
                            value={settings.holidayTime || '09:00'}
                            onChange={e => setSettings({ ...settings, holidayTime: e.target.value })}
                            style={{ colorScheme: 'dark' }}
                        />
                        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>Send msg at this time</p>
                    </div>
                </div>

                <div style={{ marginTop: 'auto' }}>
                    <button
                        onClick={saveSettings}
                        disabled={isSaving}
                        className="btn btn-primary"
                        style={{ width: '100%', justifyContent: 'center', background: 'var(--color-accent-gradient)' }}
                    >
                        {isSaving ? <Activity className="spin-animation" size={18} /> : <Save size={18} />}
                        {isSaving ? 'Saving Changes...' : 'Update Configuration'}
                    </button>
                    {saveMessage && (
                        <div style={{
                            marginTop: '1rem', padding: '0.75rem', borderRadius: '8px',
                            background: saveMessage.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            border: saveMessage.type === 'success' ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
                            color: saveMessage.type === 'success' ? '#34d399' : '#f87171',
                            display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', fontSize: '0.9rem'
                        }}>
                            {saveMessage.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
                            {saveMessage.text}
                        </div>
                    )}
                </div>
            </div>

            {/* Manual Notification Card */}
            <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem' }}>
                    <div style={{ padding: '0.5rem', background: 'rgba(139, 92, 246, 0.2)', borderRadius: '8px', color: '#8b5cf6' }}>
                        <Bell size={20} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Send Manual Notification</h3>
                    </div>
                    <button
                        onClick={async () => {
                            try {
                                const pid = OneSignal.User.PushSubscription.id;
                                const eid = OneSignal.User.externalId;
                                const optedIn = OneSignal.User.PushSubscription.optedIn;
                                const perm = Notification.permission;
                                const currentUid = currentUser?.uid;

                                let statusMsg = `DIAGNOSTIC INFO:\n\nPermission: ${perm}\nOpted In: ${optedIn}\nPlayer ID: ${pid ? 'Found' : 'MISSING'}\nLinked User ID: ${eid || 'NONE (Anonymous)'}`;

                                if (eid === currentUid) {
                                    alert(statusMsg + "\n\n✅ EXCELLENT: Device is perfectly linked.");
                                } else {
                                    if (confirm(statusMsg + "\n\n❌ ISSUE: Device not linked to User.\n\nClick OK to FORCE REPAIR.")) {
                                        await OneSignal.logout();
                                        await OneSignal.login(currentUid);
                                        toast.success("Repaired Link!");
                                        alert("Repair command sent. Please check Visual Confirmation.");
                                    }
                                }
                            } catch (e) { alert("OneSignal Error: " + e.message); }
                        }}
                        style={{ padding: '6px 12px', fontSize: '0.75rem', background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#60a5fa', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                    >
                        Check & Fix Connection
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>Target Audience</label>
                        <div style={{ position: 'relative' }}>
                            <div
                                className="glass-input"
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1rem' }}
                            >
                                {targetUser === 'all' ? (
                                    <><Megaphone size={16} color="#fbbf24" style={{ flexShrink: 0 }} /> All Users</>
                                ) : (
                                    <>
                                        <User size={16} color="#60a5fa" style={{ flexShrink: 0 }} />
                                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {users.find(u => (u.empId || u.id) === targetUser)?.name || 'Select User'}
                                        </span>
                                    </>
                                )}
                                <ChevronDown size={16} style={{ marginLeft: 'auto', opacity: 0.7 }} />
                            </div>

                            {isDropdownOpen && (
                                <div className="glass-panel" style={{
                                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                                    marginTop: '0.5rem', padding: '0.5rem', maxHeight: '250px', overflowY: 'auto',
                                    background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 10px 40px rgba(0,0,0,0.5)'
                                }}>
                                    <div
                                        onClick={() => { setTargetUser('all'); setIsDropdownOpen(false); }}
                                        style={{ padding: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', borderRadius: '8px', background: targetUser === 'all' ? 'rgba(255,255,255,0.05)' : 'transparent', marginBottom: '0.5rem' }}
                                    >
                                        <div style={{ padding: '6px', background: 'rgba(251, 191, 36, 0.1)', borderRadius: '6px' }}><Megaphone size={14} color="#fbbf24" /></div>
                                        <span>All Users</span>
                                    </div>

                                    {users.map(u => {
                                        const deviceCount = (u.oneSignalIds?.length) || (u.oneSignalId ? 1 : 0);
                                        return (
                                            <div
                                                key={u.id}
                                                onClick={() => { setTargetUser(u.empId || u.id); setIsDropdownOpen(false); }}
                                                style={{ padding: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', borderRadius: '8px', marginTop: '4px', background: targetUser === (u.empId || u.id) ? 'rgba(255,255,255,0.05)' : 'transparent' }}
                                            >
                                                <div style={{ position: 'relative', padding: '6px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '6px' }}>
                                                    <User size={14} color="#60a5fa" />
                                                    {deviceCount > 1 && (
                                                        <span style={{ position: 'absolute', top: -5, right: -5, background: '#10b981', color: 'white', fontSize: '0.6rem', padding: '1px 4px', borderRadius: '4px' }}>
                                                            {deviceCount}
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span style={{ fontWeight: 500 }}>{u.name}</span>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                                        {u.role || 'User'} • {deviceCount} Active Device{deviceCount !== 1 ? 's' : ''}
                                                    </span>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>Message Content</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <input
                                type="text"
                                placeholder="Reason / Title (e.g. Schedule Change)"
                                className="glass-input"
                                value={notifTitle}
                                onChange={e => setNotifTitle(e.target.value)}
                            />
                            <textarea
                                placeholder="Detailed message..."
                                className="glass-input"
                                rows={3}
                                value={notifBody}
                                onChange={e => setNotifBody(e.target.value)}
                                style={{ resize: 'none' }}
                            />
                        </div>
                    </div>

                    <button
                        onClick={sendManualNotification}
                        disabled={isSending}
                        className="btn btn-primary"
                        style={{
                            width: '100%', justifyContent: 'center', marginTop: '0.5rem',
                            background: 'linear-gradient(135deg, #8b5cf6, #d946ef)',
                            boxShadow: '0 4px 15px rgba(139, 92, 246, 0.4)'
                        }}
                    >
                        {isSending ? <Activity className="spin-animation" size={18} /> : <Send size={18} />}
                        {isSending ? 'Sending...' : 'Broadcast Message'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NotificationManager;
