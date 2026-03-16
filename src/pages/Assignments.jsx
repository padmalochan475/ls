/* eslint-disable sonarjs/no-nested-conditional */

import React, { useState, useEffect, useCallback, useMemo } from 'react';

import { db } from '../lib/firebase';
import { collection, addDoc, getDocs, query, where, deleteDoc, doc, updateDoc, getDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useMasterData } from '../contexts/MasterDataContext';
import { useScheduleData } from '../hooks/useScheduleData';
import { useWritePermission } from '../hooks/useWritePermission';
import {
    Check, Users, MapPin, BookOpen, Layers, X, RefreshCw,
    AlertTriangle, Keyboard, Settings, Clock, Search, Trash2, Edit2,
    User, Brain, List
} from 'lucide-react';
import MasterData from './MasterData';
import QuantumLoader from '../components/QuantumLoader';
import { normalizeStr, normalizeTime, parseTimeSlot } from '../utils/timeUtils';
import ConfirmModal from '../components/ConfirmModal';
import { analyzeSchedule } from '../utils/conflictDetection';
import FacultyLoadMonitor from '../components/assignments/FacultyLoadMonitor';

import { Select, MultiSelectDropdown } from '../components/scheduler/SchedulerControls';
import { sendNotification } from '../utils/notificationUtils';
import '../styles/Assignments.css';


// eslint-disable-next-line sonarjs/cognitive-complexity
const Assignments = () => {
    const { activeAcademicYear, userProfile, currentUser, academicYears } = useAuth();
    const isAdmin = userProfile && userProfile.role === 'admin';

    // Master Data State
    const [departments, setDepartments] = useState([]);
    const [semesters, setSemesters] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [faculty, setFaculty] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [days, setDays] = useState([]);
    const [timeSlots, setTimeSlots] = useState([]);
    const [rawGroups, setRawGroups] = useState([]);

    // Full Schedule State
    // Full Schedule State (from Context)
    const { schedule: fullSchedule, loading: scheduleLoading } = useScheduleData();

    // Form State
    const [selectedDay, setSelectedDay] = useState('');
    const [selectedTime, setSelectedTime] = useState('');
    const [selectedDept, setSelectedDept] = useState('');
    const [selectedSem, setSelectedSem] = useState('');

    // Group State
    const [selectedMainGroup, setSelectedMainGroup] = useState('');
    const [selectedSubGroup, setSelectedSubGroup] = useState('');
    const [editingId, setEditingId] = useState(null);

    const [selectedSubject, setSelectedSubject] = useState('');
    const [selectedRoom, setSelectedRoom] = useState('');
    const [selectedFaculty, setSelectedFaculty] = useState('');
    const [selectedFaculty2, setSelectedFaculty2] = useState('');

    // Table Filters State
    const [filterDepts, setFilterDepts] = useState([]);
    const [filterSems, setFilterSems] = useState([]);
    const [filterGroups, setFilterGroups] = useState([]);
    const [filterSubjects, setFilterSubjects] = useState([]);
    const [filterFaculty, setFilterFaculty] = useState([]);

    // AI / Smart Features State
    const [aiInsight, setAiInsight] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // AI Analysis Engine (Simulated)
    useEffect(() => {
        if (!selectedDay || !selectedTime) {
            setAiInsight(null);
            return;
        }

        setIsAnalyzing(true);
        const timer = setTimeout(() => {
            // 1. Calculate Resource Load
            const activeSlots = fullSchedule.filter(s => normalizeStr(s.day) === normalizeStr(selectedDay) && normalizeTime(s.time) === normalizeTime(selectedTime));
            const totalRooms = rooms.length || 1; // Avoid divide by zero
            const utilization = Math.round((activeSlots.length / totalRooms) * 100);

            // 2. Analyze Constraints
            let status = 'optimal';
            let message = 'Optimal slot available.';
            let color = '#30d158'; // Success green

            if (utilization > 80) {
                status = 'critical';
                message = `High traffic detected! ${utilization}% of rooms are booked.`;
                color = '#ff453a'; // Danger red
            } else if (utilization > 50) {
                status = 'moderate';
                message = `Moderate activity. ${utilization}% utilization.`;
                color = '#ff9f0a'; // Warning orange
            }

            // 3. Subject Frequency Check
            if (selectedSubject && selectedMainGroup) {
                const normSubject = normalizeStr(selectedSubject);
                const normGroup = normalizeStr(selectedMainGroup);

                const subjectCount = fullSchedule.filter(s => {
                    const sSection = normalizeStr(s.section);
                    const sSubject = normalizeStr(s.subject);
                    return sSection === normGroup &&
                        sSubject === normSubject &&
                        normalizeStr(s.day) === normalizeStr(selectedDay)
                }).length;

                if (subjectCount > 0) {
                    message = `Note: ${selectedSubject} is already scheduled for this group on ${selectedDay}.`;
                    status = 'warning';
                    color = '#ff9f0a';
                }
            }

            setAiInsight({
                status,
                message,
                utilization,
                color
            });
            setIsAnalyzing(false);
        }, 600); // Simulate processing delay

        return () => clearTimeout(timer);
    }, [selectedDay, selectedTime, selectedSubject, selectedMainGroup, fullSchedule, rooms]);

    // UI State

    const [saving, setSaving] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');



    const [isManageModalOpen, setIsManageModalOpen] = useState(false);
    const [manageModalTab, setManageModalTab] = useState('faculty');
    const [searchTerm, setSearchTerm] = useState('');



    const openManageModal = (tab = 'faculty') => {
        setManageModalTab(tab);
        setIsManageModalOpen(true);
    };





    // Auto-dismiss success message
    useEffect(() => {
        if (successMsg) {
            const timer = setTimeout(() => setSuccessMsg(''), 3000);
            return () => clearTimeout(timer);
        }
    }, [successMsg]);

    const {
        departments: rawDepartments,
        semesters: rawSemesters,
        subjects: rawSubjects,
        faculty: rawFaculty,
        rooms: rawRooms,
        days: rawDays,
        timeSlots: rawTimeSlots,
        groups: contextGroups,
        loading: masterLoading
    } = useMasterData();

    // Auto-Refresh Data on Mount
    // Auto-Refresh Logic Removed: Data is strictly live-synced via Contexts.
    // useEffect(() => {
    //     const init = async () => {
    //         await Promise.all([refreshMasterData(), refreshSchedule()]);
    //         setHasRefreshed(true);
    //     };
    //     init();
    // }, [refreshMasterData, refreshSchedule]);

    // Just set loaded immediately since context handles loading state
    const [hasRefreshed] = useState(true);

    useEffect(() => {
        if (!rawDepartments || !rawSemesters) return;

        // Helper: Strong Natural Sort
        const naturalSort = (a, b) => {
            const splitAlphaNum = (str) => {
                const s = String(str);
                const numMatch = s.match(/\d+/);
                if (!numMatch) return [s, 0, ''];
                const index = numMatch.index;
                const numStr = numMatch[0];
                return [s.slice(0, index), parseInt(numStr, 10), s.slice(index + numStr.length)];
            };
            const [aPre, aNum, aSuf] = splitAlphaNum(a);
            const [bPre, bNum, bSuf] = splitAlphaNum(b);
            const preCmp = aPre.localeCompare(bPre);
            if (preCmp !== 0) return preCmp;
            if (aNum !== bNum) return aNum - bNum;
            return aSuf.localeCompare(bSuf);
        };

        setDepartments(rawDepartments.map(d => d.code || d.name).sort());
        setSemesters(rawSemesters.map(d => d.name));
        setSubjects(rawSubjects.map(d => ({ name: d.name, shortCode: d.shortCode || '' })).sort((a, b) => a.name.localeCompare(b.name)));
        setFaculty(rawFaculty.map(d => ({ name: d.name, empId: d.empId, shortCode: d.shortCode || '', uid: d.uid, id: d.id })).sort((a, b) => naturalSort(a.name, b.name)));
        setRooms(rawRooms.map(d => d.name).sort(naturalSort));

        const visibleDays = rawDays.filter(d => d.isVisible !== false).map(d => d.name);
        setDays(visibleDays);

        const formatTime = (t) => {
            if (!t) return '';
            try {
                // Robust Regex Parser
                const match = t.match(/(\d{1,2})[:.]?(\d{2})?\s*([ap]m)?/i);
                if (!match) return t;


                let [_all, hStr, mStr, marker] = match; // eslint-disable-line sonarjs/no-unused-vars
                let h = parseInt(hStr, 10);
                let m = mStr ? parseInt(mStr, 10) : 0;

                const isPM = marker ? marker.toLowerCase() === 'pm' : t.toUpperCase().includes('PM');
                const isAM = marker ? marker.toLowerCase() === 'am' : t.toUpperCase().includes('AM');

                if (isPM && h < 12) h += 12;
                if (isAM && h === 12) h = 0;

                const d = new Date();
                d.setHours(h, m, 0, 0);
                return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            } catch { return t; }
        };
        setTimeSlots(rawTimeSlots.map(s => `${formatTime(s.startTime)} - ${formatTime(s.endTime)}`));

        if (contextGroups) {
            setRawGroups(contextGroups);
        }

    }, [rawDepartments, rawSemesters, rawSubjects, rawFaculty, rawRooms, rawDays, rawTimeSlots, contextGroups]);



    // Conflict Logic
    // Local parseTimeSlot removed as it was redundant/fragile. Logic now relies on `analyzeSchedule` from conflictDetection.js
    // conflictDetection.js uses a robust implementation.

    // Conflict Logic using AI Analyzer
    const checkConflict = useCallback(() => {
        if (!selectedDay || !selectedTime) return null;

        // Resolve Entities for Analysis
        const fac1 = faculty.find(f => f.id === selectedFaculty);
        const fac2 = selectedFaculty2 ? faculty.find(f => f.id === selectedFaculty2) : null;

        const candidate = {
            day: selectedDay,
            time: selectedTime,
            dept: selectedDept,
            sem: selectedSem,
            section: selectedMainGroup,
            group: selectedSubGroup,
            subject: selectedSubject,
            room: selectedRoom,
            faculty: fac1 ? fac1.name : '',
            facultyEmpId: fac1 ? fac1.empId : null,
            faculty2: fac2 ? fac2.name : '',
            faculty2EmpId: fac2 ? fac2.empId : null
        };

        // Exclude the current assignment being edited to avoid self-conflict
        const scheduleToCheck = editingId
            ? fullSchedule.filter(s => s.id !== editingId)
            : fullSchedule;

        const analysis = analyzeSchedule(candidate, scheduleToCheck, {
            roomsCount: rooms.length
        });

        if (analysis.status === 'error') {
            return { type: 'error', message: analysis.message };
        }

        // We can expose warnings if needed, but for 'conflict' blocking, we focus on errors.
        // Warnings (like soft limits) could be handled separately or allowed.
        if (analysis.status === 'warning') {
            return { type: 'warning', message: analysis.message };
        }

        return null;
    }, [fullSchedule, editingId, selectedDay, selectedTime, selectedDept, selectedSem, selectedMainGroup, selectedSubGroup, selectedFaculty, selectedFaculty2, selectedRoom, selectedSubject, faculty, rooms]);

    const conflict = checkConflict();



    const handleSendNotification = async (empId, subject, dept, day, time, type = 'New Assignment', group, subGroup, coFaculty) => {
        if (!empId) return;

        let groupStr = `${dept}-${group}`;
        if (subGroup) groupStr += `-${subGroup}`;

        const coFacText = coFaculty ? ` WITH ${coFaculty}` : '';

        await sendNotification({
            empIds: [empId],
            title: type,
            body: `You have been assigned to ${subject} of (${groupStr.toUpperCase()})${coFacText} on ${day} at ${time}.`,
            type: 'assignment',
            data: {
                url: '/assignments',
                type: 'assignment'
            }
        });
    };

    const handleEdit = (assignment) => {
        setSelectedDay(assignment.day);
        setSelectedTime(assignment.time);
        setSelectedSubject(assignment.subject);
        setSelectedRoom(assignment.room);
        setSelectedDept(assignment.dept);
        setSelectedSem(assignment.sem);
        setSelectedMainGroup(assignment.section);
        setSelectedSubGroup(assignment.group || '');

        // Find Faculty IDs from Names if needed, or better relying on names/logic
        // But our select uses IDs. We need to find ID by Name if not stored, 
        // but wait, we are not storing IDs in 'schedule' for the dropdowns usually if we just store name.
        // Actually MasterData stores ID. Schedule stores Name. 
        // We stored `facultyEmpId` but not the doc ID of faculty.
        // We need to reverse lookup name -> ID for the Select component.
        const f1 = faculty.find(f => f.name === assignment.faculty);
        const f2 = faculty.find(f => f.name === assignment.faculty2);

        setSelectedFaculty(f1 ? f1.id : '');
        setSelectedFaculty2(f2 ? f2.id : '');

        setEditingId(assignment.id);

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const { checkWritePermission } = useWritePermission();

    // eslint-disable-next-line sonarjs/cognitive-complexity
    const handleAssign = async () => {
        // STRICT PERMISSION CHECK
        if (!checkWritePermission()) return;

        if (!navigator.onLine) {
            alert("You are offline. Cannot save assignments.");
            return;
        }

        // Validation: Enforce Sub-Group selection if available
        const groupObj = rawGroups.find(g => g.name === selectedMainGroup);
        const hasSubGroups = groupObj && groupObj.subGroups && groupObj.subGroups.length > 0;

        if (hasSubGroups && !selectedSubGroup) {
            alert("Please choose a Sub Group.");
            return;
        }

        // Validation (Length check, etc.) 
        if (!selectedDay || !selectedTime || !selectedRoom || !selectedSubject || !selectedFaculty) {
            alert('Please select all required fields.');
            return;
        }

        if (conflict) {
            alert(`Cannot assign: ${conflict.message}`);
            return;
        }

        setSaving(true);
        try {
            const facultyObj = faculty.find(f => f.id === selectedFaculty);
            const faculty2Obj = selectedFaculty2 ? faculty.find(f => f.id === selectedFaculty2) : null;

            // Base payload (excluding timestamps which are handled contextually)
            const payload = {
                academicYear: activeAcademicYear,
                dept: selectedDept,
                sem: selectedSem,
                subject: selectedSubject ? selectedSubject.trim() : '',
                faculty: facultyObj ? facultyObj.name : '',
                facultyEmpId: facultyObj?.empId || null,
                faculty2: faculty2Obj ? faculty2Obj.name : null,
                faculty2EmpId: faculty2Obj?.empId || null,
                room: selectedRoom ? selectedRoom.trim() : '',
                group: selectedSubGroup,
                section: selectedMainGroup,
                day: selectedDay ? selectedDay.trim() : '',
                time: selectedTime ? selectedTime.trim() : '',
            };

            // JIT Server-Side Validation (Prevent Race Conditions)
            // 1. STRICT INTEGRITY CHECK: Network Status
            if (!navigator.onLine) {
                alert("OFFLINE DETECTED: You cannot save changes while offline to prevent data corruption. Please check your connection.");
                setSaving(false);
                return;
            }

            // 2. STRICT INTEGRITY CHECK: Ghost Year / Invalid Year Prevention
            if (!activeAcademicYear || !academicYears.includes(activeAcademicYear)) {
                alert(`CRITICAL ERROR: The selected Academic Year (${activeAcademicYear}) is invalid or archived. Action blocked to prevent data corruption. Please refresh the page.`);
                setSaving(false);
                return;
            }

            // 3. STRICT INTEGRITY CHECK: Verify Academic Year is ACTIVE on Server
            // Prevention of "Ghost Writes" to stale/archived years if client is outdated.
            const configRef = doc(db, 'settings', 'config');
            const configSnap = await getDoc(configRef);
            if (configSnap.exists()) {
                const serverYear = configSnap.data().activeAcademicYear;
                if (serverYear !== activeAcademicYear) {
                    alert(`DATA SYNC ERROR: Your session is out of date.\n\nThe Active Academic Year is now "${serverYear}", but you are trying to save to "${activeAcademicYear}".\n\nPlease refresh the page to sync with the latest system configuration.`);
                    setSaving(false);
                    return;
                }
            }

            const checkQ = query(
                collection(db, 'schedule'),
                where('academicYear', '==', activeAcademicYear),
                where('day', '==', selectedDay)
            );
            const serverSnap = await getDocs(checkQ);
            const serverSchedule = serverSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const analysis = analyzeSchedule(payload, serverSchedule, {
                ignoreId: editingId,
                roomsCount: rooms.length
            });

            if (analysis.status === 'error') {
                alert(`Conflict detected during save: ${analysis.message}`);
                setSaving(false);
                return;
            }

            let notifType = 'New Assignment';

            if (editingId) {
                // UPDATE Existing: Use updatedAt, preserve createdAt
                const updatePayload = {
                    ...payload,
                    updatedAt: new Date().toISOString(),
                    updatedBy: (currentUser && currentUser.uid) ? currentUser.uid : 'system'
                };
                // Remove fields that shouldn't change or are redundant if we want strict history (optional, currently payload has everything)
                // But specifically we must NOT overwrite createdAt if it exists in payload (it was in original payload definition)
                delete updatePayload.createdAt;

                await updateDoc(doc(db, 'schedule', editingId), updatePayload);
                setSuccessMsg('Assignment Updated!');
                notifType = 'Schedule Update';
            } else {
                // CREATE New: Use createdAt
                const createPayload = {
                    ...payload,
                    createdAt: new Date().toISOString(),
                    createdBy: (currentUser && currentUser.uid) ? currentUser.uid : 'system'
                };
                await addDoc(collection(db, 'schedule'), createPayload);
                setSuccessMsg('Assignment Created!');
            }

            // --- FREE TIER NOTIFICATION LOGIC ---
            // Send to Faculty 1
            if (facultyObj?.empId) {
                handleSendNotification(facultyObj.empId, selectedSubject, selectedDept, selectedDay, selectedTime, notifType, selectedMainGroup, selectedSubGroup, selectedFaculty2)
                    .catch(e => console.error("Notif Error:", e));
            }
            // Send to Faculty 2
            if (faculty2Obj?.empId) {
                handleSendNotification(faculty2Obj.empId, selectedSubject, selectedDept, selectedDay, selectedTime, notifType, selectedMainGroup, selectedSubGroup, selectedFaculty)
                    .catch(e => console.error("Notif Error:", e));
            }
            // ------------------------------------

            // Clear fields to prevent immediate self-conflict and prepare for next entry
            setSelectedTime('');
            setSelectedSubject('');
            setSelectedRoom('');
            setSelectedFaculty('');
            setSelectedFaculty2('');
            setEditingId(null);

        } catch (err) {
            console.error("Error saving:", err);
            alert("Failed to save assignment.");
        } finally {
            setSaving(false);
        }
    };

    // Deleting State
    const [deletingIds, setDeletingIds] = useState(new Set());

    // Modal State
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, id: null });

    // Helper to check delete permission
    const canDelete = useCallback((assignment) => {
        if (!assignment) return false;
        return isAdmin;
    }, [isAdmin]);

    const handleDelete = (e, assignment) => {
        e.stopPropagation();
        if (!assignment) return;

        // STRICT PERMISSION CHECK
        if (!checkWritePermission()) return;

        if (!canDelete(assignment)) {
            alert("Permission denied.");
            return;
        }

        setConfirmModal({ isOpen: true, id: assignment.id });
    };

    const executeDelete = async () => {
        const id = confirmModal.id;
        if (!id) return;

        // STRICT PERMISSION CHECK
        if (!checkWritePermission()) {
            setConfirmModal({ isOpen: false, id: null });
            return;
        }

        setConfirmModal({ isOpen: false, id: null });

        // Authentic Update: Show "Deleting..." state, wait for DB
        setDeletingIds(prev => new Set(prev).add(id));

        try {
            await deleteDoc(doc(db, 'schedule', id));
            setSuccessMsg('Assignment deleted permanently.');
            // onSnapshot will handle the removal from UI
        } catch (err) {
            console.error("Delete failed:", err);
            setDeletingIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(id);
                return newSet;
            });
            alert("Failed to delete assignment: " + err.message);
        }
    };


    const filteredAssignments = useMemo(() => {
        return fullSchedule.filter(s => {
            const search = normalizeStr(searchTerm);

            // 1. Filter by Department
            if (filterDepts.length > 0 && !filterDepts.includes(s.dept)) return false;

            // 2. Filter by Semester
            if (filterSems.length > 0 && !filterSems.includes(s.sem)) return false;

            // 3. Filter by Group
            if (filterGroups.length > 0 && !filterGroups.includes(s.section)) return false;

            // 4. Filter by Subject
            if (filterSubjects.length > 0 && !filterSubjects.includes(s.subject)) return false;

            // 5. Filter by Faculty (Robust Matching)
            if (filterFaculty.length > 0) {
                const matches = filterFaculty.some(facName => {
                    const search = normalizeStr(facName);
                    const f1 = normalizeStr(s.faculty);
                    const f2 = normalizeStr(s.faculty2);

                    if (f1.includes(search) || f2.includes(search)) return true;

                    const facObj = faculty.find(f => f.name === facName);
                    if (facObj?.empId) {
                        if (s.facultyEmpId === facObj.empId || s.faculty2EmpId === facObj.empId) return true;
                    }
                    return false;
                });
                if (!matches) return false;
            }

            // 6. Search Filter
            if (!search) return true;

            return (
                normalizeStr(s.subject).includes(search) ||
                normalizeStr(s.faculty).includes(search) ||
                normalizeStr(s.faculty2).includes(search) ||
                normalizeStr(s.group).includes(search) ||
                normalizeStr(s.room).includes(search) ||
                normalizeStr(s.day).includes(search) ||
                normalizeTime(s.time).includes(search)
            );
        }).sort((a, b) => {

            const getDayIndex = (dName) => {
                if (!days) return -1;
                const target = normalizeStr(dName);
                return days.findIndex(d => normalizeStr(d.name) === target);
            };

            const ia = getDayIndex(a.day);
            const ib = getDayIndex(b.day);
            if (ia !== ib) return ia - ib;

            // Robust Sort by Start Time
            const ta = parseTimeSlot(a.time);
            const tb = parseTimeSlot(b.time);
            return (ta?.start || 0) - (tb?.start || 0);
        });
    }, [fullSchedule, searchTerm, filterDepts, filterSems, filterGroups, filterSubjects, filterFaculty, faculty, days]);

    const availableSubGroups = React.useMemo(() => {
        const groupObj = rawGroups.find(g => g.name === selectedMainGroup);
        return groupObj && groupObj.subGroups ? groupObj.subGroups : [];
    }, [rawGroups, selectedMainGroup]);


    if (scheduleLoading || masterLoading || !hasRefreshed) return <QuantumLoader />;

    return (
        <div className="assignments-container animate-fade-in">

            {/* Confirm Modal */}
            <ConfirmModal
                isOpen={confirmModal.isOpen}
                title="Delete Assignment"
                message="Are you sure you want to delete this assignment? This action cannot be undone."
                onConfirm={executeDelete}
                onCancel={() => setConfirmModal({ isOpen: false, id: null })}
                isDangerous={true}
                confirmText="Delete Permanently"
            />
            {/* Header */}
            <div className="assignments-header">
                <div>
                    <h2 className="page-title">Assignments <span className="academic-year-badge">{activeAcademicYear}</span></h2>
                    <p className="page-subtitle">Manage class schedules and faculty assignments</p>
                </div>

                {isAdmin && (
                    <button
                        onClick={() => openManageModal('faculty')}
                        className="btn glass-btn-hover manage-btn"
                    >
                        <Settings size={16} /> <span className="hide-on-mobile">Manage Master Data</span>
                    </button>
                )}
            </div>

            {/* Main Content (Stacked) */}
            <div className="assignments-content">

                {/* Section: Create Assignment (Admin Only) - Premium Layout */}
                {isAdmin && (
                    <div className="glass-panel form-panel animate-slide-up premium-form-panel">
                        <div className="panel-header compact-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div className="panel-icon-wrapper"><Keyboard size={20} color="#60a5fa" /></div>
                                <h3 className="panel-title" style={{ fontSize: '1.25rem' }}>Create Assignment</h3>
                            </div>
                            {/* Status Pill */}
                            <div className={`status-pill ${saving ? 'saving' : conflict ? 'conflict' : 'ready'}`}>
                                <div className={`status-dot ${saving ? 'pulse' : ''}`}></div>
                                {saving ? 'Saving...' : conflict ? 'Conflict Detected' : 'Ready to Create'}
                            </div>
                        </div>

                        <div className="form-grid-premium">
                            {/* Row 1: Time & Location */}
                            {/* Row 1: Time & Location */}
                            <div className="form-group-row">
                                <div className="form-group"><label id="label-day">Day</label><Select ariaLabelledby="label-day" options={days} value={selectedDay} onChange={setSelectedDay} placeholder="Select Day" /></div>
                                <div className="form-group" style={{ flex: 1.2 }}><label id="label-time">Time</label><Select ariaLabelledby="label-time" options={timeSlots} value={selectedTime} onChange={setSelectedTime} placeholder="Select Time" /></div>
                                <div className="form-group" style={{ flex: 0.7 }}><label id="label-room">Room</label><Select ariaLabelledby="label-room" options={rooms} value={selectedRoom} onChange={setSelectedRoom} placeholder="Select Room" /></div>
                                <div className="form-group" style={{ flex: 1.3 }}><label id="label-subject">Subject</label><Select ariaLabelledby="label-subject" options={subjects.map(s => ({ value: s.name, label: s.shortCode ? `${s.name} [${s.shortCode}]` : s.name }))} value={selectedSubject} onChange={setSelectedSubject} placeholder="Search Subject..." /></div>
                            </div>

                            {/* Row 2: Class Target */}
                            <div className="form-group-row">
                                <div className="form-group"><label id="label-dept">Department</label><Select ariaLabelledby="label-dept" options={departments} value={selectedDept} onChange={setSelectedDept} placeholder="Dept" /></div>
                                <div className="form-group"><label id="label-main-group">Group</label><Select ariaLabelledby="label-main-group" options={rawGroups.map(g => ({ value: g.name, label: g.name }))} value={selectedMainGroup} onChange={val => { setSelectedMainGroup(val); setSelectedSubGroup(''); }} placeholder="Main Group" /></div>
                                <div className="form-group"><label id="label-sub-group">Sub-Group</label><Select ariaLabelledby="label-sub-group" options={availableSubGroups} value={selectedSubGroup} onChange={setSelectedSubGroup} placeholder="All Sub-groups" disabled={!selectedMainGroup || availableSubGroups.length === 0} /></div>
                                <div className="form-group"><label id="label-sem">Semester</label><Select ariaLabelledby="label-sem" options={semesters} value={selectedSem} onChange={setSelectedSem} placeholder="Sem" /></div>
                            </div>

                            {/* Row 3: Faculty */}
                            <div className="form-group-row">
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label id="label-faculty-1">Faculty 1</label>
                                    <Select ariaLabelledby="label-faculty-1" options={faculty.map(f => ({ value: f.id, label: f.shortCode ? `${f.name} [${f.shortCode}]` : f.name }))} value={selectedFaculty} onChange={setSelectedFaculty} placeholder="Select Faculty..." />
                                    <FacultyLoadMonitor facultyId={selectedFaculty} fullSchedule={fullSchedule} faculty={faculty} />
                                </div>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label id="label-faculty-2">Faculty 2</label>
                                    <Select
                                        ariaLabelledby="label-faculty-2"
                                        options={[{ value: '', label: 'None' }, ...faculty.map(f => ({ value: f.id, label: f.shortCode ? `${f.name} [${f.shortCode}]` : f.name }))]}
                                        value={selectedFaculty2}
                                        onChange={setSelectedFaculty2}
                                        placeholder="Select Faculty 2..."
                                    />
                                    <FacultyLoadMonitor facultyId={selectedFaculty2} fullSchedule={fullSchedule} faculty={faculty} />
                                </div>
                            </div>
                        </div>

                        {/* Status Console Box */}
                        <div className="status-console-box">
                            {/* Console Screen */}
                            <div className={`console-screen ${saving ? 'state-idle' : successMsg ? 'state-success' : conflict ? 'state-error' : 'state-idle'}`}>
                                {saving ? (
                                    <div className="console-line"><RefreshCw size={16} className="spin" /> <span>Saving Assignment...</span></div>
                                ) : isAnalyzing ? (
                                    <div className="console-line"><RefreshCw size={16} className="spin" /> <span>System analyzing schedule conflicts...</span></div>
                                ) : successMsg ? (
                                    <div className="console-line"><Check size={16} /> <span>Success: {successMsg}</span></div>
                                ) : conflict ? (
                                    <div className="console-line"><AlertTriangle size={16} /> <span>{conflict.message}</span></div>
                                ) : aiInsight ? (
                                    <div className="console-line"><Brain size={16} /> <span>AI Insight: {aiInsight.message}</span></div>
                                ) : (
                                    <div className="console-line idle"><span>{editingId ? "Update Mode: Modify the fields above." : "Waiting for input... System ready."}</span></div>
                                )}
                            </div>

                            {/* Control Buttons */}
                            <div className="console-controls">
                                <button className="premium-btn clear" onClick={() => { setSelectedSubject(''); setSelectedFaculty(''); setSelectedRoom(''); setSelectedFaculty2(''); setSuccessMsg(''); setEditingId(null); }}>
                                    <X size={18} /> Clear
                                </button>
                                <button className="premium-btn create" onClick={handleAssign} disabled={saving || !!conflict}>
                                    {saving ? <RefreshCw className="spin" size={18} /> : (editingId ? <Edit2 size={18} /> : <Check size={18} />)} {editingId ? "Update Assignment" : "Create Assignment"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Section: Assignment History */}
                <div className="glass-panel table-panel animate-slide-up premium-table-panel" style={{ animationDelay: '0.1s' }}>
                    <div className="table-header-row">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div className="panel-icon-wrapper secondary"><List size={20} color="#a78bfa" /></div>
                            <h3 className="panel-title">Assignment History <span className="count-badge">{filteredAssignments.length}</span></h3>
                        </div>
                        <div className="search-wrapper">
                            <Search size={16} className="search-icon" />
                            <input type="text" placeholder="Search assignments..." className="glass-input search-input" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        </div>
                    </div>

                    <div className="filters-bar">
                        <MultiSelectDropdown options={departments} selected={filterDepts} onChange={setFilterDepts} label="Dept" icon={BookOpen} />
                        <MultiSelectDropdown options={semesters} selected={filterSems} onChange={setFilterSems} label="Sem" icon={Layers} />
                        <MultiSelectDropdown options={rawGroups.map(g => g.name)} selected={filterGroups} onChange={setFilterGroups} label="Group" icon={Users} />
                        <MultiSelectDropdown options={subjects.map(s => s.name)} selected={filterSubjects} onChange={setFilterSubjects} label="Subject" icon={BookOpen} />
                        <MultiSelectDropdown options={faculty.map(f => f.name)} selected={filterFaculty} onChange={setFilterFaculty} label="Faculty" icon={User} />
                    </div>

                    {/* PREMIUM UNIFIED CARDS VIEW (Replaces Table everywhere) */}
                    <div className="premium-cards-grid">
                        {filteredAssignments.length > 0 ? filteredAssignments.map((assignment) => (
                            <div key={assignment.id} className="assignment-card-mobile">
                                {/* Column 1: Time & Day */}
                                <div className="card-header-mobile">
                                    <span className="card-day">{assignment.day}</span>
                                    <div className="card-time"><Clock size={16} /> {assignment.time}</div>
                                </div>

                                {/* Column 2: Subject */}
                                <div className="card-body-mobile">
                                    <h4 className="card-subject">{assignment.subject}</h4>
                                </div>

                                {/* Column 3: Badges */}
                                <div className="card-details-grid">
                                    <div className="badge badge-blue detail-badge min-w-0"><User size={14} className="shrink-0" /> <span className="truncate">{assignment.faculty}</span></div>
                                    {assignment.faculty2 && <div className="badge badge-purple detail-badge min-w-0"><User size={14} className="shrink-0" /> <span className="truncate">{assignment.faculty2}</span></div>}
                                    <div className="badge badge-pink detail-badge shrink-0"><MapPin size={14} /> <span>{assignment.room}</span></div>
                                    <div className="badge badge-orange detail-badge shrink-0"><Layers size={14} /> <span>{assignment.sem?.replace(/Semester/i, 'Sem')}</span></div>
                                    <div className="badge badge-green detail-badge shrink-0"><Users size={14} /> <span>{assignment.dept}-{assignment.section}{assignment.group ? `-${assignment.group}` : ''}</span></div>
                                </div>

                                {/* Column 4: Actions */}
                                {assignment.id && canDelete(assignment) ? (
                                    <div className="card-actions-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <button onClick={() => handleEdit(assignment)} className="icon-btn-edit mini" title="Edit">
                                            <Edit2 size={14} />
                                        </button>
                                        <button onClick={(e) => handleDelete(e, assignment)} className="icon-btn-danger mini" disabled={deletingIds.has(assignment.id)}>
                                            {deletingIds.has(assignment.id) ? <RefreshCw size={14} className="spin" /> : <Trash2 size={14} />}
                                        </button>
                                    </div>
                                ) : <div />}
                            </div>
                        )) : (
                            <div className="empty-state">
                                <div className="empty-content">
                                    <div className="empty-icon"><Search size={24} /></div>
                                    <div>No assignments found for {activeAcademicYear}</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

            </div>

            {/* Manage Data Modal */}
            {isManageModalOpen && (<div className="modal-overlay"><div className="modal-content glass-panel animate-scale-in"><button onClick={() => setIsManageModalOpen(false)} className="modal-close-btn"><X size={20} /></button><div className="modal-body"><MasterData initialTab={manageModalTab} /></div></div></div>)}

            {/* Styles moved to Assignments.css */}
        </div >
    );
};



export default Assignments;
