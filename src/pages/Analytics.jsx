import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, ScatterChart, Scatter, ZAxis
} from 'recharts';
import { Users, BookOpen, Layers, Calendar, Clock, MapPin, BarChart3, TrendingUp, Activity } from 'lucide-react';
import '../styles/design-system.css';

const Analytics = () => {
    const { activeAcademicYear, setSelectedAcademicYear, academicYears } = useAuth();
    const [activeTab, setActiveTab] = useState('overview');
    const [selectedFaculty, setSelectedFaculty] = useState('');
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
            deptCounts[d] = (deptCounts[d] || 0) + 1;
        });
        const assignmentsByDept = Object.keys(deptCounts).map(k => ({ name: k, count: deptCounts[k] }));

        // 3. Faculty Workload (Top 10)
        const facCounts = {};
        assignments.forEach(a => {
            if (a.faculty) facCounts[a.faculty] = (facCounts[a.faculty] || 0) + 1;
            if (a.faculty2) facCounts[a.faculty2] = (facCounts[a.faculty2] || 0) + 1;
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
        const dayCounts = {};
        dayOrder.forEach(d => dayCounts[d] = 0);
        assignments.forEach(a => {
            if (a.day) dayCounts[a.day] = (dayCounts[a.day] || 0) + 1;
        });
        const assignmentsByDay = dayOrder.map(d => ({ name: d, count: dayCounts[d] }));

        // 7. Faculty by Dept
        const facByDept = {};
        faculty.forEach(f => {
            const d = f.dept || 'Unknown';
            facByDept[d] = (facByDept[d] || 0) + 1;
        });
        const facultyByDept = Object.keys(facByDept).map(k => ({ name: k, count: facByDept[k] }));

        // 8. Subjects by Dept
        const subByDept = {};
        subjects.forEach(s => {
            const d = s.dept || 'Unknown';
            subByDept[d] = (subByDept[d] || 0) + 1;
        });
        const subjectsByDept = Object.keys(subByDept).map(k => ({ name: k, count: subByDept[k] }));

        // 9. Assignments by Time Slot
        const timeCounts = {};
        assignments.forEach(a => {
            if (a.time) timeCounts[a.time] = (timeCounts[a.time] || 0) + 1;
        });
        const assignmentsByTime = Object.keys(timeCounts)
            .map(k => ({ name: k, count: timeCounts[k] }))
            .sort((a, b) => a.name.localeCompare(b.name));

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
            if (a.createdAt) {
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
        assignments.forEach(a => {
            if (a.day && a.time && dayMap[a.day]) {
                const timeVal = parseInt(a.time.split(':')[0]); // Hour
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


        return {
            counts, assignmentsByDept, facultyWorkload, subjectFrequency, roomUsage, assignmentsByDay, facultyByDept, subjectsByDept,
            assignmentsByTime, assignmentsBySem, assignmentsByGroup, creationTrend, scatterData
        };
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
                const timeVal = parseInt(a.time.split(':')[0]);
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
            if (!deptResources[d]) deptResources[d] = { subjects: new Set(), faculty: new Set(), rooms: new Set() };
            if (a.subject) deptResources[d].subjects.add(a.subject);
            if (a.faculty) deptResources[d].faculty.add(a.faculty);
            if (a.room) deptResources[d].rooms.add(a.room);
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
            if (a.faculty && a.subject) {
                if (!facSubVariety[a.faculty]) facSubVariety[a.faculty] = new Set();
                facSubVariety[a.faculty].add(a.subject);
            }
        });
        const facultySubjectVariety = Object.keys(facSubVariety)
            .map(k => ({ name: k, count: facSubVariety[k].size }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // 18. Time of Day Distribution
        const timeDist = { 'Morning (8-12)': 0, 'Afternoon (12-4)': 0, 'Evening (4+)': 0 };
        assignments.forEach(a => {
            if (a.time) {
                const hour = parseInt(a.time.split(':')[0]);
                if (hour < 12) timeDist['Morning (8-12)']++;
                else if (hour < 16) timeDist['Afternoon (12-4)']++;
                else timeDist['Evening (4+)']++;
            }
        });
        const timeOfDayDist = Object.keys(timeDist).map(k => ({ name: k, count: timeDist[k] }));

        // 19. Department Workload by Day (Stacked Bar Data)
        const deptDayMap = {};
        assignments.forEach(a => {
            const d = a.dept || 'Unknown';
            if (!deptDayMap[d]) deptDayMap[d] = { name: d, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
            if (a.day) {
                const shortDay = a.day.substring(0, 3);
                if (deptDayMap[d][shortDay] !== undefined) deptDayMap[d][shortDay]++;
            }
        });
        const deptWorkloadByDay = Object.values(deptDayMap);

        return {
            counts, assignmentsByDept, facultyWorkload, subjectFrequency, roomUsage, assignmentsByDay, facultyByDept, subjectsByDept,
            assignmentsByTime, assignmentsBySem, assignmentsByGroup, creationTrend, scatterData,
            facultyWorkloadDist, roomHeatmapData, deptResourceUsage,
            facultySubjectVariety, timeOfDayDist, deptWorkloadByDay,
            facultyList: faculty.map(f => f.name).sort()
        };
    }, [data]);

    const selectedFacultyStats = useMemo(() => {
        if (!selectedFaculty) return null;
        const facultyAssignments = data.assignments.filter(a => a.faculty === selectedFaculty || a.faculty2 === selectedFaculty);

        // 1. Subject Distribution
        const subCounts = {};
        facultyAssignments.forEach(a => {
            if (a.subject) subCounts[a.subject] = (subCounts[a.subject] || 0) + 1;
        });
        const subjectDist = Object.keys(subCounts).map(k => ({ name: k, count: subCounts[k] }));

        // 2. Daily Schedule
        const dayCounts = { 'Monday': 0, 'Tuesday': 0, 'Wednesday': 0, 'Thursday': 0, 'Friday': 0, 'Saturday': 0, 'Sunday': 0 };
        facultyAssignments.forEach(a => {
            if (a.day) dayCounts[a.day] = (dayCounts[a.day] || 0) + 1;
        });
        const dailySchedule = Object.keys(dayCounts).map(k => ({ name: k, count: dayCounts[k] }));

        return {
            totalClasses: facultyAssignments.length,
            uniqueSubjects: Object.keys(subCounts).length,
            subjectDist,
            dailySchedule
        };
    }, [selectedFaculty, data.assignments]);

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'];

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
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={stats.assignmentsByDept}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis dataKey="name" stroke="#94a3b8" />
                            <YAxis stroke="#94a3b8" />
                            <Tooltip contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
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
                    <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={stats.assignmentsByDay}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis dataKey="name" stroke="#94a3b8" />
                            <YAxis stroke="#94a3b8" />
                            <Tooltip contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
                            <Area type="monotone" dataKey="count" stroke="#8b5cf6" fill="rgba(139, 92, 246, 0.3)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Assignments by Time Slot (Bar) */}
                <div className="chart-container glass-panel">
                    <h3>Time Slot Distribution</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={stats.assignmentsByTime}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis dataKey="name" stroke="#94a3b8" />
                            <YAxis stroke="#94a3b8" />
                            <Tooltip contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
                            <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Time of Day Analysis (Pie) */}
                <div className="chart-container glass-panel">
                    <h3>Time of Day Analysis</h3>
                    <ResponsiveContainer width="100%" height={300}>
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
                            >
                                {stats.timeOfDayDist && stats.timeOfDayDist.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* Assignments by Semester (Pie) */}
                <div className="chart-container glass-panel">
                    <h3>Semester Distribution</h3>
                    <ResponsiveContainer width="100%" height={300}>
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
                    <ResponsiveContainer width="100%" height={300}>
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
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={stats.creationTrend}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis dataKey="date" stroke="#94a3b8" />
                            <YAxis stroke="#94a3b8" />
                            <Tooltip contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
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
                            <Tooltip contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
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
                            <Tooltip contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
                            <Bar dataKey="count" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={20} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );

    const renderFaculty = () => (
        <div className="analytics-grid">
            {/* Faculty Selector */}
            <div className="glass-panel" style={{ gridColumn: '1 / -1', padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <h3 style={{ margin: 0, whiteSpace: 'nowrap' }}>Individual Faculty Analysis:</h3>
                <select
                    value={selectedFaculty}
                    onChange={(e) => setSelectedFaculty(e.target.value)}
                    className="glass-input"
                    style={{ flex: 1, maxWidth: '300px', padding: '0.5rem', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                    <option value="">Select Faculty...</option>
                    {stats.facultyList && stats.facultyList.map(f => (
                        <option key={f} value={f}>{f}</option>
                    ))}
                </select>
            </div>

            {selectedFaculty && selectedFacultyStats && (
                <>
                    <div className="stat-card glass-panel">
                        <div className="icon-wrapper" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6' }}><BookOpen size={24} /></div>
                        <div><h3>Total Classes</h3><p>{selectedFacultyStats.totalClasses}</p></div>
                    </div>
                    <div className="stat-card glass-panel">
                        <div className="icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981' }}><Layers size={24} /></div>
                        <div><h3>Unique Subjects</h3><p>{selectedFacultyStats.uniqueSubjects}</p></div>
                    </div>

                    <div className="chart-container glass-panel">
                        <h3>Subject Distribution for {selectedFaculty}</h3>
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={selectedFacultyStats.subjectDist}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    paddingAngle={5}
                                    dataKey="count"
                                    label
                                >
                                    {selectedFacultyStats.subjectDist.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="chart-container glass-panel">
                        <h3>Daily Schedule for {selectedFaculty}</h3>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={selectedFacultyStats.dailySchedule}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                <XAxis dataKey="name" stroke="#94a3b8" />
                                <YAxis stroke="#94a3b8" />
                                <Tooltip contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
                                <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </>
            )}

            <div className="chart-container glass-panel" style={{ gridColumn: '1 / -1' }}>
                <h3>Top 10 Faculty by Workload (Classes Assigned)</h3>
                <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={stats.facultyWorkload} layout="vertical" margin={{ left: 100 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis type="number" stroke="#94a3b8" />
                        <YAxis dataKey="name" type="category" stroke="#94a3b8" width={150} />
                        <Tooltip contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
                        <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
            <div className="chart-container glass-panel">
                <h3>Faculty Workload Distribution (Classes per Faculty)</h3>
                <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={stats.facultyWorkloadDist}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis dataKey="name" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
                        <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
            <div className="chart-container glass-panel">
                <h3>Faculty Subject Variety (Unique Subjects Taught)</h3>
                <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={stats.facultySubjectVariety} layout="vertical" margin={{ left: 100 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis type="number" stroke="#94a3b8" />
                        <YAxis dataKey="name" type="category" stroke="#94a3b8" width={150} />
                        <Tooltip contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
                        <Bar dataKey="count" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={20} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );

    const renderDepartments = () => (
        <div className="analytics-grid">
            <div className="chart-container glass-panel">
                <h3>Faculty Distribution by Department</h3>
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={stats.facultyByDept}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis dataKey="name" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
                        <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]}>
                            {stats.facultyByDept && stats.facultyByDept.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
            <div className="chart-container glass-panel">
                <h3>Subject Distribution by Department</h3>
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={stats.subjectsByDept}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis dataKey="name" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
                        <Bar dataKey="count" fill="#ec4899" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
            <div className="chart-container glass-panel" style={{ gridColumn: '1 / -1' }}>
                <h3>Department Resource Utilization (Unique Subjects, Faculty, Rooms)</h3>
                <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={stats.deptResourceUsage}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis dataKey="name" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
                        <Legend />
                        <Bar dataKey="subjects" name="Unique Subjects" fill="#3b82f6" />
                        <Bar dataKey="faculty" name="Unique Faculty" fill="#10b981" />
                        <Bar dataKey="rooms" name="Unique Rooms" fill="#f59e0b" />
                    </BarChart>
                </ResponsiveContainer>
            </div>
            <div className="chart-container glass-panel" style={{ gridColumn: '1 / -1' }}>
                <h3>Department Workload by Day</h3>
                <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={stats.deptWorkloadByDay}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis dataKey="name" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
                        <Legend />
                        <Bar dataKey="Mon" stackId="a" fill="#3b82f6" />
                        <Bar dataKey="Tue" stackId="a" fill="#10b981" />
                        <Bar dataKey="Wed" stackId="a" fill="#f59e0b" />
                        <Bar dataKey="Thu" stackId="a" fill="#ef4444" />
                        <Bar dataKey="Fri" stackId="a" fill="#8b5cf6" />
                        <Bar dataKey="Sat" stackId="a" fill="#ec4899" />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );

    const renderSubjects = () => (
        <div className="analytics-grid single-col">
            <div className="chart-container glass-panel">
                <h3>Top 10 Most Frequent Subjects</h3>
                <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={stats.subjectFrequency}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis dataKey="name" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
                        <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );

    const renderRooms = () => (
        <div className="analytics-grid">
            <div className="chart-container glass-panel">
                <h3>Room Usage Frequency</h3>
                <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={stats.roomUsage}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis dataKey="name" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
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
                    <BarChart3 size={32} /> Analytics Dashboard
                </h2>
                <div style={{ position: 'relative', minWidth: '200px' }}>
                    <select
                        value={activeAcademicYear}
                        onChange={(e) => setSelectedAcademicYear(e.target.value)}
                        className="glass-input"
                        style={{
                            fontWeight: '600',
                            color: 'var(--color-accent)',
                            cursor: 'pointer'
                        }}
                    >
                        {academicYears.map(year => (
                            <option key={year} value={year} style={{ background: '#1e293b', color: 'white' }}>
                                {year}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Tabs */}
            <div className="tabs-container">
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

            <style>{`
                .analytics-page {
                    padding-bottom: 2rem;
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
                }
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 1.5rem;
                }
                .charts-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
                    gap: 1.5rem;
                }
                .analytics-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: 1.5rem;
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
