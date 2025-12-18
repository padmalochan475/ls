import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { db, messaging } from '../lib/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { getToken, onMessage } from 'firebase/messaging';
import { useAuth } from './AuthContext';

import toast from 'react-hot-toast';

const NotificationContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useNotifications = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }) => {
    const { userProfile, activeAcademicYear, currentUser } = useAuth();
    const [permission, setPermission] = useState('default');
    const [todayClasses, setTodayClasses] = useState([]);
    const [fcmToken, setFcmToken] = useState(null);

    const notifiedClassesRef = useRef(new Set());

    // 1. Request Permission & Get Token
    useEffect(() => {
        const initMessaging = async () => {
            if ('Notification' in window) {
                // Update local state if it differs from browser state
                if (Notification.permission !== permission) {
                    setPermission(Notification.permission);
                }

                if (Notification.permission === 'granted' && currentUser && messaging) {
                    try {
                        const token = await getToken(messaging, {
                            vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY
                        });
                        if (token) {
                            console.log('FCM Token:', token);
                            setFcmToken(token);
                            await updateDoc(doc(db, 'users', currentUser.uid), {
                                fcmTokens: arrayUnion(token)
                            });
                        }
                    } catch (err) {
                        console.error('An error occurred while retrieving token. ', err);
                    }
                }
            }
        };

        if (currentUser) {
            initMessaging();
        }
    }, [currentUser, permission]);

    // Handle Foreground Messages
    useEffect(() => {
        if (!messaging) return;

        onMessage(messaging, (payload) => {
            console.log('Message received. ', payload);
            const title = payload.notification?.title || payload.data?.title;
            const body = payload.notification?.body || payload.data?.body;

            if (title) {
                toast((t) => (
                    <div onClick={() => toast.dismiss(t.id)}>
                        <p className="font-bold">{title}</p>
                        <p className="text-sm">{body}</p>
                    </div>
                ), { duration: 5000, icon: '🔔' });
            }
        });
    }, []);

    const requestPermission = async () => {
        if ('Notification' in window) {
            const result = await Notification.requestPermission();
            setPermission(result);
            return result; // Token logic handled in useEffect
        }
        return 'denied';
    };

    // 2. Fetch User's Classes for TODAY 
    useEffect(() => {
        if (!userProfile || !activeAcademicYear) return;

        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const todayName = days[new Date().getDay()];

        const q = query(
            collection(db, 'schedule'),
            where('academicYear', '==', activeAcademicYear),
            where('day', '==', todayName)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const myClasses = [];
            const empId = userProfile.empId;
            const userName = userProfile.name;

            snapshot.forEach(doc => {
                const data = { id: doc.id, ...doc.data() };
                let isMine = false;
                if (empId && (data.facultyEmpId === empId || data.faculty2EmpId === empId)) isMine = true;
                if (!isMine && userName && (data.faculty === userName || data.faculty2 === userName)) isMine = true;

                if (isMine) myClasses.push(data);
            });

            setTodayClasses(myClasses);
        });

        return () => unsubscribe();
    }, [userProfile, activeAcademicYear]);


    // 3. Monitor Time & Trigger Local Notifications
    useEffect(() => {
        if (permission !== 'granted' || todayClasses.length === 0) return;

        // Fetch settings - default to 15/5 if not set
        let firstWarning = 15;
        let secondWarning = 5;

        // Simple real-time listener for settings (optional, or just fetch once)
        // For efficiency, we can just fetch inside this effect or use a separate effect.
        // Let's assume we want real-time updates.
        const settingsRef = doc(db, 'settings', 'notifications');
        const unsubSettings = onSnapshot(settingsRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                if (data.firstWarning) firstWarning = data.firstWarning;
                if (data.secondWarning) secondWarning = data.secondWarning;
            }
        });

        const checkTime = () => {
            const now = new Date();
            const nowTime = now.getTime();

            todayClasses.forEach(cls => {
                if (!cls.time) return;

                const [timeStr] = cls.time.split(' - ');
                const [time, modifier] = timeStr.split(' ');
                let [hours, minutes] = time.split(':').map(Number);

                if (modifier === 'PM' && hours < 12) hours += 12;
                if (modifier === 'AM' && hours === 12) hours = 0;

                const classTime = new Date();
                classTime.setHours(hours, minutes, 0, 0);
                const classTimeMs = classTime.getTime();

                const diff = classTimeMs - nowTime;
                const minutesLeft = diff / 1000 / 60;

                const idFirst = `${cls.id}-first-${new Date().toDateString()}`;
                const idSecond = `${cls.id}-second-${new Date().toDateString()}`;
                const details = `${cls.dept || ''} ${cls.section || ''} ${cls.group && cls.group !== 'All' ? `(${cls.group})` : ''}`.trim();

                // Dynamic First Warning
                if (minutesLeft > secondWarning && minutesLeft <= firstWarning && !notifiedClassesRef.current.has(idFirst)) {
                    new Notification(`Upcoming Class: ${cls.subject}`, {
                        body: `${Math.ceil(minutesLeft)} Minutes left! ${details} in Room ${cls.room}.`,
                        icon: '/logo.svg',
                        tag: idFirst
                    });
                    notifiedClassesRef.current.add(idFirst);
                }

                // Dynamic Second Warning
                if (minutesLeft > 0 && minutesLeft <= secondWarning && !notifiedClassesRef.current.has(idSecond)) {
                    new Notification(`Hurry Up! Class Starting: ${cls.subject}`, {
                        body: `Starts in ${Math.ceil(minutesLeft)} mins! ${details} in ${cls.room}.`,
                        icon: '/logo.svg',
                        tag: idSecond,
                        requireInteraction: true
                    });
                    notifiedClassesRef.current.add(idSecond);
                }
            });
        };

        const interval = setInterval(checkTime, 60 * 1000);
        checkTime();

        return () => {
            clearInterval(interval);
            unsubSettings();
        };
    }, [todayClasses, permission]);

    const value = {
        permission,
        requestPermission,
        fcmToken // Expose token if needed
    };

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    );
};
