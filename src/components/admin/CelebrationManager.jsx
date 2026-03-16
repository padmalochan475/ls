import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, collection, onSnapshot } from 'firebase/firestore';
import Holidays from 'date-holidays';
import toast from 'react-hot-toast';
import { useWritePermission } from '../../hooks/useWritePermission'; // Import Hook
import { Gift, Calendar, Settings, Pencil, Trash2, Award, Eye, EyeOff, Activity, ChevronRight } from 'lucide-react';

// eslint-disable-next-line sonarjs/cognitive-complexity
const CelebrationManager = () => {
    const [celebrations, setCelebrations] = useState([]);
    const [form, setForm] = useState({ title: '', message: '', startDate: '', endDate: '', theme: 'linear-gradient(135deg, #60a5fa 0%, #2563eb 100%)', iconName: 'Gift' });
    const [isSaving, setIsSaving] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [view, setView] = useState('manage'); // manage, forecast, settings
    const [forecast, setForecast] = useState([]);
    const [config, setConfig] = useState({ masterEnabled: true, systemEnabled: true });

    useEffect(() => {
        getDoc(doc(db, 'settings', 'celebration')).then(s => {
            if (s.exists()) setConfig(s.data());
        });
    }, []);

    const { checkWritePermission } = useWritePermission();

    const toggleSetting = async (key) => {
        // STRICT PERMISSION CHECK
        if (!checkWritePermission()) return;

        const newVal = !config[key];
        const newConfig = { ...config, [key]: newVal };
        setConfig(newConfig);
        try {
            await setDoc(doc(db, 'settings', 'celebration'), newConfig, { merge: true });
            toast.success("Settings updated");
        } catch { toast.error("Failed to save"); }
    };

    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'celebrations'), (snap) => {
            setCelebrations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return unsub;
    }, []);

    // eslint-disable-next-line sonarjs/cognitive-complexity
    useEffect(() => {
        if (view === 'forecast') {
            const events = [];
            const seen = new Set();
            const start = new Date();
            const end = new Date();
            end.setFullYear(start.getFullYear() + 1);
            const hd = new Holidays('IN');

            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const m = d.getMonth();
                const date = d.getDate();
                const year = d.getFullYear();

                let odia = null;
                // Copy-Paste Logic for Forecast
                if (m === 3 && date === 1) odia = "Utkala Dibasa";
                if (m === 2 && date === 20) odia = "Pakhala Dibasa";
                if ((year === 2025 && m === 5 && date === 27) || (year === 2026 && m === 6 && date === 17)) odia = "Ratha Yatra";
                if (m === 5 && date >= 14 && date <= 16) odia = "Raja Parba";
                if ((year === 2025 && m === 7 && date === 29) || (year === 2026 && m === 8 && date === 16)) odia = "Nuakhai";
                if ((year === 2025 && m === 10 && date === 5) || (year === 2026 && m === 10 && date === 24)) odia = "Boita Bandana";

                if (odia) {
                    const key = `${odia}-${year}`;
                    if (!seen.has(key)) { events.push({ title: odia, date: new Date(d), type: 'Odia' }); seen.add(key); }
                }

                const h = hd.isHoliday(d);
                if (h && h[0] && h[0].type === 'public') {
                    const key = `${h[0].name}-${year}`;
                    if (!seen.has(key)) { events.push({ title: h[0].name, date: new Date(d), type: 'Public' }); seen.add(key); }
                }
            }
            setTimeout(() => setForecast(events), 0);
        }
    }, [view]);

    const handleEdit = (c) => {
        setForm({
            title: c.title,
            message: c.message,
            startDate: c.startDate,
            endDate: c.endDate,
            theme: c.theme || 'linear-gradient(135deg, #60a5fa 0%, #2563eb 100%)',
            iconName: c.iconName || 'Gift'
        });
        setEditingId(c.id);
    };

    const handleCancel = () => {
        setEditingId(null);
        setForm({ title: '', message: '', startDate: '', endDate: '', theme: 'linear-gradient(135deg, #60a5fa 0%, #2563eb 100%)', iconName: 'Gift' });
    };

    const handleCreate = async () => {
        // STRICT PERMISSION CHECK
        if (!checkWritePermission()) return;

        if (!form.title || !form.startDate || !form.endDate) return toast.error("Title and Dates are required");
        setIsSaving(true);
        try {
            if (editingId) {
                await updateDoc(doc(db, 'celebrations', editingId), { ...form, updatedAt: new Date() });
                toast.success("Updated!");
                handleCancel();
            } else {
                await addDoc(collection(db, 'celebrations'), { ...form, isActive: true, createdAt: new Date() });
                toast.success("Celebration created!");
                handleCancel();
            }
        } catch (e) {
            console.error(e);
            toast.error("Error: " + e.message);
        }
        setIsSaving(false);
    };

    const handleDelete = async (id) => {
        // STRICT PERMISSION CHECK
        if (!checkWritePermission()) return;

        if (!confirm("Delete this celebration?")) return;
        await deleteDoc(doc(db, 'celebrations', id));
        toast.success("Deleted");
    };

    const themes = [
        { name: 'Galaxy Motion', value: 'theme-galaxy' },
        { name: 'Neon Pulse', value: 'theme-neon' },
        { name: 'Golden Hour', value: 'theme-golden' },
        { name: 'Aurora', value: 'theme-aurora' },
        { name: 'Midnight Frost', value: 'theme-frost' },
        { name: 'Ocean Blue', value: 'linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)' },
        { name: 'Festive Red', value: 'linear-gradient(135deg, #ef4444 0%, #991b1b 100%)' },
        { name: 'Royal Gold', value: 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)' },
        { name: 'Fresh Green', value: 'linear-gradient(135deg, #10b981 0%, #047857 100%)' },
        { name: 'Mystic Purple', value: 'linear-gradient(135deg, #8b5cf6 0%, #4c1d95 100%)' },
        { name: 'Party Pink', value: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)' },
        { name: 'Deep Space', value: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' },
        { name: 'Sunset', value: 'linear-gradient(135deg, #f97316 0%, #c2410c 100%)' }
    ];

    return (
        <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.25rem' }}>
                    <div style={{ padding: '0.5rem', background: 'linear-gradient(135deg, #f472b6 0%, #db2777 100%)', borderRadius: '8px', display: 'flex' }}>
                        <Gift size={20} color="white" />
                    </div>
                    Celebration Engine & Event Manager
                </h3>

                <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '10px' }}>
                    <button
                        onClick={() => setView('manage')}
                        style={{
                            padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                            background: view === 'manage' ? 'rgba(255,255,255,0.1)' : 'transparent', color: view === 'manage' ? 'white' : '#94a3b8',
                            fontSize: '0.85rem', fontWeight: view === 'manage' ? '600' : '400', transition: 'all 0.2s'
                        }}
                    >
                        Manage Custom
                    </button>
                    <button
                        onClick={() => setView('forecast')}
                        style={{
                            padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                            background: view === 'forecast' ? 'rgba(255,255,255,0.1)' : 'transparent', color: view === 'forecast' ? 'white' : '#94a3b8',
                            fontSize: '0.85rem', fontWeight: view === 'forecast' ? '600' : '400', transition: 'all 0.2s', display: 'flex', alignItems: 'center'
                        }}
                    >
                        <Calendar size={14} style={{ marginRight: '6px' }} /> System Forecast
                    </button>
                    <button
                        onClick={() => setView('settings')}
                        style={{
                            padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                            background: view === 'settings' ? 'rgba(255,255,255,0.1)' : 'transparent', color: view === 'settings' ? 'white' : '#94a3b8',
                            fontSize: '0.85rem', fontWeight: view === 'settings' ? '600' : '400', transition: 'all 0.2s', display: 'flex', alignItems: 'center'
                        }}
                    >
                        <Settings size={14} style={{ marginRight: '6px' }} /> Settings
                    </button>
                </div>
            </div>

            {view === 'manage' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))' }}>
                    {/* Left: Create Form */}
                    <div style={{ padding: '2rem', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
                        <h4 style={{ margin: '0 0 1.5rem 0', color: '#94a3b8', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Create New Event</h4>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Event Title</label>
                                <input
                                    placeholder="e.g. Happy Dussehra! 🏹"
                                    className="glass-input"
                                    value={form.title}
                                    onChange={e => setForm({ ...form, title: e.target.value })}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Greeting Message</label>
                                <textarea
                                    placeholder="Warm wishes to convey..."
                                    className="glass-input"
                                    rows={3}
                                    value={form.message}
                                    onChange={e => setForm({ ...form, message: e.target.value })}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', color: '#94a3b8' }}>Start Date</label>
                                    <input
                                        type="date"
                                        className="glass-input"
                                        value={form.startDate}
                                        onChange={e => setForm({ ...form, startDate: e.target.value })}
                                        style={{ colorScheme: 'dark' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', color: '#94a3b8' }}>End Date</label>
                                    <input
                                        type="date"
                                        className="glass-input"
                                        value={form.endDate}
                                        onChange={e => setForm({ ...form, endDate: e.target.value })}
                                        style={{ colorScheme: 'dark' }}
                                    />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.9rem' }}>Select Theme</label>
                                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                    {themes.map(t => (
                                        <div
                                            key={t.name}
                                            className={t.value.startsWith('theme-') ? t.value : ''}
                                            onClick={() => setForm({ ...form, theme: t.value })}
                                            style={{
                                                width: '42px', height: '42px', borderRadius: '10px', background: t.value.startsWith('theme-') ? undefined : t.value,
                                                cursor: 'pointer',
                                                border: form.theme === t.value ? '3px solid white' : '1px solid rgba(255,255,255,0.1)',
                                                boxShadow: form.theme === t.value ? '0 0 15px rgba(255,255,255,0.5)' : 'none',
                                                transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                                                transform: form.theme === t.value ? 'scale(1.2)' : 'scale(1)'
                                            }}
                                            onMouseEnter={e => { if (form.theme !== t.value) e.currentTarget.style.transform = 'scale(1.1)'; }}
                                            onMouseLeave={e => { if (form.theme !== t.value) e.currentTarget.style.transform = 'scale(1)'; }}
                                            title={t.name}
                                        />
                                    ))}
                                </div>
                            </div>

                            <button
                                className="btn btn-primary"
                                onClick={handleCreate}
                                disabled={isSaving}
                                style={{ marginTop: '1rem', background: 'var(--color-accent-gradient)', padding: '1rem', justifyContent: 'center' }}
                            >
                                {isSaving ? <Activity className="spin-animation" size={20} /> : <><Gift size={20} /> {editingId ? 'Update Celebration' : 'Launch Celebration'}</>}
                            </button>
                            {editingId && (
                                <button onClick={handleCancel} style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '12px', color: '#94a3b8', cursor: 'pointer' }}>
                                    Cancel Edit
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Right: Preview & List */}
                    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem', background: 'rgba(0,0,0,0.2)' }}>

                        {/* Live Preview */}
                        <div>
                            <h4 style={{ margin: '0 0 1rem 0', color: '#94a3b8', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                <Settings size={14} style={{ marginRight: '8px', verticalAlign: 'middle' }} /> Live Preview
                            </h4>
                            <div
                                className={form.theme?.startsWith('theme-') ? form.theme : ''}
                                style={{
                                    borderRadius: '16px',
                                    background: form.theme?.startsWith('theme-') ? undefined : form.theme,
                                    padding: '1.5rem',
                                    color: 'white',
                                    boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.3)',
                                    position: 'relative',
                                    overflow: 'hidden',
                                    border: '1px solid rgba(255,255,255,0.2)'
                                }}>
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', position: 'relative', zIndex: 10 }}>
                                    <div style={{ background: 'rgba(255,255,255,0.2)', padding: '0.75rem', borderRadius: '12px', backdropFilter: 'blur(5px)' }}>
                                        <Gift size={24} />
                                    </div>
                                    <div>
                                        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>{form.title || 'Event Title'}</h2>
                                        <p style={{ margin: '0.25rem 0 0 0', opacity: 0.9 }}>{form.message || 'Your custom greeting message will appear here.'}</p>
                                    </div>
                                </div>

                                {/* Mock Confetti/Decoration */}
                                <div style={{ position: 'absolute', top: -10, right: -10, opacity: 0.3, transform: 'rotate(15deg)' }}>
                                    <Gift size={100} />
                                </div>
                            </div>
                            <p style={{ textAlign: 'center', fontSize: '0.8rem', color: '#64748b', marginTop: '0.5rem' }}>
                                *Actual card will include animated confetti effects.
                            </p>
                        </div>

                        {/* Active Events List */}
                        <div style={{ flex: 1 }}>
                            <h4 style={{ margin: '0 0 1rem 0', color: '#94a3b8', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Active Events</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '300px', overflowY: 'auto', paddingRight: '4px' }}>
                                {celebrations.length === 0 && <div style={{ padding: '1rem', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px', color: '#64748b' }}>No active events found.</div>}
                                {celebrations.map(c => (
                                    <div key={c.id} style={{
                                        background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '12px',
                                        border: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                    }}>
                                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                            <div className={c.theme?.startsWith('theme-') ? c.theme : ''} style={{ width: '12px', height: '12px', borderRadius: '50%', background: c.theme?.startsWith('theme-') ? undefined : c.theme }}></div>
                                            <div>
                                                <div style={{ fontWeight: '600', fontSize: '0.95rem' }}>{c.title}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                                                    <Calendar size={12} /> {c.startDate} <ChevronRight size={10} /> {c.endDate}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button
                                                onClick={() => handleEdit(c)}
                                                className="btn-icon-primary"
                                                title="Edit Event"
                                                style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: 'none', padding: '0.5rem', borderRadius: '8px', cursor: 'pointer' }}
                                            >
                                                <Pencil size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(c.id)}
                                                className="btn-icon-danger"
                                                title="Delete Event"
                                                style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'none', padding: '0.5rem', borderRadius: '8px', cursor: 'pointer' }}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ) : view === 'forecast' ? ( // eslint-disable-line sonarjs/no-nested-conditional
                <div style={{ padding: '2rem' }}>
                    <h4 style={{ margin: '0 0 1.5rem 0', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Calendar size={18} /> Upcoming System Events & Festivals (Next 12 Months)
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                        {forecast.length === 0 && <div style={{ color: '#64748b' }}>Calculating forecast...</div>}
                        {forecast.map((ev, i) => (
                            <div key={i} style={{ background: 'rgba(255,255,255,0.03)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                <div style={{ padding: '0.75rem', borderRadius: '10px', background: ev.type === 'Odia' ? 'rgba(236, 72, 153, 0.2)' : 'rgba(59, 130, 246, 0.2)', color: ev.type === 'Odia' ? '#f472b6' : '#3b82f6' }}>
                                    {ev.type === 'Odia' ? <Award size={20} /> : <Calendar size={20} />}
                                </div>
                                <div>
                                    <div style={{ fontWeight: 'bold' }}>{ev.title}</div>
                                    <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '4px' }}>
                                        {ev.date.toDateString()}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: ev.type === 'Odia' ? '#f472b6' : '#3b82f6', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        {ev.type === 'Odia' ? 'Regional Festival' : 'Public Holiday'}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    <div style={{ padding: '2rem', background: 'rgba(255,255,255,0.03)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <h4 style={{ margin: '0 0 1rem 0', color: '#94a3b8', fontSize: '1rem' }}>Global Engine Configuration</h4>
                        <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '2rem' }}>
                            Control the behavior of the Celebration Engine. These settings apply to all users immediately.
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {/* Master Switch */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '4px' }}>
                                        <div style={{ padding: '6px', borderRadius: '6px', background: config.masterEnabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)', color: config.masterEnabled ? '#10b981' : '#ef4444' }}>
                                            {config.masterEnabled ? <Eye size={18} /> : <EyeOff size={18} />}
                                        </div>
                                        <span style={{ fontSize: '1.1rem', fontWeight: '500' }}>Master Engine Status</span>
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                        {config.masterEnabled ? 'Engine is ACTIVE. Cards will be shown.' : 'Engine is DISABLED. No celebration cards will be shown to anyone.'}
                                    </div>
                                </div>
                                <button
                                    onClick={() => toggleSetting('masterEnabled')}
                                    style={{
                                        padding: '0.5rem 1rem', borderRadius: '8px',
                                        background: config.masterEnabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.1)',
                                        border: config.masterEnabled ? '1px solid #10b981' : '1px solid #94a3b8',
                                        color: config.masterEnabled ? '#10b981' : '#94a3b8',
                                        cursor: 'pointer', fontWeight: 'bold'
                                    }}
                                >
                                    {config.masterEnabled ? 'ENABLED' : 'DISABLED'}
                                </button>
                            </div>

                            <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)' }}></div>

                            {/* System Switch */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: !config.masterEnabled ? 0.5 : 1, pointerEvents: !config.masterEnabled ? 'none' : 'auto' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '4px' }}>
                                        <div style={{ padding: '6px', borderRadius: '6px', background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6' }}>
                                            <Calendar size={18} />
                                        </div>
                                        <span style={{ fontSize: '1.1rem', fontWeight: '500' }}>Automatic System Events</span>
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                        Includes Public Holidays (Diwali, Christmas) and Regional Festivals (Odia festivals).
                                        <br />Status: <strong>{config.systemEnabled ? 'Active' : 'Muted'}</strong>
                                    </div>
                                </div>
                                <button
                                    onClick={() => toggleSetting('systemEnabled')}
                                    style={{
                                        padding: '0.5rem 1rem', borderRadius: '8px',
                                        background: config.systemEnabled ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.1)',
                                        border: config.systemEnabled ? '1px solid #3b82f6' : '1px solid #94a3b8',
                                        color: config.systemEnabled ? '#3b82f6' : '#94a3b8',
                                        cursor: 'pointer', fontWeight: 'bold'
                                    }}
                                >
                                    {config.systemEnabled ? 'ENABLED' : 'MUTED'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CelebrationManager;
