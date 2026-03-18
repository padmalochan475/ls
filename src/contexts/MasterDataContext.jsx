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

    // Dynamic Refs for Quota-Safe Caching (Capture latest snapshot without stale closures)
    const departmentsRef = useRef([]);
    const semestersRef = useRef([]);
    const subjectsRef = useRef([]);
    const facultyRef = useRef([]);
    const roomsRef = useRef([]);
    const daysRef = useRef([]);
    const timeSlotsRef = useRef([]);
    const groupsRef = useRef([]);
    const holidaysRef = useRef([]);

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
        if (authLoading) return;

        // --- DYNAMIC HIBERNATION LOGIC ---
        // We stop all listeners when the tab is hidden to prevent "background leaks"
        // and re-sync only when the user returns.
        let isActive = true;
        let setupTimer = null;

        const syncMasterData = () => {
            if (!currentUser) {
                cleanupListeners();
                setDepartments([]); setSemesters([]); setSubjects([]); setFaculty([]);
                setRooms([]); setDays([]); setTimeSlots([]); setGroups([]); setHolidays([]);
                setLoading(false);
                return;
            }

            // TRY LOAD FROM CACHE FIRST (Instant UX)
            // eslint-disable-next-line sonarjs/no-ignored-exceptions
            try {
                const cache = JSON.parse(localStorage.getItem(`lams_master_cache_${currentUser.uid}`) || '{}');
                if (cache.faculty) {
                    setDepartments(cache.departments || []);
                    setSemesters(cache.semesters || []);
                    setSubjects(cache.subjects || []);
                    setFaculty(cache.faculty || []);
                    setRooms(cache.rooms || []);
                    setDays(cache.days || []);
                    setTimeSlots(cache.timeSlots || []);
                    setGroups(cache.groups || []);
                    setHolidays(cache.holidays || []);
                    // We stay in "loading" state until live sync finishes, but UI has data!
                }
            } catch (e) { console.warn("Cache load failed"); }

            setLoading(true);
            cleanupListeners();

            const loadStatus = {
                departments: false, semesters: false, subjects: false, 
                faculty: false, rooms: false, days: false, 
                timeslots: false, groups: false, settings: false
            };

            const checkAllLoaded = () => {
                const allLoaded = Object.values(loadStatus).every(s => s);
                if (isActive && allLoaded) {
                    setLoading(false);
                    // UPDATE CACHE
                    const newCache = { 
                        departments: departmentsRef.current, 
                        semesters: semestersRef.current, 
                        subjects: subjectsRef.current, 
                        faculty: facultyRef.current, 
                        rooms: roomsRef.current, 
                        days: daysRef.current, 
                        timeSlots: timeSlotsRef.current, 
                        groups: groupsRef.current, 
                        holidays: holidaysRef.current 
                    };
                    localStorage.setItem(`lams_master_cache_${currentUser.uid}`, JSON.stringify(newCache));
                }
            };

            const naturalSort = (a, b) => {
                const splitAlphaNum = (str) => {
                    const match = String(str).match(/^(\D*)(\d+)(.*)$/);
                    if (!match) return [String(str), 0, ''];
                    return [match[1], parseInt(match[2] || 0, 10), match[3]];
                };
                const [aPre, aNum, aSuf] = splitAlphaNum(a);
                const [bPre, bNum, bSuf] = splitAlphaNum(b);
                const preCmp = aPre.localeCompare(bPre);
                if (preCmp !== 0) return preCmp;
                if (aNum !== bNum) return aNum - bNum;
                return aSuf.localeCompare(bSuf);
            };

            const setupListener = (collectionName, setState, statusKey, customQuery = null) => {
                const q = customQuery || query(collection(db, collectionName));
                const unsubscribe = onSnapshot(q, (snapshot) => {
                    if (!isActive) return;
                    const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    
                    // --- INTELLIGENT MASTER HUB SORT ---
                    if (statusKey === 'days') {
                        items.sort((a, b) => (a.order || 0) - (b.order || 0));
                    } else if (statusKey === 'timeslots') {
                        items.sort((a, b) => {
                            const t1 = parseTimeToDate(a.startTime).getTime();
                            const t2 = parseTimeToDate(b.startTime).getTime();
                            if (t1 !== t2) return t1 - t2;
                            return naturalSort(a.name || '', b.name || '');
                        });
                    } else if (statusKey === 'faculty') {
                        items.sort((a, b) => {
                            if (a.slNo !== undefined && b.slNo !== undefined) return a.slNo - b.slNo;
                            return naturalSort(a.name || '', b.name || '');
                        });
                    } else {
                        items.sort((a, b) => naturalSort(a.name || '', b.name || ''));
                    }
                    
                    // Update State + Ref for caching
                    setState(items);
                    if (statusKey === 'departments') departmentsRef.current = items;
                    if (statusKey === 'semesters') semestersRef.current = items;
                    if (statusKey === 'subjects') subjectsRef.current = items;
                    if (statusKey === 'faculty') facultyRef.current = items;
                    if (statusKey === 'rooms') roomsRef.current = items;
                    if (statusKey === 'days') daysRef.current = items;
                    if (statusKey === 'timeslots') timeSlotsRef.current = items;
                    if (statusKey === 'groups') groupsRef.current = items;
                    if (statusKey === 'settings') holidaysRef.current = items;

                    loadStatus[statusKey] = true;
                    checkAllLoaded();
                }, (error) => {
                    console.warn(`[MasterData] Listener failed for ${collectionName}:`, error.code);
                    loadStatus[statusKey] = true;
                    checkAllLoaded();
                });
                unsubsRef.current.push(unsubscribe);
            };

            setupTimer = setTimeout(() => {
                setupListener('departments', setDepartments, 'departments');
                setupListener('semesters', setSemesters, 'semesters');
                setupListener('subjects', setSubjects, 'subjects');
                setupListener('faculty', setFaculty, 'faculty');
                setupListener('rooms', setRooms, 'rooms');
                setupListener('days', setDays, 'days');
                setupListener('timeslots', setTimeSlots, 'timeslots');
                setupListener('groups', setGroups, 'groups');
                setupListener('settings', setHolidays, 'settings', query(collection(db, 'settings'), where('type', '==', 'holiday')));
            }, 300);
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                console.log("[MasterData] Focus detected. Resuming sync...");
                syncMasterData();
            } else {
                console.log("[MasterData] Background detected. Suspending sync for quota...");
                cleanupListeners();
            }
        };

        // Initial Start
        syncMasterData();
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // SAFETY: If MasterData hangs (Limit Exhausted), force load after 8s to show cached data
        const masterSafetyTimer = setTimeout(() => {
            setLoading(prev => {
                if (prev) console.warn("MasterData initialization timed out. Forcing degraded mode.");
                return false;
            });
        }, 8000);

        return () => {
            isActive = false;
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (setupTimer) clearTimeout(setupTimer);
            clearTimeout(masterSafetyTimer);
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
