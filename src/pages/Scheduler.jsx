import React, { useState, useEffect, useRef } from 'react';
import { MultiSelectDropdown } from '../components/scheduler/SchedulerControls';
import BookingModal from '../components/scheduler/BookingModal';
import QuickAssignPanel from '../components/scheduler/QuickAssignPanel';
import SwapFacultyModal from '../components/scheduler/SwapModal';
import ScheduleGrid from '../components/scheduler/ScheduleGrid';
import AssignmentDetailsModal from '../components/scheduler/AssignmentDetailsModal'; // Added Import
import { db } from '../lib/firebase';
import { collection, addDoc, query, where, deleteDoc, doc, updateDoc, getDocs, getDoc, writeBatch, and } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useMasterData } from '../contexts/MasterDataContext';
import { useScheduleData } from '../hooks/useScheduleData';
import { useWritePermission } from '../hooks/useWritePermission';
import { analyzeSchedule } from '../utils/conflictDetection';
import '../styles/design-system.css';
import ConfirmModal from '../components/ConfirmModal';
import { ChevronDown, LayoutGrid, List, Zap, Filter, Users, BookOpen, Layers, RefreshCw, Printer, MapPin, AlertTriangle } from 'lucide-react';
import { generateTimetablePDF } from '../utils/pdfGenerator';
import { styledExportToExcel } from '../utils/excelGenerator';
import { sendNotification } from '../utils/notificationUtils';
import { normalizeStr, normalizeTime } from '../utils/timeUtils';
import { sortSemesters } from '../utils/sortUtils';





// Components moved to src/components/scheduler/

// eslint-disable-next-line sonarjs/cognitive-complexity
const Scheduler = () => {
    const auth = useAuth();
    const { userProfile, activeAcademicYear, currentUser } = auth || {};



    const [viewMode, setViewMode] = useState('horizontal');
    const [viewType, setViewType] = useState('class'); // 'class' or 'faculty'
    const [selectedDepts, setSelectedDepts] = useState([]);
    const [selectedSems, setSelectedSems] = useState([]);
    const [selectedFaculties, setSelectedFaculties] = useState(userProfile?.name ? [userProfile.name] : []);
    const [selectedSubjects, setSelectedSubjects] = useState([]);
    const [selectedLabs, setSelectedLabs] = useState([]);
    const [selectedAssignment, setSelectedAssignment] = useState(null); // New State
    const defaultsSet = useRef(false);

    // Data States
    const { schedule, loading: scheduleLoading } = useScheduleData();
    const [rooms, setRooms] = useState([]);
    const [faculty, setFaculty] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [subjectDetails, setSubjectDetails] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [semesters, setSemesters] = useState([]);
    const [groups, setGroups] = useState([]);
    // Derived loading from master data (below) and schedule data
    // const [loading, setLoading] = useState(true); // Removed local state

    // Modal States
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({
        day: '',
        time: '',
        subject: '',
        room: '',
        faculty: '',
        faculty2: '',
        group: '',
        section: '',
        dept: '',
        sem: ''
    });
    const [error, setError] = useState('');
    const [editingId, setEditingId] = useState(null);

    // Quick Assign State
    const [quickAssignMode, setQuickAssignMode] = useState(false);
    const [quickAssignData, setQuickAssignData] = useState({
        subject: '',
        room: '',
        faculty: '',
        faculty2: '',
        group: '',
        section: '',
        dept: '',
        sem: '',
        day: '',
        time: ''
    });

    const [days, setDays] = useState([]);
    const [timeSlots, setTimeSlots] = useState([]);



    const {
        rooms: rawRooms,
        faculty: rawFaculty,
        subjects: rawSubjects,
        departments: rawDepartments,
        semesters: rawSemesters,
        groups: rawGroups,
        days: rawDays,
        timeSlots: rawTimeSlots,
        loading: masterLoading
    } = useMasterData();

    const loading = masterLoading || scheduleLoading;

    // Helper: Strong Natural Sort (Manual implementation for 100% browsing consistency)
    const naturalSort = (a, b) => {
        const splitAlphaNum = (str) => {
            // eslint-disable-next-line sonarjs/slow-regex
            const match = String(str).match(/^(\D*)(\d+)(.*)$/);
            if (!match) return [String(str), 0, ''];
            // return [prefix, number, suffix]
            return [match[1], parseInt(match[2] || 0, 10), match[3]];
        };

        const [aPre, aNum, aSuf] = splitAlphaNum(a);
        const [bPre, bNum, bSuf] = splitAlphaNum(b);

        // Compare prefixes (e.g., "Lab " vs "Lab ")
        const preCmp = aPre.localeCompare(bPre);
        if (preCmp !== 0) return preCmp;

        // Compare numbers (e.g., 2 vs 10)
        if (aNum !== bNum) return aNum - bNum;

        // Compare suffixes (if any)
        return aSuf.localeCompare(bSuf);
    };

    // eslint-disable-next-line sonarjs/cognitive-complexity
    useEffect(() => {
        if (!rawRooms || !rawFaculty) return;

        // Process Rooms
        setRooms(rawRooms.map(d => d.name).sort(naturalSort));

        // Process Faculty
        setFaculty(rawFaculty.map(d => ({ name: d.data?.name || d.name, shortCode: d.data?.shortCode || d.shortCode, empId: d.data?.empId || d.empId })).sort((a, b) => naturalSort(a.name, b.name)));

        // Process Subjects
        const subData = rawSubjects.map(d => ({ name: d.name, shortCode: d.shortCode, type: d.type })).sort((a, b) => a.name.localeCompare(b.name));
        setSubjects(subData.map(d => d.name));
        setSubjectDetails(subData);

        // Process Departments
        const depts = [...new Set(rawDepartments.map(d => d.code || d.name))].sort();
        setDepartments(depts);

        // Process Semesters
        // Semesters might have same name but different ID? Usually name is unique ('1st Semester', etc)
        // Let's filter unique names just in case
        const uniqueSemesters = rawSemesters.filter((s, index, self) =>
            index === self.findIndex((t) => (t.name === s.name))
        );
        setSemesters(uniqueSemesters);

        // Process Groups
        setGroups(rawGroups); // Context doesn't sort by name by default? Context sorts by name if no sortFn.

        // Default to ALL departments and semesters for the view (Only once)
        if (!defaultsSet.current) {
            if (depts.length > 0) {
                if (selectedDepts.length === 0) setSelectedDepts(depts);
                setQuickAssignData(prev => ({ ...prev, dept: depts[0] }));
            }

            if (rawSemesters.length > 0) {
                const semNames = rawSemesters.map(s => s.name);
                if (selectedSems.length === 0) setSelectedSems(semNames);
                setQuickAssignData(prev => ({ ...prev, sem: rawSemesters[0].name }));
            }

            // Mark as set if we have data
            if (depts.length > 0 && rawSemesters.length > 0) {
                defaultsSet.current = true;
            }
        }

        // Process Days
        const visibleDays = rawDays.filter(d => d.isVisible !== false).map(d => d.name);
        setDays(visibleDays);
        if (visibleDays.length > 0 && !formData.day) {
            setFormData(prev => ({ ...prev, day: visibleDays[0] }));
        }

        // Process Time Slots
        const formatTime = (t) => {
            if (!t) return '';
            try {
                // Robust Regex Parser (Handles HH:MM, H.MM, AM/PM)
                const match = t.match(/(\d{1,2})[:.]?(\d{2})?\s*([ap]m)?/i);
                if (!match) return t;

                const hStr = match[1];
                const mStr = match[2];
                const marker = match[3];
                let h = parseInt(hStr, 10);
                const m = mStr ? parseInt(mStr, 10) : 0;

                if (marker && marker.toLowerCase() === 'pm' && h < 12) h += 12;
                if (marker && marker.toLowerCase() === 'am' && h === 12) h = 0;

                // Reconstruct to consistent format for Date object
                const val = `2000-01-01T${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

                const d = new Date(val);
                if (isNaN(d.getTime())) return t; // Fallback

                return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                // eslint-disable-next-line sonarjs/no-ignored-exceptions, no-unused-vars
            } catch (e) { return t; }
        };
        const formattedSlots = rawTimeSlots.map(s => `${formatTime(s.startTime)} - ${formatTime(s.endTime)}`);
        setTimeSlots(formattedSlots);

        if (formattedSlots.length > 0 && !formData.time) {
            setFormData(prev => ({ ...prev, time: formattedSlots[0] }));
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rawRooms, rawFaculty, rawSubjects, rawDepartments, rawSemesters, rawGroups, rawDays, rawTimeSlots, formData.day, formData.time]);

    // Schedule syncing handled by useScheduleData hook

    const [contentTypeFilter, setContentTypeFilter] = useState('all'); // 'all', 'theory', 'lab'

    // Helper: Determine if assignment is Lab
    const isAssignmentLab = (assignment) => {
        let isLab = false;
        // 1. Check Master Data type
        if (subjectDetails) {
            const subjectData = subjectDetails.find(s => s.name === assignment.subject);
            if (subjectData && subjectData.type === 'lab') isLab = true;
        }
        // 2. Fallback: Fuzzy Name Match
        // 2. Fallback: Fuzzy Name Match
        if (!isLab) {
            const sub = normalizeStr(assignment.subject);
            const rm = normalizeStr(assignment.room);
            if (sub.includes('lab') || rm.includes('lab')) {
                isLab = true;
            }
        }
        return isLab;
    };

    // Filter Logic
    const getFilteredSchedule = () => {
        let filtered = schedule;

        if (viewType === 'class') {
            // Strict Filter: Must match selected Departments AND Semesters
            // If selection is empty (Unselect All), show nothing.
            filtered = filtered.filter(item => selectedDepts.includes(item.dept));
            filtered = filtered.filter(item => selectedSems.includes(item.sem));
        } else if (viewType === 'faculty') {
            filtered = filtered.filter(item => {
                // If no selection, show nothing (follows Class selection behavior)
                if (selectedFaculties.length === 0) return false;

                return selectedFaculties.some(facName => {
                    const search = normalizeStr(facName);
                    const f1 = normalizeStr(item.faculty);
                    const f2 = normalizeStr(item.faculty2);

                    // 1. Match by inclusion (best for names with trailing spaces)
                    if (f1.includes(search) || f2.includes(search)) return true;

                    // 2. Match by EmpID
                    // eslint-disable-next-line sonarjs/no-nested-functions
                    const facObj = faculty.find(f => f.name === facName);
                    if (facObj?.empId) {
                        if (item.facultyEmpId === facObj.empId || item.faculty2EmpId === facObj.empId) return true;
                    }

                    return false;
                });
            });
        } else if (viewType === 'subject') {
            filtered = filtered.filter(item => selectedSubjects.includes(item.subject));
        } else if (viewType === 'room') {
            filtered = filtered.filter(item => selectedLabs.includes(item.room));
        }

        // Apply Content Type Filter
        if (contentTypeFilter === 'theory') {
            filtered = filtered.filter(item => !isAssignmentLab(item));
        } else if (contentTypeFilter === 'lab') {
            filtered = filtered.filter(item => isAssignmentLab(item));
        }

        return filtered;
    };

    const filteredSchedule = getFilteredSchedule();

    const getFilterText = () => {
        if (viewType === 'class') return `DEPTS: ${selectedDepts.join(', ') || 'ALL'} | SEMS: ${selectedSems.join(', ') || 'ALL'}`;
        if (viewType === 'faculty') return `FACULTY: ${selectedFaculties.join(', ')}`;
        if (viewType === 'subject') return `SUBJECT: ${selectedSubjects.join(', ')}`;
        if (viewType === 'room') return `ROOM: ${selectedLabs.join(', ')}`;
        return `VIEW: ${viewType.toUpperCase()}`;
    };

    // --- ORPHANED ASSIGNMENT DETECTION (Improved Logic) ---
    // Detect assignments that are hidden due to Day not in view or Time mismatch
    const [hiddenCount, setHiddenCount] = useState(0);

    useEffect(() => {
        if (loading || !schedule || days.length === 0 || timeSlots.length === 0) return;

        // Build Normalized Sets for quick lookup
        const validDaysNorm = new Set(days.map(d => normalizeStr(d)));
        const validTimesNorm = new Set(timeSlots.map(t => normalizeTime(t)));

        const count = schedule.filter(item => {
            // 1. Check Day (Fuzzy)
            const dNorm = normalizeStr(item.day);
            if (!validDaysNorm.has(dNorm)) return true;

            // 2. Check Time (Fuzzy)
            const tNorm = normalizeTime(item.time);
            if (!validTimesNorm.has(tNorm)) return true;

            return false;
        }).length;

        setHiddenCount(count);
    }, [schedule, days, timeSlots, loading]);


    // Notification Logic (Refactored)
    const handleSendNotification = async (empId, subject, dept, day, time, type = 'New Assignment', group, subGroup, coFaculty) => {
        if (!empId) return;

        // Resolve Co-Faculty Name if ID is passed
        const resolveName = (val) => {
            if (!val) return '';
            // Check if 'faculty' list is available in scope (it is from props/context)
            const found = faculty.find(f => f.name === val || f.empId === val || f.uid === val || f.id === val);
            return found ? found.name : val;
        };

        const resolvedCoFaculty = resolveName(coFaculty);

        let groupStr = `${dept}-${group}`;
        if (subGroup) groupStr += `-${subGroup}`;
        const coFacText = resolvedCoFaculty ? ` WITH ${resolvedCoFaculty}` : '';

        await sendNotification({
            empIds: [empId],
            title: type,
            body: `You have been assigned to ${subject} of (${groupStr.toUpperCase()})${coFacText} on ${day} at ${time}.`,
            type: 'assignment',
            data: {
                url: '/assignments',
                type: 'assignment' // Redundant but consistent with original payload
            }
        });
    };

    // Enhanced Conflict Detection Logic
    const { checkWritePermission } = useWritePermission();

    // eslint-disable-next-line sonarjs/cognitive-complexity
    const handleSave = async (e, overrideData = null) => {
        if (e) e.preventDefault();
        setError('');

        // STRICT PERMISSION CHECK
        if (!checkWritePermission()) return;

        if (!navigator.onLine) {
            alert("You are offline. Cannot save changes.");
            return;
        }

        const dataToSave = overrideData || formData;

        // Validation: Enforce Sub-Group selection if available
        const grpObj = groups.find(g => g.name === dataToSave.section);
        if (grpObj && grpObj.subGroups && grpObj.subGroups.length > 0 && !dataToSave.group) {
            const msg = "Please choose a Sub-Group.";
            setError(msg);
            if (overrideData) alert(msg);
            return;
        }

        // Basic Validation
        if (!dataToSave.subject || !dataToSave.room || !dataToSave.faculty || !dataToSave.day || !dataToSave.time) {
            const msg = "Please fill in all required fields (Subject, Room, Faculty, Day, Time).";
            setError(msg);
            if (overrideData) alert(msg);
            return;
        }

        // Lookup Faculty EmpIDs for robust linking
        const faculty1Obj = faculty.find(f => f.name === dataToSave.faculty);
        const faculty2Obj = dataToSave.faculty2 ? faculty.find(f => f.name === dataToSave.faculty2) : null;


        // STRICT VALIDATION: Academic Year must be present
        if (!activeAcademicYear) {
            const msg = "System Error: No Active Academic Year detected. Please refresh the page.";
            setError(msg);
            if (overrideData) alert(msg);
            return;
        }

        // Sanitize Strings (Passive Repair)
        const clean = (s) => (s && typeof s === 'string') ? s.trim() : s;

        const finalData = {
            ...dataToSave,
            day: clean(dataToSave.day),
            time: clean(dataToSave.time),
            subject: clean(dataToSave.subject),
            room: clean(dataToSave.room),
            dept: clean(dataToSave.dept),
            sem: clean(dataToSave.sem),
            section: clean(dataToSave.section),
            group: clean(dataToSave.group),
            faculty: clean(dataToSave.faculty),
            faculty2: clean(dataToSave.faculty2),
            facultyEmpId: (faculty1Obj && faculty1Obj.empId) || null,
            faculty2EmpId: (faculty2Obj && faculty2Obj.empId) || null,
            academicYear: activeAcademicYear
        };

        try {
            // JIT Server-Side Validation (Prevent Race Conditions)
            // Query only relevant slots to minimize read costs while ensuring integrity
            const checkQ = query(
                collection(db, 'schedule'),
                and(
                    where('academicYear', '==', activeAcademicYear),
                    where('day', '==', finalData.day)
                )
                // We fetch the WHOLE day to catch:
                // 1. Partial time overlaps
                // 2. Faculty daily load counts
                // 3. Subject repetition
            );

            const serverSnap = await getDocs(checkQ);
            const serverSchedule = serverSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // 1. Analyze against SERVER truth
            const analysis = analyzeSchedule(finalData, serverSchedule, {
                ignoreId: editingId,
                roomsCount: rooms.length
            });

            if (analysis.status === 'error') {
                const msg = `Server Block: ${analysis.message}`;
                setError(msg);
                if (overrideData) alert(msg);
                // Force refresh context if needed, but the listener should catch up eventually.
                return;
            }

            // 2. Show Warnings (Soft Conflicts)
            if (analysis.status === 'warning') {
                const confirmed = window.confirm(`Warning: ${analysis.message}\n\nDo you want to proceed anyway?`);
                if (!confirmed) return;
            }

            // 0. STRICT SYNC CHECK: Academic Year
            const configRef = doc(db, 'settings', 'config');
            const configSnap = await getDoc(configRef);
            if (configSnap.exists()) {
                const serverYear = configSnap.data().activeAcademicYear;
                if (serverYear !== activeAcademicYear) {
                    alert(`SYNC ERROR: Active Academic Year mismatch. Server: ${serverYear}, Local: ${activeAcademicYear}.\n\nPlease refresh.`);
                    return;
                }
            }

            let notifType = 'New Assignment';
            if (editingId) {
                // Update
                const updatePayload = {
                    ...finalData,
                    updatedAt: new Date().toISOString(),
                    updatedBy: (currentUser && currentUser.uid) ? currentUser.uid : 'system'
                };
                delete updatePayload.createdAt; // Ensure we don't overwrite if present
                await updateDoc(doc(db, 'schedule', editingId), updatePayload);
                notifType = 'Schedule Update';
            } else {
                // Create
                const createPayload = {
                    ...finalData,
                    createdAt: new Date().toISOString(),
                    createdBy: (currentUser && currentUser.uid) ? currentUser.uid : 'system'
                };
                await addDoc(collection(db, 'schedule'), createPayload);
            }

            // --- NOTIFICATION TRIGGER ---
            if (finalData.facultyEmpId) {
                handleSendNotification(finalData.facultyEmpId, finalData.subject, finalData.dept, finalData.day, finalData.time, notifType, finalData.section, finalData.group, finalData.faculty2)
                    .catch(e => console.error("Notif Error:", e));
            }
            if (finalData.faculty2EmpId) {
                handleSendNotification(finalData.faculty2EmpId, finalData.subject, finalData.dept, finalData.day, finalData.time, notifType, finalData.section, finalData.group, finalData.faculty)
                    .catch(e => console.error("Notif Error:", e));
            }
            // ----------------------------

            if (!overrideData) {
                setIsModalOpen(false);
                setFormData({ ...formData, subject: '', room: '', faculty: '', faculty2: '', group: '' });
                setEditingId(null);
            }
        } catch (err) {
            console.error("Error saving schedule:", err);
            setError(`Failed to save schedule: ${err.message}`);
        }
    };

    const handleEdit = (assignment) => {
        setFormData({
            day: assignment.day,
            time: assignment.time,
            subject: assignment.subject,
            room: assignment.room,
            faculty: assignment.faculty,
            faculty2: assignment.faculty2 || '',
            group: assignment.group || '',
            section: assignment.section || '',
            dept: assignment.dept,
            sem: assignment.sem
        });
        setEditingId(assignment.id);
        setIsModalOpen(true);
    };

    // Deleting State
    const [deletingIds, setDeletingIds] = useState(new Set());
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, id: null });

    const handleDelete = (id) => {
        if (!id) return;

        // STRICT PERMISSION CHECK
        if (!checkWritePermission()) return;

        setConfirmModal({ isOpen: true, id });
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

        if (!isAdmin) {
            alert("Permission denied. Only Admins can delete.");
            return;
        }

        if (!navigator.onLine) {
            alert("You are offline. Cannot delete.");
            return;
        }

        setDeletingIds(prev => new Set(prev).add(id));

        try {
            await deleteDoc(doc(db, 'schedule', id));
            // onSnapshot will handle the removal
        } catch (err) {
            console.error("Error deleting:", err);
            setDeletingIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(id);
                return newSet;
            });
            alert("Failed to delete class.");
        }
    };

    const openModal = (day, time) => {
        if (quickAssignMode) {
            // Quick Assign Logic
            if (!quickAssignData.subject || !quickAssignData.room || !quickAssignData.faculty) {
                alert("Please configure Quick Assign settings first (Subject, Room, Faculty).");
                return;
            }
            handleSave(null, {
                ...quickAssignData,
                day,
                time
            });
        } else {
            // Standard Modal Logic
            setFormData({
                ...formData,
                day,
                time,
                subject: '',
                room: '',
                faculty: '',
                dept: selectedDepts.length > 0 ? selectedDepts[0] : (departments[0] || ''),
                sem: selectedSems.length > 0 ? selectedSems[0] : (semesters[0]?.name || '')
            });
            setError('');
            setIsModalOpen(true);
        }
    };

    const getAssignments = (day, time) => {
        // Fuzzy Match to ensure we show everything that isn't countable as 'hidden'
        const targetD = normalizeStr(day);
        const targetT = normalizeTime(time);

        const assignments = filteredSchedule.filter(item =>
            normalizeStr(item.day) === targetD &&
            normalizeTime(item.time) === targetT
        );

        // Sort: 1st Sem -> 8th Sem
        return assignments.sort(sortSemesters);
    };

    const isAdmin = userProfile && userProfile.role === 'admin';

    const getFacultyShortCode = (name) => {
        if (!name) return '';
        // Normalize helper: lowercase, remove all spaces and special chars to ensure robust matching
        const normalize = (str) => String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const target = normalize(name);

        const f = faculty.find(f => normalize(f.name) === target);

        // Strict: Only return shortCode if found in Master Data. Fallback to name ONLY if not found.
        return f && f.shortCode ? f.shortCode : name;
    };

    const getSubjectShortCode = (name) => {
        if (!name) return '';
        const normalize = (str) => String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const target = normalize(name);

        const s = subjectDetails.find(s => normalize(s.name) === target);
        return s && s.shortCode ? s.shortCode : name;
    };






    // --- SWAP LOGIC ---
    const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
    const [swapSourceAssignment, setSwapSourceAssignment] = useState(null);

    const handleInitiateSwap = (assignment) => {
        setSwapSourceAssignment(assignment);
        setIsSwapModalOpen(true);
    };

    // eslint-disable-next-line sonarjs/cognitive-complexity
    const handleConfirmSwap = async (sourceItem, targetItem, targetFacultyName, sourceFacultyToSwap) => {
        // STRICT PERMISSION CHECK
        if (!checkWritePermission()) return;

        try {
            const timestamp = new Date().toISOString();
            const userId = (currentUser && currentUser.uid) ? currentUser.uid : 'system';

            // Allow user to specify which source faculty (if provided), else default to Primary
            const sourceFacName = sourceFacultyToSwap || sourceItem.faculty;

            // Update Source Doc
            const sourceUpdate = {};
            let sourceIsFac1 = (sourceItem.faculty === sourceFacName);

            if (sourceIsFac1) sourceUpdate.faculty = targetFacultyName;
            else sourceUpdate.faculty2 = targetFacultyName;

            const targetFacObj = faculty.find(f => f.name === targetFacultyName);
            if (sourceIsFac1) sourceUpdate.facultyEmpId = targetFacObj?.empId || null;
            else sourceUpdate.faculty2EmpId = targetFacObj?.empId || null;

            sourceUpdate.updatedAt = timestamp;
            sourceUpdate.updatedBy = userId;

            // Update Target Doc
            const targetUpdate = {};
            let targetIsFac1 = (targetItem.faculty === targetFacultyName);

            if (targetIsFac1) targetUpdate.faculty = sourceFacName;
            else targetUpdate.faculty2 = sourceFacName;

            const sourceFacObj = faculty.find(f => f.name === sourceFacName);
            if (targetIsFac1) targetUpdate.facultyEmpId = sourceFacObj?.empId || null;
            else targetUpdate.faculty2EmpId = sourceFacObj?.empId || null;

            targetUpdate.updatedAt = timestamp;
            targetUpdate.updatedBy = userId;

            // ATOMIC BATCH WRITE
            const batch = writeBatch(db);
            const sourceRef = doc(db, 'schedule', sourceItem.id);
            const targetRef = doc(db, 'schedule', targetItem.id);

            batch.update(sourceRef, sourceUpdate);
            batch.update(targetRef, targetUpdate);

            await batch.commit();

            // Notifications (Non-blocking)
            // We don't await these to keep UI snappy after success
            handleSendNotification(sourceFacObj?.empId, targetItem.subject, targetItem.dept, targetItem.day, targetItem.time, 'Swap Alert', targetItem.section, targetItem.group, targetItem.faculty === targetFacultyName ? targetItem.faculty2 : targetItem.faculty).catch(e => console.error(e));
            handleSendNotification(targetFacObj?.empId, sourceItem.subject, sourceItem.dept, sourceItem.day, sourceItem.time, 'Swap Alert', sourceItem.section, sourceItem.group, sourceItem.faculty === sourceFacName ? sourceItem.faculty2 : sourceItem.faculty).catch(e => console.error(e));

            alert("✅ Swap Successful!");

        } catch (e) {
            console.error("Swap Error:", e);
            if (e.message && e.message.includes("No document to update")) {
                alert("Swap Failed: One of these classes has been deleted or modified by another user.\n\nPlease refresh the page.");
            } else {
                alert("Swap Failed: " + e.message);
            }
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)' }}>
                <RefreshCw className="spin" size={32} />
            </div>
        );
    }

    // Auto-Scaling Calculation for Browser Print
    const totalItems = filteredSchedule.length;
    let printScale = 1;
    if (totalItems > 60) printScale = 0.55;
    else if (totalItems > 45) printScale = 0.65;
    else if (totalItems > 30) printScale = 0.75;
    else if (totalItems > 15) printScale = 0.85;

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-md)',
            height: '100%',
            '--print-scale': printScale
        }}>
            {hiddenCount > 0 && (
                <div style={{
                    background: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.2)',
                    color: '#fbbf24',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '8px'
                }}>
                    <AlertTriangle size={20} />
                    <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 700 }}>Data Mismatch Detected:</span> {hiddenCount} assignments are currently hidden because their Day or Time does not match the active Master Data settings.
                    </div>
                </div>
            )}
            <ConfirmModal
                isOpen={confirmModal.isOpen}
                title="Remove Class"
                message="Are you sure you want to remove this class from the schedule?"
                onConfirm={executeDelete}
                onCancel={() => setConfirmModal({ isOpen: false, id: null })}
                isDangerous={true}
                confirmText="Remove"
            />
            <style>{`
                #print-area { display: none; }
                @media print {
                    #print-area { display: block; }
                    @page { 
                        size: A4 landscape; 
                        margin: 5mm; 
                    }
                    
                    body { 
                        background: white !important; 
                        color: black !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        font-family: 'Inter', 'Segoe UI', Arial, sans-serif !important;
                        visibility: hidden; 
                    }

                    /* Show only print area */
                    #print-area {
                        visibility: visible;
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: calc(100% / var(--print-scale, 1)); /* Compensate for scale */
                        transform: scale(var(--print-scale, 1));
                        transform-origin: top left;
                        margin: 0;
                        padding: 0;
                        background: white !important;
                    }

                    #print-area * {
                        visibility: visible;
                        box-sizing: border-box;
                    }

                    /* --- Professional Table Styling --- */
                    #print-area table.print-table {
                        width: 100%;
                        border-collapse: collapse !important;
                        border: 2px solid black !important;
                        table-layout: fixed; /* Ensures equal col widths if set */
                        margin-top: 10px;
                    }

                    #print-area table.print-table th,
                    #print-area table.print-table td {
                        border: 1px solid black !important;
                        padding: 4px;
                        font-size: 9pt;
                        vertical-align: top;
                        color: black !important;
                        background: white !important;
                    }

                    /* Header Styling */
                    #print-area table.print-table th {
                        background-color: #f3f4f6 !important; /* Light gray header */
                        font-weight: 800;
                        text-align: center;
                        border-bottom: 2px solid black !important;
                        padding: 8px 4px;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }

                    /* Day Column Styling - Clean & readable */
                    #print-area .day-cell {
                        background-color: #f1f5f9 !important;
                        color: #334155 !important;
                        font-weight: 800;
                        text-align: center;
                        vertical-align: middle !important;
                        width: 40px !important;
                        border-right: 2px solid black !important;
                        padding: 0 !important;
                        text-transform: uppercase;
                        font-size: 10pt;
                    }
                    
                    #print-area .day-cell .vertical-text {
                         display: flex;
                         align-items: center;
                         justify-content: center;
                         writing-mode: vertical-lr; /* Better reading direction */
                         transform: rotate(180deg); /* Fix orientation */
                         height: 100%;
                         width: 100%;
                         letter-spacing: 2px;
                    }

                    /* =========================================
                       PLATINUM PRINT SYSTEM (v4.0 - Premium)
                       ========================================= */
                    
                    /* 1. Global Reset & Typography */
                    html, body {
                         height: auto !important;
                         min-height: 100% !important;
                         background: #fff !important;
                         color: #1e293b !important;
                         font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
                         -webkit-print-color-adjust: exact !important;
                         print-color-adjust: exact !important;
                    }

                    .check-print-styles {
                        display: block !important;
                        padding: 0;
                        margin: 0;
                        width: 100%;
                    }

                    /* 2. Premium Header Styling */
                    .print-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-end;
                        padding: 20px 0;
                        border-bottom: 3px solid #0f172a;
                        margin-bottom: 20px;
                    }
                    
                    .print-header h1 {
                        font-size: 28pt;
                        font-weight: 900;
                        color: #0f172a;
                        margin: 0;
                        letter-spacing: -1px;
                        line-height: 1;
                        text-transform: uppercase;
                    }

                    .print-meta-grid {
                        display: grid;
                        grid-template-columns: auto auto;
                        gap: 15px;
                        font-size: 9pt;
                        color: #475569;
                    }

                    /* 3. The "Schedule Grid" Table */
                    .print-table {
                        width: 100%;
                        border-collapse: separate;
                        border-spacing: 0;
                        border: 1px solid #e2e8f0;
                        border-radius: 8px;
                        overflow: hidden;
                        margin-bottom: 20px;
                        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); /* Visible on screen preview */
                    }

                    .print-table th {
                        background: #f8fafc !important;
                        color: #334155 !important;
                        font-weight: 700;
                        text-transform: uppercase;
                        font-size: 8.5pt;
                        letter-spacing: 0.5px;
                        padding: 12px 8px;
                        border-bottom: 2px solid #e2e8f0;
                        border-right: 1px solid #e2e8f0;
                    }

                    .print-table td {
                        border-bottom: 1px solid #e2e8f0;
                        border-right: 1px solid #e2e8f0;
                        vertical-align: top;
                        padding: 8px;
                        background: #fff;
                    }

                    /* Zebra Striping for Rows */
                    .print-table tr:nth-child(even) td {
                        background: #fff !important;
                    }
                    .print-table tr:nth-child(odd) td {
                        background: #fcfcfc !important; /* Very subtle alternate */
                    }

                    /* 4. Day Column (The "Sidebar") */
                    .day-cell {
                        background: #0f172a !important; /* Dark Slate Blue */
                        color: #fff !important;
                        width: 40px;
                        padding: 0 !important;
                        border-right: 2px solid #0f172a !important;
                    }

                    .day-cell .vertical-text {
                        writing-mode: vertical-rl;
                        transform: rotate(180deg);
                        text-align: center;
                        font-weight: 800;
                        letter-spacing: 3px;
                        height: 100%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        text-transform: uppercase;
                        font-size: 11pt;
                    }

                    /* 5. Assignment "Card" Design */
                    /* 5. Assignment "Card" (Ticket Flex) */
                    .print-assignment {
                        background: #fff;
                        border: 1px solid #e2e8f0;
                        border-left: 4px solid #ec4899; /* Pink for Lab (Default) */
                        border-radius: 4px;
                        padding: 5px 6px;
                        margin-bottom: 4px;
                        min-height: 44px;
                        page-break-inside: avoid;
                        display: block;
                        box-shadow: 0 1px 1px rgba(0,0,0,0.05);
                    }

                    .print-assignment.conflict {
                        border-left-color: #ef4444;
                        background: #fef2f2;
                    }

                    .print-assignment.theory {
                        border-left-color: #a855f7; /* Purple for Theory */
                        background: #fdf4ff; /* Very light purple bg */
                    }

                    /* Flex Column Layout - Robust & Safe */
                    .print-ticket-grid {
                        display: flex;
                        flex-direction: column;
                        gap: 4px;
                        width: 100%;
                    }

                    /* Top Row: Subject + Room */
                    .ticket-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-start;
                        width: 100%;
                        gap: 8px;
                    }

                    .print-sub {
                        font-weight: 800;
                        font-size: 10pt;
                        color: #0f172a;
                        /* Ensure it doesn't break layout */
                        flex: 1; 
                        /* REMOVED overflow:hidden to prevent invisible text bug */
                        line-height: 1.2;
                    }

                    .ticket-room {
                        flex-shrink: 0; /* Never shrink the room pill */
                    }

                    /* Bottom Row: Metadata + Sem */
                    .ticket-meta {
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        flex-wrap: wrap;
                        width: 100%;
                        margin-top: 1px;
                    }
                    
                    /* Pills */
                    .print-pill {
                        display: inline-flex;
                        align-items: center;
                        padding: 1px 5px;
                        border-radius: 3px;
                        font-size: 8pt;
                        font-weight: 700;
                        border: 1px solid transparent; /* default */
                        line-height: 1.1;
                        white-space: nowrap;
                    }

                    .pill-cls { background: #f1f5f9; color: #1e293b; border-color: #cbd5e1; }
                    .pill-fac { background: #eff6ff; color: #1e40af; border-color: #93c5fd; }
                    .pill-room { background: #f0fdf4; color: #166534; border-color: #86efac; }
                    .pill-sem { 
                        background: #fff1f2; 
                        color: #be123c; 
                        border-color: #fecdd3;
                        margin-left: auto; /* Push to end */
                    }

                    /* 6. Footer Styling */
                    .print-footer {
                         margin-top: 30px;
                         display: flex;
                         justify-content: space-between;
                         padding-top: 10px;
                         border-top: 2px solid #e2e8f0;
                         font-size: 8pt;
                         color: #94a3b8;
                         font-weight: 500;
                         text-transform: uppercase;
                         letter-spacing: 1px;
                    }
                    
                    /* PDF / Print Controls Hide */
                    .no-print { display: none !important; }

                    /* Preview Override to show white background */
                    /* =========================================
                       PLATINUM HIGH-CONTRAST PATCH
                       ========================================= */
                    
                    /* =========================================
                       DIAMOND HIGH-CONTRAST PATCH v5.0
                       ========================================= */
                    
                   /* FORCE BLACK INK - LEAF NODE TARGETING */
                    /* FORCE BLACK INK - LEAF NODE TARGETING */
                    @media print {
                         /* 1. Reset everything to black first */
                         
                         .check-print-styles, .check-print-styles * {
                             visibility: visible;
                             color: #000 !important;
                             text-shadow: none !important;
                             box-shadow: none !important;
                         }
                         
                         .check-print-styles {
                             position: absolute;
                             left: 0;
                             top: 0;
                             width: 100%;
                             margin: 0;
                             padding: 0;
                             background: white !important;
                         }

                         /* 2. Specific Logic for the Ticket */
                         .print-sub { 
                             color: #000 !important; 
                             font-weight: 900 !important;
                         }
                         
                         .print-assignment {
                             border: 1px solid #000 !important;
                             border-left: 4px solid #000 !important; /* Force black or dark accent */
                             box-shadow: none !important;
                         }
                         
                         /* 3. Pills: High Contrast Mode */
                         .print-pill {
                             color: #000 !important;
                             border: 1px solid #000 !important;
                             background: transparent !important; /* Force clean on paper */
                         }
                         
                         .pill-sem {
                             font-weight: 900 !important;
                             color: #000 !important;
                             border: none !important;
                             text-decoration: underline;
                         }

                         /* 4. Table Borders */
                         .print-table, .print-table th, .print-table td {
                             border: 1px solid #000 !important;
                             border-color: #000 !important;
                         }
                    }

                    /* PREVIEW FIX - MIRROR THE PRINT */
                    .preview-active .print-sub { 
                             color: #000 !important; 
                             font-weight: 900 !important;
                    }
                    
                    .preview-active .print-assignment {
                         border: 1px solid #94a3b8 !important; 
                         background: #fff !important;
                    }

                    .preview-active .print-pill {
                        color: #0f172a !important; /* Very dark slate, effectively black */
                    }
                    
                    .preview-active .pill-sem {
                        color: #be123c !important;
                    }

                    /* General Preview Container */
                    .preview-active .check-print-styles {
                         background: white;
                         padding: 40px;
                         box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
                         max-width: 1400px;
                         margin: 0 auto;
                         border-radius: 8px;
                     }
            `}</style>



            {/* Toolbar (Screen Only) */}
            <div className="glass-panel-static no-print" style={{
                padding: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px',
                position: 'relative',
                zIndex: 100,
                background: 'rgba(30, 41, 59, 0.7)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
            }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', maxWidth: '100%' }}>
                    {/* View Type Switcher */}
                    <div style={{
                        display: 'flex',
                        background: 'rgba(15, 23, 42, 0.6)',
                        padding: '4px',
                        borderRadius: '12px',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        overflowX: 'auto',
                        maxWidth: '100%',
                        scrollbarWidth: 'none' // Hide scrollbar for cleaner look
                    }}>
                        {[
                            { id: 'class', label: 'Class', icon: Layers },
                            { id: 'faculty', label: 'Faculty', icon: Users },
                            { id: 'subject', label: 'Subject', icon: BookOpen },
                            { id: 'room', label: 'Room', icon: MapPin }
                        ].map(type => (
                            <button
                                key={type.id}
                                onClick={() => setViewType(type.id)}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: viewType === type.id ? 'var(--color-accent)' : 'transparent',
                                    color: viewType === type.id ? 'white' : '#94a3b8',
                                    cursor: 'pointer',
                                    fontSize: '0.875rem',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    transition: 'all 0.2s',
                                    whiteSpace: 'nowrap', // Prevent text wrapping inside button
                                    boxShadow: viewType === type.id ? '0 2px 4px rgba(0,0,0,0.2)' : 'none'
                                }}
                            >
                                <type.icon size={14} />
                                {type.label}
                            </button>
                        ))}
                    </div>

                    <div className="desktop-only" style={{ width: '1px', height: '32px', background: 'rgba(255,255,255,0.1)' }}></div>

                    {/* Filters */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flex: 1, minWidth: '200px' }}>
                        {viewType === 'class' && (
                            <>
                                <MultiSelectDropdown
                                    options={departments}
                                    selected={selectedDepts}
                                    onChange={setSelectedDepts}
                                    label="Departments"
                                    icon={Filter}
                                />
                                <MultiSelectDropdown
                                    options={semesters.map(s => s.name)}
                                    selected={selectedSems}
                                    onChange={setSelectedSems}
                                    label="Semesters"
                                    icon={Filter}
                                />
                            </>
                        )}

                        {viewType === 'faculty' && (
                            <MultiSelectDropdown
                                options={faculty.map(f => f.name)}
                                selected={selectedFaculties}
                                onChange={setSelectedFaculties}
                                label="Select Faculty"
                                icon={Users}
                            />
                        )}

                        {viewType === 'subject' && (
                            <MultiSelectDropdown
                                options={subjects}
                                selected={selectedSubjects}
                                onChange={setSelectedSubjects}
                                label="Select Subjects"
                                icon={BookOpen}
                            />
                        )}

                        {viewType === 'room' && (
                            <MultiSelectDropdown
                                options={rooms}
                                selected={selectedLabs}
                                onChange={setSelectedLabs}
                                label="Select Rooms"
                                icon={MapPin}
                            />
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                    {/* Content Type Filter */}
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <select
                            value={contentTypeFilter}
                            onChange={(e) => setContentTypeFilter(e.target.value)}
                            style={{
                                background: 'rgba(15, 23, 42, 0.6)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: 'white',
                                padding: '8px 12px',
                                borderRadius: '10px',
                                cursor: 'pointer',
                                fontSize: '0.875rem',
                                fontWeight: 500,
                                outline: 'none',
                                appearance: 'none',
                                paddingRight: '32px'
                            }}
                        >
                            <option value="all">All Types</option>
                            <option value="theory">Theory Only</option>
                            <option value="lab">Labs Only</option>
                        </select>
                        <ChevronDown size={14} style={{ position: 'absolute', right: '10px', pointerEvents: 'none', color: '#94a3b8' }} />
                    </div>

                    {/* View Mode Toggle */}
                    <div style={{ display: 'flex', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '10px', padding: '2px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <button
                            onClick={() => setViewMode('horizontal')}
                            style={{
                                padding: '8px',
                                borderRadius: '8px',
                                border: 'none',
                                background: viewMode === 'horizontal' ? 'rgba(255,255,255,0.1)' : 'transparent',
                                color: viewMode === 'horizontal' ? 'white' : '#64748b',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                            title="Horizontal View"
                        >
                            <LayoutGrid size={18} />
                        </button>
                        <button
                            onClick={() => setViewMode('vertical')}
                            style={{
                                padding: '8px',
                                borderRadius: '8px',
                                border: 'none',
                                background: viewMode === 'vertical' ? 'rgba(255,255,255,0.1)' : 'transparent',
                                color: viewMode === 'vertical' ? 'white' : '#64748b',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                            title="Vertical View"
                        >
                            <List size={18} />
                        </button>
                    </div>

                    {isAdmin && (
                        <button
                            className="btn"
                            onClick={() => setQuickAssignMode(!quickAssignMode)}
                            style={{
                                background: quickAssignMode ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : 'rgba(255,255,255,0.05)',
                                border: quickAssignMode ? 'none' : '1px solid rgba(255,255,255,0.1)',
                                padding: '10px 16px',
                                fontSize: '0.875rem',
                                color: quickAssignMode ? 'white' : '#cbd5e1',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                borderRadius: '10px',
                                fontWeight: 600,
                                boxShadow: quickAssignMode ? '0 4px 12px rgba(245, 158, 11, 0.3)' : 'none',
                                transition: 'all 0.2s'
                            }}
                        >
                            <Zap size={16} fill={quickAssignMode ? "currentColor" : "none"} />
                            Quick Assign
                        </button>
                    )}

                    <button
                        className="btn"
                        onClick={() => {
                            try {
                                const pdfMeta = {
                                    title: activeAcademicYear || 'ACADEMIC SCHEDULE',
                                    subtitle: 'Official Timetable Document',
                                    user: userProfile?.name || 'Administrator',
                                    academicYear: activeAcademicYear, // Explicitly pass for filename generation
                                    filterText: getFilterText()
                                };

                                const getDeptShortCode = (nameOrCode) => {
                                    // Try to find by name first
                                    const found = rawDepartments.find(d => d.name === nameOrCode || d.code === nameOrCode);
                                    return found && found.code ? found.code : nameOrCode;
                                };

                                const getRoomShortCode = (name) => {
                                    // Future proofing: If Master Data adds short codes for rooms. Currently returns name.
                                    const found = rawRooms.find(r => r.name === name);
                                    return found && found.shortCode ? found.shortCode : name;
                                };

                                const getSemesterShortCode = (name) => {
                                    // Retrieve 'number' or 'shortCode' from Master Data if available
                                    const found = rawSemesters.find(s => s.name === name);
                                    // Prefer 'number' as it seems to be the short form in schema (e.g. "4")
                                    // If user actively saved "4th SEM" in a 'code' field (future proof), check that too.
                                    return found ? (found.code || found.number || name) : name;
                                }

                                const pdfDataRaw = {
                                    days,
                                    timeSlots,
                                    assignments: getFilteredSchedule().map(a => ({
                                        ...a,
                                        subject: getSubjectShortCode(a.subject),
                                        faculty: getFacultyShortCode(a.faculty),
                                        faculty2: a.faculty2 ? getFacultyShortCode(a.faculty2) : null,
                                        dept: getDeptShortCode(a.dept), // Use Short Code validation
                                        room: getRoomShortCode(a.room), // Use Short Code validation
                                        sem: getSemesterShortCode(a.sem),
                                        isLab: isAssignmentLab(a)
                                    }))
                                };

                                // Updated PDF Generation Logic (User Feeback: Clean Header & Smart Content)
                                generateTimetablePDF(pdfDataRaw, pdfMeta);
                            } catch (err) {
                                console.error("PDF Error:", err);
                                alert("Failed.");
                            }
                        }}
                        style={{
                            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)',
                            display: 'flex',
                            gap: '8px'
                        }}
                    >
                        <Printer size={18} />
                        Download PDF
                    </button>

                    {/* PUBLISH BUTTON (ADMIN ONLY) */}



                    <button
                        onClick={() => styledExportToExcel({ days, timeSlots, getAssignments, getSubjectShortCode, getFacultyShortCode, activeAcademicYear })}
                        className="btn"
                        style={{
                            background: '#10b981',
                            border: 'none',
                            padding: '10px 16px',
                            fontSize: '0.875rem',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            borderRadius: '10px',
                            fontWeight: 600,
                            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                            cursor: 'pointer',
                            marginLeft: '10px',
                            transition: 'all 0.2s'
                        }}
                    >
                        <List size={16} />
                        Excel
                    </button>
                </div>
            </div>

            {/* Quick Assign Configuration Panel */}
            {
                quickAssignMode && (
                    <QuickAssignPanel
                        isVisible={quickAssignMode}
                        onClose={() => setQuickAssignMode(false)}
                        data={quickAssignData}
                        setData={setQuickAssignData}
                        onSave={handleSave}
                        departments={departments}
                        semesters={semesters}
                        subjectDetails={subjectDetails}
                        rooms={rooms}
                        faculty={faculty}
                        groups={groups}
                        days={days}
                        timeSlots={timeSlots}
                    />
                )
            }

            {/* Screen Grid (Redesigned) */}
            <div className="glass-panel" style={{ padding: 0, overflow: 'auto', flex: 1 }}>
                <ScheduleGrid
                    viewMode={viewMode}
                    days={days}
                    timeSlots={timeSlots}
                    getAssignments={getAssignments}
                    isAdmin={userProfile?.role === 'admin'}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    deletingIds={deletingIds}
                    onAdd={openModal}
                    onSwap={handleInitiateSwap}
                    getSubjectShortCode={getSubjectShortCode}
                    getFacultyShortCode={getFacultyShortCode}
                    subjects={subjectDetails}
                    onViewDetails={(assignment) => setSelectedAssignment(assignment)} // Pass Handler
                />
            </div>





            {/* Booking Modal */}
            <BookingModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                editingId={editingId}
                formData={formData}
                setFormData={setFormData}
                onSave={handleSave}
                error={error}
                departments={departments}
                semesters={semesters}
                subjectDetails={subjectDetails}
                rooms={rooms}
                faculty={faculty}
                groups={groups}
            />
            {/* 
                =========================================
                PREMIUM PRINT LAYOUT (Hidden on Screen)
                =========================================
                This structure is strictly for Ctrl+P / Browser Print match.
                It uses the "Platinum Print System" CSS defined in the <style> block.
            */}
            <div id="print-area" style={{ '--print-scale': printScale }}>
                <div className="print-header">
                    <div>
                        <h1>{activeAcademicYear || 'SCHEDULE'}</h1>
                        <div className="print-meta-grid" style={{ marginTop: '8px' }}>
                            <span>GENERATED: {new Date().toLocaleDateString('en-GB')}</span>
                            <span>OFFICIAL TIMETABLE</span>
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '12pt', fontWeight: 'bold', color: '#334155' }}>
                            {getFilterText()}
                        </div>
                    </div>
                </div>

                <table className="print-table">
                    <thead>
                        <tr>
                            <th style={{ width: '40px' }}>DAY</th>
                            {timeSlots.map(t => <th key={t}>{t}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {days.map(day => (
                            <tr key={day}>
                                <td className="day-cell">
                                    <div className="vertical-text">{String(day || '').toUpperCase()}</div>
                                </td>
                                {timeSlots.map(time => {
                                    // Use same logic as screen view to get data
                                    const assignments = getAssignments(day, time);
                                    return (
                                        <td key={time}>
                                            <div className="print-ticket-grid">
                                                {assignments.map(a => {
                                                    const isLab = isAssignmentLab(a);
                                                    return (
                                                        <div key={a.id} className={`print-assignment ${isLab ? '' : 'theory'}`}>
                                                            {/* Top Row: Subject & Room */}
                                                            <div className="ticket-header">
                                                                <div className="print-sub">
                                                                    {getSubjectShortCode(a.subject)}
                                                                </div>
                                                                <div className="print-pill pill-room">
                                                                    {a.room}
                                                                </div>
                                                            </div>

                                                            {/* Bottom Row: Metadata Pills */}
                                                            <div className="ticket-meta">
                                                                <div className="print-pill pill-cls">
                                                                    {a.dept}-{a.section}{a.group && a.group !== 'All' ? `-${a.group}` : ''}
                                                                </div>
                                                                <div className="print-pill pill-fac">
                                                                    {getFacultyShortCode(a.faculty)}{a.faculty2 ? `,${getFacultyShortCode(a.faculty2)}` : ''}
                                                                </div>
                                                                <div className="print-pill pill-sem">
                                                                    {a.sem ? a.sem.replace(/Semester/i, '').replace(/Sem/i, '').trim() : ''}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="print-footer">
                    <span>LAMS 2.0 - Intelligent Scheduler</span>
                    <span>Page 1 of 1</span>
                </div>
            </div>

            {/* SWAP MODAL */}
            <SwapFacultyModal
                isOpen={isSwapModalOpen}
                onClose={() => setIsSwapModalOpen(false)}
                sourceAssignment={swapSourceAssignment}
                schedule={schedule}
                facultyList={faculty}
                onConfirmSwap={handleConfirmSwap}
                getSubjectShortCode={getSubjectShortCode}
            />

            {/* DETAILS MODAL */}
            <AssignmentDetailsModal
                isOpen={!!selectedAssignment}
                onClose={() => setSelectedAssignment(null)}
                assignment={selectedAssignment}
                subjectDetails={subjectDetails}
                facultyList={faculty}
            />

        </div>
    );
};

export default Scheduler;
