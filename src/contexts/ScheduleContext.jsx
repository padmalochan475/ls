import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, or, and } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthContext';

const ScheduleContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useScheduleContext = () => useContext(ScheduleContext);

export const ScheduleProvider = ({ children }) => {
    const { currentUser, userProfile, activeAcademicYear, loading: authLoading } = useAuth();
    const [schedule, setSchedule] = useState([]);
    const scheduleRef = React.useRef([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let unsubscribe = () => { };
        let isActive = true;
        let suspendTimeout;
        let scheduleSafetyTimer;

        const setupLiveSchedule = () => {
            // Prevent memory leaks by unsubscribing any existing orphaned listeners before creating a new one
            unsubscribe();
            if (scheduleSafetyTimer) clearTimeout(scheduleSafetyTimer);
            
            // Don't flip loading=false if auth is still settling — prevents flash
            if (authLoading) return;

            if (!activeAcademicYear || typeof activeAcademicYear !== 'string' || !currentUser) {
                setSchedule([]);
                scheduleRef.current = [];
                setLoading(false); // ALWAYS drop loader if we abort
                return;
            }
            
            if (scheduleRef.current.length === 0) {
                setLoading(true);
                // Launch safety timer ONLY when we are actively showing a loader
                scheduleSafetyTimer = setTimeout(() => {
                    if (!isActive) return; // Guard: ignore if this effect instance is already torn down
                    setLoading(prev => {
                        if (prev) console.warn("Schedule initialization timed out (Likely Firestore Limit). Forcing degraded mode.");
                        return false;
                    });
                }, 9000);
            }

            try {
                const baseYear = activeAcademicYear.replace(/ \((ODD|EVEN)\)/i, '').trim();
                let searchYears = [activeAcademicYear];
                if (baseYear !== activeAcademicYear) searchYears.push(baseYear);
                else {
                    searchYears.push(`${baseYear} (EVEN)`);
                    searchYears.push(`${baseYear} (ODD)`);
                }
                searchYears = [...new Set(searchYears)];

                let q;
                const scheduleRefDb = collection(db, 'schedule');

                // We query the entire schedule for the active academic year for ALL users.
                // This is critical because:
                // 1. Students need to see the full class schedule.
                // 2. Local conflict detection requires the full schedule to prevent double-booking rooms/faculty.
                q = query(scheduleRefDb, where('academicYear', 'in', searchYears));

                unsubscribe = onSnapshot(q, (snapshot) => {
                    if (!isActive) return;
                    if (scheduleSafetyTimer) clearTimeout(scheduleSafetyTimer); // Data arrived, cancel rescue timer!
                    
                    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    setSchedule(data);
                    scheduleRef.current = data;
                    setLoading(false);
                }, (err) => {
                    console.error("Critical Schedule Snapshot Error:", err);
                    if (scheduleSafetyTimer) clearTimeout(scheduleSafetyTimer);
                    setLoading(false);
                });

            } catch (e) {
                console.error("Setup Error:", e);
                if (scheduleSafetyTimer) clearTimeout(scheduleSafetyTimer);
                setLoading(false);
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                // User came back! Cancel the suspension if it's pending.
                if (suspendTimeout) {
                    clearTimeout(suspendTimeout);
                    suspendTimeout = null;
                    console.log("[Schedule] Suspension aborted (rapid tab switch). Connection maintained.");
                } else {
                    // It was fully suspended. Reconnect.
                    console.log("[Schedule] Resuming live sync...");
                    setupLiveSchedule();
                }
            } else {
                // User left the tab. Don't disconnect instantly (prevents quota burn on rapid alt-tabbing).
                // Wait 30 seconds before severing the Firebase connection.
                console.log("[Schedule] Tab hidden. Scheduling suspension in 30 seconds...");
                suspendTimeout = setTimeout(() => {
                    console.log("[Schedule] Suspending sync for quota conservation...");
                    unsubscribe();
                    if (scheduleSafetyTimer) clearTimeout(scheduleSafetyTimer);
                    suspendTimeout = null;
                }, 30000);
            }
        };

        setupLiveSchedule();
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            isActive = false;
            unsubscribe();
            if (suspendTimeout) clearTimeout(suspendTimeout);
            if (scheduleSafetyTimer) clearTimeout(scheduleSafetyTimer);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [activeAcademicYear, currentUser, authLoading]);

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
