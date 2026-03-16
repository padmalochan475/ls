import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import OneSignal from 'react-onesignal';
import { db } from '../lib/firebase';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';

const NotificationContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useNotifications = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }) => {
    const { currentUser } = useAuth();
    const [initialized, setInitialized] = useState(false);
    const [permission, setPermission] = useState(Notification.permission);
    const [oneSignalId, setOneSignalId] = useState(null);
    const lastLoginUid = useRef(null);

    // 1. Initialize OneSignal (Run Once)
    useEffect(() => {
        const runInit = async () => {
            try {
                if (window.OneSignalInitialized) return;
                window.OneSignalInitialized = true;

                await OneSignal.init({
                    appId: import.meta.env.VITE_ONESIGNAL_APP_ID || "6764f541-4220-4ffd-85d2-6660b86d5a48",
                    allowLocalhostAsSecureOrigin: true,
                    notifyButton: { enable: false },
                });

                setInitialized(true);
            } catch (error) {
                if (error.message?.includes("Can only be used on") && window.location.hostname === 'localhost') {
                    console.warn("OneSignal: Testing only on Production. Normal.");
                } else {
                    console.error("OneSignal Init Error:", error);
                }
            }
        };

        runInit();
    }, []);

    // 2. Handle User Identity (Login/Logout)
    useEffect(() => {
        if (!initialized) return;

        if (currentUser?.uid) {
            try {
                if (typeof currentUser.uid === 'string' && currentUser.uid.trim() !== '') {
                    if (lastLoginUid.current !== currentUser.uid) {
                        OneSignal.login(currentUser.uid);
                        lastLoginUid.current = currentUser.uid;
                        toast.success("Device Linked to User!", { id: 'os-sync', icon: '🔗' });
                    }
                }
            } catch (e) {
                console.warn("OneSignal Login Failed", e);
            }

            // Foreground Listener
            try {
                OneSignal.Notifications?.addEventListener('foregroundWillDisplay', (event) => {
                    event.preventDefault();
                    const data = event.notification.additionalData;
                    const primaryUrl = data?.url || event.notification.launchURL;

                    toast.custom((t) => (
                        <div
                            onClick={() => {
                                if (primaryUrl) window.location.href = primaryUrl;
                                toast.dismiss(t.id);
                            }}
                            className="glass-panel"
                            style={{
                                background: 'rgba(15, 23, 42, 0.95)',
                                backdropFilter: 'blur(12px)',
                                padding: '16px',
                                borderRadius: '12px',
                                border: '1px solid rgba(59, 130, 246, 0.4)',
                                color: 'white',
                                maxWidth: '380px',
                                boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
                                display: 'flex',
                                gap: '16px',
                                cursor: 'pointer'
                            }}
                        >
                            <div style={{ fontSize: '24px' }}>
                                {data?.type === 'urgent' ? '🚨' : '🔔'}
                            </div>
                            <div>
                                <div style={{ fontWeight: '700', color: '#60a5fa' }}>{event.notification.title}</div>
                                <div style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>{event.notification.body}</div>
                            </div>
                        </div>
                    ), { duration: 8000, position: 'top-right' });
                });
            } catch (e) { /* silent */ }

        } else if (lastLoginUid.current) {
            try {
                OneSignal.logout();
                lastLoginUid.current = null;
            } catch (e) { /* silent */ }
        }
    }, [currentUser, initialized]);

    // 3. Sync Subscription to Firestore
    useEffect(() => {
        if (!initialized || !currentUser) return;

        const syncUser = async () => {
            try {
                let id = OneSignal.User?.PushSubscription?.id;
                let optedIn = OneSignal.User?.PushSubscription?.optedIn;

                if (Notification.permission === 'granted' && !id) {
                    for (let i = 0; i < 5; i++) {
                        await new Promise(r => setTimeout(r, 1000));
                        id = OneSignal.User?.PushSubscription?.id;
                        optedIn = OneSignal.User?.PushSubscription?.optedIn;
                        if (id) break;
                    }
                }

                if (optedIn && id) {
                    setOneSignalId(id);
                    await updateDoc(doc(db, 'users', currentUser.uid), {
                        oneSignalId: id,
                        oneSignalIds: arrayUnion(id),
                        webPushActive: true,
                        lastSeen: new Date()
                    });
                }
            } catch (e) { console.error("Sync Error", e); }
        };

        syncUser();

        // 🛡️ Auto-Healer 🛡️
        const runHealer = async () => {
            if (!initialized || !currentUser || Notification.permission !== 'granted') return;

            const sw = await navigator.serviceWorker.getRegistration();
            const osId = OneSignal.User?.PushSubscription?.id;

            if (!sw || !osId) {
                const attempts = parseInt(sessionStorage.getItem('ah_attempts') || '0');
                if (attempts > 2) return;
                sessionStorage.setItem('ah_attempts', (attempts + 1).toString());

                try {
                    if (!sw) await navigator.serviceWorker.register('/OneSignalSDKWorker.js');
                    if (!osId) {
                        await OneSignal.User.PushSubscription.optOut();
                        setTimeout(() => OneSignal.User.PushSubscription.optIn(), 1000);
                    }
                } catch (e) { /* silent */ }
            }
        };

        const timer = setTimeout(runHealer, 10000);
        return () => clearTimeout(timer);
    }, [initialized, currentUser]);

    const registerForPush = async () => {
        if (Notification.permission === 'denied') {
            alert("Blocked. Enable in browser settings.");
            return;
        }
        try {
            await OneSignal.Slidedown?.promptPush();
            OneSignal.User?.PushSubscription?.optIn();

            setTimeout(() => {
                setPermission(Notification.permission);
                const id = OneSignal.User?.PushSubscription?.id;
                if (id) toast.success("Active!");
            }, 2000);
        } catch (e) { console.error(e); }
    };

    return (
        <NotificationContext.Provider value={{ registerForPush, permission, oneSignalId, initialized }}>
            {children}
        </NotificationContext.Provider>
    );
};
