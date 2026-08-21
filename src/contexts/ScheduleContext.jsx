import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, or } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthContext';
import { useDynamicListener } from '../hooks/useDynamicListener';

const ScheduleContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useScheduleContext = () => useContext(ScheduleContext);

export const ScheduleProvider = ({ children }) => {
    const { currentUser, userProfile, activeAcademicYear, loading: authLoading } = useAuth();
    const [schedule, setSchedule] = useState([]);
    const scheduleRef = React.useRef([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useDynamicListener((isActiveRef) => {
        let scheduleSafetyTimer = null;

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
                if (!isActiveRef.current) return;
                setLoading(prev => {
                    if (prev) {
                        console.warn("Schedule initialization timed out (Likely Firestore Limit). Forcing degraded mode.");
                        setError("Schedule failed to load (timeout).");
                    }
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

            const scheduleRefDb = collection(db, 'schedule');
            let q;
            
            // TARGETED REALTIME QUERIES based on user role to optimize Spark Quota
            if (userProfile?.role === 'admin' || userProfile?.role === 'principal' || userProfile?.role === 'coordinator') {
                q = query(scheduleRefDb, where('academicYear', 'in', searchYears));
            } else if (userProfile?.role === 'faculty' && userProfile?.empId) {
                q = query(
                    scheduleRefDb, 
                    where('academicYear', 'in', searchYears),
                    or(
                        where('facultyEmpId', '==', String(userProfile.empId).trim()),
                        where('faculty2EmpId', '==', String(userProfile.empId).trim())
                    )
                );
            } else if (userProfile?.role === 'student' && userProfile?.section) {
                // Students need to see their section's schedule
                q = query(
                    scheduleRefDb,
                    where('academicYear', 'in', searchYears),
                    where('section', '==', userProfile.section)
                );
            } else {
                // Fallback for unassigned or generic roles (if any)
                q = query(scheduleRefDb, where('academicYear', 'in', searchYears));
            }

            const unsubscribe = onSnapshot(q, (snapshot) => {
                if (!isActiveRef.current) return;
                if (scheduleSafetyTimer) clearTimeout(scheduleSafetyTimer); // Data arrived, cancel rescue timer!
                
                const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setSchedule(data);
                scheduleRef.current = data;
                setLoading(false);
                setError(null);
            }, (err) => {
                console.error("Critical Schedule Snapshot Error:", err);
                if (scheduleSafetyTimer) clearTimeout(scheduleSafetyTimer);
                if (isActiveRef.current) {
                    setLoading(false);
                    setError("Failed to fetch schedule data.");
                }
            });

            return () => {
                unsubscribe();
                if (scheduleSafetyTimer) clearTimeout(scheduleSafetyTimer);
            };
        } catch (e) {
            console.error("Setup Error:", e);
            if (scheduleSafetyTimer) clearTimeout(scheduleSafetyTimer);
            if (isActiveRef.current) {
                setLoading(false);
                setError(e.message);
            }
            return () => {};
        }
    }, [activeAcademicYear, currentUser], {
        enabled: !authLoading,
        suspendOnHidden: true,
        suspendDelayMs: 30000
    });

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
