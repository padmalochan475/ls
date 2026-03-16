/* eslint-disable sonarjs/no-nested-conditional */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import AcademicYearSelector from '../components/AcademicYearSelector';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, ScatterChart, Scatter, ZAxis
} from 'recharts';
import { Users, BookOpen, Layers, Search, CalendarOff, ChartBar, Activity, MapPin, Calendar, Clock, X, User } from 'lucide-react';
import '../styles/design-system.css';
import { normalizeStr, parseTimeToDate } from '../utils/timeUtils';

const classifyTimeOfDay = (timeStr) => {
    if (!timeStr) return null;
    const date = parseTimeToDate(timeStr);
    const hour = date.getHours();

    if (hour < 12) return 'Morning (8-12)';
    if (hour < 16) return 'Afternoon (12-4)';
    return 'Evening (4+)';
};

// eslint-disable-next-line sonarjs/cognitive-complexity
const Analytics = () => {
    const { activeAcademicYear, userProfile } = useAuth();
    const [activeTab, setActiveTab] = useState('overview');
    const [selectedFaculty, setSelectedFaculty] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [viewSemesterDetails, setViewSemesterDetails] = useState(null);
    const [popupSearch, setPopupSearch] = useState(''); // Search within popup
    const [viewDepartmentDetails, setViewDepartmentDetails] = useState(null); // New
    const [viewRoomDetails, setViewRoomDetails] = useState(null); // New
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    const matchesSubject = (itemSubject, targetName) => {
        return normalizeStr(itemSubject) === normalizeStr(targetName);
    };


    const [loading, setLoading] = useState(true);
    const [data, setData] = useState({
        assignments: [],
        faculty: [],
        departments: [],
        subjects: [],
        rooms: []
    });

    const fetchData = useCallback(async () => {
        if (!activeAcademicYear) return;
        setLoading(true);
        try {
            // Fetch assignments for the active year
            const schedQuery = query(collection(db, 'schedule'), where('academicYear', '==', activeAcademicYear));

            const [schedSnap, facSnap, deptSnap, subSnap, roomSnap] = await Promise.all([
                getDocs(schedQuery),
                getDocs(collection(db, 'faculty')),
                getDocs(collection(db, 'departments')),
                getDocs(collection(db, 'subjects')),
                getDocs(collection(db, 'rooms'))
            ]);

            setData({
                assignments: schedSnap?.docs?.map(d => d.data()) || [],
                faculty: facSnap?.docs?.map(d => d.data()) || [],
                departments: deptSnap?.docs?.map(d => d.data()) || [],
                subjects: subSnap?.docs?.map(d => d.data()) || [],
                rooms: roomSnap?.docs?.map(d => d.data()) || []
            });
        } catch (error) {
            console.error("Error fetching analytics data:", error);
        } finally {
            setLoading(false);
        }
    }, [activeAcademicYear]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Clear search term when switching tabs
    useEffect(() => {
        setSearchTerm('');
    }, [activeTab]);


    // --- DERIVED METRICS FOR TABLES ---
    const deptMetrics = useMemo(() => {
        if (!data || !data.assignments) return [];
        const metrics = {};

        data.assignments.forEach(a => {
            const d = a.dept || 'General';
            if (!metrics[d]) metrics[d] = {
                name: d,
                subjects: new Set(),
                faculty: new Set(),
                classes: 0,
                labs: 0,
                theory: 0,
                rooms: new Set()
            };
            metrics[d].subjects.add(a.subject);
            if (a.faculty) metrics[d].faculty.add(normalizeStr(a.faculty));
            if (a.faculty2) metrics[d].faculty.add(normalizeStr(a.faculty2));
            if (a.room) metrics[d].rooms.add(a.room);
            metrics[d].classes++;

            // Check Master Data for subject type first
            const masterSubject = data.subjects?.find(s => normalizeStr(s.name) === normalizeStr(a.subject));
            let isLab = false;

            if (masterSubject && masterSubject.type) {
                // Use Master Data type if available
                isLab = normalizeStr(masterSubject.type) === 'lab';
            } else {
                // Fallback to name-based heuristic only if Master Data doesn't have type
                const subNorm = normalizeStr(a.subject);
                const rmNorm = normalizeStr(a.room);
                isLab = subNorm.includes('lab') || rmNorm.includes('lab');
            }

            if (isLab) metrics[d].labs++; else metrics[d].theory++;
        });

        return Object.values(metrics).map(m => ({
            ...m,
            subjectCount: m.subjects.size,
            facultyCount: m.faculty.size,
            roomCount: m.rooms.size,
            facultyNames: Array.from(m.faculty).sort()
        })).sort((a, b) => b.classes - a.classes);
    }, [data]);

    const roomMetrics = useMemo(() => {
        if (!data || !data.assignments) return [];
        const metrics = {};

        data.assignments.forEach(a => {
            const r = a.room || 'Unassigned';
            if (!metrics[r]) metrics[r] = { name: r, classes: 0, subjects: new Set(), faculty: new Set() };
            metrics[r].classes++;
            metrics[r].subjects.add(a.subject);
            if (a.faculty) metrics[r].faculty.add(a.faculty.trim());
            if (a.faculty2) metrics[r].faculty.add(a.faculty2.trim());
        });

        return Object.values(metrics).map(m => ({
            ...m,
            subjectCount: m.subjects.size,
            facultyCount: m.faculty.size,
            facultyNames: Array.from(m.faculty).sort()
        })).sort((a, b) => b.classes - a.classes);
    }, [data]);

    // --- Metrics Calculations ---
    const stats = useMemo(() => {
        const { assignments, faculty, departments, subjects, rooms } = data;

        // 1. Overview Counts
        const counts = {
            assignments: assignments.length,
            faculty: faculty.length,
            departments: departments.length,
            subjects: subjects.length,
            rooms: rooms.length
        };

        // 2. Assignments by Department
        const deptCounts = {};
        assignments.forEach(a => {
            const d = a.dept || 'Unknown';
            if (d !== 'Unknown') {
                deptCounts[d] = (deptCounts[d] || 0) + 1;
            }
        });
        const assignmentsByDept = Object.keys(deptCounts).map(k => ({ name: k, count: deptCounts[k] }));

        // 3. Faculty Workload (Top 10)
        const facCounts = {};
        assignments.forEach(a => {
            if (a.faculty) {
                const f = a.faculty.trim();
                facCounts[f] = (facCounts[f] || 0) + 1;
            }
            if (a.faculty2) {
                const f = a.faculty2.trim();
                facCounts[f] = (facCounts[f] || 0) + 1;
            }
        });
        const facultyWorkload = Object.keys(facCounts)
            .map(k => ({ name: k, count: facCounts[k] }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // 4. Subject Frequency (Top 10)
        const subCounts = {};
        assignments.forEach(a => {
            if (a.subject) subCounts[a.subject] = (subCounts[a.subject] || 0) + 1;
        });
        const subjectFrequency = Object.keys(subCounts)
            .map(k => ({ name: k, count: subCounts[k] }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // 5. Room Usage
        const roomCounts = {};
        assignments.forEach(a => {
            if (a.room) roomCounts[a.room] = (roomCounts[a.room] || 0) + 1;
        });
        const roomUsage = Object.keys(roomCounts)
            .map(k => ({ name: k, count: roomCounts[k] }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 15);

        // 6. Assignments by Day
        const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const dayShort = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const dayCounts = {};
        dayOrder.forEach(d => dayCounts[d] = 0);
        assignments.forEach(a => {
            if (a.day) dayCounts[a.day] = (dayCounts[a.day] || 0) + 1;
        });
        const dailyWorkload = dayOrder.map((d, i) => ({ name: dayShort[i], count: dayCounts[d] }));
        // 7. Faculty by Dept
        const facByDept = {};
        faculty.forEach(f => {
            const d = f.dept || 'Unknown';
            if (d !== 'Unknown') {
                facByDept[d] = (facByDept[d] || 0) + 1;
            }
        });
        const facultyByDept = Object.keys(facByDept).map(k => ({ name: k, count: facByDept[k] }));

        // 8. Subjects by Dept
        const subByDept = {};
        subjects.forEach(s => {
            const d = s.dept || 'Unknown';
            if (d !== 'Unknown') {
                subByDept[d] = (subByDept[d] || 0) + 1;
            }
        });
        const subjectsByDept = Object.keys(subByDept).map(k => ({ name: k, count: subByDept[k] }));

        // 9. Assignments by Time Slot
        const timeCounts = {};
        assignments.forEach(a => {
            if (a.time) timeCounts[a.time] = (timeCounts[a.time] || 0) + 1;
        });
        const assignmentsByTime = Object.keys(timeCounts)
            .map(k => ({ name: k, count: timeCounts[k] }))
            .sort((a, b) => {
                const getMinutes = (tStr) => {
                    if (!tStr) return 0;
                    const match = tStr.match(/(\d{1,2})[:.]?(\d{2})?\s*([ap]m)?/i);
                    if (!match) return 0;
                    // eslint-disable-next-line sonarjs/no-unused-vars
                    let [_a, hStr, mStr, marker] = match;
                    let h = parseInt(hStr, 10);
                    let m = mStr ? parseInt(mStr, 10) : 0;
                    const isPM = marker ? marker.toLowerCase() === 'pm' : tStr.toUpperCase().includes('PM');
                    const isAM = marker ? marker.toLowerCase() === 'am' : tStr.toUpperCase().includes('AM');
                    if (isPM && h < 12) h += 12;
                    if (isAM && h === 12) h = 0;
                    return h * 60 + m;
                };
                return getMinutes(a.name) - getMinutes(b.name);
            });

        // 10. Assignments by Semester
        const semCounts = {};
        assignments.forEach(a => {
            if (a.sem) semCounts[a.sem] = (semCounts[a.sem] || 0) + 1;
        });
        const assignmentsBySem = Object.keys(semCounts).map(k => ({ name: k, count: semCounts[k] }));

        // 11. Assignments by Group (Section)
        const groupCounts = {};
        assignments.forEach(a => {
            const g = a.section || 'Unknown';
            groupCounts[g] = (groupCounts[g] || 0) + 1;
        });
        const assignmentsByGroup = Object.keys(groupCounts).map(k => ({ name: k, count: groupCounts[k] }));

        // 12. Creation Trend (Last 7 Days)
        const trendCounts = {};
        assignments.forEach(a => {
            if (a.createdAt && typeof a.createdAt === 'string') {
                const date = a.createdAt.split('T')[0];
                trendCounts[date] = (trendCounts[date] || 0) + 1;
            }
        });
        const creationTrend = Object.keys(trendCounts)
            .map(k => ({ date: k, count: trendCounts[k] }))
            .sort((a, b) => a.date.localeCompare(b.date))
            .slice(-14); // Last 14 days

        // 13. Peak Hours (Scatter Data)
        const peakHours = [];
        const dayMap = { 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6, 'Sunday': 7 };
        const getHourVal = (tStr) => {
            if (!tStr) return 0;
            const match = tStr.match(/(\d{1,2})[:.]?(\d{2})?\s*([ap]m)?/i);
            if (!match) return 0;
            // eslint-disable-next-line no-unused-vars, sonarjs/no-unused-vars, sonarjs/no-dead-store
            let [_b, hStr, mStr, marker] = match;
            let h = parseInt(hStr, 10);
            const isPM = marker ? marker.toLowerCase() === 'pm' : tStr.toUpperCase().includes('PM');
            const isAM = marker ? marker.toLowerCase() === 'am' : tStr.toUpperCase().includes('AM');
            if (isPM && h < 12) h += 12;
            if (isAM && h === 12) h = 0;
            return h;
        };

        assignments.forEach(a => {
            if (a.day && a.time && dayMap[a.day]) {
                const timeVal = getHourVal(a.time);
                peakHours.push({
                    day: dayMap[a.day],
                    time: timeVal,
                    z: 1 // Weight
                });
            }
        });
        // Aggregate for Scatter
        const scatterData = [];
        const scatterMap = {};
        peakHours.forEach(p => {
            const key = `${p.day}-${p.time}`;
            if (scatterMap[key]) scatterMap[key].z += 1;
            else scatterMap[key] = { ...p };
        });
        Object.values(scatterMap).forEach(v => scatterData.push(v));



        // 14. Faculty Workload Distribution (Histogram)
        const workloadDist = { '0-5': 0, '6-10': 0, '11-15': 0, '16-20': 0, '20+': 0 };
        Object.values(facCounts).forEach(count => {
            if (count <= 5) workloadDist['0-5']++;
            else if (count <= 10) workloadDist['6-10']++;
            else if (count <= 15) workloadDist['11-15']++;
            else if (count <= 20) workloadDist['16-20']++;
            else workloadDist['20+']++;
        });
        const facultyWorkloadDist = Object.keys(workloadDist).map(k => ({ name: k, count: workloadDist[k] }));

        // 15. Room Utilization Heatmap (Top 5 Rooms vs Time)
        const topRooms = roomUsage.slice(0, 5).map(r => r.name);
        const roomHeatmap = [];
        assignments.forEach(a => {
            if (a.room && topRooms.includes(a.room) && a.time) {
                const getTimeH = (tStr) => {
                    const match = tStr.match(/(\d{1,2})[:.]?(\d{2})?\s*([ap]m)?/i);
                    if (!match) return 0;
                    // eslint-disable-next-line no-unused-vars, sonarjs/no-unused-vars, sonarjs/no-dead-store
                    let [_c, hStr, mStr, marker] = match;
                    let h = parseInt(hStr, 10);
                    const isPM = marker ? marker.toLowerCase() === 'pm' : tStr.toUpperCase().includes('PM');
                    if (isPM && h < 12) h += 12;
                    if (marker && marker.toLowerCase() === 'am' && h === 12) h = 0;
                    return h;
                };
                const timeVal = getTimeH(a.time);
                roomHeatmap.push({ room: a.room, time: timeVal, z: 1 });
            }
        });
        const roomHeatmapAgg = {};
        roomHeatmap.forEach(p => {
            const key = `${p.room}-${p.time}`;
            if (roomHeatmapAgg[key]) roomHeatmapAgg[key].z += 1;
            else roomHeatmapAgg[key] = { ...p };
        });
        const roomHeatmapData = Object.values(roomHeatmapAgg);

        // 16. Dept Resource Utilization
        const deptResources = {};
        assignments.forEach(a => {
            const d = a.dept || 'Unknown';
            if (d !== 'Unknown') {
                if (!deptResources[d]) deptResources[d] = { subjects: new Set(), faculty: new Set(), rooms: new Set() };
                if (a.subject) deptResources[d].subjects.add(a.subject);
                if (a.faculty) deptResources[d].faculty.add(a.faculty);
                if (a.room) deptResources[d].rooms.add(a.room);
            }
        });
        const deptResourceUsage = Object.keys(deptResources).map(d => ({
            name: d,
            subjects: deptResources[d].subjects.size,
            faculty: deptResources[d].faculty.size,
            rooms: deptResources[d].rooms.size
        }));


        // 17. Faculty Subject Variety (Unique subjects per faculty)
        const facSubVariety = {};
        assignments.forEach(a => {
            if (a.subject) {
                if (a.faculty) {
                    const f = a.faculty.trim();
                    if (!facSubVariety[f]) facSubVariety[f] = new Set();
                    facSubVariety[f].add(a.subject);
                }
                if (a.faculty2) {
                    const f = a.faculty2.trim();
                    if (!facSubVariety[f]) facSubVariety[f] = new Set();
                    facSubVariety[f].add(a.subject);
                }
            }
        });
        const facultySubjectVariety = Object.keys(facSubVariety)
            .map(k => ({ name: k, count: facSubVariety[k].size }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // 18. Time of Day Distribution
        // 18. Time of Day Distribution
        const timeDist = { 'Morning (8-12)': 0, 'Afternoon (12-4)': 0, 'Evening (4+)': 0 };
        assignments.forEach(a => {
            const period = classifyTimeOfDay(a.time);
            if (period && timeDist[period] !== undefined) {
                timeDist[period]++;
            }
        });

        // Enforce logical order: Morning -> Afternoon -> Evening
        const timeOfDayDist = [
            { name: 'Morning', count: timeDist['Morning (8-12)'] },
            { name: 'Afternoon', count: timeDist['Afternoon (12-4)'] },
            { name: 'Evening', count: timeDist['Evening (4+)'] }
        ];

        // 19. Daily Workload by Department (Stacked Bar Pivot)
        const dayOrderShort = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const dailyDeptMap = {};
        dayOrderShort.forEach(d => dailyDeptMap[d] = { name: d });

        const allDeptsSet = new Set();

        assignments.forEach(a => {
            const d = a.dept || 'Unknown';
            const dayFull = a.day;
            if (d !== 'Unknown' && dayFull) {
                const dayShort = dayFull.substring(0, 3);
                allDeptsSet.add(d);
                dailyDeptMap[dayShort][d] = (dailyDeptMap[dayShort][d] || 0) + 1;
            }
        });

        const workloadByDayData = dayOrderShort.map(d => dailyDeptMap[d]);
        const departmentList = Array.from(allDeptsSet).sort();

        return {
            counts, assignmentsByDept, facultyWorkload, subjectFrequency, roomUsage, dailyWorkload, facultyByDept, subjectsByDept,
            assignmentsByTime, assignmentsBySem, assignmentsByGroup, creationTrend, scatterData,
            facultyWorkloadDist, roomHeatmapData, deptResourceUsage,
            facultySubjectVariety, timeOfDayDist, workloadByDayData, departmentList,
            facultyList: faculty.map(f => f.name).sort()
        };
    }, [data]);

    const hasInitializedRef = useRef(false);

    // --- Search & Default User Logic ---
    const filteredFaculty = useMemo(() => {
        if (!stats.facultyList) return [];
        const validMatches = stats.facultyList.filter(f => f && normalizeStr(f).includes(normalizeStr(searchTerm)));

        // Allow finding 'All Faculty' if user searches for 'all' or empty
        if (searchTerm === '' || normalizeStr('all faculty').includes(normalizeStr(searchTerm))) {
            return ['All Faculty', ...validMatches];
        }
        return validMatches;
    }, [stats.facultyList, searchTerm]);

    useEffect(() => {
        if (hasInitializedRef.current) return;

        // Wait for loading to finish and data to exist
        if (!loading && stats.facultyList && stats.facultyList.length > 0) {
            if (userProfile?.name && stats.facultyList.includes(userProfile.name)) {
                setSelectedFaculty(userProfile.name);
                setSearchTerm(userProfile.name);
            }
            hasInitializedRef.current = true;
        }
    }, [userProfile, stats.facultyList, loading]);

    const selectedFacultyStats = useMemo(() => {
        if (!selectedFaculty) return null;

        const facultyAssignments = selectedFaculty === 'All Faculty'
            ? data.assignments
            : data.assignments.filter(a => {
                const search = normalizeStr(selectedFaculty);
                const f1 = normalizeStr(a.faculty);
                const f2 = normalizeStr(a.faculty2);

                if (f1 === search || f2 === search) return true;
                if (f1.includes(search) || f2.includes(search)) return true;

                const targetFacultyObj = data.faculty.find(f => normalizeStr(f.name) === search);
                if (targetFacultyObj?.empId) {
                    if (a.facultyEmpId === targetFacultyObj.empId || a.faculty2EmpId === targetFacultyObj.empId) return true;
                }
                return false;
            });

        let labCount = 0;
        let theoryCount = 0;

        // 1. Subject Distribution & Type Count
        const subCounts = {};
        facultyAssignments.forEach(a => {
            if (a.subject) {
                const s = a.subject.trim();
                subCounts[s] = (subCounts[s] || 0) + 1;
            }

            // Lab Detection Logic
            const subjectObj = data.subjects.find(s => s.name === a.subject);
            const isLab = subjectObj?.type === 'lab' ||
                normalizeStr(a.subject).includes('lab') ||
                normalizeStr(a.room).includes('lab');

            if (isLab) labCount++;
            else theoryCount++;
        });
        const subjectDist = Object.keys(subCounts)
            .map(k => ({ name: k, count: subCounts[k] }))
            .sort((a, b) => b.count - a.count) // Descending
            .slice(0, 8); // Limit to top 8 for UI cleanly

        // 2. Daily Schedule
        const dayCounts = { 'Monday': 0, 'Tuesday': 0, 'Wednesday': 0, 'Thursday': 0, 'Friday': 0, 'Saturday': 0, 'Sunday': 0 };
        facultyAssignments.forEach(a => {
            if (a.day) dayCounts[a.day] = (dayCounts[a.day] || 0) + 1;
        });
        const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const dailySchedule = dayOrder.map(d => ({ name: d, count: dayCounts[d] }));

        // 3. Semester Distribution
        const semCounts = {};
        facultyAssignments.forEach(a => {
            if (a.sem) {
                const s = a.sem.trim();
                semCounts[s] = (semCounts[s] || 0) + 1;
            }
        });
        const semesterDist = Object.keys(semCounts)
            .map(k => ({ name: k, count: semCounts[k] }))
            .sort((a, b) => {
                const nA = parseInt(a.name.replace(/\D/g, '')) || 0;
                const nB = parseInt(b.name.replace(/\D/g, '')) || 0;
                return nA - nB;
            });

        return {
            totalClasses: facultyAssignments.length,
            uniqueSubjects: Object.keys(subCounts).length,
            labCount,
            theoryCount,
            subjectDist,
            dailySchedule,
            semesterDist
        };
    }, [selectedFaculty, data.assignments, data.subjects, data.faculty]);

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'];

    // --- Subject Metrics (Correctly placed before return) ---
    const subjectMetrics = useMemo(() => {
        const allSubjects = data.subjects || [];
        const activeSubjects = new Set(data.assignments.map(a => a.subject));

        // Merge Master Data with Schedule Data
        const enriched = allSubjects.map(sub => {
            const subAssignments = data.assignments.filter(a => matchesSubject(a.subject, sub.name));
            const uniqueFaculty = new Set(subAssignments.map(a => a.faculty?.trim()).filter(Boolean));
            // Also add Faculty 2
            subAssignments.forEach(a => {
                if (a.faculty2) uniqueFaculty.add(a.faculty2.trim());
            });

            const uniqueSems = new Set(subAssignments.map(a => a.sem).filter(Boolean));

            // Infer type if missing
            const isLab = sub.type === 'lab' || normalizeStr(sub.name).includes('lab');

            return {
                ...sub,
                isLab,
                weeklyClasses: subAssignments.length,
                facultyCount: uniqueFaculty.size,
                facultyNames: Array.from(uniqueFaculty).sort(), // Added specific list
                semesterCount: uniqueSems.size,
                isActive: activeSubjects.has(sub.name)
            };
        });

        // Filter by search
        const filtered = enriched.filter(s =>
            normalizeStr(s.name).includes(normalizeStr(searchTerm)) ||
            normalizeStr(s.shortCode).includes(normalizeStr(searchTerm))
        );

        // Sort by Weekly Classes (Desc) then Name
        return filtered.sort((a, b) => b.weeklyClasses - a.weeklyClasses || a.name.localeCompare(b.name));
    }, [data.subjects, data.assignments, searchTerm]);

    if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: 'white' }}>Loading Analytics...</div>;

    const renderOverview = () => (
        <div className="analytics-container">
            {/* 1. Stat Cards (Counts) */}
            <div className="stats-grid">
                <div className="stat-card glass-panel">
                    <div className="icon-wrapper" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6' }}><BookOpen size={24} /></div>
                    <div><h3>Total Assignments</h3><p>{stats.counts.assignments}</p></div>
                </div>
                <div className="stat-card glass-panel">
                    <div className="icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981' }}><Users size={24} /></div>
                    <div><h3>Total Faculty</h3><p>{stats.counts.faculty}</p></div>
                </div>
                <div className="stat-card glass-panel">
                    <div className="icon-wrapper" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b' }}><Layers size={24} /></div>
                    <div><h3>Departments</h3><p>{stats.counts.departments}</p></div>
                </div>
                <div className="stat-card glass-panel">
                    <div className="icon-wrapper" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}><MapPin size={24} /></div>
                    <div><h3>Rooms</h3><p>{stats.counts.rooms}</p></div>
                </div>
            </div>

            {/* 2. Charts Grid */}
            <div className="charts-grid">
                {/* Assignments by Department (Bar) */}
                <div className="chart-container glass-panel">
                    <h3>Assignments by Department</h3>
                    <ResponsiveContainer width="100%" height={300} minWidth={0} minHeight={0}>
                        <BarChart data={stats.assignmentsByDept}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis dataKey="name" stroke="#94a3b8" />
                            <YAxis stroke="#94a3b8" />
                            <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
                            <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                                {stats.assignmentsByDept && stats.assignmentsByDept.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Assignments by Day (Area) */}
                <div className="chart-container glass-panel">
                    <h3>Daily Workload Distribution</h3>
                    <ResponsiveContainer width="100%" height={300} minWidth={0} minHeight={0}>
                        <AreaChart data={stats.dailyWorkload}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis dataKey="name" stroke="#94a3b8" interval={0} />
                            <YAxis stroke="#94a3b8" />
                            <Tooltip cursor={{ stroke: 'rgba(255,255,255,0.2)' }} contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
                            <Area type="monotone" dataKey="count" stroke="#8b5cf6" fill="rgba(139, 92, 246, 0.3)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Assignments by Time Slot (Bar) */}
                <div className="chart-container glass-panel">
                    <h3>Time Slot Distribution</h3>
                    <ResponsiveContainer width="100%" height={300} minWidth={0} minHeight={0}>
                        <BarChart data={stats.assignmentsByTime} margin={{ bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis dataKey="name" stroke="#94a3b8" interval={0} angle={-15} textAnchor="end" height={60} style={{ fontSize: '0.8rem' }} />
                            <YAxis stroke="#94a3b8" />
                            <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
                            <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Time of Day Analysis (Pie) */}
                <div className="chart-container glass-panel">
                    <h3>Time of Day Analysis</h3>
                    <ResponsiveContainer width="100%" height={300} minWidth={0} minHeight={0}>
                        <PieChart>
                            <Pie
                                data={stats.timeOfDayDist}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                fill="#8884d8"
                                paddingAngle={5}
                                dataKey="count"
                                startAngle={90}
                                endAngle={-270}
                            >
                                {stats.timeOfDayDist && stats.timeOfDayDist.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
                            <Legend
                                content={() => (
                                    <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginTop: '10px' }}>
                                        {['Morning', 'Afternoon', 'Evening'].map((item, index) => (
                                            <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', fontSize: '0.85rem' }}>
                                                <div style={{ width: '10px', height: '10px', backgroundColor: COLORS[index], borderRadius: '2px' }} />
                                                <span>{item}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* Assignments by Semester (Pie) */}
                <div className="chart-container glass-panel">
                    <h3>Semester Distribution</h3>
                    <ResponsiveContainer width="100%" height={300} minWidth={0} minHeight={0}>
                        <PieChart>
                            <Pie
                                data={stats.assignmentsBySem}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                fill="#8884d8"
                                paddingAngle={5}
                                dataKey="count"
                            >
                                {stats.assignmentsBySem && stats.assignmentsBySem.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* Assignments by Group (Pie) */}
                <div className="chart-container glass-panel">
                    <h3>Section/Group Distribution</h3>
                    <ResponsiveContainer width="100%" height={300} minWidth={0} minHeight={0}>
                        <PieChart>
                            <Pie
                                data={stats.assignmentsByGroup}
                                cx="50%"
                                cy="50%"
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="count"
                                label
                            >
                                {stats.assignmentsByGroup && stats.assignmentsByGroup.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* Creation Trend (Line) */}
                <div className="chart-container glass-panel" style={{ gridColumn: '1 / -1' }}>
                    <h3>Assignment Creation Activity (Last 14 Days)</h3>
                    <ResponsiveContainer width="100%" height={300} minWidth={0} minHeight={0}>
                        <LineChart data={stats.creationTrend}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis dataKey="date" stroke="#94a3b8" />
                            <YAxis stroke="#94a3b8" />
                            <Tooltip cursor={{ stroke: 'rgba(255,255,255,0.2)' }} contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
                            <Line type="monotone" dataKey="count" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                {/* Peak Hours Heatmap (Scatter) */}
                <div className="chart-container glass-panel" style={{ gridColumn: '1 / -1' }}>
                    <h3>Peak Hours Heatmap (Day vs Time)</h3>
                    <ResponsiveContainer width="100%" height={400}>
                        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis type="number" dataKey="day" name="Day" tickFormatter={d => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d - 1]} stroke="#94a3b8" domain={[1, 7]} tickCount={7} />
                            <YAxis type="number" dataKey="time" name="Hour" unit=":00" stroke="#94a3b8" domain={[8, 18]} />
                            <ZAxis type="number" dataKey="z" range={[50, 500]} name="Classes" />
                            <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
                            <Scatter name="Classes" data={stats.scatterData} fill="#ec4899" />
                        </ScatterChart>
                    </ResponsiveContainer>
                </div>

                {/* Top 5 Faculty (Mini Bar) */}
                <div className="chart-container glass-panel">
                    <h3>Top 5 Busiest Faculty</h3>
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={stats.facultyWorkload.slice(0, 5)} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis type="number" stroke="#94a3b8" />
                            <YAxis dataKey="name" type="category" stroke="#94a3b8" width={100} tick={{ fontSize: 12 }} />
                            <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
                            <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Top 5 Rooms (Mini Bar) */}
                <div className="chart-container glass-panel">
                    <h3>Top 5 Busiest Rooms</h3>
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={stats.roomUsage.slice(0, 5)} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis type="number" stroke="#94a3b8" />
                            <YAxis dataKey="name" type="category" stroke="#94a3b8" width={100} tick={{ fontSize: 12 }} />
                            <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
                            <Bar dataKey="count" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={20} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );

    const renderFaculty = () => (
        <div className="analytics-grid">

            {/* 1. Premium Deep Dive Card (Now Top) */}
            <div className="glass-panel" style={{ gridColumn: '1 / -1', padding: '0', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                {/* Header / Toolbar */}
                <div style={{
                    padding: '1.5rem',
                    background: 'linear-gradient(to right, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.8))',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem'
                }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Users size={20} className="text-accent" />
                            Faculty Schedule Inspector
                        </h3>
                        <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '0.9rem' }}>
                            Select any faculty member to analyze their complete weekly schedule.
                        </p>
                    </div>

                    {/* Integrated Searchable Dropdown */}
                    <div style={{ position: 'relative', width: '100%', maxWidth: '350px', zIndex: isDropdownOpen ? 45 : 'auto' }}>
                        <div style={{ position: 'relative', zIndex: 51 }}>
                            <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    if (selectedFaculty && e.target.value !== selectedFaculty) {
                                        setSelectedFaculty('');
                                    }
                                    setIsDropdownOpen(true);
                                }}
                                onFocus={() => setIsDropdownOpen(true)}
                                placeholder="Search Faculty Member..."
                                className="glass-input"
                                style={{
                                    width: '100%',
                                    padding: '0.75rem 1rem 0.75rem 2.75rem',
                                    paddingRight: searchTerm ? '2.5rem' : '1rem',
                                    borderRadius: '12px',
                                    background: 'rgba(0,0,0,0.3)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    color: 'white',
                                    fontSize: '0.95rem'
                                }}
                            />
                            {searchTerm && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSearchTerm('');
                                        setSelectedFaculty('');
                                        setIsDropdownOpen(true);
                                    }}
                                    style={{
                                        position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                                        background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center',
                                        zIndex: 100,
                                        width: '24px', height: '24px', justifyContent: 'center'
                                    }}
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>

                        {/* Dropdown List */}
                        {isDropdownOpen && (
                            <>
                                <div
                                    style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                                    onClick={() => setIsDropdownOpen(false)}
                                />
                                <div style={{
                                    position: 'absolute',
                                    top: 'calc(100% + 8px)',
                                    left: 0,
                                    right: 0,
                                    background: '#1e293b',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '12px',
                                    maxHeight: '300px',
                                    overflowY: 'auto',
                                    zIndex: 50,
                                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)'
                                }}>
                                    {filteredFaculty.map(f => (
                                        <div
                                            key={f}
                                            onClick={() => {
                                                setSelectedFaculty(f);
                                                setSearchTerm(f);
                                                setIsDropdownOpen(false);
                                            }}
                                            style={{
                                                padding: '0.75rem 1rem',
                                                cursor: 'pointer',
                                                color: 'white',
                                                borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                background: f === selectedFaculty ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                                                transition: 'background 0.2s'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = f === selectedFaculty ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.05)'}
                                            onMouseLeave={e => e.currentTarget.style.background = f === selectedFaculty ? 'rgba(59, 130, 246, 0.2)' : 'transparent'}
                                        >
                                            {f}
                                        </div>
                                    ))}
                                    {filteredFaculty.length === 0 && (
                                        <div style={{ padding: '1rem', color: '#64748b', textAlign: 'center' }}>No faculty found</div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Content Body */}
                <div style={{ padding: '1.5rem', background: 'rgba(15, 23, 42, 0.4)' }}>
                    {selectedFaculty && selectedFacultyStats ? (
                        <div className="animate-fade-in charts-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>

                            {/* Left: Quick Stats Grid */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                {/* Mini Stats Grid */}
                                <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div style={{ padding: '1.25rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '16px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                                        <div style={{ color: '#60a5fa', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Total Load</div>
                                        <div style={{ fontSize: '2.5rem', fontWeight: '800', color: 'white', lineHeight: 1 }}>{selectedFacultyStats.totalClasses}</div>
                                        <div style={{ fontSize: '0.8rem', color: '#93c5fd', marginTop: '4px' }}>Classes / Week</div>
                                    </div>
                                    <div style={{ padding: '1.25rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '16px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                                        <div style={{ color: '#34d399', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Subjects</div>
                                        <div style={{ fontSize: '2.5rem', fontWeight: '800', color: 'white', lineHeight: 1 }}>{selectedFacultyStats.uniqueSubjects}</div>
                                        <div style={{ fontSize: '0.8rem', color: '#6ee7b7', marginTop: '4px' }}>Unique Taught</div>
                                    </div>
                                    {/* New Breakdown Stats */}
                                    <div style={{ padding: '1.25rem', background: 'rgba(139, 92, 246, 0.1)', borderRadius: '16px', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                                        <div style={{ color: '#a78bfa', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Theory</div>
                                        <div style={{ fontSize: '2.5rem', fontWeight: '800', color: 'white', lineHeight: 1 }}>{selectedFacultyStats.theoryCount}</div>
                                        <div style={{ fontSize: '0.8rem', color: '#c4b5fd', marginTop: '4px' }}>Lecture Hours</div>
                                    </div>
                                    <div style={{ padding: '1.25rem', background: 'rgba(236, 72, 153, 0.1)', borderRadius: '16px', border: '1px solid rgba(236, 72, 153, 0.2)' }}>
                                        <div style={{ color: '#f472b6', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Labs</div>
                                        <div style={{ fontSize: '2.5rem', fontWeight: '800', color: 'white', lineHeight: 1 }}>{selectedFacultyStats.labCount}</div>
                                        <div style={{ fontSize: '0.8rem', color: '#fbcfe8', marginTop: '4px' }}>Practical Sessions</div>
                                    </div>
                                </div>

                                {/* Subject Distribution List */}
                                <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <h4 style={{ margin: '0 0 1rem 0', color: '#e2e8f0', fontSize: '1rem' }}>Subject Portfolio</h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        {selectedFacultyStats.subjectDist.map((sub, idx) => (
                                            <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: COLORS[idx % COLORS.length] }}></div>
                                                    <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>{sub.name}</span>
                                                </div>
                                                <div style={{ fontSize: '0.85rem', fontWeight: '600', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '12px', color: 'white' }}>
                                                    {sub.count}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Semester Workload List - NEW ADDITION */}
                                <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <h4 style={{ margin: '0 0 1rem 0', color: '#e2e8f0', fontSize: '1rem' }}>Semester Breakdown</h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '0.75rem' }}>
                                        {selectedFacultyStats.semesterDist.map((sem, idx) => (
                                            <div
                                                key={idx}
                                                onClick={() => setViewSemesterDetails(sem.name)}
                                                className="hover-lift"
                                                style={{
                                                    background: 'rgba(59, 130, 246, 0.1)',
                                                    border: '1px solid rgba(59, 130, 246, 0.2)',
                                                    padding: '0.75rem',
                                                    borderRadius: '12px',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    justifyContent: 'center',
                                                    alignItems: 'center',
                                                    textAlign: 'center',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#93c5fd' }}>{sem.count}</div>
                                                <div style={{ fontSize: '0.7rem', color: '#cbd5e1', marginTop: '2px', fontWeight: '600' }}>{sem.name}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Right: The "Bit by Bit" Timeline */}
                            <div style={{
                                background: 'rgba(0, 0, 0, 0.2)',
                                borderRadius: '16px',
                                border: '1px solid rgba(255, 255, 255, 0.05)',
                                overflow: 'hidden',
                                display: 'flex',
                                flexDirection: 'column'
                            }}>
                                <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.01)' }}>
                                    <h4 style={{ margin: 0, color: '#fcd34d', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Calendar size={16} /> Weekly Timeline
                                    </h4>
                                </div>

                                <div style={{ padding: '1rem', maxHeight: '80vh', overflowY: 'auto' }}>
                                    {data.assignments
                                        .filter(a => {
                                            if (selectedFaculty === 'All Faculty') return true;
                                            const search = normalizeStr(selectedFaculty);
                                            const f1 = normalizeStr(a.faculty);
                                            const f2 = normalizeStr(a.faculty2);

                                            if (f1.includes(search) || f2.includes(search)) return true;

                                            const targetFacultyObj = data.faculty.find(f => normalizeStr(f.name) === search);
                                            if (targetFacultyObj?.empId) {
                                                if (a.facultyEmpId === targetFacultyObj.empId || a.faculty2EmpId === targetFacultyObj.empId) return true;
                                            }
                                            return false;
                                        })
                                        .sort((a, b) => {
                                            const days = { 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6, 'Sunday': 7 };
                                            if (days[a.day] !== days[b.day]) return days[a.day] - days[b.day];
                                            return a.time.localeCompare(b.time);
                                        })
                                        .map((assignment, idx, arr) => {
                                            const isNewDay = idx === 0 || assignment.day !== arr[idx - 1].day;

                                            // Determine if Lab or Theory
                                            const subjectObj = data.subjects.find(s => normalizeStr(s.name) === normalizeStr(assignment.subject));
                                            const isLab = subjectObj?.type === 'lab' ||
                                                normalizeStr(assignment.subject).includes('lab') ||
                                                normalizeStr(assignment.room).includes('lab');

                                            // Visual Config
                                            const borderColor = isLab ? '#ec4899' : '#8b5cf6'; // Pink for Lab, Purple for Theory
                                            const bgColor = isLab
                                                ? 'linear-gradient(145deg, rgba(80, 7, 36, 0.4), rgba(15, 23, 42, 0.6))'
                                                : 'linear-gradient(145deg, rgba(30, 41, 59, 0.6), rgba(15, 23, 42, 0.6))';
                                            const badgeColor = isLab ? '#f472b6' : '#a78bfa';
                                            const badgeBg = isLab ? 'rgba(236, 72, 153, 0.15)' : 'rgba(139, 92, 246, 0.15)';

                                            return (
                                                <div key={idx} style={{ marginBottom: isNewDay ? '1rem' : '0.5rem' }}>
                                                    {isNewDay && (
                                                        <div style={{
                                                            padding: '0.5rem 0',
                                                            color: '#94a3b8',
                                                            fontSize: '0.85rem',
                                                            fontWeight: 'bold',
                                                            textTransform: 'uppercase',
                                                            letterSpacing: '1px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '1rem'
                                                        }}>
                                                            {assignment.day}
                                                            <div style={{ height: '1px', flex: 1, background: 'rgba(255,255,255,0.1)' }}></div>
                                                        </div>
                                                    )}

                                                    <div className="hover-lift faculty-timeline-card" style={{
                                                        padding: '1.25rem',
                                                        background: bgColor,
                                                        borderTop: '1px solid rgba(255,255,255,0.08)',
                                                        borderRight: '1px solid rgba(255,255,255,0.05)',
                                                        borderBottom: '1px solid rgba(0,0,0,0.3)',
                                                        borderLeft: `4px solid ${borderColor}`,
                                                        borderRadius: '16px',
                                                        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                                                        marginBottom: '0.75rem',
                                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                                        backdropFilter: 'blur(12px)',
                                                        position: 'relative',

                                                    }}>

                                                        {/* Time Column */}
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid rgba(255,255,255,0.05)', paddingRight: '1rem' }}>
                                                            <div style={{
                                                                color: 'white',
                                                                fontWeight: '800',
                                                                fontSize: '1rem',
                                                                letterSpacing: '-0.5px'
                                                            }}>
                                                                {assignment.time.split(' - ')[0]}
                                                            </div>
                                                            <div style={{
                                                                color: '#94a3b8',
                                                                fontSize: '0.75rem',
                                                                marginTop: '4px',
                                                                fontWeight: '500'
                                                            }}>
                                                                {assignment.time.split(' - ')[1]}
                                                            </div>
                                                            {/* Semester Badge (Moved here) */}
                                                            <div style={{
                                                                marginTop: '8px',
                                                                fontSize: '0.7rem', fontWeight: '800',
                                                                background: badgeBg,
                                                                color: badgeColor,
                                                                padding: '2px 8px', borderRadius: '10px',
                                                                border: `1px solid ${isLab ? 'rgba(236, 72, 153, 0.3)' : 'rgba(139, 92, 246, 0.3)'}`,
                                                                textAlign: 'center',
                                                                letterSpacing: '0.5px'
                                                            }}>
                                                                {assignment.sem}
                                                            </div>
                                                        </div>

                                                        {/* Details Column */}
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', justifyContent: 'center' }}>
                                                            <div style={{ fontWeight: '700', color: '#f8fafc', fontSize: '1.05rem', letterSpacing: '0.2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                {assignment.subject}
                                                                {/* Type Badge */}
                                                                <span style={{
                                                                    fontSize: '0.65rem', fontWeight: '800',
                                                                    background: badgeBg,
                                                                    color: badgeColor,
                                                                    padding: '2px 6px', borderRadius: '4px',
                                                                    border: `1px solid ${badgeBg}`,
                                                                    textTransform: 'uppercase',
                                                                    letterSpacing: '0.5px'
                                                                }}>
                                                                    {isLab ? 'LAB' : 'THEORY'}
                                                                </span>
                                                            </div>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                                                                {/* Dept Badge (Blue Pill) */}
                                                                <span style={{
                                                                    fontSize: '0.75rem', fontWeight: '800',
                                                                    background: 'linear-gradient(to right, rgba(59, 130, 246, 0.2), rgba(37, 99, 235, 0.2))',
                                                                    color: '#60a5fa',
                                                                    padding: '4px 10px', borderRadius: '20px',
                                                                    border: '1px solid rgba(59, 130, 246, 0.3)',
                                                                    boxShadow: '0 2px 5px rgba(59, 130, 246, 0.1)'
                                                                }}>
                                                                    {assignment.dept}
                                                                </span>



                                                                {/* Section Badge (Purple Square/Rough) */}
                                                                <span style={{
                                                                    fontSize: '0.75rem', fontWeight: '800',
                                                                    background: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa',
                                                                    padding: '4px 8px', borderRadius: '6px',
                                                                    border: '1px solid rgba(139, 92, 246, 0.3)'
                                                                }}>
                                                                    {assignment.section}
                                                                </span>

                                                                {/* Group Badge (Amber Circle/Round) */}
                                                                {assignment.group && assignment.group !== 'All' && (
                                                                    <span style={{
                                                                        fontSize: '0.75rem', fontWeight: '800',
                                                                        background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24',
                                                                        padding: '4px 8px', borderRadius: '6px',
                                                                        border: '1px solid rgba(245, 158, 11, 0.3)'
                                                                    }}>
                                                                        {assignment.group}
                                                                    </span>
                                                                )}

                                                                {/* Co-Faculty / Faculty Badge */}
                                                                {(() => {
                                                                    const otherFac = selectedFaculty === 'All Faculty'
                                                                        ? `${assignment.faculty}${assignment.faculty2 ? ` & ${assignment.faculty2}` : ''}` // eslint-disable-line sonarjs/no-nested-template-literals
                                                                        : (() => { // eslint-disable-line sonarjs/no-nested-functions
                                                                            const search = normalizeStr(selectedFaculty);
                                                                            const f1 = normalizeStr(assignment.faculty);

                                                                            // If selected is F1, show F2. If selected is F2, show F1.
                                                                            // Use robust matching to decide
                                                                            const isF1 = f1 === search || f1.includes(search);

                                                                            return isF1 ? assignment.faculty2 : assignment.faculty;
                                                                        })();

                                                                    if (!otherFac) return null;

                                                                    return (
                                                                        <span style={{
                                                                            fontSize: '0.75rem', fontWeight: '800',
                                                                            background: 'rgba(79, 70, 229, 0.15)', color: '#a5b4fc',
                                                                            padding: '4px 8px', borderRadius: '6px',
                                                                            border: '1px solid rgba(79, 70, 229, 0.25)',
                                                                            display: 'flex', alignItems: 'center', gap: '4px'
                                                                        }}>
                                                                            <User size={12} />
                                                                            {selectedFaculty !== 'All Faculty' ? <span style={{ opacity: 0.7, marginRight: '1px' }}>w/</span> : ''}
                                                                            {otherFac}
                                                                        </span>
                                                                    );
                                                                })()}

                                                                {/* Room Badge (Ghost) */}
                                                                <span style={{
                                                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                    fontSize: '0.75rem', fontWeight: '600',
                                                                    color: '#cbd5e1',
                                                                    padding: '4px 8px', borderRadius: '6px', border: '1px dashed rgba(255,255,255,0.2)',
                                                                    marginLeft: 'auto'
                                                                }}>
                                                                    <MapPin size={12} className="text-muted" /> {assignment.room}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}


                                    {data.assignments.filter(a => {
                                        if (selectedFaculty === 'All Faculty') return true;
                                        const search = normalizeStr(selectedFaculty);
                                        const f1 = normalizeStr(a.faculty);
                                        const f2 = normalizeStr(a.faculty2);

                                        if (f1.includes(search) || f2.includes(search)) return true;
                                        const targetFacultyObj = data.faculty.find(f => normalizeStr(f.name) === search);
                                        if (targetFacultyObj?.empId) {
                                            if (a.facultyEmpId === targetFacultyObj.empId || a.faculty2EmpId === targetFacultyObj.empId) return true;
                                        }
                                        return false;
                                    }).length === 0 && (
                                            <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                                                <CalendarOff size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                                                <p>No classes found for this faculty member.</p>
                                            </div>
                                        )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style={{
                            height: '300px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#64748b',
                            border: '2px dashed rgba(255,255,255,0.1)',
                            borderRadius: '16px'
                        }}>
                            <Search size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                            <h3 style={{ color: '#94a3b8', margin: '0 0 0.5rem 0' }}>No Faculty Selected</h3>
                            <p style={{ margin: 0, fontSize: '0.9rem' }}>Choose a faculty member from the list above or the chart to get started.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* 2. Advanced Workload Explorer (Bar Chart - Now Bottom) */}
            <div className="glass-panel" style={{ gridColumn: '1 / -1', padding: '2rem' }}>
                <h3 style={{ marginBottom: '1.5rem', color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Activity size={20} color="var(--color-accent)" />
                    Faculty Workload Overview
                </h3>
                <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>
                    Visual comparison of weekly class load across all faculty members.
                </p>

                <div style={{ height: '400px' }}>
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                        <BarChart
                            data={stats.facultyWorkload}
                            layout="vertical"
                            margin={{ left: 20, right: 20 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis type="number" stroke="#94a3b8" />
                            <YAxis dataKey="name" type="category" stroke="#94a3b8" width={150} tick={{ fontSize: 12 }} />
                            <Tooltip
                                cursor={{ fill: 'transparent' }}
                                contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }}
                            />
                            <Bar
                                dataKey="count"
                                fill="#3b82f6"
                                radius={[0, 4, 4, 0]}
                                barSize={30}
                                onClick={(data) => {
                                    setSelectedFaculty(data.name);
                                    setSearchTerm(data.name);
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                style={{ cursor: 'pointer' }}
                            >
                                {stats.facultyWorkload.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={selectedFaculty === entry.name ? '#f59e0b' : '#3b82f6'}
                                        cursor="pointer"
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

        </div>
    );
    const renderDepartments = () => {
        return (
            <div className="analytics-grid">
                {/* --- DETAILED LIST --- */}
                <div className="glass-panel" style={{ gridColumn: '1 / -1', padding: '1.5rem' }}>
                    <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h3>Detailed Department Analysis</h3>
                        <div className="search-bar" style={{ width: '300px' }}>
                            <Search size={16} />
                            <input
                                type="text"
                                placeholder="Search departments..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{ background: 'transparent', border: 'none', color: 'white', width: '100%', outline: 'none' }}
                            />
                        </div>
                    </div>

                    <div className="table-container" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', color: '#cbd5e1' }}>
                            <thead style={{ position: 'sticky', top: 0, background: '#0f172a', zIndex: 10 }}>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left' }}>
                                    <th style={{ padding: isMobile ? '0.75rem 0.5rem' : '1rem' }}>Department</th>
                                    <th style={{ padding: isMobile ? '0.75rem 0.5rem' : '1rem' }}>Subjects</th>
                                    <th style={{ padding: '1rem' }} className="hide-mobile">Faculty Count</th>
                                    <th style={{ padding: '1rem' }} className="hide-mobile">Labs vs Theory</th>
                                    <th style={{ padding: isMobile ? '0.75rem 0.5rem' : '1rem' }}>Classes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {deptMetrics
                                    .filter(d => normalizeStr(d.name).includes(normalizeStr(searchTerm)))
                                    .map(dep => (
                                        <tr
                                            key={dep.name}
                                            style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}
                                            className="hover-row"
                                            onClick={() => setViewDepartmentDetails(dep)}
                                        >
                                            <td style={{ padding: isMobile ? '0.75rem 0.5rem' : '1rem' }}>
                                                <div style={{ fontWeight: 'bold', color: 'white', fontSize: isMobile ? '0.9rem' : '1rem' }}>{dep.name}</div>
                                                {/* Mobile Subtitle */}
                                                {isMobile && (
                                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                                                        {dep.facultyCount} Faculty • {dep.labs}L/{dep.theory}T
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: isMobile ? '0.75rem 0.5rem' : '1rem' }}>{dep.subjectCount}</td>
                                            <td style={{ padding: '1rem' }} className="hide-mobile">{dep.facultyCount}</td>
                                            <td style={{ padding: '1rem' }} className="hide-mobile">
                                                <div style={{ display: 'flex', gap: '8px', fontSize: '0.8rem' }}>
                                                    <span style={{ color: '#fca5a5' }}>{dep.labs} L</span>
                                                    <span style={{ color: '#93c5fd' }}>{dep.theory} T</span>
                                                </div>
                                            </td>
                                            <td style={{ padding: isMobile ? '0.75rem 0.5rem' : '1rem', color: '#fbbf24', fontWeight: 'bold' }}>{dep.classes}</td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="chart-container glass-panel" style={{ gridColumn: '1 / -1' }}>
                    <h3>Average Daily Workload (Stacked by Dept)</h3>
                    <ResponsiveContainer width="100%" height={400}>
                        <BarChart data={stats.workloadByDayData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis dataKey="name" stroke="#94a3b8" />
                            <YAxis stroke="#94a3b8" />
                            <Tooltip contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} cursor={{ fill: 'transparent' }} />
                            <Legend />
                            {stats.departmentList.map((dept, index) => (
                                <Bar
                                    key={dept}
                                    dataKey={dept}
                                    stackId="a"
                                    fill={COLORS[index % COLORS.length]}
                                    name={dept}
                                />
                            ))}
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        );
    };

    // --- RENDER FUNCTIONS ---

    const renderSubjects = () => {
        const totalSubjects = data.subjects.length;
        const activeCount = subjectMetrics.filter(s => s.isActive).length;
        const labCount = subjectMetrics.filter(s => s.isLab).length;
        const theoryCount = totalSubjects - labCount;

        return (
            <div className="analytics-container" style={{ gap: '1.5rem' }}>
                {/* --- METRIC CARDS --- */}
                <div className="stats-grid">
                    <div className="stat-card glass-panel">
                        <div className="icon-wrapper" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa' }}>
                            <BookOpen size={24} />
                        </div>
                        <div className="stat-content">
                            <h3>Total Subjects</h3>
                            <p>{totalSubjects}</p>
                            <span className="trend positive">{activeCount} Currently Scheduled</span>
                        </div>
                    </div>

                    <div className="stat-card glass-panel">
                        <div className="icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399' }}>
                            <Activity size={24} />
                        </div>
                        <div className="stat-content">
                            <h3>Subject Types</h3>
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                <div style={{ fontSize: '0.9rem' }}>
                                    <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>{theoryCount}</span> Theory
                                </div>
                                <div style={{ fontSize: '0.9rem' }}>
                                    <span style={{ color: '#f87171', fontWeight: 'bold' }}>{labCount}</span> Labs
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="stat-card glass-panel">
                        <div className="icon-wrapper" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24' }}>
                            <Layers size={24} />
                        </div>
                        <div className="stat-content">
                            <h3>Heaviest Subject</h3>
                            <p style={{ fontSize: '1.2rem' }}>{subjectMetrics[0]?.name || 'N/A'}</p>
                            <span className="trend">{subjectMetrics[0]?.weeklyClasses || 0} Classes/Week</span>
                        </div>
                    </div>
                </div> {/* End of stats-grid */}

                {/* --- DETAILED LIST (Moved to Top) --- */}
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                    <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h3>Detailed Subject Analysis (Click row for details)</h3>
                        <div className="search-bar" style={{ width: '300px' }}>
                            <Search size={16} />
                            <input
                                type="text"
                                placeholder="Search subjects..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{ background: 'transparent', border: 'none', color: 'white', width: '100%', outline: 'none' }}
                            />
                        </div>
                    </div>

                    <div className="table-container" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', color: '#cbd5e1' }}>
                            <thead style={{ position: 'sticky', top: 0, background: '#0f172a', zIndex: 10 }}>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left' }}>
                                    <th style={{ padding: isMobile ? '0.75rem 0.5rem' : '1rem' }}>Subject Name</th>
                                    <th style={{ padding: isMobile ? '0.75rem 0.5rem' : '1rem' }} className="hide-mobile">Code</th>
                                    <th style={{ padding: isMobile ? '0.75rem 0.5rem' : '1rem' }} className="hide-mobile">Dept</th>
                                    <th style={{ padding: isMobile ? '0.75rem 0.5rem' : '1rem' }}>Type</th>
                                    <th style={{ padding: isMobile ? '0.75rem 0.5rem' : '1rem' }}>Classes</th>
                                    <th style={{ padding: isMobile ? '0.75rem 0.5rem' : '1rem' }} className="hide-mobile">Faculty</th>
                                </tr>
                            </thead>
                            <tbody>
                                {subjectMetrics.map(sub => (
                                    <tr
                                        key={sub.id}
                                        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s', cursor: 'pointer' }}
                                        className="hover-row"
                                        onClick={() => setViewSemesterDetails(sub)}
                                    >
                                        <td style={{ padding: isMobile ? '0.75rem 0.5rem' : '1rem' }}>
                                            <div style={{ fontWeight: '600', color: 'white', fontSize: isMobile ? '0.9rem' : '1rem' }}>{sub.name}</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                                {sub.isActive && <span style={{ fontSize: '0.7rem', color: '#10b981' }}>● Active</span>}
                                                {isMobile && sub.shortCode && <span style={{ fontSize: '0.7rem', color: '#94a3b8', background: 'rgba(255,255,255,0.05)', padding: '0 4px', borderRadius: '2px' }}>{sub.shortCode}</span>}
                                            </div>
                                        </td>
                                        <td style={{ padding: '1rem', fontFamily: 'monospace', color: '#94a3b8' }} className="hide-mobile">{sub.shortCode || '-'}</td>
                                        <td style={{ padding: '1rem' }} className="hide-mobile">{sub.dept || 'General'}</td>
                                        <td style={{ padding: isMobile ? '0.75rem 0.5rem' : '1rem' }}>
                                            <span style={{
                                                padding: '2px 6px',
                                                borderRadius: '12px',
                                                fontSize: '0.65rem',
                                                background: sub.isLab ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                                                color: sub.isLab ? '#fca5a5' : '#93c5fd'
                                            }}>
                                                {sub.isLab ? 'LAB' : 'TH'}
                                            </span>
                                        </td>
                                        <td style={{ padding: isMobile ? '0.75rem 0.5rem' : '1rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {!isMobile && (
                                                    <div style={{ width: '40px', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                                                        <div style={{ width: `${Math.min((sub.weeklyClasses / 20) * 100, 100)}%`, height: '100%', background: '#8b5cf6' }}></div>
                                                    </div>
                                                )}
                                                <span style={{ fontWeight: 'bold', color: '#e2e8f0' }}>{sub.weeklyClasses}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '1rem' }} className="hide-mobile">
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', fontSize: '0.85rem' }}>
                                                {sub.facultyNames.slice(0, 2).map((f, i) => (
                                                    <span key={i} style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>{f}</span>
                                                ))}
                                                {sub.facultyNames.length > 2 && <span style={{ color: '#94a3b8', padding: '2px' }}>+{sub.facultyNames.length - 2}</span>}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {subjectMetrics.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                                No subjects found.
                            </div>
                        )}
                    </div>
                </div>

                {/* --- CHARTS ROW --- */}
                <div className="charts-grid">
                    <div className="chart-container glass-panel">
                        <h3>Top 10 Most Frequent Subjects (Load)</h3>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={subjectMetrics.slice(0, 10)}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                <XAxis
                                    dataKey="name"
                                    stroke="#94a3b8"
                                    tickFormatter={(val) => val.length > 10 ? val.substring(0, 10) + '...' : val}
                                />
                                <YAxis stroke="#94a3b8" />
                                <Tooltip
                                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                    contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
                                />
                                <Bar dataKey="weeklyClasses" name="Weekly Classes" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="chart-container glass-panel">
                        <h3>Type Distribution</h3>
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={[
                                        { name: 'Theory', value: theoryCount },
                                        { name: 'Lab', value: labCount }
                                    ]}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    <Cell key="theory" fill="#3b82f6" />
                                    <Cell key="lab" fill="#ef4444" />
                                </Pie>
                                <Tooltip contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
                                <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>



                {/* --- SUBJECT DETAILS POPUP (PREMIUM DESIGN - CENTERED FIX) --- */}
                {/* Subject Details Popup Moved to Portal Below */}
            </div>
        );
    };

    const renderRooms = () => (
        <div className="analytics-grid">
            {/* --- DETAILED LIST --- */}
            <div className="glass-panel" style={{ gridColumn: '1 / -1', padding: '1.5rem' }}>
                <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3>Detailed Room Analysis</h3>
                    <div className="search-bar" style={{ width: '300px' }}>
                        <Search size={16} />
                        <input
                            type="text"
                            placeholder="Search rooms..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ background: 'transparent', border: 'none', color: 'white', width: '100%', outline: 'none' }}
                        />
                    </div>
                </div>

                <div className="table-container" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', color: '#cbd5e1' }}>
                        <thead style={{ position: 'sticky', top: 0, background: '#0f172a', zIndex: 10 }}>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left' }}>
                                <th style={{ padding: isMobile ? '0.75rem 0.5rem' : '1rem' }}>Room</th>
                                <th style={{ padding: isMobile ? '0.75rem 0.5rem' : '1rem' }}>Classes</th>
                                <th style={{ padding: isMobile ? '0.75rem 0.5rem' : '1rem' }} className="hide-mobile">Subjects</th>
                                <th style={{ padding: isMobile ? '0.75rem 0.5rem' : '1rem' }} className="hide-mobile">Faculty</th>
                                <th style={{ padding: isMobile ? '0.75rem 0.5rem' : '1rem' }}>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {roomMetrics
                                .filter(r => normalizeStr(r.name).includes(normalizeStr(searchTerm)))
                                .map(room => (
                                    <tr
                                        key={room.name}
                                        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}
                                        className="hover-row"
                                        onClick={() => setViewRoomDetails(room)}
                                    >
                                        <td style={{ padding: isMobile ? '0.75rem 0.5rem' : '1rem', fontWeight: 'bold', color: 'white', fontFamily: 'monospace' }}>{room.name}</td>
                                        <td style={{ padding: isMobile ? '0.75rem 0.5rem' : '1rem', color: '#fbbf24', fontWeight: 'bold' }}>{room.classes}</td>
                                        <td style={{ padding: '1rem' }} className="hide-mobile">{room.subjectCount}</td>
                                        <td style={{ padding: '1rem' }} className="hide-mobile">{room.facultyCount}</td>
                                        <td style={{ padding: isMobile ? '0.75rem 0.5rem' : '1rem' }}>
                                            {room.classes > 30 ? (
                                                <span style={{ color: '#f87171', background: 'rgba(248, 113, 113, 0.1)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>High</span>
                                            ) : (
                                                <span style={{ color: '#4ade80', background: 'rgba(74, 222, 128, 0.1)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>OK</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="chart-container glass-panel">
                <h3>Room Usage Frequency</h3>
                <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={stats.roomUsage}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis dataKey="name" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
                        <Bar dataKey="count" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
            <div className="chart-container glass-panel">
                <h3>Room Utilization Heatmap (Top 5 Rooms vs Time)</h3>
                <ResponsiveContainer width="100%" height={400}>
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis type="number" dataKey="time" name="Hour" unit=":00" stroke="#94a3b8" domain={[8, 18]} />
                        <YAxis type="category" dataKey="room" name="Room" stroke="#94a3b8" width={100} />
                        <ZAxis type="number" dataKey="z" range={[50, 500]} name="Classes" />
                        <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
                        <Scatter name="Usage" data={stats.roomHeatmapData} fill="#10b981" />
                    </ScatterChart>
                </ResponsiveContainer>
            </div>
        </div>
    );

    return (
        <div className="analytics-page">
            <div className="page-header">
                <h2 style={{ fontSize: '2rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <ChartBar size={32} /> Analytics Dashboard
                </h2>
                <div style={{ position: 'relative', minWidth: '200px' }}>
                    <AcademicYearSelector />
                </div>
            </div>

            {/* Tabs */}
            <div className="tabs-container mobile-scroll-tabs" style={{ flexWrap: 'nowrap' }}>
                {['overview', 'faculty', 'departments', 'subjects', 'rooms'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
                    >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="tab-content">
                {activeTab === 'overview' && renderOverview()}
                {activeTab === 'faculty' && renderFaculty()}
                {activeTab === 'departments' && renderDepartments()}
                {activeTab === 'subjects' && renderSubjects()}
                {activeTab === 'rooms' && renderRooms()}
            </div>

            {/* --- PORTAL IMPLEMENTATIONS --- */}

            {/* SUBJECT DETAIL PORTAL (RESTORED PREMIUM) */}
            {viewSemesterDetails && viewSemesterDetails.facultyNames && createPortal(
                <div className="modal-overlay" onClick={() => setViewSemesterDetails(null)} style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 99999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backdropFilter: 'blur(8px)',
                    background: 'rgba(0,0,0,0.7)'
                }}>
                    <div className="modal-content glass-panel" onClick={e => e.stopPropagation()} style={{
                        maxWidth: '900px',
                        width: '95%',
                        maxHeight: '85vh',
                        overflowY: 'auto',
                        border: '1px solid rgba(255,255,255,0.1)',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                        padding: 0,
                        margin: 'auto',
                        position: 'relative',
                        background: '#0f1115'
                    }}>
                        {/* Premium Header */}
                        <div style={{
                            background: 'linear-gradient(to right, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95))',
                            padding: isMobile ? '1.5rem 1rem' : '2rem 2rem 1.5rem',
                            borderBottom: '1px solid rgba(255,255,255,0.1)',
                            position: 'sticky', top: 0, zIndex: 20
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexDirection: isMobile ? 'column' : 'row', gap: '1rem' }}>
                                <div style={{ width: isMobile ? '100%' : 'auto' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                                        <span style={{
                                            fontSize: '0.7rem', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase',
                                            color: '#94a3b8', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px'
                                        }}>
                                            {viewSemesterDetails.shortCode || 'NO CODE'}
                                        </span>
                                        <span style={{
                                            fontSize: '0.7rem', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase',
                                            color: viewSemesterDetails.isLab ? '#fca5a5' : '#93c5fd',
                                            background: viewSemesterDetails.isLab ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                                            padding: '2px 6px', borderRadius: '4px'
                                        }}>
                                            {viewSemesterDetails.isLab ? 'LABORATORY' : 'THEORY'}
                                        </span>
                                    </div>
                                    <h2 style={{ margin: '0.5rem 0', fontSize: isMobile ? '1.4rem' : '1.75rem', background: 'linear-gradient(to right, #fff, #cbd5e1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1.2 }}>
                                        {viewSemesterDetails.name}
                                    </h2>
                                    <div style={{ color: '#94a3b8', fontSize: '0.85rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <Layers size={14} /> {viewSemesterDetails.dept || 'General Dept'}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: isMobile ? '100%' : 'auto', justifyContent: 'space-between' }}>
                                    {/* Popup Search Bar */}
                                    <div style={{ position: 'relative', flex: 1 }}>
                                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                        <input
                                            type="text"
                                            placeholder="Search faculty..."
                                            value={popupSearch}
                                            onChange={(e) => setPopupSearch(e.target.value)}
                                            style={{
                                                background: 'rgba(255,255,255,0.05)',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                borderRadius: '8px',
                                                padding: '8px 10px 8px 32px',
                                                color: 'white',
                                                outline: 'none',
                                                fontSize: '0.85rem',
                                                width: '100%'
                                            }}
                                        />
                                    </div>
                                    <button onClick={() => { setViewSemesterDetails(null); setPopupSearch(''); }} className="icon-btn" style={{ background: 'rgba(255,255,255,0.05)', padding: '8px' }}>
                                        <X size={18} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="modal-body" style={{ padding: isMobile ? '1rem' : '2rem' }}>
                            {/* Faculty Centric Cards */}
                            <div style={{ marginBottom: '2.5rem' }}>
                                <h4 style={{ color: '#64748b', marginBottom: '1rem', textTransform: 'uppercase', fontSize: '0.7rem', fontWeight: 'bold', letterSpacing: '1px' }}>
                                    Faculty Breakdown & Load
                                </h4>
                                <div className="charts-grid" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                                    {viewSemesterDetails.facultyNames
                                        .filter(f => normalizeStr(f).includes(normalizeStr(popupSearch)))
                                        .length > 0 ?
                                        viewSemesterDetails.facultyNames
                                            .filter(f => normalizeStr(f).includes(normalizeStr(popupSearch)))
                                            .map(f => {
                                                const theirClasses = data.assignments.filter(a => {
                                                    if (a.subject !== viewSemesterDetails.name) return false;

                                                    const search = normalizeStr(f);
                                                    const f1 = normalizeStr(a.faculty);
                                                    const f2 = normalizeStr(a.faculty2);

                                                    return f1.includes(search) || f2.includes(search);
                                                }).sort((a, b) => {
                                                    const days = { 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6, 'Sunday': 7 };
                                                    const ia = days[a.day] || 0;
                                                    const ib = days[b.day] || 0;
                                                    if (ia !== ib) return ia - ib;
                                                    return a.time.localeCompare(b.time);
                                                });

                                                return (
                                                    <div key={f} style={{
                                                        background: '#0f172a',
                                                        border: '1px solid rgba(255,255,255,0.05)',
                                                        borderRadius: '12px',
                                                        overflow: 'hidden',
                                                        display: 'flex', flexDirection: 'column'
                                                    }}>
                                                        {/* Card Header */}
                                                        <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '0.85rem' }}>
                                                                    {f.charAt(0)}
                                                                </div>
                                                                <span style={{ color: '#f1f5f9', fontSize: '0.95rem', fontWeight: '600' }}>{f}</span>
                                                            </div>
                                                            <span style={{ fontSize: '0.75rem', background: 'rgba(16, 185, 129, 0.1)', color: '#34d399', px: '8px', py: '2px', borderRadius: '4px', padding: '2px 8px' }}>
                                                                {theirClasses.length} Classes
                                                            </span>
                                                        </div>

                                                        {/* Detailed Schedule List */}
                                                        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                            {theirClasses.length > 0 ? theirClasses.map((cls, cIdx) => (
                                                                <div key={cIdx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem', color: '#94a3b8' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                        <span style={{ color: '#fbbf24', fontWeight: '500' }}>{cls.day.substring(0, 3)}</span>
                                                                        <span>{cls.time}</span>
                                                                    </div>
                                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                                        <span style={{ color: '#e2e8f0', background: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: '4px', fontSize: '0.8rem' }}>
                                                                            {cls.dept}-{cls.section}{cls.group ? `-${cls.group}` : ''}
                                                                        </span>
                                                                        {(() => {
                                                                            const search = normalizeStr(f);
                                                                            const f1 = normalizeStr(cls.faculty);
                                                                            const f2 = normalizeStr(cls.faculty2);
                                                                            const isF1 = f1 === search || f1.includes(search);
                                                                            const isF2 = f2 === search || f2.includes(search);

                                                                            const other = isF1 ? cls.faculty2 : (isF2 ? cls.faculty : null);
                                                                            if (!other) return null;

                                                                            return (
                                                                                <span style={{
                                                                                    fontSize: '0.75rem', fontWeight: '800',
                                                                                    background: 'rgba(79, 70, 229, 0.15)', color: '#a5b4fc',
                                                                                    padding: '3px 8px', borderRadius: '6px',
                                                                                    border: '1px solid rgba(79, 70, 229, 0.25)',
                                                                                    display: 'flex', alignItems: 'center', gap: '4px',
                                                                                    marginTop: '4px'
                                                                                }}>
                                                                                    <User size={10} />
                                                                                    <span style={{ opacity: 0.7, marginRight: '1px' }}>w/</span>
                                                                                    {other}
                                                                                </span>
                                                                            );
                                                                        })()}
                                                                    </div>
                                                                </div>
                                                            )) : (
                                                                <div style={{ color: '#64748b', fontStyle: 'italic', fontSize: '0.85rem' }}>No specific schedule data found.</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            }) : <span style={{ color: '#64748b', fontStyle: 'italic' }}>No faculty assigned yet.</span>}
                                </div>
                            </div>

                            {/* Weekly Schedule Table */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1rem' }}>
                                    <h4 style={{ color: '#64748b', margin: 0, textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 'bold', letterSpacing: '1px' }}>
                                        Weekly Class Schedule
                                    </h4>
                                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                                        {data.assignments.filter(a => matchesSubject(a.subject, viewSemesterDetails.name)).length} Classes / Week
                                    </span>
                                </div>

                                <div className="table-container" style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                        <thead>
                                            <tr style={{ background: 'rgba(30, 41, 59, 0.5)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                <th style={{ padding: isMobile ? '0.75rem' : '1rem', textAlign: 'left', color: '#94a3b8', fontWeight: '600' }}>Day & Time</th>
                                                <th style={{ padding: isMobile ? '0.75rem' : '1rem', textAlign: 'left', color: '#94a3b8', fontWeight: '600' }} className="hide-mobile">Room</th>
                                                <th style={{ padding: isMobile ? '0.75rem' : '1rem', textAlign: 'left', color: '#94a3b8', fontWeight: '600' }}>Target</th>
                                                <th style={{ padding: isMobile ? '0.75rem' : '1rem', textAlign: 'left', color: '#94a3b8', fontWeight: '600' }} className="hide-mobile">Faculty</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.assignments
                                                .filter(a => matchesSubject(a.subject, viewSemesterDetails.name))
                                                .sort((a, b) => {
                                                    const days = { 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6, 'Sunday': 7 };
                                                    if (days[a.day] !== days[b.day]) return days[a.day] - days[b.day];
                                                    return a.time.localeCompare(b.time);
                                                })
                                                .map((a, idx) => (
                                                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                                                        <td style={{ padding: isMobile ? '0.75rem' : '1rem' }}>
                                                            <div style={{ fontWeight: '500', color: 'white', marginBottom: '2px', fontSize: isMobile ? '0.85rem' : '0.95rem' }}>{a.day}</div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#fbbf24' }}>
                                                                <Clock size={11} /> {a.time}
                                                            </div>
                                                            {isMobile && a.room && (
                                                                <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                    <MapPin size={10} color="#94a3b8" />
                                                                    <span style={{ fontSize: '0.7rem', color: '#cbd5e1', fontFamily: 'monospace' }}>{a.room}</span>
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td style={{ padding: '1rem' }} className="hide-mobile">
                                                            {a.room ? (
                                                                <span style={{ fontFamily: 'monospace', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', color: '#e2e8f0' }}>
                                                                    {a.room}
                                                                </span>
                                                            ) : <span style={{ color: '#64748b' }}>-</span>}
                                                        </td>
                                                        <td style={{ padding: isMobile ? '0.75rem' : '1rem' }}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                <span style={{
                                                                    fontSize: isMobile ? '0.8rem' : '0.95rem',
                                                                    fontWeight: 'bold',
                                                                    color: '#e2e8f0',
                                                                    letterSpacing: '0.5px'
                                                                }}>
                                                                    {a.dept}-{a.section}{a.group ? `-${a.group}` : ''}
                                                                </span>
                                                                {isMobile ? (
                                                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                                                                        {a.faculty} {a.faculty2 ? `+ ${a.faculty2}` : ''}
                                                                    </div>
                                                                ) : (
                                                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                                        {a.sem}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '1rem' }} className="hide-mobile">
                                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                <span style={{ color: '#e2e8f0' }}>{a.faculty}</span>
                                                                {a.faculty2 && <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>+ {a.faculty2}</span>}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            {data.assignments.filter(a => matchesSubject(a.subject, viewSemesterDetails.name)).length === 0 && (
                                                <tr>
                                                    <td colSpan="4" style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                                                        <CalendarOff size={32} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                                                        <div>No classes scheduled for this subject yet.</div>
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* DEPARTMENT DETAIL PORTAL */}
            {viewDepartmentDetails && createPortal(
                <div className="modal-overlay" onClick={() => setViewDepartmentDetails(null)} style={{
                    position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(8px)', background: 'rgba(0,0,0,0.7)'
                }}>
                    <div className="modal-content glass-panel" onClick={e => e.stopPropagation()} style={{
                        maxWidth: '800px', width: '95%', maxHeight: '85vh', display: 'flex', flexDirection: 'column',
                        border: '1px solid rgba(255,255,255,0.1)', background: '#0f1115', margin: 'auto'
                    }}>
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between' }}>
                            <h2 style={{ margin: 0, color: 'white' }}>Department: {viewDepartmentDetails.name}</h2>
                            <button onClick={() => setViewDepartmentDetails(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><X /></button>
                        </div>
                        <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                <div>
                                    <h4 style={{ color: '#94a3b8', marginBottom: '1rem' }}>Faculty Members</h4>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        {viewDepartmentDetails.facultyNames.map(f => (
                                            <span key={f} style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#93c5fd', padding: '4px 8px', borderRadius: '4px', fontSize: '0.9rem' }}>{f}</span>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <h4 style={{ color: '#94a3b8', marginBottom: '1rem' }}>Subjects Taught</h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {Array.from(viewDepartmentDetails.subjects || []).sort().map(s => (
                                            <div key={s} style={{ color: '#e2e8f0', fontSize: '0.9rem' }}>• {s}</div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ROOM DETAIL PORTAL */}
            {viewRoomDetails && createPortal(
                <div className="modal-overlay" onClick={() => setViewRoomDetails(null)} style={{
                    position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(8px)', background: 'rgba(0,0,0,0.7)'
                }}>
                    <div className="modal-content glass-panel" onClick={e => e.stopPropagation()} style={{
                        maxWidth: '900px', width: '95%', maxHeight: '85vh', display: 'flex', flexDirection: 'column',
                        border: '1px solid rgba(255,255,255,0.1)', background: '#0f1115', margin: 'auto'
                    }}>
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between' }}>
                            <h2 style={{ margin: 0, color: 'white' }}>Room {viewRoomDetails.name} Schedule</h2>
                            <button onClick={() => setViewRoomDetails(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><X /></button>
                        </div>
                        <div style={{ padding: '0', overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', color: '#cbd5e1' }}>
                                <thead style={{ background: 'rgba(255,255,255,0.05)' }}>
                                    <tr>
                                        <th style={{ padding: '1rem', textAlign: 'left' }}>Day/Time</th>
                                        <th style={{ padding: '1rem', textAlign: 'left' }}>Subject</th>
                                        <th style={{ padding: '1rem', textAlign: 'left' }}>Class</th>
                                        <th style={{ padding: '1rem', textAlign: 'left' }}>Faculty</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.assignments
                                        .filter(a => a.room === viewRoomDetails.name)
                                        .sort((a, b) => {
                                            const days = { 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6, 'Sunday': 7 };
                                            return (days[a.day] - days[b.day]) || a.time.localeCompare(b.time);
                                        })
                                        .map((row, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                <td style={{ padding: '1rem' }}><span style={{ color: '#fbbf24' }}>{row.day.slice(0, 3)}</span> {row.time}</td>
                                                <td style={{ padding: '1rem', color: 'white' }}>{row.subject}</td>
                                                <td style={{ padding: '1rem' }}>{row.dept}-{row.section}{row.group && row.group !== 'All' ? `-${row.group}` : ''}</td>
                                                <td style={{ padding: '1rem' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <span style={{ color: '#e2e8f0' }}>{row.faculty}</span>
                                                        {row.faculty2 && <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>+ {row.faculty2}</span>}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    }
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* SEMESTER DETAIL PORTAL (NEWLY PORTALIZED) */}
            {viewSemesterDetails && typeof viewSemesterDetails === 'string' && createPortal(
                <div
                    className="semester-popup-overlay"
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 99999,
                        background: 'rgba(0, 0, 0, 0.7)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1.5rem'
                    }} onClick={() => setViewSemesterDetails(null)}>
                    <div
                        className="semester-popup-content"
                        style={{
                            background: '#0f1115',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '24px',
                            width: '95%',
                            maxWidth: '600px',
                            maxHeight: '85vh',
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                            position: 'relative'
                        }} onClick={e => e.stopPropagation()}>

                        {/* Premium Header */}
                        <div style={{
                            padding: '1.5rem',
                            borderBottom: '1px solid rgba(255,255,255,0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: 'linear-gradient(to right, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95))',
                            borderTopLeftRadius: '24px',
                            borderTopRightRadius: '24px',
                            position: 'sticky', top: 0, zIndex: 10
                        }}>
                            <div>
                                <h3 style={{ margin: 0, color: 'white', fontSize: '1.5rem', fontWeight: 'bold' }}>{viewSemesterDetails}</h3>
                                <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>
                                    Detail view for {selectedFaculty}
                                </p>
                            </div>
                            <button
                                onClick={() => setViewSemesterDetails(null)}
                                style={{
                                    background: 'rgba(255,255,255,0.1)',
                                    border: 'none',
                                    color: 'white',
                                    borderRadius: '50%',
                                    width: '36px',
                                    height: '36px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content */}
                        <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
                            {(() => {
                                // Logic to group assignments by Subject -> Classes
                                const semAssignments = data.assignments.filter(a => {
                                    if (a.sem?.trim() !== viewSemesterDetails) return false;
                                    if (selectedFaculty === 'All Faculty') return true;

                                    const search = normalizeStr(selectedFaculty);
                                    const f1 = normalizeStr(a.faculty);
                                    const f2 = normalizeStr(a.faculty2);

                                    if (f1.includes(search) || f2.includes(search)) return true;

                                    const targetFacultyObj = data.faculty.find(f => normalizeStr(f.name) === search);
                                    if (targetFacultyObj?.empId) {
                                        if (a.facultyEmpId === targetFacultyObj.empId || a.faculty2EmpId === targetFacultyObj.empId) return true;
                                    }
                                    return false;
                                });

                                const grouped = {};
                                semAssignments.forEach(a => {
                                    const s = a.subject?.trim() || 'No Subject';
                                    if (!grouped[s]) grouped[s] = [];
                                    grouped[s].push(a);
                                });

                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                        {Object.keys(grouped).length === 0 ? (
                                            <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>No assignments found for this semester.</div>
                                        ) : Object.keys(grouped).map(subject => {
                                            const classes = grouped[subject];
                                            const subjectObj = data.subjects.find(s => normalizeStr(s.name) === normalizeStr(subject));
                                            const isLab = subjectObj?.type === 'lab' ||
                                                normalizeStr(subject).includes('lab') ||
                                                normalizeStr(classes[0]?.room).includes('lab');

                                            return (
                                                <div key={subject} style={{
                                                    background: 'rgba(15, 23, 42, 0.6)',
                                                    backdropFilter: 'blur(12px)',
                                                    borderRadius: '16px',
                                                    border: '1px solid rgba(255,255,255,0.08)',
                                                    overflow: 'hidden',
                                                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)'
                                                }}>
                                                    {/* Subject Header */}
                                                    <div style={{
                                                        padding: '1rem 1.25rem',
                                                        background: isLab
                                                            ? 'linear-gradient(90deg, rgba(236, 72, 153, 0.15), rgba(80, 7, 36, 0.3))'
                                                            : 'linear-gradient(90deg, rgba(139, 92, 246, 0.15), rgba(30, 41, 59, 0.3))',
                                                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between'
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                            <div style={{
                                                                width: '8px', height: '8px', borderRadius: '50%',
                                                                background: isLab ? '#ec4899' : '#8b5cf6',
                                                                boxShadow: isLab ? '0 0 10px rgba(236, 72, 153, 0.5)' : '0 0 10px rgba(139, 92, 246, 0.5)'
                                                            }} />
                                                            <strong style={{ color: 'white', fontSize: '1.05rem', letterSpacing: '0.3px' }}>{subject}</strong>
                                                        </div>
                                                        <span style={{
                                                            fontSize: '0.7rem', fontWeight: '800',
                                                            background: 'rgba(0,0,0,0.4)',
                                                            padding: '4px 10px', borderRadius: '20px',
                                                            color: '#e2e8f0'
                                                        }}>
                                                            {classes.length} Classes
                                                        </span>
                                                    </div>

                                                    {/* Classes List */}
                                                    <div style={{ padding: '0.5rem' }}>
                                                        {classes.sort((a, b) => {
                                                            const days = { 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6, 'Sunday': 7 };
                                                            return (days[a.day] - days[b.day]) || a.time.localeCompare(b.time);
                                                        }).map((cls, ci) => (
                                                            <div key={ci} style={{
                                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                                padding: '0.85rem 1rem',
                                                                borderBottom: ci !== classes.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none'
                                                            }}>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                    <span style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase' }}>{cls.day}</span>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'white', fontSize: '0.9rem' }}>
                                                                        <Clock size={12} /> {cls.time}
                                                                    </div>
                                                                </div>

                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <span style={{
                                                                        background: 'rgba(255,255,255,0.05)',
                                                                        border: '1px solid rgba(255,255,255,0.1)',
                                                                        color: '#e2e8f0',
                                                                        padding: '4px 10px',
                                                                        borderRadius: '6px',
                                                                        fontSize: '0.75rem'
                                                                    }}>
                                                                        {cls.dept}-{cls.section}{cls.group && cls.group !== 'All' ? `-${cls.group}` : ''}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            <style>{`
                .faculty-timeline-card {
                    display: grid;
                    grid-template-columns: 90px 1fr;
                    gap: 1rem;
                }
                @media (max-width: 768px) {
                    .faculty-timeline-card {
                        grid-template-columns: 1fr !important;
                        gap: 0.5rem !important;
                    }
                    .faculty-timeline-card > div:first-child {
                        flex-direction: row !important;
                        justify-content: flex-start !important;
                        gap: 1rem !important;
                        border-right: none !important;
                        border-bottom: 1px solid rgba(255,255,255,0.1) !important;
                        padding-right: 0 !important;
                        padding-bottom: 0.5rem !important;
                        margin-bottom: 0.5rem !important;
                        width: 100% !important;
                    }
                    
                    /* Mobile Popup Fixes */
                    .modal-content {
                        width: 100% !important;
                        max-width: 100% !important;
                        height: 100vh !important;
                        max-height: 100vh !important;
                        margin: 0 !important;
                        border-radius: 0 !important;
                    }
                    
                    .modal-content .modal-body {
                        padding: 1rem !important;
                    }
                    
                    /* Detailed Schedule Fix in Faculty Cards */
                    .modal-body div[style*="flex-direction: column; gap: 0.75rem"] {
                        gap: 0.5rem !important;
                    }
                    
                    .modal-body div[style*="justify-content: space-between"] {
                        flex-direction: column !important;
                        align-items: flex-start !important;
                        gap: 4px !important;
                    }
                    
                    .modal-body div[style*="align-items: flex-end"] {
                        align-items: flex-start !important;
                        margin-top: 4px;
                    }
                    
                    /* Subject Details Popup - Header */
                    .modal-content > div:first-child {
                        padding: 1rem !important;
                        flex-direction: column !important;
                        align-items: flex-start !important;
                    }
                    
                    .modal-content > div:first-child > div:first-child {
                        width: 100%;
                    }
                    
                    .modal-content > div:first-child > div:last-child {
                        width: 100%;
                        margin-top: 1rem;
                        flex-direction: column;
                        gap: 0.75rem !important;
                    }
                    
                    .modal-content > div:first-child h2 {
                        font-size: 1.25rem !important;
                    }
                    
                    .modal-content > div:first-child input {
                        width: 100% !important;
                    }
                    
                    /* Faculty Cards Grid */
                    .modal-body > div > div[style*="grid-template-columns"] {
                        grid-template-columns: 1fr !important;
                    }
                    
                    /* Tables - Make them scrollable */
                    .table-container {
                        overflow-x: auto !important;
                        -webkit-overflow-scrolling: touch;
                    }
                    
                    .table-container table {
                        min-width: 600px;
                    }
                    
                    /* Department Details - Grid */
                    .modal-content > div:nth-child(2) > div[style*="grid-template-columns: 1fr 1fr"] {
                        grid-template-columns: 1fr !important;
                        gap: 1.5rem !important;
                    }
                    
                    /* Panel Headers - Stack on Mobile */
                    .panel-header {
                        flex-direction: column !important;
                        align-items: flex-start !important;
                        gap: 1rem !important;
                    }
                    
                    .panel-header h3 {
                        font-size: 1.1rem !important;
                    }
                    
                    .panel-header .search-bar {
                        width: 100% !important;
                        max-width: 100% !important;
                    }
                    
                    /* Utility Classes */
                    .hide-mobile {
                        display: none !important;
                    }
                    
                    .mobile-small-text {
                        font-size: 0.8rem !important;
                    }
                    
                    .mobile-stack {
                        flex-direction: column !important;
                        align-items: flex-start !important;
                        gap: 1rem !important;
                    }
                    
                    /* Stat Cards - Smaller on Mobile */
                    .stat-card {
                        padding: 1rem !important;
                        gap: 1rem !important;
                    }
                    
                    .stat-card .icon-wrapper {
                        width: 40px !important;
                        height: 40px !important;
                    }
                    
                    .stat-card h3 {
                        font-size: 0.8rem !important;
                    }
                    
                    .stat-card p {
                        font-size: 1.5rem !important;
                    }
                    
                    /* Charts - Reduce Height on Mobile */
                    .chart-container {
                        padding: 1rem !important;
                        min-height: 250px !important;
                    }
                    
                    .chart-container h3 {
                        font-size: 0.95rem !important;
                        margin-bottom: 1rem !important;
                    }
                    
                    /* Analytics Grids - Single Column on Mobile */
                    .stats-grid {
                        grid-template-columns: repeat(2, 1fr) !important;
                        gap: 1rem !important;
                    }
                    
                    .charts-grid {
                        grid-template-columns: 1fr !important;
                        gap: 1rem !important;
                    }
                    
                    .analytics-grid, .charts-grid {
                        grid-template-columns: 1fr !important;
                        gap: 1rem !important;
                    }
                    
                    /* Force 1 column on very small factor for stats too */
                    @media (max-width: 480px) {
                        .stats-grid {
                            grid-template-columns: 1fr !important;
                        }
                    }
                    
                    /* Page Header - Stack on Mobile */
                    .page-header {
                        flex-direction: column !important;
                        align-items: flex-start !important;
                        gap: 1rem !important;
                        margin-bottom: 1.5rem !important;
                    }
                    
                    .page-header h1 {
                        font-size: 1.5rem !important;
                    }
                    
                    /* Tabs - Scrollable on Mobile */
                    .tabs-container {
                        gap: 0.5rem !important;
                        padding-bottom: 0.75rem !important;
                        margin-bottom: 1.5rem !important;
                        flex-wrap: nowrap !important;
                    }
                    
                    .tab-btn {
                        font-size: 0.9rem !important;
                        padding: 0.4rem 0.8rem !important;
                        white-space: nowrap;
                    }
                    
                    /* Glass Panel - Reduce Padding on Mobile */
                    .glass-panel {
                        padding: 1rem !important;
                    }
                    
                    /* Semester Popup - Mobile Fixes */
                    .semester-popup-overlay {
                        padding: 0 !important;
                        align-items: flex-end !important;
                    }
                    
                    .semester-popup-content {
                        max-width: 100% !important;
                        width: 100% !important;
                        max-height: 85vh !important;
                        border-bottom-left-radius: 0 !important;
                        border-bottom-right-radius: 0 !important;
                        border-radius: 20px 20px 0 0 !important;
                        border-bottom: none !important;
                    }
                }
                .page-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 2rem;
                }
                .year-badge {
                    background: var(--color-accent);
                    padding: 0.5rem 1rem;
                    border-radius: 20px;
                    font-weight: bold;
                    font-size: 0.9rem;
                }
                .tabs-container {
                    display: flex;
                    gap: 1rem;
                    margin-bottom: 2rem;
                    border-bottom: 1px solid rgba(255,255,255,0.1);
                    padding-bottom: 1rem;
                    overflow-x: auto;
                    flex-wrap: nowrap;
                }
                .tab-btn {
                    background: none;
                    border: none;
                    color: var(--color-text-muted);
                    font-size: 1rem;
                    padding: 0.5rem 1rem;
                    cursor: pointer;
                    border-radius: 8px;
                    transition: all 0.2s;
                }
                .tab-btn:hover {
                    color: white;
                    background: rgba(255,255,255,0.05);
                }
                .tab-btn.active {
                    color: white;
                    background: var(--color-accent);
                }
                .analytics-container {
                    display: flex;
                    flex-direction: column;
                    gap: 2rem;
                    width: 100%;
                    max-width: 95vw;
                    margin: 0 auto;
                }
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 1.5rem;
                }
                .charts-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
                    gap: 1.5rem;
                }
                .analytics-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: 1.5rem;
                }
                
                @media (max-width: 768px) {
                    .stats-grid,
                    .charts-grid,
                    .analytics-grid {
                        grid-template-columns: 1fr !important;
                        gap: 1rem !important;
                    }
                    
                    .stat-card {
                        padding: 1rem !important;
                    }
                    
                    .chart-container {
                        padding: 1rem !important;
                        min-height: 300px !important;
                        overflow-x: hidden;
                    }
                }
                .analytics-grid.single-col {
                    grid-template-columns: 1fr;
                }
                .stat-card {
                    padding: 1.5rem;
                    display: flex;
                    align-items: center;
                    gap: 1.5rem;
                }
                .stat-card .icon-wrapper {
                    width: 50px;
                    height: 50px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .stat-card h3 {
                    margin: 0;
                    font-size: 0.9rem;
                    color: var(--color-text-muted);
                }
                .stat-card p {
                    margin: 0.25rem 0 0 0;
                    font-size: 1.8rem;
                    font-weight: bold;
                }
                .chart-container {
                    padding: 1.5rem;
                    min-height: 350px;
                }
                .chart-container h3 {
                    margin-bottom: 1.5rem;
                    font-size: 1.1rem;
                    color: var(--color-text-muted);
                }
            `}</style>
        </div>
    );
};

export default Analytics;
