import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

const MasterDataContext = createContext();

export const useMasterData = () => {
    return useContext(MasterDataContext);
};

export const MasterDataProvider = ({ children }) => {
    const [departments, setDepartments] = useState([]);
    const [semesters, setSemesters] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [faculty, setFaculty] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [days, setDays] = useState([]);
    const [timeSlots, setTimeSlots] = useState([]);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribes = [];

        // Helper to create listener
        const subscribe = (colName, setter, sortFn) => {
            const q = query(collection(db, colName));
            const unsub = onSnapshot(q, (snapshot) => {
                const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                if (sortFn) {
                    items.sort(sortFn);
                } else {
                    // Default sort by name if available
                    items.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }));
                }
                setter(items);
            }, (error) => {
                console.error(`Error fetching ${colName}:`, error);
            });
            unsubscribes.push(unsub);
        };

        setLoading(true);

        subscribe('departments', setDepartments);
        subscribe('semesters', setSemesters, (a, b) => (a.number || 0) - (b.number || 0)); // Sort by semester number
        subscribe('subjects', setSubjects);
        subscribe('faculty', setFaculty);
        subscribe('rooms', setRooms);
        subscribe('days', setDays, (a, b) => (a.order || 0) - (b.order || 0));
        subscribe('timeslots', setTimeSlots, (a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
        subscribe('groups', setGroups);

        // We can consider loading done once listeners are attached, 
        // though strictly we might want to wait for first emission.
        // For simplicity, we'll set loading false after a short tick or assume initial empty state is fine.
        // Better: count how many returned. But onSnapshot is async.
        // We'll just set loading to false immediately as the UI handles empty arrays gracefully.
        setLoading(false);

        return () => {
            unsubscribes.forEach(unsub => unsub());
        };
    }, []);

    // Create a simplified value object for consumers, stripping IDs where only names were used previously if needed,
    // but better to provide full objects and let consumers map.

    // We also provide helper maps for commonly used "just names" arrays to match previous behavior (Departments, etc often just list of strings)
    // But Scheduler/Assignments often map d.name anyway.

    const value = {
        departments,
        semesters,
        subjects,
        faculty,
        rooms,
        days,
        timeSlots,
        groups,
        loading
    };

    return (
        <MasterDataContext.Provider value={value}>
            {children}
        </MasterDataContext.Provider>
    );
};
