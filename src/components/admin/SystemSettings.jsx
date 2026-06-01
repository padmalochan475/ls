import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Key, Save, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

const SystemSettings = () => {
    const [groqApiKey, setGroqApiKey] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const snap = await getDoc(doc(db, 'settings', 'global'));
                if (snap.exists()) {
                    setGroqApiKey(snap.data().groqApiKey || '');
                }
            } catch (error) {
                console.error("Failed to load settings:", error);
                toast.error("Failed to load system settings");
            } finally {
                setLoading(false);
            }
        };
        fetchSettings();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            await setDoc(doc(db, 'settings', 'global'), { groqApiKey }, { merge: true });
            toast.success("Settings saved successfully!");
        } catch (error) {
            console.error("Failed to save settings:", error);
            toast.error("Failed to save settings");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading settings...</div>;
    }

    return (
        <div className="glass-panel" style={{ padding: '2rem' }}>
            <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Key size={20} color="#fbbf24" /> AI Assistant Settings
            </h3>
            
            <div style={{ maxWidth: '600px' }}>
                <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Global Groq API Key</label>
                    <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.75rem' }}>
                        This key will be used by all users to access the AI assistant. Users will no longer need to provide their own keys.
                    </p>
                    <input 
                        type="password" 
                        value={groqApiKey} 
                        onChange={(e) => setGroqApiKey(e.target.value)} 
                        placeholder="gsk_..." 
                        style={{ 
                            width: '100%', padding: '12px 16px', 
                            background: 'rgba(255,255,255,0.05)', 
                            border: '1px solid rgba(255,255,255,0.1)', 
                            borderRadius: '8px', color: 'white', 
                            outline: 'none', transition: 'border-color 0.2s' 
                        }} 
                        onFocus={e => e.target.style.borderColor = 'rgba(59,130,246,0.5)'}
                        onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                    />
                </div>
                
                <button 
                    onClick={handleSave} 
                    disabled={saving}
                    style={{ 
                        background: 'linear-gradient(135deg, #3b82f6, #2563eb)', 
                        border: 'none', color: 'white', 
                        padding: '10px 24px', borderRadius: '8px', 
                        cursor: saving ? 'not-allowed' : 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: '8px',
                        fontWeight: 600, transition: 'opacity 0.2s',
                        opacity: saving ? 0.7 : 1
                    }}
                >
                    {saving ? <Loader2 size={16} className="spin-animation" /> : <Save size={16} />}
                    Save Settings
                </button>
            </div>
        </div>
    );
};

export default SystemSettings;
