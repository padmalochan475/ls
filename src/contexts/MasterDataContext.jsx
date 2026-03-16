import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';

import { useAuth } from './AuthContext';
import { parseTimeToDate } from '../utils/timeUtils';

const MasterDataContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useMasterData = () => {
    return useContext(MasterDataContext);
};

export const MasterDataProvider = ({ children }) => {
    // Pull `loading` from AuthContext to gate our listeners until auth is fully settled.
    // This prevents the race condition where listeners fire before the user profile is resolved.
    const { currentUser, loading: authLoading } = useAuth();
    const [departments, setDepartments] = useState([]);
    const [semesters, setSemesters] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [faculty, setFaculty] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [days, setDays] = useState([]);
    const [timeSlots, setTimeSlots] = useState([]);
    const [groups, setGroups] = useState([]);
    const [holidays, setHolidays] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Use a ref to track active unsubscribers so we can safely tear them down
    const unsubsRef = useRef([]);

    // Cleanup helper — call before setting up new listeners
    const cleanupListeners = () => {
        unsubsRef.current.forEach(u => {
            // eslint-disable-next-line sonarjs/no-ignored-exceptions, no-unused-vars
            try { u(); } catch (e) { /* ignore cleanup errors */ }
        });
        unsubsRef.current = [];
    };

    useEffect(() => {
        // Wait until AuthContext is fully settled before starting Firestore listeners.
        // Without this, listeners fire during auth's async profile fetch → data appears
        // to stall on first login, fixed only by refresh (when cache is warm).
        if (authLoading) return;

        if (!currentUser) {
            cleanupListeners();
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setDepartments([]);
            setSemesters([]);
            setSubjects([]);
            setFaculty([]);
            setRooms([]);
            setDays([]);
            setTimeSlots([]);
            setGroups([]);
            setHolidays([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        cleanupListeners(); // Ensure no stale listeners before creating new ones

        // Track which collections have finished their initial load
        const loadStatus = {
            departments: false,
            semesters: false,
            subjects: false,
            faculty: false,
            rooms: false,
            days: false,
            timeslots: false,
            groups: false,
            settings: false
        };

        // Track if this effect instance is still active (prevents stale state updates)
        let isActive = true;
        let setupTimer = null;

        const checkAllLoaded = () => {
            if (isActive && Object.values(loadStatus).every(s => s)) {
                setLoading(false);
            }
        };

        /**
         * Setup a real-time Firestore listener with safe error handling.
         * Uses try/catch around both setup AND the snapshot callback to
         * prevent Firestore SDK assertion failures from propagating up to React.
         */
        const setupListener = (collectionName, setState, sortFn, statusKey, customQuery = null) => {
            try {
                const q = customQuery || query(collection(db, collectionName));

                const unsubscribe = onSnapshot(
                    q,
                    (snapshot) => {
                        if (!isActive) return; // Effect was cleaned up — discard stale updates

                        try {
                            // eslint-disable-next-line sonarjs/no-nested-functions
                            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                            if (sortFn) {
                                items.sort(sortFn);
                            } else if (!customQuery) {
                                // eslint-disable-next-line sonarjs/no-nested-functions
                                items.sort((a, b) =>
                                    (a.name || '').toString().localeCompare((b.name || '').toString(), undefined, { numeric: true, sensitivity: 'base' })
                                );
                            }

                            setState(items);
                            loadStatus[statusKey] = true;
                            checkAllLoaded();
                        } catch (processErr) {
                            console.error(`[MasterData] Error processing ${collectionName} snapshot:`, processErr);
                            loadStatus[statusKey] = true;
                            checkAllLoaded();
                        }
                    },
                    (error) => {
                        // Non-fatal: mark as loaded and log. Don't crash the app.
                        console.warn(`[MasterData] Listener error for ${collectionName} (will continue):`, error.code || error.message);
                        if (isActive) {
                            loadStatus[statusKey] = true;
                            checkAllLoaded();
                        }
                    }
                );

                unsubsRef.current.push(unsubscribe);
            } catch (setupErr) {
                // If listener setup itself fails (e.g. Firestore not ready), mark loaded and move on
                console.warn(`[MasterData] Failed to setup listener for ${collectionName}:`, setupErr.message);
                loadStatus[statusKey] = true;
                checkAllLoaded();
            }
        };

        // --- Set up all listeners ---

        // Small delay to allow Auth claims to propagate to Firestore internals
        setupTimer = setTimeout(() => {
            // 1. Departments
            setupListener('departments', setDepartments, null, 'departments');

            // 2. Semesters (sort by number)
            setupListener('semesters', setSemesters, (a, b) => (a.number || 0) - (b.number || 0), 'semesters');

            // 3. Subjects
            setupListener('subjects', setSubjects, null, 'subjects');

            // 4. Faculty
            setupListener('faculty', setFaculty, null, 'faculty');

            // 5. Rooms
            setupListener('rooms', setRooms, null, 'rooms');

            // 6. Days (sort by custom order index)
            setupListener('days', setDays, (a, b) => (a.order || 0) - (b.order || 0), 'days');

            // 7. TimeSlots (sort chronologically)
            setupListener('timeslots', setTimeSlots, (a, b) => {
                try {
                    const t1 = parseTimeToDate(a.startTime).getTime();
                    const t2 = parseTimeToDate(b.startTime).getTime();
                    return t1 - t2;
                } catch {
                    return 0;
                }
            }, 'timeslots');

            // 8. Groups
            setupListener('groups', setGroups, null, 'groups');

            // 9. Holidays (subset of settings collection)
            setupListener(
                'settings',
                setHolidays,
                null,
                'settings',
                query(collection(db, 'settings'), where('type', '==', 'holiday'))
            );
        }, 50);

        // Fallback timer: if Firestore doesn't respond for some collections within 3 seconds,
        // release the loading state so the UI isn't permanently blocked.
        // Cleanup: mark effect as inactive and teardown all listeners
        return () => {
            isActive = false;
            if (setupTimer) clearTimeout(setupTimer);
            cleanupListeners();
        };
    }, [currentUser, authLoading, refreshTrigger]);

    // Force a re-fetch of all master data
    const refreshMasterData = async () => {
        setRefreshTrigger(prev => prev + 1);
    };

    const value = {
        departments,
        semesters,
        subjects,
        faculty,
        rooms,
        days,
        timeSlots,
        groups,
        holidays,
        loading,
        refreshMasterData
    };

    return (
        <MasterDataContext.Provider value={value}>
            {children}
        </MasterDataContext.Provider>
    );
};
