import React, { createContext, useContext, useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthContext';

const ScheduleContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useScheduleContext = () => useContext(ScheduleContext);

export const ScheduleProvider = ({ children }) => {
    const { currentUser, activeAcademicYear } = useAuth();
    const [schedule, setSchedule] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let unsubscribe = () => { };

        const setupLiveSchedule = () => {
            // Validation: Ensure we have a valid string year and user is logged in
            if (!activeAcademicYear || typeof activeAcademicYear !== 'string' || !currentUser) {
                setSchedule([]);
                setLoading(false);
                return;
            }

            setLoading(true);

            try {
                // Fuzzy Query Logic: Handle "(EVEN)" or "(ODD)" suffixes causing mismatches
                const baseYear = activeAcademicYear.replace(/ \((ODD|EVEN)\)/i, '').trim();
                let searchYears = [activeAcademicYear];

                // If current is specific (has suffix), add base
                if (baseYear !== activeAcademicYear) {
                    searchYears.push(baseYear);
                } else {
                    // If current is base, add potential variants
                    searchYears.push(`${baseYear} (EVEN)`);
                    searchYears.push(`${baseYear} (ODD)`);
                }

                // Deduplicate
                searchYears = [...new Set(searchYears)];

                const q = query(
                    collection(db, 'schedule'),
                    where('academicYear', 'in', searchYears)
                );

                unsubscribe = onSnapshot(q, (snapshot) => {
                    // eslint-disable-next-line sonarjs/no-nested-functions
                    const data = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data(),
                    }));
                    setSchedule(data);
                    setLoading(false);
                }, (err) => {
                    console.error("Critical Schedule Snapshot Error:", err);
                    setError(err);
                    setLoading(false);
                });

            } catch (e) {
                console.error("Setup Error:", e);
                setError(e);
                setLoading(false);
            }
        };

        setupLiveSchedule();

        return () => {
            unsubscribe();
        };
    }, [activeAcademicYear, currentUser]);

    // Manual refresh is no longer needed with real-time listeners, 
    // but kept as a stub to prevent breaking components that call it.
    const refreshSchedule = async () => {
        // console.debug("Schedule is live-synced. Manual refresh ignored.");
    };

    const value = { schedule, loading, error, refreshSchedule };

    return (
        <ScheduleContext.Provider value={value}>
            {children}
        </ScheduleContext.Provider>
    );
};
