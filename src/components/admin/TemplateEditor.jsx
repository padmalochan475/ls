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
    morning_footer: "Have a productive day! ✨\n_LAMS Admin_"
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
                    value={templates[key]}
                    onChange={(e) => handleChange(key, e.target.value)}
                />
            ) : (
                <textarea
                    className="glass-input"
                    rows={rows}
                    value={templates[key]}
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

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem', overflowX: 'auto' }}>
                {['warnings', 'greetings', 'summary', 'holiday'].map(tab => (
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
                        {tab}
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
            </div>
        </div>
    );
};

export default TemplateEditor;
