import React, { createContext, useContext, useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { db, messaging } from '../lib/firebase';
import firebaseConfig from '../lib/firebaseConfig';
import { doc, updateDoc, arrayUnion, arrayRemove, deleteField } from 'firebase/firestore';
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
    const [permission, setPermission] = useState('Notification' in window ? Notification.permission : 'denied');
    const [fcmToken, setFcmToken] = useState(null);
    const lastLoginUid = useRef(null);
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

    // Helper: Register SW with config params and wait until active
    const registerFCMWorker = async (forceReinstall = false) => {
        if (!('serviceWorker' in navigator)) return null;
        try {
            if (forceReinstall) {
                const regs = await navigator.serviceWorker.getRegistrations();
                for (const reg of regs) {
                    await reg.unregister();
                }
                // Small delay to allow browser to clean up SW thread
                await new Promise(res => setTimeout(res, 500));
            }

            const params = new URLSearchParams();
            for (const [key, value] of Object.entries(firebaseConfig)) {
                if (value) params.append(key, value);
            }
            const swUrl = `/firebase-messaging-sw.js?${params.toString()}`;
            await navigator.serviceWorker.register(swUrl);
            
            // Wait for the Service Worker to be fully active before returning
            const registration = await navigator.serviceWorker.ready;
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
                if ('Notification' in window && Notification.permission === 'granted' && messaging && vapidKey) {
                    let swReg;
                    let token;
                    
                    try {
                        swReg = await registerFCMWorker();
                        token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: swReg });
                    } catch (e) {
                        console.warn("FCM initial sync failed, attempting self-heal...", e);
                        // Deep Self-Heal Protocol
                        try {
                            // Wipe the corrupted token from browser DB if possible
                            await deleteToken(messaging).catch(() => null);
                            // Violently purge all service workers
                            swReg = await registerFCMWorker(true);
                            // Attempt fresh token generation
                            token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: swReg });
                            console.log("FCM Self-heal successful. New token generated.");
                        } catch (healError) {
                            console.error("FCM Self-Heal completely failed:", healError);
                        }
                    }

                    if (token) {
                        setFcmToken(token);
                        let deviceId = localStorage.getItem('lams_device_id');
                        const updateData = {
                            fcmTokens: arrayUnion(token),
                            webPushActive: true,
                            lastSeen: new Date()
                        };
                        if (deviceId) {
                            updateData[`fcmDeviceTokens.${deviceId}`] = token;
                        }
                        try {
                            await updateDoc(doc(db, 'users', currentUser.uid), updateData);
                        } catch (err) {
                            console.warn("FCM token sync to user profile failed (Quota or Offline):", err);
                        }
                    }
                }
            } else if (lastLoginUid.current) {
                // Logout logic: Delete the token locally and remotely
                try {
                    if (messaging && fcmToken) {
                        await deleteToken(messaging);
                        
                        const removeData = {
                            fcmTokens: arrayRemove(fcmToken)
                        };
                        let deviceId = localStorage.getItem('lams_device_id');
                        if (deviceId) {
                            removeData[`fcmDeviceTokens.${deviceId}`] = deleteField();
                        }

                        await updateDoc(doc(db, 'users', lastLoginUid.current), removeData);
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

    // Dynamic Logic: Detect iOS, Android, and PWA status
    const isIOS = () => {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    };

    const isAndroid = () => {
        return /Android/.test(navigator.userAgent);
    };
    
    const isStandalone = () => {
        return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    };

    const registerForPush = useCallback(async () => {
        // iOS requires the Web App to be added to the Home Screen to support Push Notifications (Apple Policy)
        if (isIOS() && !isStandalone()) {
            toast.error("To enable notifications on iPhone/iPad, tap the Share icon at the bottom of Safari and select 'Add to Home Screen'.", { duration: 8000, id: 'ios-push' });
            return;
        }

        if (!('Notification' in window) || !messaging) {
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
                
                let swReg;
                let token;
                
                try {
                    swReg = await registerFCMWorker();
                    token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: swReg });
                } catch (e) {
                    console.warn("Manual push registration failed, self-healing...", e);
                    try {
                        await deleteToken(messaging).catch(() => null);
                        swReg = await registerFCMWorker(true);
                        token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: swReg });
                    } catch (healError) {
                        console.error("Manual push self-heal failed:", healError);
                        throw healError; // bubble to outer catch
                    }
                }
                
                if (token) {
                    setFcmToken(token);
                    if (currentUser?.uid) {
                        let deviceId = localStorage.getItem('lams_device_id');
                        const updateData = {
                            fcmTokens: arrayUnion(token),
                            webPushActive: true
                        };
                        if (deviceId) {
                            updateData[`fcmDeviceTokens.${deviceId}`] = token;
                        }
                        try {
                            await updateDoc(doc(db, 'users', currentUser.uid), updateData);
                            toast.success("Notifications Enabled!", { id: 'push-register' });
                        } catch (err) {
                            console.error("Manual push sync failed:", err);
                            toast.error("Failed to sync token to profile. Check connection.", { id: 'push-register' });
                        }
                    } else {
                        toast.success("Notifications Enabled Locally!", { id: 'push-register' });
                    }
                }
            } else {
                // Permission Denied Handling
                if (isIOS()) {
                    toast.error("Permission Denied. Please go to iPhone Settings > Safari > Advanced > Website Data to clear it, then try again.");
                } else if (isAndroid()) {
                    toast.error("Permission Denied. On Android, tap the lock icon 🔒 in the URL bar, go to Permissions, and allow Notifications.");
                } else {
                    toast.error("Permission Denied. Please click the lock icon in your URL bar to unblock notifications.");
                }
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
