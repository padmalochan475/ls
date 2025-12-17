import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { Bell } from 'lucide-react';

const NotificationContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useNotifications = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }) => {
    const { userProfile, activeAcademicYear } = useAuth();
    const [permission, setPermission] = useState('default');
    const [todayClasses, setTodayClasses] = useState([]);

    // We use a ref to track notified classes to avoid double-firing in strict mode or re-renders
    const notifiedClassesRef = useRef(new Set());

    // 1. Request Permission on Mount
    useEffect(() => {
        if ('Notification' in window) {
            setPermission(Notification.permission);
        }
    }, []);

    const requestPermission = async () => {
        if ('Notification' in window) {
            const result = await Notification.requestPermission();
            setPermission(result);
            return result;
        }
        return 'denied';
    };

    // 2. Fetch User's Classes for TODAY
    useEffect(() => {
        if (!userProfile || !activeAcademicYear) return;

        // Determine "Today"
        // Note: In real production, handle timezones carefully. Here we assume client local time.
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const todayName = days[new Date().getDay()];

        // Query logic matches Dashboard "My Classes"
        // We listen closely so we are always up to date
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

                // Match Logic
                // Match Logic
                let isMine = false;

                // 1. Check EmpID (Strong Match)
                if (empId) {
                    if (data.facultyEmpId === empId || data.faculty2EmpId === empId) isMine = true;
                }

                // 2. Check Name (Fallback - Try even if EmpID exists, for legacy records)
                if (!isMine && userName) {
                    if (data.faculty === userName || data.faculty2 === userName) isMine = true;
                }

                if (isMine) {
                    myClasses.push(data);
                }
            });

            setTodayClasses(myClasses);
        });

        return () => unsubscribe();
    }, [userProfile, activeAcademicYear]);


    // 3. Monitor Time & Trigger Notifications
    useEffect(() => {
        if (permission !== 'granted' || todayClasses.length === 0) return;

        const checkTime = () => {
            const now = new Date();
            const nowTime = now.getTime();

            todayClasses.forEach(cls => {
                if (!cls.time) return;

                // Parse Start Time
                // Format: "10:00 AM - 11:00 AM"
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

                // Unique IDs for different alert intervals
                const id15 = `${cls.id}-15min-${new Date().toDateString()}`;
                const id05 = `${cls.id}-05min-${new Date().toDateString()}`;

                // Helper to format details: "CSE - G1 (SG1)"
                const details = `${cls.dept || ''} ${cls.section || ''} ${cls.group && cls.group !== 'All' ? `(${cls.group})` : ''}`.trim();

                // 1. 15 Minute Warning (Window: 5 to 15 mins)
                if (minutesLeft > 5 && minutesLeft <= 15 && !notifiedClassesRef.current.has(id15)) {
                    new Notification(`Upcoming Class: ${cls.subject}`, {
                        body: `15 Minutes left! ${details} in Room ${cls.room}.`,
                        icon: '/logo.svg',
                        tag: id15
                    });
                    notifiedClassesRef.current.add(id15);
                }

                // 2. 5 Minute Urgent Warning (Window: 0 to 5 mins)
                if (minutesLeft > 0 && minutesLeft <= 5 && !notifiedClassesRef.current.has(id05)) {
                    new Notification(`Hurry Up! Class Starting: ${cls.subject}`, {
                        body: `Starts in ${Math.ceil(minutesLeft)} mins! ${details} in ${cls.room}.`,
                        icon: '/logo.svg',
                        tag: id05,
                        requireInteraction: true // Keeps it on screen
                    });
                    notifiedClassesRef.current.add(id05);
                }
            });
        };

        // Check every minute
        const interval = setInterval(checkTime, 60 * 1000);
        checkTime(); // Run immediately too

        return () => clearInterval(interval);
    }, [todayClasses, permission]);


    const value = {
        permission,
        requestPermission
    };

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    );
};
