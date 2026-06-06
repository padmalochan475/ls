import React, { createContext, useContext, useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { db, messaging } from '../lib/firebase';
import firebaseConfig from '../lib/firebaseConfig';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { getToken, onMessage, deleteToken } from 'firebase/messaging';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';

const NotificationContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useNotifications = () => useContext(NotificationContext);

const ForegroundToast = ({ notification, t }) => {
    const data = notification.data || {};
    const primaryUrl = data?.url || '/';
    const title = notification.notification?.title || data?.title || 'Notification';
    const body = notification.notification?.body || data?.body || '';

    return (
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
                <div style={{ fontWeight: '700', color: '#60a5fa' }}>{title}</div>
                <div style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>{body}</div>
            </div>
        </div>
    );
};

export const NotificationProvider = ({ children }) => {
    const { currentUser } = useAuth();
    const [initialized, setInitialized] = useState(false);
    const [permission, setPermission] = useState(Notification.permission);
    const [fcmToken, setFcmToken] = useState(null);
    const lastLoginUid = useRef(null);
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

    // Helper: Register SW with config params
    const registerFCMWorker = async () => {
        if (!('serviceWorker' in navigator)) return null;
        try {
            const params = new URLSearchParams(firebaseConfig).toString();
            const swUrl = `/firebase-messaging-sw.js?${params}`;
            const registration = await navigator.serviceWorker.register(swUrl);
            return registration;
        } catch (error) {
            console.error("SW Registration failed:", error);
            return null;
        }
    };

    // 1. Initial Setup & Foreground Listener
    useEffect(() => {
        setInitialized(true);

        if (messaging) {
            try {
                onMessage(messaging, (payload) => {
                    toast.custom((t) => <ForegroundToast notification={payload} t={t} />, { duration: 8000, position: 'top-right' });
                });
            } catch (e) { console.warn("FCM onMessage error:", e); }
        }
    }, []);

    // 2. Handle User Identity (Sync & Auto-Healing)
    useEffect(() => {
        if (!initialized) return;

        const syncUser = async () => {
            if (currentUser?.uid) {
                lastLoginUid.current = currentUser.uid;

                // Auto-Heal: If permission is already granted, silently get token
                if (Notification.permission === 'granted' && messaging && vapidKey) {
                    try {
                        const swReg = await registerFCMWorker();
                        const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: swReg });
                        if (token) {
                            setFcmToken(token);
                            await updateDoc(doc(db, 'users', currentUser.uid), {
                                fcmTokens: arrayUnion(token),
                                webPushActive: true,
                                lastSeen: new Date()
                            });
                        }
                    } catch (e) {
                        console.error("Auto-sync FCM Error:", e);
                    }
                }
            } else if (lastLoginUid.current) {
                // Logout logic: Delete the token locally and remotely
                try {
                    if (messaging && fcmToken) {
                        await deleteToken(messaging);
                        await updateDoc(doc(db, 'users', lastLoginUid.current), {
                            fcmTokens: arrayRemove(fcmToken)
                        });
                        setFcmToken(null);
                    }
                } catch (e) {
                    console.warn("FCM Logout Cleanup Error:", e);
                } finally {
                    lastLoginUid.current = null;
                }
            }
        };

        syncUser();
    }, [currentUser, initialized, fcmToken, vapidKey]);

    const registerForPush = useCallback(async () => {
        if (!messaging) {
            toast.error("Push messaging not supported in this browser.");
            return;
        }
        if (!vapidKey) {
            toast.error("VAPID Key missing. Admin must configure VITE_FIREBASE_VAPID_KEY.");
            return;
        }
        
        try {
            const permissionResult = await Notification.requestPermission();
            setPermission(permissionResult);
            
            if (permissionResult === 'granted') {
                toast.loading("Generating Secure Key...", { id: 'push-register' });
                const swReg = await registerFCMWorker();
                const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: swReg });
                
                if (token) {
                    setFcmToken(token);
                    if (currentUser?.uid) {
                        await updateDoc(doc(db, 'users', currentUser.uid), {
                            fcmTokens: arrayUnion(token),
                            webPushActive: true
                        });
                    }
                    toast.success("Notifications Enabled!", { id: 'push-register' });
                }
            } else {
                toast.error("Permission Denied. Please unblock in browser settings.");
            }
        } catch (e) { 
            console.error(e);
            toast.error("Failed to enable notifications.", { id: 'push-register' });
        }
    }, [currentUser, vapidKey]);

    const value = useMemo(() => ({ 
        registerForPush, 
        permission, 
        fcmToken, 
        initialized 
    }), [registerForPush, permission, fcmToken, initialized]);

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    );
};
