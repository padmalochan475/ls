import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * Custom hook to fetch schedule data for a specific academic year.
 * Subscribes to real-time updates.
 * @param {string} academicYear - The active academic year (e.g., "2024-2025")
 * @returns {Object} { schedule, loading, error }
 */
export const useScheduleData = (academicYear) => {
    const [schedule, setSchedule] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!academicYear) {
            setSchedule([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        // We fetching the WHOLE schedule for the year. 
        // For scalability (PERF-01), this might need to optionally refine by Day or Dept later.
        const q = query(
            collection(db, 'schedule'),
            where('academicYear', '==', academicYear)
        );

        const unsubscribe = onSnapshot(q,
            (snapshot) => {
                const data = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setSchedule(data);
                setLoading(false);
            },
            (err) => {
                console.error("Error fetching schedule:", err);
                setError(err);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [academicYear]);

    return { schedule, loading, error };
};
