import React, { createContext, useContext, useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

import { useAuth } from './AuthContext';
import { parseTimeToDate } from '../utils/timeUtils';

const MasterDataContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useMasterData = () => {
    return useContext(MasterDataContext);
};

const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export const MasterDataProvider = ({ children }) => {
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

    const sortItems = (items, statusKey) => {
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
        return items;
    };

    useEffect(() => {
        if (!currentUser || authLoading) {
            setDepartments([]); setSemesters([]); setSubjects([]); setFaculty([]);
            setRooms([]); setDays([]); setTimeSlots([]); setGroups([]); setHolidays([]);
            setLoading(false);
            return;
        }

        let isMounted = true;
        
        const loadMasterData = async () => {
            setLoading(true);
            const cacheKey = `lams_master_cache_${currentUser.uid}`;
            
            // Check cache
            if (refreshTrigger === 0) {
                try {
                    const cachedStr = localStorage.getItem(cacheKey);
                    if (cachedStr) {
                        const parsed = JSON.parse(cachedStr);
                        if (parsed.timestamp && (Date.now() - parsed.timestamp < CACHE_TTL_MS)) {
                            // Valid cache
                            setDepartments(parsed.departments || []);
                            setSemesters(parsed.semesters || []);
                            setSubjects(parsed.subjects || []);
                            setFaculty(parsed.faculty || []);
                            setRooms(parsed.rooms || []);
                            setDays(parsed.days || []);
                            setTimeSlots(parsed.timeSlots || []);
                            setGroups(parsed.groups || []);
                            setHolidays(parsed.holidays || []);
                            setLoading(false);
                            return; // Skip fetch
                        }
                    }
                } catch (e) {
                    console.warn("MasterData Cache load failed", e);
                }
            }

            try {
                // Fetch all sequentially to avoid completely blowing up concurrent limits, 
                // but Promise.all is faster. We will use Promise.all for speed.
                const queries = [
                    { key: 'departments', q: query(collection(db, 'departments')) },
                    { key: 'semesters', q: query(collection(db, 'semesters')) },
                    { key: 'subjects', q: query(collection(db, 'subjects')) },
                    { key: 'faculty', q: query(collection(db, 'faculty')) },
                    { key: 'rooms', q: query(collection(db, 'rooms')) },
                    { key: 'days', q: query(collection(db, 'days')) },
                    { key: 'timeslots', q: query(collection(db, 'timeslots')) },
                    { key: 'groups', q: query(collection(db, 'groups')) },
                    { key: 'holidays', q: query(collection(db, 'settings'), where('type', '==', 'holiday')) }
                ];

                const snapshots = await Promise.all(queries.map(async (def) => {
                    const snap = await getDocs(def.q);
                    return { key: def.key, items: sortItems(snap.docs.map(d => ({ id: d.id, ...d.data() })), def.key) };
                }));

                if (!isMounted) return;

                const newData = {};
                snapshots.forEach(s => { newData[s.key] = s.items; });

                setDepartments(newData.departments);
                setSemesters(newData.semesters);
                setSubjects(newData.subjects);
                setFaculty(newData.faculty);
                setRooms(newData.rooms);
                setDays(newData.days);
                setTimeSlots(newData.timeslots);
                setGroups(newData.groups);
                setHolidays(newData.holidays);

                // Update cache
                localStorage.setItem(cacheKey, JSON.stringify({
                    timestamp: Date.now(),
                    ...newData
                }));

            } catch (error) {
                console.error("[MasterData] Fetch failed:", error);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        loadMasterData();

        return () => { isMounted = false; };
    }, [currentUser, authLoading, refreshTrigger]);

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
