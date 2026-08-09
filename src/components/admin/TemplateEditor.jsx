import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { Save, Activity, LayoutTemplate, MessageSquare, Bell } from 'lucide-react';

const defaultTemplates = {
    birthday_wa: "🎂 *Happy Birthday, {name}!* 🎂\n\nOn behalf of the entire college, we wish you a fantastic day filled with joy and a year ahead full of success and happiness. Keep inspiring! ✨\n\n_Best Wishes,_\n*LAMS Administration*",
    anniversary_wa: "🎊 *Work Anniversary Celebration* 🎊\n\nCongratulations *{name}* on completing *{years}* with our institution! 🏫\n\nThank you for your dedication, hard work, and the positive impact you've made. We are proud to have you on our team!\n\n_Warm Regards,_\n*College Management*",
    holiday_push_title: "🎉 Holiday Alert",
    holiday_push_body: "Today is {holiday_name}. No classes today. Enjoy!",
    holiday_wa: "🎉 *LAMS Holiday Alert* 🎉\n\nToday is *{holiday_name}*.\nNo classes today. Enjoy!\n\n_System Admin_",
    warn1_push_title: "Upcoming Class",
    warn1_push_body: "🔔 Heads Up: {subject} ({group}) starts in {mins} mins at Room {room}.",
    warn1_wa: "🔔 *Upcoming* 🔔\n\n🔔 Heads Up: {subject} ({group}) starts in {mins} mins at Room {room}.",
    warn2_push_title: "Class Starting!",
    warn2_push_body: "🚀 ACTION: Run to Room {room}! {subject} ({group}) is starting NOW!",
    warn2_wa: "🚀 *Now* 🚀\n\n🚀 ACTION: Run to Room {room}! {subject} ({group}) is starting NOW!",
    weekly_header: "🗓️ *Weekly Preview for {name}* 🗓️\n\nPrep for the upcoming week! You have *{total_sessions} sessions* scheduled.\n\n",
    weekly_footer: "\n🌐 _Check the portal for full timetable._\nGood luck for the week! 💪",
    morning_header: "📅 *Today's Briefing: {name}* 📅\nDay: *{day}* | Classes: *{total_classes}*\n\n",
    morning_footer: "Have a productive day! ✨\n_LAMS Admin_",
    sys_sub_req: "🔄 *Substitution Request* 🔄\n\nHello *{name}*,\nYou have received a new substitution request from *{requesterName}*.\n\n📝 *Details*:\nClass: {subject} ({group})\nRoom: {room}\nWhen: {date} at {time}\n\n👉 _Log in to the portal to Accept or Reject._",
    sys_sub_app: "✅ *Substitution Approved* ✅\n\nGood news *{name}*,\nYour substitution for *{subject}* on {date} has been *Approved*.\n\n📅 *Covered By*: {subName}\n\n_System Admin_",
    sys_sub_rej: "❌ *Substitution Request Status* ❌\n\nHello *{name}*,\nA substitution request for *{subject}* on {date} has been *Rejected* or cancelled.\n\nℹ️ *Info*: Please log in to check the status.",
    sys_sub_acc: "🎉 *Substitution Request Confirmed* 🎉\n\nHello *{name}*,\nYour request for *{subject}* on {date} has been *Accepted* by *{subName}*.\n\n_System Admin_",
    sys_sub_can: "⚠️ *Substitution Cancelled* ⚠️\n\nHello *{name}*,\nA previously requested substitution for *{subject}* on {date} has been *Cancelled*.\n\nℹ️ *Info*: You are expected to take this class.",
    sys_acc_app: "👋 *Welcome to LAMS, {name}!* 🎉\n\nYour account has been *Approved* by the Administrator.\n\nYou can now log in and manage your classes, labs, and substitutions.\n\n🌐 _https://lams.vercel.app_",
    obs_sub_app: "🚨 *Admin Alert: Leave Covered* 🚨\n\n*{requesterName}* is on leave on {date}.\n*{subName}* will be taking the {subject} class for ({group}).",
    obs_sub_can: "⚠️ *Admin Alert: Sub Cancelled* ⚠️\n\nA substitution arrangement for {subject} on {date} was cancelled.",
    obs_bday: "🎉 *Admin Alert: Birthday Today!* 🎉\n\nToday is *{name}'s* birthday! Be sure to wish them!",
    obs_anni: "🎊 *Admin Alert: Work Anniversary!* 🎊\n\n*{name}* is celebrating {years} years with us today!"
};

const TemplateEditor = () => {
    const [templates, setTemplates] = useState(defaultTemplates);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('warnings'); // warnings, greetings, summary, holiday

    useEffect(() => {
        const fetchTemplates = async () => {
            try {
                const docRef = doc(db, 'settings', 'templates');
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    setTemplates(prev => ({ ...prev, ...snap.data() }));
                }
            } catch (err) {
                console.error("Failed to load templates:", err);
            }
        };
        fetchTemplates();
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await setDoc(doc(db, 'settings', 'templates'), templates);
            toast.success("Templates saved successfully!");
        } catch (err) {
            console.error(err);
            toast.error("Failed to save templates.");
        }
        setIsSaving(false);
    };

    const handleChange = (key, value) => {
        setTemplates(prev => ({ ...prev, [key]: value }));
    };

    const renderInput = (key, label, type = 'textarea', rows = 3) => (
        <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
                {type === 'text' ? <Bell size={14} /> : <MessageSquare size={14} />} {label}
            </label>
            {type === 'text' ? (
                <input
                    type="text"
                    className="glass-input"
                    value={templates[key] || defaultTemplates[key] || ''}
                    onChange={(e) => handleChange(key, e.target.value)}
                />
            ) : (
                <textarea
                    className="glass-input"
                    rows={rows}
                    value={templates[key] || defaultTemplates[key] || ''}
                    onChange={(e) => handleChange(key, e.target.value)}
                    style={{ resize: 'vertical' }}
                />
            )}
        </div>
    );

    return (
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ padding: '0.5rem', background: 'rgba(236, 72, 153, 0.2)', borderRadius: '8px', color: '#ec4899' }}>
                        <LayoutTemplate size={20} />
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Message Templates Editor</h3>
                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>Customize all automated WhatsApp and Push messages.</div>
                    </div>
                </div>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="btn btn-primary"
                    style={{ background: 'linear-gradient(135deg, #ec4899, #8b5cf6)' }}
                >
                    {isSaving ? <Activity className="spin-animation" size={16} /> : <Save size={16} />}
                    Save Templates
                </button>
            </div>

            {/* No-Code User Help Box */}
            <div style={{ 
                background: 'rgba(59, 130, 246, 0.1)', 
                border: '1px solid rgba(59, 130, 246, 0.3)', 
                borderRadius: '8px', 
                padding: '1.25rem', 
                display: 'flex', 
                gap: '1rem',
                alignItems: 'flex-start'
            }}>
                <div style={{ padding: '0.5rem', background: 'rgba(59, 130, 246, 0.2)', borderRadius: '50%', color: '#60a5fa' }}>
                    <MessageSquare size={20} />
                </div>
                <div style={{ width: '100%' }}>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: '#60a5fa', fontSize: '1.05rem' }}>How to edit these messages? (For No-Code Admins)</h4>
                    <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: '#cbd5e1', lineHeight: '1.5' }}>
                        Simply type your message in the boxes below! The words wrapped in curly braces like <strong style={{ color: '#fbbf24' }}>{'{room}'}</strong> are magic placeholders. When the system sends the message, it automatically replaces them with the real data (e.g., L10).
                    </p>
                    
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <h5 style={{ margin: '0 0 0.75rem 0', color: '#94a3b8', fontSize: '0.85rem', textTransform: 'uppercase' }}>Available Placeholders by Category:</h5>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', fontSize: '0.85rem' }}>
                            <div>
                                <strong style={{ color: '#e2e8f0', display: 'block', marginBottom: '4px' }}>⚠️ Class Warnings:</strong>
                                <span style={{ color: '#fbbf24' }}>{'{subject}'}, {'{room}'}, {'{group}'}, {'{mins}'}</span>
                            </div>
                            <div>
                                <strong style={{ color: '#e2e8f0', display: 'block', marginBottom: '4px' }}>🎉 Greetings:</strong>
                                <span style={{ color: '#fbbf24' }}>{'{name}'}, {'{years}'}</span> <span style={{color: '#64748b'}}>(for anniversary)</span>
                            </div>
                            <div>
                                <strong style={{ color: '#e2e8f0', display: 'block', marginBottom: '4px' }}>📊 Summaries:</strong>
                                <span style={{ color: '#fbbf24' }}>{'{day}'}, {'{total_classes}'}, {'{total_sessions}'}</span>
                            </div>
                            <div>
                                <strong style={{ color: '#e2e8f0', display: 'block', marginBottom: '4px' }}>🏖️ Holidays:</strong>
                                <span style={{ color: '#fbbf24' }}>{'{holiday_name}'}</span>
                            </div>
                            <div>
                                <strong style={{ color: '#e2e8f0', display: 'block', marginBottom: '4px' }}>⚙️ System & Subs:</strong>
                                <span style={{ color: '#fbbf24' }}>{'{name}'}, {'{requesterName}'}, {'{subName}'}, {'{subject}'}, {'{date}'}, {'{day}'}, {'{time}'}, {'{group}'}, {'{room}'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem', overflowX: 'auto' }}>
                {['warnings', 'greetings', 'summary', 'holiday', 'system', 'observers'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                            padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer',
                            background: activeTab === tab ? 'rgba(255,255,255,0.1)' : 'transparent',
                            color: activeTab === tab ? 'white' : 'var(--color-text-muted)',
                            fontWeight: activeTab === tab ? 600 : 400, textTransform: 'capitalize', whiteSpace: 'nowrap'
                        }}
                    >
                        {tab === 'system' ? 'System & Subs' : tab}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {activeTab === 'warnings' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '12px' }}>
                            <h4 style={{ marginTop: 0, color: '#f59e0b' }}>First Warning (e.g., 15 Mins)</h4>
                            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>Vars: {'{subject}'}, {'{group}'}, {'{room}'}, {'{mins}'}</p>
                            {renderInput('warn1_push_title', 'Push Title', 'text')}
                            {renderInput('warn1_push_body', 'Push Body', 'textarea', 2)}
                            {renderInput('warn1_wa', 'WhatsApp Message', 'textarea', 4)}
                        </div>
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '12px' }}>
                            <h4 style={{ marginTop: 0, color: '#ef4444' }}>Second Warning (e.g., 5 Mins)</h4>
                            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>Vars: {'{subject}'}, {'{group}'}, {'{room}'}, {'{mins}'}</p>
                            {renderInput('warn2_push_title', 'Push Title', 'text')}
                            {renderInput('warn2_push_body', 'Push Body', 'textarea', 2)}
                            {renderInput('warn2_wa', 'WhatsApp Message', 'textarea', 4)}
                        </div>
                    </div>
                )}

                {activeTab === 'greetings' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '12px' }}>
                            <h4 style={{ marginTop: 0, color: '#10b981' }}>Birthday Message (WhatsApp)</h4>
                            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>Vars: {'{name}'}</p>
                            {renderInput('birthday_wa', 'Message', 'textarea', 6)}
                        </div>
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '12px' }}>
                            <h4 style={{ marginTop: 0, color: '#3b82f6' }}>Work Anniversary (WhatsApp)</h4>
                            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>Vars: {'{name}'}, {'{years}'}</p>
                            {renderInput('anniversary_wa', 'Message', 'textarea', 6)}
                        </div>
                    </div>
                )}

                {activeTab === 'summary' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '12px' }}>
                            <h4 style={{ marginTop: 0, color: '#8b5cf6' }}>Morning Summary (WhatsApp)</h4>
                            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>Header Vars: {'{name}'}, {'{day}'}, {'{total_classes}'}</p>
                            {renderInput('morning_header', 'Header Text', 'textarea', 3)}
                            {renderInput('morning_footer', 'Footer Text', 'textarea', 2)}
                        </div>
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '12px' }}>
                            <h4 style={{ marginTop: 0, color: '#6366f1' }}>Weekly Preview (Sun 7 PM)</h4>
                            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>Header Vars: {'{name}'}, {'{total_sessions}'}</p>
                            {renderInput('weekly_header', 'Header Text', 'textarea', 3)}
                            {renderInput('weekly_footer', 'Footer Text', 'textarea', 2)}
                        </div>
                    </div>
                )}

                {activeTab === 'holiday' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '12px', maxWidth: '600px' }}>
                            <h4 style={{ marginTop: 0, color: '#f43f5e' }}>Holiday Alert</h4>
                            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>Vars: {'{holiday_name}'}</p>
                            {renderInput('holiday_push_title', 'Push Title', 'text')}
                            {renderInput('holiday_push_body', 'Push Body', 'textarea', 2)}
                            {renderInput('holiday_wa', 'WhatsApp Message', 'textarea', 4)}
                        </div>
                    </div>
                )}

                {activeTab === 'system' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '12px' }}>
                            <h4 style={{ marginTop: 0, color: '#fcd34d' }}>Substitution Request</h4>
                            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>Vars: {'{name}'}, {'{requesterName}'}, {'{subject}'}, {'{date}'}, {'{time}'}, {'{room}'}, {'{group}'}</p>
                            {renderInput('sys_sub_req', 'Message', 'textarea', 5)}
                        </div>
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '12px' }}>
                            <h4 style={{ marginTop: 0, color: '#34d399' }}>Substitution Approved</h4>
                            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>Vars: {'{name}'}, {'{subName}'}, {'{subject}'}, {'{date}'}</p>
                            {renderInput('sys_sub_app', 'Message', 'textarea', 5)}
                        </div>
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '12px' }}>
                            <h4 style={{ marginTop: 0, color: '#f87171' }}>Substitution Rejected</h4>
                            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>Vars: {'{name}'}, {'{subject}'}, {'{date}'}</p>
                            {renderInput('sys_sub_rej', 'Message', 'textarea', 5)}
                        </div>
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '12px' }}>
                            <h4 style={{ marginTop: 0, color: '#60a5fa' }}>Substitution Accepted</h4>
                            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>Vars: {'{name}'}, {'{subName}'}, {'{subject}'}, {'{date}'}</p>
                            {renderInput('sys_sub_acc', 'Message', 'textarea', 5)}
                        </div>
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '12px' }}>
                            <h4 style={{ marginTop: 0, color: '#fb923c' }}>Substitution Cancelled</h4>
                            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>Vars: {'{name}'}, {'{subject}'}, {'{date}'}</p>
                            {renderInput('sys_sub_can', 'Message', 'textarea', 5)}
                        </div>
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '12px' }}>
                            <h4 style={{ marginTop: 0, color: '#c084fc' }}>Account Approved</h4>
                            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>Vars: {'{name}'}</p>
                            {renderInput('sys_acc_app', 'Message', 'textarea', 5)}
                        </div>
                    </div>
                )}

                {activeTab === 'observers' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
                        <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.1)', padding: '1.5rem', borderRadius: '12px' }}>
                            <h4 style={{ marginTop: 0, color: '#f87171' }}>Observer: Sub Approved</h4>
                            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>Vars: {'{requesterName}'}, {'{subName}'}, {'{subject}'}, {'{date}'}, {'{day}'}, {'{group}'}, {'{time}'}, {'{room}'}</p>
                            {renderInput('obs_sub_app', 'WhatsApp Broadcast', 'textarea', 5)}
                        </div>
                        <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.1)', padding: '1.5rem', borderRadius: '12px' }}>
                            <h4 style={{ marginTop: 0, color: '#fb923c' }}>Observer: Sub Cancelled</h4>
                            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>Vars: {'{subject}'}, {'{date}'}, {'{day}'}, {'{time}'}, {'{room}'}</p>
                            {renderInput('obs_sub_can', 'WhatsApp Broadcast', 'textarea', 5)}
                        </div>
                        <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.1)', padding: '1.5rem', borderRadius: '12px' }}>
                            <h4 style={{ marginTop: 0, color: '#60a5fa' }}>Observer: Birthday</h4>
                            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>Vars: {'{name}'}</p>
                            {renderInput('obs_bday', 'WhatsApp Broadcast', 'textarea', 4)}
                        </div>
                        <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.1)', padding: '1.5rem', borderRadius: '12px' }}>
                            <h4 style={{ marginTop: 0, color: '#a78bfa' }}>Observer: Anniversary</h4>
                            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>Vars: {'{name}'}, {'{years}'}</p>
                            {renderInput('obs_anni', 'WhatsApp Broadcast', 'textarea', 4)}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TemplateEditor;
