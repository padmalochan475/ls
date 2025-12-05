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
    const [explorerFaculty, setExplorerFaculty] = useState(null);
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
            if (d !== 'Unknown') {
                deptCounts[d] = (deptCounts[d] || 0) + 1;
            }
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
        const dailyWorkload = dayOrder.map(d => ({ name: d, count: dayCounts[d] }));
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
                    if (!facSubVariety[a.faculty]) facSubVariety[a.faculty] = new Set();
                    facSubVariety[a.faculty].add(a.subject);
                }
                if (a.faculty2) {
                    if (!facSubVariety[a.faculty2]) facSubVariety[a.faculty2] = new Set();
                    facSubVariety[a.faculty2].add(a.subject);
                }
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
            if (d !== 'Unknown') {
                if (!deptDayMap[d]) deptDayMap[d] = { name: d, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
                if (a.day) {
                    const shortDay = a.day.substring(0, 3);
                    if (deptDayMap[d][shortDay] !== undefined) deptDayMap[d][shortDay]++;
                }
            }
        });
        const deptWorkloadByDay = Object.values(deptDayMap);

        return {
            counts, assignmentsByDept, facultyWorkload, subjectFrequency, roomUsage, dailyWorkload, facultyByDept, subjectsByDept,
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
        const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const dailySchedule = dayOrder.map(d => ({ name: d, count: dayCounts[d] }));

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
                    <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={stats.dailyWorkload}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis dataKey="name" stroke="#94a3b8" />
                            <YAxis stroke="#94a3b8" />
                            <Tooltip cursor={{ stroke: 'rgba(255,255,255,0.2)' }} contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
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
                            <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
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
            {/* Faculty Selector */}
            <div className="glass-panel" style={{ gridColumn: '1 / -1', padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <h3 style={{ margin: 0, whiteSpace: 'nowrap' }}>Individual Faculty Analysis:</h3>
                <select
                    value={selectedFaculty}
                    onChange={(e) => setSelectedFaculty(e.target.value)}
                    className="glass-input"
                    style={{ flex: 1, maxWidth: '300px', padding: '0.5rem', borderRadius: '8px', background: '#1e293b', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                    <option value="" style={{ background: '#1e293b', color: 'white' }}>Select Faculty...</option>
                    {stats.facultyList && stats.facultyList.map(f => (
                        <option key={f} value={f} style={{ background: '#1e293b', color: 'white' }}>{f}</option>
                    ))}
                </select>
            </div>

            {selectedFaculty && selectedFacultyStats && (
                <div className="glass-panel" style={{ gridColumn: '1 / -1', padding: '2rem' }}>
                    <h3 style={{ marginBottom: '2rem', fontSize: '1.2rem', color: 'white' }}>Workload Analysis: <span style={{ color: 'var(--color-accent)' }}>{selectedFaculty}</span></h3>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', alignItems: 'start' }}>
                        {/* Left: Metrics & List */}
                        <div>
                            <div style={{ marginBottom: '2rem', padding: '1.5rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                                <h4 style={{ color: '#93c5fd', fontSize: '0.9rem', margin: '0 0 0.5rem 0', textTransform: 'uppercase', letterSpacing: '1px' }}>Total Weekly Load</h4>
                                <div style={{ fontSize: '3.5rem', fontWeight: 'bold', color: '#60a5fa', lineHeight: 1, display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                                    {selectedFacultyStats.totalClasses} <span style={{ fontSize: '1rem', color: '#94a3b8', fontWeight: 'normal' }}>classes/week</span>
                                </div>
                            </div>

                            <h4 style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Subject Breakdown</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {selectedFacultyStats.subjectDist.map((sub, idx) => (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: COLORS[idx % COLORS.length] }}></div>
                                            <span style={{ fontWeight: 500, color: '#e2e8f0' }}>{sub.name}</span>
                                        </div>
                                        <span style={{ fontWeight: 'bold', color: 'white' }}>{sub.count} <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 'normal' }}>classes</span></span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Right: Chart */}
                        <div style={{ height: '350px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', padding: '1rem' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={selectedFacultyStats.subjectDist}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={80}
                                        outerRadius={110}
                                        paddingAngle={5}
                                        dataKey="count"
                                        stroke="none"
                                    >
                                        {selectedFacultyStats.subjectDist.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white' }} itemStyle={{ color: 'white' }} />
                                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                    <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
                                        <tspan x="50%" dy="-0.5em" fontSize="32" fill="white" fontWeight="bold">{selectedFacultyStats.totalClasses}</tspan>
                                        <tspan x="50%" dy="1.5em" fontSize="14" fill="#94a3b8">Total Classes</tspan>
                                    </text>
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}

            <div className="glass-panel" style={{ gridColumn: '1 / -1', padding: '2rem' }}>
                <h3 style={{ marginBottom: '1.5rem', color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Activity size={20} color="var(--color-accent)" />
                    Advanced Faculty Workload Explorer
                </h3>
                <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>
                    Click on a faculty member's bar to view their detailed schedule breakdown.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>
                    {/* Chart Side */}
                    <div style={{ height: '400px' }}>
                        <ResponsiveContainer width="100%" height="100%">
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
                                    onClick={(data) => setExplorerFaculty(data.name)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    {stats.facultyWorkload.map((entry, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={explorerFaculty === entry.name ? '#f59e0b' : '#3b82f6'}
                                            cursor="pointer"
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Details Side */}
                    <div style={{
                        background: 'rgba(255,255,255,0.03)',
                        borderRadius: '12px',
                        padding: '1.5rem',
                        border: '1px solid rgba(255,255,255,0.05)',
                        maxHeight: '400px',
                        overflowY: 'auto'
                    }}>
                        {explorerFaculty ? (
                            <>
                                <h4 style={{ color: '#f59e0b', margin: '0 0 1.5rem 0', fontSize: '1.1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
                                    Schedule: {explorerFaculty}
                                </h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {data.assignments
                                        .filter(a => a.faculty === explorerFaculty || a.faculty2 === explorerFaculty)
                                        .sort((a, b) => {
                                            const days = { 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6, 'Sunday': 7 };
                                            if (days[a.day] !== days[b.day]) return days[a.day] - days[b.day];
                                            return a.time.localeCompare(b.time);
                                        })
                                        .map((assignment, idx) => (
                                            <div key={idx} style={{
                                                display: 'grid',
                                                gridTemplateColumns: '80px 1fr',
                                                gap: '1rem',
                                                padding: '1rem',
                                                background: 'rgba(30, 41, 59, 0.5)',
                                                borderRadius: '8px',
                                                borderLeft: `3px solid ${COLORS[idx % COLORS.length]}`
                                            }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                    <span style={{ fontWeight: 'bold', color: '#e2e8f0', fontSize: '0.9rem' }}>{assignment.day?.substring(0, 3)}</span>
                                                    <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{assignment.time}</span>
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                    <span style={{ fontWeight: '600', color: 'white' }}>{assignment.subject}</span>
                                                    <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                                                        <span style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>{assignment.dept}</span>
                                                        <span style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>{assignment.section}</span>
                                                        <span>{assignment.room}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    {data.assignments.filter(a => a.faculty === explorerFaculty || a.faculty2 === explorerFaculty).length === 0 && (
                                        <div style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No classes assigned found.</div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem', color: '#64748b' }}>
                                <Users size={48} style={{ opacity: 0.2 }} />
                                <p>Select a faculty member from the chart to see their detailed schedule.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div >
    );
    const renderDepartments = () => {
        const CustomLegend = ({ payload }) => {
            const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            const sortedPayload = [...payload].sort((a, b) => {
                return order.indexOf(a.value) - order.indexOf(b.value);
            });

            return (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '10px' }}>
                    {sortedPayload.map((entry, index) => (
                        <div key={`item-${index}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '14px', color: '#94a3b8' }}>
                            <div style={{ width: 12, height: 12, backgroundColor: entry.color, borderRadius: '2px' }} />
                            <span>{entry.value}</span>
                        </div>
                    ))}
                </div>
            );
        };

        const CustomTooltip = ({ active, payload, label }) => {
            if (active && payload && payload.length) {
                const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                const sortedPayload = [...payload].sort((a, b) => {
                    return order.indexOf(a.name) - order.indexOf(b.name);
                });

                return (
                    <div style={{ background: '#1e293b', border: 'none', padding: '10px', borderRadius: '4px', color: 'white' }}>
                        <p style={{ fontWeight: 'bold', marginBottom: '5px' }}>{label}</p>
                        {sortedPayload.map((entry, index) => (
                            <div key={`item-${index}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '12px', marginBottom: '2px' }}>
                                <span style={{ color: entry.color }}>{entry.name}:</span>
                                <span>{entry.value}</span>
                            </div>
                        ))}
                    </div>
                );
            }
            return null;
        };

        return (
            <div className="analytics-grid">
                <div className="chart-container glass-panel" style={{ gridColumn: '1 / -1' }}>
                    <h3>Department Resource Utilization (Unique Subjects, Faculty, Rooms)</h3>
                    <ResponsiveContainer width="100%" height={400}>
                        <BarChart data={stats.deptResourceUsage}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis dataKey="name" stroke="#94a3b8" />
                            <YAxis stroke="#94a3b8" />
                            <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
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
                            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
                            <Legend content={<CustomLegend />} />
                            <Bar dataKey="Mon" stackId="a" fill="#3b82f6" name="Mon" />
                            <Bar dataKey="Tue" stackId="a" fill="#10b981" name="Tue" />
                            <Bar dataKey="Wed" stackId="a" fill="#f59e0b" name="Wed" />
                            <Bar dataKey="Thu" stackId="a" fill="#ef4444" name="Thu" />
                            <Bar dataKey="Fri" stackId="a" fill="#8b5cf6" name="Fri" />
                            <Bar dataKey="Sat" stackId="a" fill="#ec4899" name="Sat" />
                            <Bar dataKey="Sun" stackId="a" fill="#6366f1" name="Sun" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        );
    };

    const renderSubjects = () => (
        <div className="analytics-grid single-col">
            <div className="chart-container glass-panel">
                <h3>Top 10 Most Frequent Subjects</h3>
                <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={stats.subjectFrequency}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis dataKey="name" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ background: '#1e293b', border: 'none', color: 'white' }} />
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
