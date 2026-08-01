import React, { createContext, useContext, useState, useMemo, useRef, useCallback } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';

import { useAuth } from './AuthContext';
import { useDynamicListener } from '../hooks/useDynamicListener';
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

    // --- DYNAMIC QUOTA & CACHE HUB ---
    useDynamicListener((isActiveRef) => {
        if (!currentUser) {
            setDepartments([]); setSemesters([]); setSubjects([]); setFaculty([]);
            setRooms([]); setDays([]); setTimeSlots([]); setGroups([]); setHolidays([]);
            setLoading(false);
            return;
        }

        let masterSafetyTimer = null;
        let unsubs = [];

        // 1. Initial Local Cache Load
        try {
            const cached = localStorage.getItem(`lams_master_cache_${currentUser.uid}`);
            if (cached) {
                const parsed = JSON.parse(cached);
                setDepartments(parsed.departments || []); departmentsRef.current = parsed.departments || [];
                setSemesters(parsed.semesters || []); semestersRef.current = parsed.semesters || [];
                setSubjects(parsed.subjects || []); subjectsRef.current = parsed.subjects || [];
                setFaculty(parsed.faculty || []); facultyRef.current = parsed.faculty || [];
                setRooms(parsed.rooms || []); roomsRef.current = parsed.rooms || [];
                setDays(parsed.days || []); daysRef.current = parsed.days || [];
                setTimeSlots(parsed.timeSlots || []); timeSlotsRef.current = parsed.timeSlots || [];
                setGroups(parsed.groups || []); groupsRef.current = parsed.groups || [];
                setHolidays(parsed.holidays || []); holidaysRef.current = parsed.holidays || [];
                if (isActiveRef.current) setLoading(false);
            }
        } catch (e) { console.warn("Cache load failed"); }

        if (!departmentsRef.current || departmentsRef.current.length === 0) {
            if (isActiveRef.current) setLoading(true);
            // Launch safety timer ONLY when we are actively showing a loader
            masterSafetyTimer = setTimeout(() => {
                if (isActiveRef.current) setLoading(prev => {
                    if (prev) console.warn("MasterData initialization timed out. Forcing degraded mode.");
                    return false;
                });
            }, 8000);
        }

        const loadStatus = {
            departments: false, semesters: false, subjects: false, 
            faculty: false, rooms: false, days: false, 
            timeslots: false, groups: false, settings: false
        };

        const checkAllLoaded = () => {
            const allLoaded = Object.values(loadStatus).every(s => s);
            if (isActiveRef.current && allLoaded) {
                if (masterSafetyTimer) clearTimeout(masterSafetyTimer);
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
                if (!isActiveRef.current) return;
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
                
                // Check if data actually changed to prevent violent React re-renders on boot
                let prevItems = [];
                if (statusKey === 'departments') prevItems = departmentsRef.current;
                else if (statusKey === 'semesters') prevItems = semestersRef.current;
                else if (statusKey === 'subjects') prevItems = subjectsRef.current;
                else if (statusKey === 'faculty') prevItems = facultyRef.current;
                else if (statusKey === 'rooms') prevItems = roomsRef.current;
                else if (statusKey === 'days') prevItems = daysRef.current;
                else if (statusKey === 'timeslots') prevItems = timeSlotsRef.current;
                else if (statusKey === 'groups') prevItems = groupsRef.current;
                else if (statusKey === 'settings') prevItems = holidaysRef.current;

                if (JSON.stringify(prevItems) !== JSON.stringify(items)) {
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
                }

                loadStatus[statusKey] = true;
                checkAllLoaded();
            }, (error) => {
                console.warn(`[MasterData] Listener failed for ${collectionName}:`, error.code);
                loadStatus[statusKey] = true;
                checkAllLoaded();
            });
            unsubs.push(unsubscribe);
        };

        setupListener('departments', setDepartments, 'departments');
        setupListener('semesters', setSemesters, 'semesters');
        setupListener('subjects', setSubjects, 'subjects');
        setupListener('faculty', setFaculty, 'faculty');
        setupListener('rooms', setRooms, 'rooms');
        setupListener('days', setDays, 'days');
        setupListener('timeslots', setTimeSlots, 'timeslots');
        setupListener('groups', setGroups, 'groups');
        setupListener('settings', setHolidays, 'settings', query(collection(db, 'settings'), where('type', '==', 'holiday')));

        return () => {
            unsubs.forEach(u => u());
            if (masterSafetyTimer) clearTimeout(masterSafetyTimer);
        };
    }, [currentUser, authLoading, refreshTrigger], {
        enabled: !authLoading && currentUser,
        suspendOnHidden: true,
        suspendDelayMs: 30000
    });


    // Force a re-fetch of all master data
    const refreshMasterData = useCallback(async () => {
        setRefreshTrigger(prev => prev + 1);
    }, []); // Stable reference — setRefreshTrigger never changes

    const value = useMemo(() => ({
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
    }), [
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
    ]);

    return (
        <MasterDataContext.Provider value={value}>
            {children}
        </MasterDataContext.Provider>
    );
};
