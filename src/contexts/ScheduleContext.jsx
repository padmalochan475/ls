import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, or, and } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthContext';

const ScheduleContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useScheduleContext = () => useContext(ScheduleContext);

export const ScheduleProvider = ({ children }) => {
    const { currentUser, userProfile, activeAcademicYear } = useAuth();
    const [schedule, setSchedule] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let unsubscribe = () => { };
        let isActive = true;

        const setupLiveSchedule = () => {
            // Validation: Ensure we have a valid string year and user is logged in
            if (!activeAcademicYear || typeof activeAcademicYear !== 'string' || !currentUser) {
                setSchedule([]);
                setLoading(false);
                return;
            }

            setLoading(true);

            try {
                const baseYear = activeAcademicYear.replace(/ \((ODD|EVEN)\)/i, '').trim();
                let searchYears = [activeAcademicYear];
                if (baseYear !== activeAcademicYear) searchYears.push(baseYear);
                else {
                    searchYears.push(`${baseYear} (EVEN)`);
                    searchYears.push(`${baseYear} (ODD)`);
                }
                searchYears = [...new Set(searchYears)];

                const isAdmin = userProfile?.role === 'admin';
                const empId = userProfile?.empId;
                let q;
                const scheduleRef = collection(db, 'schedule');

                // We query the entire schedule for the active academic year for ALL users.
                // This is critical because:
                // 1. Students need to see the full class schedule.
                // 2. Local conflict detection requires the full schedule to prevent double-booking rooms/faculty.
                q = query(scheduleRef, where('academicYear', 'in', searchYears));

                unsubscribe = onSnapshot(q, (snapshot) => {
                    if (!isActive) return;
                    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    setSchedule(data);
                    setLoading(false);
                }, (err) => {
                    console.error("Critical Schedule Snapshot Error:", err);
                    setLoading(false);
                });

            } catch (e) {
                console.error("Setup Error:", e);
                setLoading(false);
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                console.log("[Schedule] Resuming live sync...");
                setupLiveSchedule();
            } else {
                console.log("[Schedule] Suspending sync for quota conservation...");
                unsubscribe();
            }
        };

        setupLiveSchedule();
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            isActive = false;
            unsubscribe();
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [activeAcademicYear, currentUser, userProfile?.role, userProfile?.empId]);

    // Manual refresh is no longer needed with real-time listeners, 
    // but kept as a stub to prevent breaking components that call it.
    const refreshSchedule = async () => {
        // console.debug("Schedule is live-synced. Manual refresh ignored.");
    };

    const value = useMemo(() => ({ schedule, loading, error, refreshSchedule }), [schedule, loading, error]);

    return (
        <ScheduleContext.Provider value={value}>
            {children}
        </ScheduleContext.Provider>
    );
};
