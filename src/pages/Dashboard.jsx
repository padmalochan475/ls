import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useScheduleData } from '../hooks/useScheduleData';
import { useMasterData } from '../contexts/MasterDataContext';
import { Users, Clock, MapPin, CalendarDays, Zap, BookOpen, GraduationCap, ChevronLeft, ChevronRight, LayoutTemplate, UserCircle, Check, CalendarOff, Coffee, RefreshCw, Calendar, FlaskConical } from 'lucide-react';
import CelebrationCard from '../components/CelebrationCard';
import QuantumLoader from '../components/QuantumLoader';
import AssignmentDetailsModal from '../components/scheduler/AssignmentDetailsModal';
import { normalizeStr, formatDateLocal, getDayName, parseTimeToDate, parseTimeSlot } from '../utils/timeUtils';

const StatCard = ({ title, value, icon, trend, gradient }) => (
    <div className="glass-panel stat-card celebration-interactive" style={gradient ? { background: gradient } : {}}>
        <div className="stat-card-icon-bg">
            {icon}
        </div>
        <div className="stat-card-header">
            <div className="stat-card-icon">
                {icon}
            </div>
            {trend && (
                <span className="stat-trend">
                    {trend}
                </span>
            )}
        </div>
        <div className="stat-card-value">{value}</div>
        <div className="stat-card-label">{title}</div>
    </div>
);


// Helper to determine if an assignment belongs to the user
const isMyAssignment = (item, targetName, userProfile, isPersonalView) => {
    // 1. Robust Check: Match by EmpID
    if (isPersonalView && userProfile?.empId) {
        if (item.facultyEmpId === userProfile.empId) return true;
        if (item.faculty2EmpId === userProfile.empId) return true;
    }

    // 2. Fallback Check: Match by Name (Robust)
    if (!targetName) return false;
    const search = normalizeStr(targetName);
    const f1 = normalizeStr(item.faculty);
    const f2 = normalizeStr(item.faculty2);

    return f1.includes(search) || f2.includes(search);
};

const calculateTodaySchedule = (selectedFaculty, allData, currentDayName, adjustments, currentDate, isPersonalView, userProfile, myAbsences, activeSubstitutions) => {
    const targetDateStr = formatDateLocal(currentDate);
    const targetDayNorm = normalizeStr(currentDayName);
    let dailyFiltered = [];

    if (selectedFaculty === 'All Assignments') {
        dailyFiltered = allData.filter(item => normalizeStr(item.day) === targetDayNorm).map(item => {
            const adj = adjustments.find(a => a.originalScheduleId === item.id && a.date === targetDateStr);
            if (adj) {
                return { ...item, isSubstituted: true, substituteName: adj.substituteName };
            }
            return item;
        });
    } else if (selectedFaculty) {
        // A. Base Schedule
        dailyFiltered = allData.filter(item =>
            normalizeStr(item.day) === targetDayNorm &&
            isMyAssignment(item, selectedFaculty, userProfile, isPersonalView) &&
            !myAbsences.some(a => a.originalScheduleId === item.id && a.date === targetDateStr)
        );

        // B. Add Today's Substitutions
        const todaysSubs = activeSubstitutions.filter(s => s.date === targetDateStr);
        dailyFiltered = [...dailyFiltered, ...todaysSubs];
    }
    return dailyFiltered
        .map(item => ({ ...item, sortVal: parseTimeSlot(item.time)?.start || 0 }))
        .sort((a, b) => (Number(a.sortVal) || 0) - (Number(b.sortVal) || 0));
};

const calculateWeeklySchedule = (selectedFaculty, allData, weekDates, isPersonalView, userProfile, myAbsences, activeSubstitutions) => {
    let facultyData = allData;
    if (selectedFaculty !== 'All Assignments' && selectedFaculty) {
        // Filter out absences that occur THIS WEEK
        facultyData = allData.filter(item => {
            if (!isMyAssignment(item, selectedFaculty, userProfile, isPersonalView)) return false;

            // Fuzzy Find Day
            const itemDayNorm = normalizeStr(item.day);
            const dayInfo = weekDates.find(d => normalizeStr(d.dayName) === itemDayNorm);

            if (!dayInfo) return true; // Keep if we can't map it (safety)

            const itemDateStr = formatDateLocal(dayInfo.fullDate);
            if (myAbsences.some(a => a.originalScheduleId === item.id && a.date === itemDateStr)) return false;
            return true;
        });

        // Add Substitutions that occur THIS WEEK
        const weeksSubs = activeSubstitutions.filter(s => {
            const sDayNorm = normalizeStr(s.day);
            const dayInfo = weekDates.find(d => normalizeStr(d.dayName) === sDayNorm);
            if (!dayInfo) return false;
            return s.date === formatDateLocal(dayInfo.fullDate);
        });

        facultyData = [...facultyData, ...weeksSubs];
    } else if (!selectedFaculty) {
        facultyData = [];
    }

    const grouped = weekDates.reduce((acc, { dayName }) => {
        if (selectedFaculty !== 'All Assignments' && selectedFaculty) {
            const targetDayNorm = normalizeStr(dayName);
            const dayClasses = facultyData
                .filter(item => normalizeStr(item.day) === targetDayNorm)
                .map(item => ({ ...item, sortVal: parseTimeSlot(item.time)?.start || 0 }))
                .sort((a, b) => (Number(a.sortVal) || 0) - (Number(b.sortVal) || 0));
            acc[dayName] = dayClasses;
        }
        return acc;
    }, {});

    return (selectedFaculty === 'All Assignments') ? {} : grouped;
};

const calculateDerivedSchedules = ({
    activeAcademicYear,
    weekDates,
    dashboardView,
    userProfile,
    allData,
    adjustments,
    currentDate,
    selectedFaculty,
    currentDayName
}) => {
    if (!activeAcademicYear || weekDates.length === 0) {
        return { todaySchedule: [], weeklySchedule: {} };
    }

    const isPersonalView = dashboardView === 'personal';

    // Robust Matching for Absences/Substitutions
    const matchesTarget = (val) => {
        if (!val || !selectedFaculty) return false;
        return normalizeStr(val) === normalizeStr(selectedFaculty);
    };

    const myAbsences = adjustments.filter(a => matchesTarget(a.originalFaculty));
    const mySubstitutions = adjustments.filter(a => matchesTarget(a.substituteName));

    const activeSubstitutions = mySubstitutions.map(adj => ({
        id: `adj_${adj.id}`,
        originalId: adj.originalScheduleId,
        day: getDayName(adj.date),
        date: adj.date,
        time: adj.time,
        subject: adj.subject,
        room: adj.room,
        dept: adj.dept,
        section: adj.section,
        group: adj.group,
        sem: adj.sem,
        faculty: adj.substituteName,
        originalFacultyName: adj.originalFaculty,
        isSubstitution: true
    }));

    const todaySchedule = calculateTodaySchedule(
        selectedFaculty, allData, currentDayName, adjustments, currentDate, isPersonalView, userProfile, myAbsences, activeSubstitutions
    );

    const weeklySchedule = calculateWeeklySchedule(
        selectedFaculty, allData, weekDates, isPersonalView, userProfile, myAbsences, activeSubstitutions
    );

    return { todaySchedule, weeklySchedule };
};

const Dashboard = () => {
    const { userProfile, activeAcademicYear } = useAuth();
    // Schedules derived via useMemo
    const [roomCount, setRoomCount] = useState(0);
    const { schedule: allData } = useScheduleData();
    const totalClasses = allData ? allData.length : 0; // Derived instead
    const [facultyList, setFacultyList] = useState([]);
    const [selectedFaculty, setSelectedFaculty] = useState('');
    const [holidays, setHolidays] = useState([]);
    const [showCelebration, setShowCelebration] = useState(true);
    const [selectedAssignment, setSelectedAssignment] = useState(null); // For Details Modal

    // View Mode: 'admin' or 'personal'
    const [dashboardView, setDashboardView] = useState('personal');

    // Initialize View Mode based on Role
    useEffect(() => {
        if (userProfile) {
            if (userProfile.role === 'admin') {
                setTimeout(() => setDashboardView('admin'), 0);
            } else {
                setTimeout(() => setDashboardView('personal'), 0);
            }
        }
    }, [userProfile]);

    // Handle View Mode Change
    const toggleViewMode = () => {
        const newMode = dashboardView === 'admin' ? 'personal' : 'admin';
        setDashboardView(newMode);

        if (newMode === 'personal') {
            setSelectedFaculty(userProfile.name);
        } else {
            setSelectedFaculty('All Assignments');
        }
    };

    // Set default selection based on role/view when profile loads or view changes
    useEffect(() => {
        if (userProfile) {
            if (dashboardView === 'admin') {
                if (!selectedFaculty || selectedFaculty === userProfile.name) {
                    setTimeout(() => setSelectedFaculty('All Assignments'), 0);
                }
            } else {
                // Force non-admins or personal view to see only their own schedule
                setTimeout(() => setSelectedFaculty(userProfile.name), 0);
            }
        }
    }, [userProfile, dashboardView, selectedFaculty]);

    const [currentDate, setCurrentDate] = useState(new Date());
    const [liveTime, setLiveTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setLiveTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Helper to format date for display
    const formattedDate = currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const currentDayName = getDayName(currentDate);

    // Check if current date is a holiday
    const isHoliday = holidays.find(h => h.date === formatDateLocal(currentDate));

    // Helper to change date
    const changeDate = (days) => {
        const newDate = new Date(currentDate);
        newDate.setDate(currentDate.getDate() + days);
        setCurrentDate(newDate);
    };

    // Helper to check class status
    const getClassStatus = (timeRange) => {
        if (!timeRange || typeof timeRange !== 'string' || !timeRange.includes(' - ')) {
            return { label: 'Unknown', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.1)' };
        }

        const now = new Date();
        const isToday = currentDate.toDateString() === now.toDateString();
        const isPast = currentDate < now && !isToday;

        if (isPast) return { label: 'Completed', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' };
        if (!isToday) return { label: 'Scheduled', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.1)' };

        const [start, end] = timeRange.split(' - ');

        const startTime = parseTimeToDate(start);
        const endTime = parseTimeToDate(end);

        if (now > endTime) return { label: 'Completed', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' };
        if (now >= startTime && now <= endTime) return { label: 'In Progress', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' };
        return { label: 'Upcoming', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' };
    };

    const { loading: scheduleLoading, refreshSchedule } = useScheduleData();
    // Use Real-Time Master Data Context instead of manual fetch
    const {
        faculty: masterFaculty,
        rooms: masterRooms,
        days: masterDays,
        holidays: masterHolidays,
        subjects: masterSubjects,
        loading: masterLoading
    } = useMasterData();

    const [hasRefreshed, setHasRefreshed] = useState(false);

    // Auto-Refresh Schedule Data on Mount
    useEffect(() => {
        const init = async () => {
            await refreshSchedule();
            setHasRefreshed(true);
        };
        init();
    }, [refreshSchedule]);

    const loading = scheduleLoading || masterLoading; // Unified loading state
    const [weekDates, setWeekDates] = useState([]);

    // Sync Master Data to Local State (Reactive)
    useEffect(() => {
        if (masterFaculty.length > 0) setTimeout(() => setFacultyList(masterFaculty.map(f => f.name)), 0);
        if (masterRooms.length > 0) setTimeout(() => setRoomCount(masterRooms.length), 0);

        // Handle Holidays from Context
        if (masterHolidays) {
            const holidayData = masterHolidays.map(d => ({ date: d.date, name: d.name }));
            setTimeout(() => setHolidays(holidayData), 0);
        } else {
            setTimeout(() => setHolidays([]), 0);
        }
    }, [masterFaculty, masterRooms, masterHolidays]);

    // Handle Week Generation based on Real-Time Days and Selected Date
    useEffect(() => {
        if (!masterDays || masterDays.length === 0) return;

        // Process Days for Week View
        const daysData = [...masterDays].filter(d => d.isVisible !== false).sort((a, b) => a.order - b.order);

        // Use 'currentDate' instead of 'new Date()' to allow navigation between weeks
        const curr = new Date(currentDate);
        const currentDay = curr.getDay() === 0 ? 7 : curr.getDay();
        const first = curr.getDate() - currentDay + 1; // Monday

        const week = [];
        const dayMap = { 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6, 'Sunday': 7 };

        daysData.forEach(dayObj => {
            const dayName = dayObj.name;
            const targetDayIndex = dayMap[dayName];
            if (targetDayIndex !== undefined) {
                const offset = targetDayIndex - 1;
                const dayDate = new Date(curr);
                dayDate.setDate(first + offset);

                week.push({
                    dayName: dayName,
                    dateString: dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                    fullDate: dayDate
                });
            }
        });
        setTimeout(() => setWeekDates(week), 0);
    }, [masterDays, currentDate, setWeekDates]);

    // Fetch Adjustments (Real-Time Sync)
    const [adjustments, setAdjustments] = useState([]);
    useEffect(() => {
        let unsubscribe = () => { };

        if (activeAcademicYear && userProfile?.empId) {
            const q = query(collection(db, 'adjustments'), where('academicYear', '==', activeAcademicYear));
            unsubscribe = onSnapshot(q, (snap) => {
                const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setAdjustments(data);
            }, (err) => {
                console.error("Dashboard Adjustments Sync Error:", err);
            });
        } else {
            setTimeout(() => setAdjustments([]), 0);
        }

        return () => unsubscribe();
    }, [activeAcademicYear, userProfile?.empId]);

    // Derived Schedules (Memoized)
    const { todaySchedule, weeklySchedule } = useMemo(() => {
        return calculateDerivedSchedules({
            activeAcademicYear,
            weekDates,
            dashboardView,
            userProfile,
            allData,
            adjustments,
            currentDate,
            selectedFaculty,
            currentDayName
        });
    }, [activeAcademicYear, weekDates, currentDayName, currentDate, selectedFaculty, dashboardView, userProfile, allData, adjustments]);

    // Helper to get relative date label with Day
    const getDateLabel = (date) => {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });

        if (date.toDateString() === today.toDateString()) return `Today (${dayName})`;
        if (date.toDateString() === tomorrow.toDateString()) return `Tomorrow (${dayName})`;
        if (date.toDateString() === yesterday.toDateString()) return `Yesterday (${dayName})`;

        return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    };

    // Dynamic Stats based on View Mode
    const stats = dashboardView === 'admin' ? [
        { title: 'Total Classes', value: totalClasses, icon: <BookOpen size={24} />, trend: 'This Year', gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' },
        { title: 'Active Faculty', value: facultyList.length, icon: <Users size={24} />, trend: 'Registered', gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' },
        { title: 'Lab Rooms', value: roomCount, icon: <Zap size={24} />, gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' },
        { title: 'Academic Year', value: activeAcademicYear || 'N/A', icon: <GraduationCap size={24} />, gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' },
    ] : [
        { title: `${getDateLabel(currentDate)}'s Classes`, value: isHoliday ? 0 : todaySchedule.length, icon: <Clock size={24} />, trend: getDateLabel(currentDate), gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' },
        {
            title: 'Weekly Classes', value: Object.entries(weeklySchedule).reduce((acc, [dayName, classes]) => {
                const dayInfo = weekDates.find(d => d.dayName === dayName);
                if (dayInfo && holidays.some(h => h.date === formatDateLocal(dayInfo.fullDate))) return acc;
                return acc + classes.length;
            }, 0), icon: <CalendarDays size={24} />, trend: 'This Week', gradient: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'
        },
        { title: 'Subjects', value: new Set(Object.values(weeklySchedule).flat().map(i => i.subject)).size, icon: <BookOpen size={24} />, gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' },
        { title: 'Academic Year', value: activeAcademicYear || 'N/A', icon: <GraduationCap size={24} />, gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' },
    ];

    if (loading || !hasRefreshed) return <QuantumLoader />;

    const getGreeting = () => {
        const hour = liveTime.getHours();
        if (hour < 12) return 'Good Morning';
        if (hour < 18) return 'Good Afternoon';
        return 'Good Evening';
    };

    const renderScheduleItem = (item, index) => {
        const status = getClassStatus(item.time);

        const renderFacultyInfo = () => {
            if (item.isSubstitution) {
                return (
                    <>
                        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f472b6' }}>Subbing For</span>
                        <span style={{ fontSize: '0.85rem', color: 'white', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            {item.originalFacultyName}
                        </span>
                    </>
                );
            }
            if (item.isSubstituted) {
                return (
                    <>
                        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#10b981' }}>Substitute</span>
                        <span style={{ fontSize: '0.85rem', color: 'white' }}>{item.substituteName}</span>
                    </>
                );
            }

            const myName = userProfile?.name;
            const mySearch = normalizeStr(myName);

            let primary = item.faculty;
            let secondary = item.faculty2;

            if (secondary && normalizeStr(secondary) === mySearch) {
                primary = item.faculty2;
                secondary = item.faculty;
            }

            return (
                <>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'white' }}>{primary}</span>
                    {secondary && (
                        <span style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <span style={{ opacity: 0.6 }}>&</span> {secondary}
                        </span>
                    )}
                </>
            );
        };

        // Determine if LAB or THEORY: Check Master Data AND Fallback to Name
        let isLab = false;
        if (masterSubjects) {
            const subjectData = masterSubjects.find(s => s.name === item.subject);
            if (subjectData && subjectData.type === 'lab') {
                isLab = true;
            }
        }
        // Fallback: Check Name Logic (if master data is missing or type not set)
        if (!isLab) {
            const sub = normalizeStr(item.subject);
            const rm = normalizeStr(item.room);
            if (sub.includes('lab') || rm.includes('lab')) {
                isLab = true;
            }
        }

        return (
            <div key={index} className="glass-panel schedule-card"
                style={{
                    padding: '1.5rem',
                    background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.4) 0%, rgba(15, 23, 42, 0.6) 100%)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    position: 'relative',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1.25rem',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2), 0 4px 6px -2px rgba(0, 0, 0, 0.1)',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    cursor: 'pointer'
                }}
                onClick={() => setSelectedAssignment(item)}
            >
                {/* Accent Bar */}
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: status.color }}></div>

                {/* Header: Time, Badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '10px' }}>
                            <Clock size={18} color="white" />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'white', letterSpacing: '0.5px' }}>{item.time}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                                <MapPin size={14} color="#f59e0b" />
                                {item.room}
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {item.isSubstitution && (
                            <div style={{
                                padding: '0.35rem 0.85rem', borderRadius: '20px',
                                background: 'rgba(236, 72, 153, 0.2)', color: '#f472b6',
                                fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase',
                                letterSpacing: '0.5px', boxShadow: `0 2px 8px rgba(236, 72, 153, 0.3)`,
                                display: 'flex', alignItems: 'center', gap: '4px'
                            }}>
                                <Users size={12} />
                                SUBSTITUTION
                            </div>
                        )}
                        {item.isSubstituted && (
                            <div style={{
                                padding: '0.35rem 0.85rem', borderRadius: '20px',
                                background: 'rgba(16, 185, 129, 0.2)', color: '#10b981',
                                fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase',
                                letterSpacing: '0.5px', boxShadow: `0 2px 8px rgba(16, 185, 129, 0.3)`,
                                display: 'flex', alignItems: 'center', gap: '4px'
                            }}>
                                <RefreshCw size={12} />
                                ADJUSTED
                            </div>
                        )}
                        <div style={{
                            padding: '0.35rem 0.85rem', borderRadius: '20px',
                            background: status.bg, color: status.color,
                            fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase',
                            letterSpacing: '0.5px', boxShadow: `0 2px 8px ${status.bg.replace('0.1', '0.2')}`
                        }}>
                            {status.label}
                        </div>
                    </div>
                </div>

                {/* Body: Subject */}
                <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.4rem', fontWeight: 800, color: 'white', lineHeight: 1.3, wordBreak: 'break-word' }}>
                        {item.subject}
                    </h4>

                    {/* TYPE Badge: Lab vs Theory */}
                    <div style={{ marginBottom: '0.75rem' }}>
                        {isLab ? (
                            <span style={{
                                background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa',
                                border: '1px solid rgba(59, 130, 246, 0.3)',
                                fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px',
                                fontWeight: 700, letterSpacing: '0.5px'
                            }}>
                                LAB
                            </span>
                        ) : (
                            <span style={{
                                background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc',
                                border: '1px solid rgba(168, 85, 247, 0.3)',
                                fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px',
                                fontWeight: 700, letterSpacing: '0.5px'
                            }}>
                                THEORY
                            </span>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ background: 'rgba(255,255,255,0.05)', padding: '0.25rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', color: '#cbd5e1', fontWeight: 500 }}>
                            {item.dept}
                        </span>
                        <span style={{ background: 'rgba(255,255,255,0.05)', padding: '0.25rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', color: '#cbd5e1', fontWeight: 500 }}>
                            {item.section ? `${item.section}` : ''}
                        </span>
                        {item.group && item.group !== 'All' && (
                            <span style={{ background: 'rgba(255,255,255,0.05)', padding: '0.25rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', color: '#e2e8f0', fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)' }}>
                                {item.group}
                            </span>
                        )}
                        <span style={{ background: 'rgba(255,255,255,0.05)', padding: '0.25rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', color: '#cbd5e1', fontWeight: 500 }}>
                            {item.sem}
                        </span>
                    </div>
                </div>

                {/* Footer: Faculty (Always Visible) */}
                <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                        <div style={{ padding: '0.5rem', background: item.isSubstitution ? 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)' : 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)', borderRadius: '50%', color: 'white', display: 'flex', boxShadow: item.isSubstitution ? '0 2px 5px rgba(236, 72, 153, 0.4)' : '0 2px 5px rgba(59, 130, 246, 0.4)' }}>
                            <UserCircle size={18} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {renderFacultyInfo()}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderDailyScheduleContent = () => {
        if (loading) {
            return <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>Loading schedule...</div>;
        }

        if (isHoliday) {
            return (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#f87171' }}>
                    <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '50%', display: 'inline-flex', marginBottom: '1rem' }}>
                        <CalendarOff size={32} />
                    </div>
                    <h3 style={{ fontSize: '1.5rem', margin: '0 0 0.5rem 0', color: '#fca5a5' }}>Holiday: {isHoliday.name}</h3>
                    <p style={{ fontSize: '1rem', opacity: 0.8, color: 'var(--color-text-muted)' }}>College is Closed. No classes scheduled.</p>
                </div>
            );
        }

        if (todaySchedule.length === 0) {
            return (
                <div style={{
                    textAlign: 'center',
                    padding: '5rem 2rem',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '1.5rem',
                    opacity: 0.9
                }}>
                    <div style={{
                        width: '80px', height: '80px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(245, 158, 11, 0.05))',
                        color: '#fbbf24',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: '1px solid rgba(245, 158, 11, 0.2)',
                        boxShadow: '0 0 30px rgba(245, 158, 11, 0.1)',
                        position: 'relative'
                    }}>
                        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(245, 158, 11, 0.1)', animation: 'pulse-ring 3s infinite' }}></div>
                        <Coffee size={36} />
                    </div>
                    <div style={{ maxWidth: '400px' }}>
                        <h3 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#e2e8f0', margin: '0 0 0.75rem 0', letterSpacing: '-0.5px' }}>
                            No Classes Scheduled
                        </h3>
                        <p style={{ fontSize: '1.05rem', color: 'var(--color-text-muted)', lineHeight: '1.6', margin: 0 }}>
                            Looks like <span style={{ color: '#fbbf24', fontWeight: 600 }}>{currentDayName}</span> is all yours. Enjoy your free time or catch up on some research!
                        </p>
                    </div>
                </div>
            );
        }

        return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
                {todaySchedule.map((item, index) => renderScheduleItem(item, index))}
            </div>
        );
    };

    const renderNextClassPreview = () => {
        const isSystemToday = currentDate.toDateString() === new Date().toDateString();
        const isFuture = currentDate > new Date() && !isSystemToday;

        // Find active or next class
        let upcoming = null;
        const sortedClasses = todaySchedule
            .map(item => ({ ...item, startTime: parseTimeToDate(item.time, currentDate) }))
            .sort((a, b) => a.startTime - b.startTime);

        if (isSystemToday) {
            // If Today: Show next available class
            upcoming = sortedClasses.find(item => item.startTime > new Date(new Date().getTime() - 60 * 60 * 1000));
        } else if (isFuture) {
            // If Future: Show the FIRST class of the day
            upcoming = sortedClasses[0];
        }
        // If Past: upcoming remains null (caught up)

        if (!upcoming) return (
            <div className="glass-panel animate-fade-in" style={{
                padding: '3rem 2rem',
                background: 'linear-gradient(145deg, #0f172a 0%, #020617 100%)', // Ultra dark slate theme
                border: '1px solid rgba(30, 41, 59, 0.5)',
                display: 'flex',
                alignItems: 'center',
                gap: '2rem',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)'
            }}>
                {/* Decorative Background Glows */}
                <div style={{
                    position: 'absolute',
                    top: '-50%',
                    left: '-10%',
                    width: '40%',
                    height: '200%',
                    background: 'radial-gradient(circle, rgba(16, 185, 129, 0.08) 0%, transparent 60%)',
                    transform: 'rotate(-15deg)',
                    pointerEvents: 'none'
                }}></div>

                <div style={{
                    padding: '1.25rem',
                    background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                    borderRadius: '50%',
                    color: '#ffffff',
                    flexShrink: 0,
                    boxShadow: '0 0 20px rgba(16, 185, 129, 0.4), inset 0 2px 5px rgba(255,255,255,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 2,
                    border: '2px solid rgba(16, 185, 129, 0.2)'
                }}>
                    <Check size={40} strokeWidth={3} />
                </div>

                <div style={{ zIndex: 2 }}>
                    <h3 style={{
                        margin: '0 0 0.5rem 0',
                        fontSize: '2rem',
                        fontWeight: 800,
                        color: 'white',
                        letterSpacing: '-0.5px'
                    }}>
                        {isFuture ? 'No Classes Scheduled' : 'All Caught Up!'}
                    </h3>
                    <p style={{
                        margin: 0,
                        fontSize: '1.1rem',
                        color: '#94a3b8',
                        lineHeight: '1.6',
                        fontWeight: 500
                    }}>
                        {isFuture ? `No classes found for ${currentDayName}.` : 'No more classes scheduled for this day.'}
                    </p>
                </div>
            </div>
        );

        const isNow = getClassStatus(upcoming.time).label === 'In Progress';

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div className="next-class-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.5rem' }}>
                    <div>
                        <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.25rem 0.75rem', borderRadius: '20px',
                            background: isNow ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                            color: isNow ? '#fbbf24' : '#60a5fa',
                            fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '1rem'
                        }}>
                            {isNow ? <Zap size={14} /> : <Calendar size={14} />}
                            {isNow ? 'Happening Now' : 'Up Next'}
                        </div>
                        <h2 style={{ margin: 0, fontSize: '2.5rem', fontWeight: 800, lineHeight: 1.2 }}>
                            {upcoming.subject}
                        </h2>
                        <div style={{ fontSize: '1.2rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
                            {upcoming.dept} - {upcoming.section}{upcoming.group && upcoming.group !== 'All' ? ` - ${upcoming.group}` : ''} - {upcoming.sem}
                        </div>
                    </div>
                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem', lineHeight: 1 }}>
                            <span style={{ fontSize: '2.5rem', fontWeight: 700, color: 'white' }}>
                                {upcoming.time.split(' - ')[0].replace(/(AM|PM)/i, '').trim()}
                            </span>
                            <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                {upcoming.time.match(/(AM|PM)/i)?.[0] || ''}
                            </span>
                        </div>
                        <div style={{ fontSize: '1.1rem', color: 'var(--color-text-muted)', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <MapPin size={16} />
                            <span>Room <span style={{ color: '#f59e0b', fontWeight: 700 }}>{upcoming.room}</span></span>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Celebration & Greetings Engine */}
            {showCelebration && <CelebrationCard userProfile={userProfile} onClose={() => setShowCelebration(false)} />}

            {/* Premium Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '2.5rem', fontWeight: '800', letterSpacing: '-1px', background: 'linear-gradient(to right, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        {getGreeting()}, {userProfile?.name?.split(' ')[0] || 'Faculty'}!
                    </h2>
                    <p style={{ margin: '0.5rem 0 0 0', color: 'var(--color-text-muted)', fontSize: '1.1rem' }}>
                        {dashboardView === 'admin' ? 'Admin Overview & Management' : 'My Schedule & Stats'}
                        <span style={{ fontSize: '0.9rem', marginLeft: '1rem', background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', padding: '4px 10px', borderRadius: '6px', fontFamily: 'monospace', display: 'inline-flex', alignItems: 'center', gap: '6px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                            <Clock size={14} />
                            {liveTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                        </span>
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Admin Toggle Switch */}
                    {userProfile?.role === 'admin' && (
                        <button
                            onClick={toggleViewMode}
                            className="glass-panel-static"
                            style={{
                                padding: '0.5rem 1rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                cursor: 'pointer',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: 'white',
                                transition: 'all 0.2s',
                                borderRadius: '12px'
                            }}
                            title={dashboardView === 'admin' ? "Switch to Personal View" : "Switch to Admin View"}
                        >
                            {dashboardView === 'admin' ? <UserCircle size={20} /> : <LayoutTemplate size={20} />}
                            <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                                {dashboardView === 'admin' ? 'View as Faculty' : 'View as Admin'}
                            </span>
                        </button>
                    )}

                    {dashboardView === 'admin' ? (
                        <div className="glass-panel-static" style={{ padding: '0.5rem', display: 'flex', alignItems: 'center', gap: '1rem', borderRadius: '50px' }}>
                            <span style={{ paddingLeft: '1rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Schedule for:</span>
                            <select
                                value={selectedFaculty}
                                onChange={(e) => setSelectedFaculty(e.target.value)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'white',
                                    fontSize: '1rem',
                                    fontWeight: '600',
                                    outline: 'none',
                                    cursor: 'pointer',
                                    paddingRight: '1rem'
                                }}
                            >
                                <option value="All Assignments" style={{ background: '#1e293b', color: 'white' }}>All Assignments</option>
                                {facultyList.map(f => (
                                    <option key={f} value={f} style={{ background: '#1e293b', color: 'white' }}>
                                        {f === userProfile?.name ? `${f} (Me)` : f}
                                    </option>
                                ))}
                            </select>
                        </div>
                    ) : (
                        <div className="glass-panel-static" style={{ padding: '0.5rem 1.5rem', borderRadius: '50px', color: 'var(--color-text-muted)', fontSize: '0.9rem', fontWeight: 500 }}>
                            {userProfile?.name}'s Schedule
                        </div>
                    )}
                </div>
            </div>

            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
                {stats.map((stat, index) => (
                    <StatCard key={index} {...stat} />
                ))}
            </div>

            {/* AI Daily Insights */}
            {todaySchedule.length > 0 && dashboardView === 'personal' && (
                <div className="glass-panel" style={{
                    padding: '1.5rem',
                    background: 'linear-gradient(to right, rgba(139, 92, 246, 0.1), rgba(59, 130, 246, 0.05))',
                    border: '1px solid rgba(139, 92, 246, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem'
                }}>
                    <div style={{
                        padding: '0.75rem',
                        background: 'rgba(139, 92, 246, 0.2)',
                        borderRadius: '50%',
                        color: '#a78bfa'
                    }}>
                        <Zap size={24} />
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#e2e8f0' }}>Daily Insight</h3>
                        <p style={{ margin: '0.25rem 0 0 0', color: 'var(--color-text-muted)', fontSize: '0.95rem' }}>
                            {(() => {
                                const count = todaySchedule.length;
                                const uniqueRooms = new Set(todaySchedule.map(i => i.room)).size;
                                const isHeavy = count > 3;

                                if (isHeavy) return `You have a packed day with ${count} classes across ${uniqueRooms} different rooms. Stay hydrated!`;
                                return `You have a balanced schedule with ${count} classes. Good day for research or grading.`;
                            })()}
                        </p>
                    </div>
                </div>
            )}



            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>

                {/* Up Next / Live Status Card (Faculty View Only) */}


                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                    {/* 1. Next Class / Live Status Section (Full Width) */}
                    <div className="glass-panel celebration-interactive" style={{
                        padding: '2rem',
                        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%)',
                        position: 'relative', overflow: 'hidden',
                        display: 'flex', flexDirection: 'column', justifyContent: 'center',
                        minHeight: '200px'
                    }}>


                        {renderNextClassPreview()}
                    </div>

                    {/* 2. Daily Schedule List */}
                    <div className="glass-panel" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', flexWrap: 'wrap', gap: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <Calendar size={20} className="text-accent" />
                                <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Daily Schedule</h3>
                            </div>

                            {/* Date Controls */}
                            <div className="dashboard-date-controls">
                                <button
                                    onClick={() => changeDate(-1)}
                                    style={{
                                        padding: '0.6rem',
                                        borderRadius: '12px',
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        color: 'white',
                                        border: '1px solid rgba(255, 255, 255, 0.05)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                        e.currentTarget.style.transform = 'translateY(-1px)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                        e.currentTarget.style.transform = 'translateY(0)';
                                    }}
                                    title="Previous Day"
                                >
                                    <ChevronLeft size={20} />
                                </button>

                                <button
                                    onClick={() => setCurrentDate(new Date())}
                                    className="today-btn"
                                    style={{
                                        padding: '0.6rem 1.5rem',
                                        borderRadius: '12px',
                                        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                        color: 'white',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontWeight: '600',
                                        fontSize: '0.95rem',
                                        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        textShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                        justifyContent: 'center'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = 'translateY(-1px)';
                                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(37, 99, 235, 0.4)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = 'translateY(0)';
                                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.3)';
                                    }}
                                >
                                    <Calendar size={18} />
                                    <span className="date-btn-label">{getDateLabel(currentDate)}</span>
                                </button>

                                <button
                                    onClick={() => changeDate(1)}
                                    style={{
                                        padding: '0.6rem',
                                        borderRadius: '12px',
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        color: 'white',
                                        border: '1px solid rgba(255, 255, 255, 0.05)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                        e.currentTarget.style.transform = 'translateY(-1px)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                        e.currentTarget.style.transform = 'translateY(0)';
                                    }}
                                    title="Next Day"
                                >
                                    <ChevronRight size={20} />
                                </button>

                                <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)', margin: '0 0.25rem' }}></div>

                                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                    {/* Visual Custom Display for DD/MM/YYYY */}
                                    <div className="date-display-box">
                                        <span>{currentDate.toLocaleDateString('en-GB')}</span>
                                        <CalendarDays size={16} color="#94a3b8" />
                                    </div>

                                    {/* Hidden Native Input overlaid to capture clicks/picker */}
                                    <input
                                        type="date"
                                        value={currentDate && !isNaN(currentDate.getTime()) ? currentDate.toISOString().split('T')[0] : ''}
                                        onChange={(e) => {
                                            if (!e.target.value) return;
                                            const d = new Date(e.target.value);
                                            if (!isNaN(d.getTime())) setCurrentDate(d);
                                        }}
                                        style={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            width: '100%',
                                            height: '100%',
                                            opacity: 0,
                                            cursor: 'pointer',
                                            zIndex: 10
                                        }}
                                    />
                                </div>
                            </div>
                        </div>

                        <div style={{ padding: '1rem 1.5rem', background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.95rem', color: 'var(--color-text-muted)' }}>
                            Showing classes for <strong style={{ color: 'white' }}>{formattedDate}</strong>
                        </div>

                        <div style={{ padding: '1.5rem' }}>
                            {renderDailyScheduleContent()}
                        </div>
                    </div>


                </div>
            </div>

            {/* Premium Weekly Timetable (Interactive Timeline) */}
            {selectedFaculty !== 'All Assignments' && (
                <div className="glass-panel" style={{ padding: '2rem', overflow: 'hidden', position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.5rem' }}>
                            <div style={{ padding: '0.5rem', background: 'rgba(139, 92, 246, 0.2)', borderRadius: '8px', color: '#a78bfa' }}>
                                <CalendarDays size={24} />
                            </div>
                            Weekly Planner
                        </h3>
                        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', color: 'var(--color-text-muted)', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.5)' }}></div>
                                <span>Completed</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.5)' }}></div>
                                <span>Ongoing</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '4px', background: 'rgba(139, 92, 246, 0.5)' }}></div>
                                <span>Theory</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '4px', background: 'rgba(236, 72, 153, 0.5)' }}></div>
                                <span>Lab</span>
                            </div>
                        </div>
                    </div>

                    <div className="timeline-scroll-wrapper">
                        <div className="timeline-track-container">
                            {/* Time Header */}
                            <div style={{ display: 'flex', marginLeft: '100px', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
                                {[8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map(hour => (
                                    <div key={hour} style={{ flex: 1, textAlign: 'left', fontSize: '0.85rem', color: 'var(--color-text-muted)', borderLeft: '1px solid rgba(255,255,255,0.05)', paddingLeft: '0.5rem' }}>
                                        {hour > 12 ? hour - 12 : hour} {hour >= 12 ? 'PM' : 'AM'}
                                    </div>
                                ))}
                            </div>

                            {/* Days Rows */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {weekDates.map(({ dayName, dateString, fullDate }) => {
                                    const classes = weeklySchedule[dayName] || [];
                                    const isSelectedDay = dayName === currentDayName; // For UI Highlighting (Navigation)
                                    const isSystemToday = fullDate.toDateString() === new Date().toDateString(); // For Logic (Status, Red Line)

                                    // Helper functions for time parsing
                                    const parseTime = (t) => {
                                        if (!t) return 8;
                                        try {
                                            const [timePart, modifier] = t.split(' - ')[0].split(' ');
                                            let [h, m] = timePart.split(':').map(Number);
                                            if (modifier === 'PM' && h < 12) h += 12;
                                            if (modifier === 'AM' && h === 12) h = 0;
                                            return h + (m / 60);
                                        } catch {
                                            return 8;
                                        }
                                    };
                                    const parseDuration = (t) => {
                                        if (!t) return 1;
                                        try {
                                            const [startStr, endStr] = t.split(' - ');

                                            const getHours = (timeStr) => {
                                                const [timePart, modifier] = timeStr.split(' ');
                                                let [h, m] = timePart.split(':').map(Number);
                                                if (modifier === 'PM' && h < 12) h += 12;
                                                if (modifier === 'AM' && h === 12) h = 0;
                                                return h + (m / 60);
                                            };

                                            return getHours(endStr) - getHours(startStr);
                                        } catch {
                                            return 1;
                                        }
                                    };

                                    // Process overlaps to assign lanes
                                    const processOverlaps = (items) => {
                                        // Sort by start time, then duration (longest first)
                                        const sorted = [...items].map(item => ({
                                            ...item,
                                            start: parseTime(item.time),
                                            duration: parseDuration(item.time),
                                            end: parseTime(item.time) + parseDuration(item.time)
                                        })).sort((a, b) => {
                                            if (a.start !== b.start) return a.start - b.start;
                                            return b.duration - a.duration;
                                        });

                                        const lanes = []; // Stores the end time of the last item in each lane

                                        const processed = sorted.map(item => {
                                            let laneIndex = -1;
                                            // Find the first lane where this item fits
                                            for (let i = 0; i < lanes.length; i++) {
                                                if (item.start >= lanes[i]) {
                                                    laneIndex = i;
                                                    lanes[i] = item.end;
                                                    break;
                                                }
                                            }
                                            // If no lane found, create a new one
                                            if (laneIndex === -1) {
                                                laneIndex = lanes.length;
                                                lanes.push(item.end);
                                            }
                                            return { ...item, laneIndex };
                                        });

                                        return { items: processed, maxLanes: lanes.length };
                                    };

                                    const { items: processedClasses, maxLanes } = processOverlaps(classes);
                                    const laneHeight = 75; // Increased Height for better readability
                                    const minHeight = 85;
                                    const rowHeight = Math.max(minHeight, maxLanes * laneHeight);

                                    return (
                                        <div key={dayName} style={{ display: 'flex', alignItems: 'flex-start', minHeight: `${rowHeight}px`, position: 'relative' }}>
                                            {/* Day Label */}
                                            <div style={{
                                                width: '100px',
                                                flexShrink: 0,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                justifyContent: 'center',
                                                borderRight: '1px solid rgba(255,255,255,0.1)',
                                                paddingRight: '1rem',
                                                height: `${rowHeight}px`, // Match row height
                                                opacity: isSelectedDay ? 1 : 0.7
                                            }}>
                                                <div style={{ fontWeight: 700, color: isSelectedDay ? 'var(--color-accent)' : 'white' }}>{dayName.substring(0, 3)}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{dateString.split(' ')[1]}</div>
                                            </div>

                                            {/* Timeline Track */}
                                            <div style={{ flex: 1, position: 'relative', height: `${rowHeight}px`, background: isSelectedDay ? 'rgba(255,255,255,0.02)' : 'transparent', borderRadius: '8px' }}>
                                                {/* Grid Lines */}
                                                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
                                                    <div key={i} style={{ position: 'absolute', left: `${i * 10}%`, top: 0, bottom: 0, width: '1px', background: 'rgba(255,255,255,0.03)' }}></div>
                                                ))}

                                                {/* Classes */}
                                                {/* eslint-disable-next-line sonarjs/cognitive-complexity */}
                                                {processedClasses.map((item, idx) => {
                                                    const startOffset = item.start - 8; // Start at 8 AM
                                                    // 10 hours total width (8am to 6pm)
                                                    const left = (startOffset / 10) * 100;
                                                    const width = (item.duration / 10) * 100;

                                                    // Determine Status
                                                    const now = liveTime; // Use reactive time

                                                    // Construct class start/end times using the row's date
                                                    const [startStr, endStr] = item.time.split(' - ');
                                                    const classStart = parseTimeToDate(startStr, fullDate);
                                                    const classEnd = parseTimeToDate(endStr, fullDate);

                                                    let status = 'upcoming';
                                                    if (now > classEnd) status = 'completed';
                                                    else if (now >= classStart && now <= classEnd) status = 'ongoing';

                                                    // Robust Lab Detection
                                                    let isLab = false;
                                                    if (masterSubjects) {
                                                        const subjectData = masterSubjects.find(s => s.name === item.subject);
                                                        if (subjectData && subjectData.type === 'lab') isLab = true;
                                                    }
                                                    if (!isLab) {
                                                        const sub = normalizeStr(item.subject);
                                                        const rm = normalizeStr(item.room);
                                                        if (sub.includes('lab') || rm.includes('lab')) isLab = true;
                                                    }

                                                    // Dynamic Styles based on Status
                                                    let cardStyle = {
                                                        // Default UPCOMING Style - Split by Type (Matched with Analytics)
                                                        background: isLab
                                                            ? 'linear-gradient(135deg, rgba(190, 24, 93, 0.25) 0%, rgba(88, 28, 135, 0.15) 100%)' // Pink/Red (Lab)
                                                            : 'linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.6) 100%)', // Slate/Purple (Theory)
                                                        border: isLab
                                                            ? '1px solid rgba(236, 72, 153, 0.3)' // Pink Border
                                                            : '1px solid rgba(139, 92, 246, 0.3)', // Purple Border
                                                        color: isLab ? '#fbcfe8' : '#e9d5ff',
                                                        boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                                                        zIndex: 10
                                                    };

                                                    if (status === 'completed') {
                                                        cardStyle = {
                                                            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(6, 78, 59, 0.1) 100%)',
                                                            border: '1px solid rgba(16, 185, 129, 0.1)', // Green
                                                            color: '#6ee7b7', // green-300
                                                            boxShadow: 'none',
                                                            opacity: 0.8,
                                                            zIndex: 5
                                                        };
                                                    } else if (status === 'ongoing') {
                                                        cardStyle = {
                                                            background: 'linear-gradient(135deg, rgba(217, 119, 6, 0.2) 0%, rgba(245, 158, 11, 0.1) 100%)', // Amber
                                                            border: '1px solid rgba(245, 158, 11, 0.5)',
                                                            color: '#fcd34d', // amber-300
                                                            boxShadow: '0 0 15px rgba(245, 158, 11, 0.15), inset 0 0 10px rgba(245, 158, 11, 0.05)',
                                                            zIndex: 20
                                                            // We can't easily animate standard inline styles effectively without keyframes, 
                                                            // but the glow makes it pop.
                                                        };
                                                    }

                                                    return (
                                                        <div
                                                            key={idx}
                                                            className={`glass-panel timeline-card status-${status}`}
                                                            style={{
                                                                position: 'absolute',
                                                                left: `${left}%`,
                                                                width: `${width}%`,
                                                                top: `${item.laneIndex * laneHeight + 5}px`,
                                                                height: `${laneHeight - 10}px`,
                                                                padding: '0.6rem',
                                                                borderRadius: '8px',
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                justifyContent: 'center',
                                                                overflow: 'hidden',
                                                                cursor: 'pointer',
                                                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                                                // Use backgroundImage for gradient to sit ON TOP of backgroundColor
                                                                backgroundColor: '#0f172a', // Solid backing to hide grid lines
                                                                backgroundImage: cardStyle.background,
                                                                border: cardStyle.border,
                                                                color: cardStyle.color,
                                                                boxShadow: cardStyle.boxShadow,
                                                                zIndex: cardStyle.zIndex
                                                            }}
                                                            title=""
                                                            onClick={() => setSelectedAssignment(item)}
                                                        >
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', marginBottom: '2px' }}>
                                                                {status === 'completed' && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />}
                                                                {status === 'ongoing' && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 8px #f59e0b', flexShrink: 0 }} />}

                                                                {/* Type Icon */}
                                                                {isLab
                                                                    ? <FlaskConical size={14} color="#f472b6" fill={status === 'ongoing' ? "#f472b6" : "none"} strokeWidth={2} style={{ opacity: 1 }} />
                                                                    : <BookOpen size={14} color="#a78bfa" strokeWidth={2} style={{ opacity: 1 }} />
                                                                }

                                                                <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                    {item.subject}
                                                                </span>
                                                            </div>

                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', color: cardStyle.color, opacity: 0.9 }}>
                                                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '60%' }}>
                                                                    {item.dept}-{item.section}{item.group && item.group !== 'All' ? `-${item.group}` : ''}
                                                                </span>
                                                                <span style={{ fontWeight: 600 }}>{item.room}</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}

                                                {/* Current Time Indicator - Only for ACTUAL TODAY */}
                                                {isSystemToday && (() => {
                                                    const now = liveTime;
                                                    const currentHour = now.getHours() + now.getMinutes() / 60;
                                                    if (currentHour >= 8 && currentHour <= 18) {
                                                        const left = ((currentHour - 8) / 10) * 100;
                                                        return (
                                                            <div style={{
                                                                position: 'absolute',
                                                                left: `${left}%`,
                                                                top: 0,
                                                                bottom: 0,
                                                                width: '2px',
                                                                background: '#ef4444',
                                                                boxShadow: '0 0 10px rgba(239, 68, 68, 0.4)',
                                                                zIndex: 25,
                                                                pointerEvents: 'none'
                                                            }}>
                                                                <div style={{
                                                                    position: 'absolute',
                                                                    top: '-4px',
                                                                    left: '-5px',
                                                                    width: '12px',
                                                                    height: '12px',
                                                                    borderRadius: '50%',
                                                                    background: '#ef4444',
                                                                    boxShadow: '0 0 10px rgba(239, 68, 68, 0.6)'
                                                                }} />
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                        </div>
                    </div>
                </div>
            )}


            {/* Assignment Details Modal */}
            <AssignmentDetailsModal
                isOpen={!!selectedAssignment}
                onClose={() => setSelectedAssignment(null)}
                assignment={selectedAssignment}
                subjectDetails={masterSubjects}
                facultyList={masterFaculty}
            />

        </div >
    );
};

// Responsive Styles
const dashboardStyles = `
    .dashboard-date-controls {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        background: rgba(0, 0, 0, 0.2);
        padding: 0.5rem;
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.05);
        flex-wrap: wrap;
        justify-content: center;
    }
    .date-display-box {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: white;
        padding: 0.6rem 1rem;
        border-radius: 12px;
        font-size: 0.9rem;
        min-width: 120px;
        text-align: center;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
    }
    .today-btn {
        min-width: 120px;
    }
    
    /* TIMELINE SCROLL WRAPPER */
    .timeline-scroll-wrapper {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        margin: 0 -1.5rem; /* Negative margin to edge-to-edge on mobile panels */
        padding: 0 1.5rem;
        padding-bottom: 1rem; /* Space for scrollbar */
    }
    
    .timeline-track-container {
        min-width: 800px; /* Force minimum width to prevent squishing */
    }
    
    /* SCHEDULE CARD HOVER */
    .schedule-card:hover {
        transform: translateY(-4px) !important;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.15) !important;
        border-color: rgba(255,255,255,0.15) !important;
        z-index: 10;
    }
    
    /* TIMELINE CARD HOVER (Robust z-index handling) */
    .timeline-card {
        backface-visibility: hidden; /* Fix for blurry text on transform */
    }
    
    .timeline-card:not(.status-completed):hover {
        z-index: 50 !important;
        transform: translateY(-2px) scale(1.02) !important;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5) !important;
    }
    
    .timeline-card.status-ongoing:hover {
        box-shadow: 0 0 20px rgba(245, 158, 11, 0.4) !important;
    }

    @media (max-width: 600px) {
        .dashboard-header {
            flex-direction: column;
            align-items: flex-start;
        }
        
        .dashboard-date-controls {
            width: 100%;
            justify-content: space-between;
            margin-top: 1rem;
            gap: 0.5rem;
        }
        
        .date-display-box {
            flex: 1;
            min-width: auto;
            justify-content: center;
            font-size: 0.9rem;
            padding: 0.6rem;
        }
        
        /* Show condensed label on mobile if needed, or hide if too cramped */
        .date-btn-label {
            display: inline-block;
            font-size: 0.8rem;
        }
        
        .today-btn {
            flex: 1; /* Make "Today" button expand */
            min-width: unset;
            padding: 0.6rem !important;
            justify-content: center;
        }
        
        .next-class-header {
            flex-direction: column !important;
        }
        
        .next-class-header > div:last-child {
            align-items: flex-start !important;
            text-align: left !important;
        }
    }
`;

export default function DashboardWithStyles() {
    return (
        <>
            <style>{dashboardStyles}</style>
            <Dashboard />
        </>
    );
}
