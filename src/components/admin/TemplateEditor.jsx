import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { Save, Activity, LayoutTemplate, MessageSquare, Bell } from 'lucide-react';

const defaultTemplates = {
    birthday_wa: "🎂 *HAPPY BIRTHDAY, {name}!* 🎂\n\nWishing you a fantastic day filled with joy, and a year ahead full of success and happiness! Keep inspiring! ✨🥂\n\n~ *LAMS Admin*",
    anniversary_wa: "🎊 *HAPPY WORK ANNIVERSARY!* 🎊\n\nCongratulations, *{name}*, on completing *{years}* with our institution! 🏫\n\nThank you for your incredible dedication and hard work. We are so proud to have you on our team! 🌟\n\n~ *College Management*",
    holiday_push_title: "🎉 Holiday Alert",
    holiday_push_body: "Today is {holiday_name}. No classes today. Enjoy!",
    holiday_wa: "🏝️ *HAPPY HOLIDAY!* 🏝️\n\nWishing everyone a wonderful *{holiday_name}*! 🎉\nHave a great time!\n\n~ *LAMS Admin*",
    warn1_push_title: "Upcoming Class",
    warn1_push_body: "🔔 Heads Up: {subject} ({group}) starts in {mins} mins at Room {room}.",
    warn1_wa: "🔔 *UPCOMING CLASS* 🔔\n\n📌 *{subject}* ({group})\n⏰ _Starts in:_ *{mins} mins*\n🏫 _Room:_ *{room}*",
    warn2_push_title: "Class Starting!",
    warn2_push_body: "🚀 ACTION: Run to Room {room}! {subject} ({group}) is starting NOW!",
    warn2_wa: "🚀 *CLASS STARTING NOW!* 🚀\n\n🚨 _ACTION REQUIRED:_ Run to *Room {room}!*\n\n📌 *{subject}* ({group}) is starting *NOW!*",
    weekly_header: "🗓️ *WEEKLY PREVIEW: {name}* 🗓️\n\n🎯 _Prep for the upcoming week!_\nYou have *{total_sessions} sessions* scheduled.\n\n",
    weekly_class_line: "🔹 *[{idx}]* ⏰ _{time}_\n 📌 *{subject}* ({group}){roomStr}{semStr}{cofacStr}{subStr}\n",
    weekly_footer: "\n🌐 _Check the portal for full timetable._\nGood luck for the week! 💪",
    morning_header: "✨ *GOOD MORNING, {name}!* ✨\n🗓️ _{day}_ | 📚 *{total_classes} Classes Today*\n\n",
    morning_class_line: "🔹 *[{idx}]* ⏰ _{time}_\n 📌 *{subject}* ({group}){roomStr}{semStr}{cofacStr}{subStr}\n",
    morning_footer: "\n💡 _Have a highly productive day!_\n~ *LAMS Admin*",
    sys_sub_req: "🔄 *NEW SUBSTITUTION REQUEST* 🔄\n\nHello *{name}*,\nYou have received a new substitution request from *{requesterName}*!\n\n📝 *Details*:\nClass: {subject} ({group})\nRoom: {room}\nWhen: *{day}*, {date} at {time}\n\n👉 _Please log in to the portal to Accept or Reject._",
    sys_sub_app: "✅ *SUBSTITUTION APPROVED!* ✅\n\nGreat news, *{name}*!\nYour substitution request for *{subject}* on *{day}*, {date} has been *officially approved*.\n\n📅 *Covered By*: {subName}\n\n~ *LAMS Admin*",
    sys_sub_rej: "❌ *SUBSTITUTION DECLINED* ❌\n\nHello *{name}*,\nUnfortunately, your substitution request for *{subject}* on *{day}*, {date} has been *declined* or cancelled.\n\nℹ️ *Info*: Please log in to check the status.",
    sys_sub_acc: "🎉 *SUBSTITUTION ACCEPTED!* 🎉\n\nHello *{name}*,\nYour request for *{subject}* on *{day}*, {date} has been *accepted* by *{subName}*!\n\n~ *LAMS Admin*",
    sys_sub_can: "⚠️ *SUBSTITUTION CANCELLED* ⚠️\n\nHello *{name}*,\nA previously requested substitution for *{subject}* on *{day}*, {date} has been *cancelled*.\n\nℹ️ *Info*: You are expected to take this class.",
    sys_new_assign: "📚 *NEW CLASS ASSIGNMENT* 📚\n\nHello *{name}*,\n{body}\n\n~ *LAMS Admin*",
    sys_acc_app: "👋 *WELCOME TO LAMS, {name}!* 🎉\n\nYour account has been *successfully approved* by the Administrator! ✅\n\nYou can now log in and manage your classes, labs, and substitutions seamlessly.\n\n🌐 _https://lams.vercel.app_",
    obs_sub_app: "🚨 *Admin Alert: Leave Covered* 🚨\n\n*{requesterName}* is on leave on *{day}, {date}*.\n*{subName}* will cover the *{subject}* class for ({group}) at *{time}* in Room *{room}*.",
    obs_sub_can: "⚠️ *Admin Alert: Sub Cancelled* ⚠️\n\nThe substitution arrangement for *{subject}* on *{day}, {date}* at *{time}* in Room *{room}* has been cancelled.",
    obs_bday: "📢 *Admin Alert: Birthday Today!* 🎈\n\nToday is *{name}'s* birthday! Be sure to wish them! 🎂",
    obs_anni: "📢 *Admin Alert: Work Anniversary!* 🎊\n\n*{name}* is celebrating *{years} years* with us today! 🏫"
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
            console.error("Failed to save templates:", err);
            toast.error("Failed to save templates.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = async () => {
        if (!window.confirm("Are you sure you want to reset all templates to their default factory settings? This cannot be undone.")) return;
        
        setIsSaving(true);
        try {
            setTemplates(defaultTemplates);
            await setDoc(doc(db, 'settings', 'templates'), defaultTemplates);
            toast.success("Templates reset to defaults!");
        } catch (err) {
            console.error("Failed to reset templates:", err);
            toast.error("Failed to reset templates.");
        } finally {
            setIsSaving(false);
        }
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
                    value={templates[key] ?? defaultTemplates[key] ?? ''}
                    onChange={(e) => handleChange(key, e.target.value)}
                />
            ) : (
                <textarea
                    className="glass-input"
                    rows={rows}
                    value={templates[key] ?? defaultTemplates[key] ?? ''}
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
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button
                        onClick={handleReset}
                        disabled={isSaving}
                        className="btn btn-outline"
                        style={{ border: '1px solid rgba(239, 68, 68, 0.5)', color: '#f87171' }}
                    >
                        Reset Defaults
                    </button>
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
                                <span style={{ color: '#fbbf24' }}>{'{name}'}, {'{requesterName}'}, {'{subName}'}, {'{subject}'}, {'{date}'}, {'{day}'}, {'{time}'}, {'{group}'}, {'{room}'}, {'{body}'}</span>
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
                            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '1rem', marginBottom: '1rem' }}>Class List Vars: {'{idx}'}, {'{time}'}, {'{group}'}, {'{subject}'}, {'{cofacStr}'}, {'{roomStr}'}, {'{semStr}'}, {'{subStr}'}</p>
                            {renderInput('morning_class_line', 'Class Item Format', 'textarea', 2)}
                            {renderInput('morning_footer', 'Footer Text', 'textarea', 2)}
                        </div>
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '12px' }}>
                            <h4 style={{ marginTop: 0, color: '#6366f1' }}>Weekly Preview (Sun 7 PM)</h4>
                            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>Header Vars: {'{name}'}, {'{total_sessions}'}</p>
                            {renderInput('weekly_header', 'Header Text', 'textarea', 3)}
                            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '1rem', marginBottom: '1rem' }}>Class List Vars: {'{idx}'}, {'{time}'}, {'{group}'}, {'{subject}'}, {'{cofacStr}'}, {'{roomStr}'}, {'{semStr}'}</p>
                            {renderInput('weekly_class_line', 'Class Item Format', 'textarea', 2)}
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
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '12px' }}>
                            <h4 style={{ marginTop: 0, color: '#f472b6' }}>New Assignment</h4>
                            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>Vars: {'{name}'}, {'{body}'}</p>
                            {renderInput('sys_new_assign', 'Message', 'textarea', 5)}
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
