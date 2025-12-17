import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { db, messaging } from '../lib/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { getToken, onMessage } from 'firebase/messaging';
import { useAuth } from './AuthContext';
import { Bell } from 'lucide-react';
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
                setPermission(Notification.permission);

                if (Notification.permission === 'granted' && currentUser) {
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
    }, [currentUser]);

    // Handle Foreground Messages
    useEffect(() => {
        onMessage(messaging, (payload) => {
            console.log('Message received. ', payload);
            toast((t) => (
                <div onClick={() => toast.dismiss(t.id)}>
                    <p className="font-bold">{payload.notification.title}</p>
                    <p className="text-sm">{payload.notification.body}</p>
                </div>
            ), { duration: 5000, icon: '🔔' });
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

                const id15 = `${cls.id}-15min-${new Date().toDateString()}`;
                const id05 = `${cls.id}-05min-${new Date().toDateString()}`;
                const details = `${cls.dept || ''} ${cls.section || ''} ${cls.group && cls.group !== 'All' ? `(${cls.group})` : ''}`.trim();

                // 1. 15 Minute Warning
                if (minutesLeft > 5 && minutesLeft <= 15 && !notifiedClassesRef.current.has(id15)) {
                    new Notification(`Upcoming Class: ${cls.subject}`, {
                        body: `15 Minutes left! ${details} in Room ${cls.room}.`,
                        icon: '/logo.svg',
                        tag: id15
                    });
                    notifiedClassesRef.current.add(id15);
                }

                // 2. 5 Minute Warning
                if (minutesLeft > 0 && minutesLeft <= 5 && !notifiedClassesRef.current.has(id05)) {
                    new Notification(`Hurry Up! Class Starting: ${cls.subject}`, {
                        body: `Starts in ${Math.ceil(minutesLeft)} mins! ${details} in ${cls.room}.`,
                        icon: '/logo.svg',
                        tag: id05,
                        requireInteraction: true
                    });
                    notifiedClassesRef.current.add(id05);
                }
            });
        };

        const interval = setInterval(checkTime, 60 * 1000);
        checkTime();

        return () => clearInterval(interval);
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
