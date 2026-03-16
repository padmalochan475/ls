import React, { useState, useEffect } from 'react';
import Confetti from 'react-confetti';
import { X, Gift, Award, Coffee } from 'lucide-react';
import Holidays from 'date-holidays';
import { db } from '../lib/firebase';
import { collection, query, where, doc, onSnapshot } from 'firebase/firestore';

const CelebrationCard = ({ userProfile, onClose }) => {
    const [celebration, setCelebration] = useState(null);
    const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });

    useEffect(() => {
        const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const getOrdinal = (n) => {
        const s = ["th", "st", "nd", "rd"];
        const v = n % 100;
        return s[(v - 20) % 10] || s[v] || s[0];
    };

    // State for Realtime Data
    const [settings, setSettings] = useState({ masterEnabled: true, systemEnabled: true });
    const [customEvents, setCustomEvents] = useState([]);

    // 1. Listen to Settings
    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'settings', 'celebration'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setSettings({
                    masterEnabled: data.masterEnabled ?? true,
                    systemEnabled: data.systemEnabled ?? true
                });
            }
        }, (err) => console.error("Settings listener error", err));
        return () => unsub();
    }, []);

    // 2. Listen to Active Custom Celebrations
    useEffect(() => {
        if (!settings.masterEnabled) {
            setTimeout(() => setCustomEvents([]), 0);
            return;
        }

        const todayStr = new Date().toLocaleDateString('en-CA');
        const q = query(collection(db, 'celebrations'), where('isActive', '==', true));

        const unsub = onSnapshot(q, (snap) => {
            const matches = snap.docs
                .map(d => d.data())
                .filter(data => data.startDate <= todayStr && data.endDate >= todayStr);
            setCustomEvents(matches);
        }, (err) => console.error("Custom celebrations listener error", err));

        return () => unsub();
    }, [settings.masterEnabled]);

    // 3. Main Logic (Re-runs when data or user changes)
    useEffect(() => {
        if (!userProfile || !settings.masterEnabled) {
            setTimeout(() => setCelebration(null), 0);
            return;
        }

        // eslint-disable-next-line sonarjs/cognitive-complexity
        const runChecks = () => {
            const today = new Date();

            // A. Check Custom First (Priority)
            if (customEvents.length > 0) {
                // Pick the first match (or priority based if we had it)
                const data = customEvents[0];
                let IconComp = Gift;
                if (data.theme && data.theme.includes('Gold')) IconComp = Award;

                setCelebration({
                    type: 'custom',
                    title: data.title,
                    message: data.message,
                    theme: data.theme,
                    icon: <IconComp size={32} />
                });
                return;
            }

            // B. System Checks
            if (!settings.systemEnabled) return;

            const hd = new Holidays('IN');
            const holidays = hd.isHoliday(today);

            // Personal - Birthday
            if (userProfile.dob) {
                const dob = new Date(userProfile.dob);
                if (dob.getDate() === today.getDate() && dob.getMonth() === today.getMonth()) {
                    setCelebration({
                        type: 'birthday',
                        title: `Happy Birthday, ${userProfile.name}! 🎉`,
                        message: "Wishing you a fantastic day filled with joy and success.",
                        theme: 'linear-gradient(135deg, #f472b6 0%, #db2777 100%)',
                        icon: <Gift size={32} />
                    });
                    return;
                }
            }
            // Personal - Anniversary
            if (userProfile.joiningDate) {
                const joinDate = new Date(userProfile.joiningDate);
                if (joinDate.getDate() === today.getDate() && joinDate.getMonth() === today.getMonth()) {
                    const years = today.getFullYear() - joinDate.getFullYear();
                    if (years > 0) {
                        setCelebration({
                            type: 'anniversary',
                            title: `Happy ${years}${getOrdinal(years)} Work Anniversary! 🏆`,
                            message: `Thank you for ${years} years of excellence and dedication.`,
                            theme: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)',
                            icon: <Award size={32} />
                        });
                        return;
                    }
                }
            }

            // Odia Festivals
            const getOdiaFestival = (d) => {
                const m = d.getMonth();
                const date = d.getDate();
                const year = d.getFullYear();

                if (m === 3 && date === 1) return { title: "Happy Utkala Dibasa! ⭕", message: "Celebrating the glory and heritage of Odisha. Bande Utkala Janani!", theme: 'linear-gradient(135deg, #ea580c 0%, #b45309 100%)', icon: <Award size={32} /> };
                if (m === 2 && date === 20) return { title: "Happy Pakhala Dibasa! 🍚", message: "It's time to enjoy the soul food of Odisha. Stay cool and refreshed!", theme: 'linear-gradient(135deg, #10b981 0%, #047857 100%)', icon: <Coffee size={32} /> };
                if ((year === 2025 && m === 5 && date === 27) || (year === 2026 && m === 6 && date === 17)) return { title: "Jay Jagannath! 🙏", message: "May Lord Jagannath bless you with happiness and prosperity on this Ratha Yatra.", theme: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)', icon: <Award size={32} /> };
                if (m === 5 && date >= 14 && date <= 16) return { title: "Happy Raja Parba! 🪁", message: "Celebrating womanhood and the joy of monsoon. Enjoy the Poda Pitha!", theme: 'linear-gradient(135deg, #db2777 0%, #be185d 100%)', icon: <Gift size={32} /> };
                if ((year === 2025 && m === 7 && date === 29) || (year === 2026 && m === 8 && date === 16)) return { title: "Nuakhai Juhar! 🌾", message: "Welcome the new harvest with gratitude. May your year be filled with abundance.", theme: 'linear-gradient(135deg, #ca8a04 0%, #854d0e 100%)', icon: <Gift size={32} /> };
                if ((year === 2025 && m === 10 && date === 5) || (year === 2026 && m === 10 && date === 24)) return { title: "Happy Boita Bandana! ⛵", message: "Remembering our glorious maritime history. Aa Ka Ma Boi!", theme: 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)', icon: <Award size={32} /> };

                return null;
            };

            const odia = getOdiaFestival(today);
            if (odia) {
                setCelebration({ type: 'festival', ...odia });
                return;
            }

            // Public Holidays
            if (holidays && holidays[0] && holidays[0].type === 'public') {
                const h = holidays[0];
                let theme = 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
                let icon = <Gift size={32} />;

                if (h.name.includes('Diwali') || h.name.includes('Deepavali')) {
                    theme = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
                } else if (h.name.includes('Christmas')) {
                    theme = 'linear-gradient(135deg, #10b981 0%, #dc2626 100%)';
                }

                setCelebration({
                    type: 'holiday',
                    title: `Happy ${h.name}!`,
                    message: "Wishing you a wonderful holiday with friends and family.",
                    theme,
                    icon
                });
            }
        };

        runChecks();
    }, [userProfile, settings, customEvents]);



    if (!celebration) return null;

    const isCustomTheme = celebration.theme && celebration.theme.startsWith('theme-');

    return (
        <div
            className={`${isCustomTheme ? celebration.theme : ''} celebration-interactive`}
            style={{
                position: 'relative',
                marginBottom: '2rem',
                borderRadius: '16px',
                background: isCustomTheme ? undefined : celebration.theme,
                padding: '2rem',
                color: 'white',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.2)'
            }}>
            {/* Confetti limited to this container area mostly, or full screen? 
                React-confetti is usually full screen. Let's make it full screen but recyclable.
            */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'hidden', pointerEvents: 'none' }}>
                {/* 
                   Note: React-Confetti typically uses window size. 
                   If we want it localized, we need to pass width/height of container. 
                   For now, let's let it catch the user's attention with window size but recycle=false so it stops after a while.
                 */}
            </div>
            <Confetti
                width={windowSize.width}
                height={windowSize.height}
                numberOfPieces={200}
                recycle={false}
                gravity={0.15}
            />

            <div style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                    <div style={{
                        background: 'rgba(255,255,255,0.2)',
                        padding: '1rem',
                        borderRadius: '12px',
                        backdropFilter: 'blur(5px)'
                    }}>
                        {celebration.icon}
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 'bold', textShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                            {celebration.title}
                        </h2>
                        <p style={{ margin: '0.5rem 0 0 0', fontSize: '1.1rem', opacity: 0.9 }}>
                            {celebration.message}
                        </p>
                    </div>
                </div>

                <button
                    onClick={onClose}
                    style={{
                        background: 'rgba(0,0,0,0.1)',
                        border: 'none',
                        color: 'white',
                        padding: '0.5rem',
                        borderRadius: '50%',
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.1)'}
                >
                    <X size={20} />
                </button>
            </div>

            {/* Background Decorations */}
            <div style={{
                position: 'absolute',
                top: '-50%',
                right: '-10%',
                width: '300px',
                height: '300px',
                background: 'radial-gradient(circle, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 70%)',
                borderRadius: '50%',
                pointerEvents: 'none'
            }} />
        </div>
    );
};

export default CelebrationCard;
