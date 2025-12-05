import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../lib/firebase';
import { collection, getDocs, addDoc, query, where, deleteDoc, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useMasterData } from '../contexts/MasterDataContext';
import '../styles/design-system.css';
import { ChevronDown, Check, LayoutGrid, List, Zap, Printer, Filter, Users, BookOpen, FlaskConical, Layers, X } from 'lucide-react';

const MultiSelectDropdown = ({ options, selected, onChange, label, icon: Icon }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                // Check if click is inside the portal
                const portal = document.getElementById(`multiselect-portal-${label}`);
                if (portal && portal.contains(event.target)) return;
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [label]);

    // Update coords on open and scroll
    useEffect(() => {
        const updateCoords = () => {
            if (dropdownRef.current) {
                const rect = dropdownRef.current.getBoundingClientRect();
                setCoords({
                    top: rect.bottom + 6,
                    left: rect.left,
                    width: rect.width
                });
            }
        };

        if (isOpen) {
            updateCoords();
            window.addEventListener('scroll', updateCoords, true);
            window.addEventListener('resize', updateCoords);
        }

        return () => {
            window.removeEventListener('scroll', updateCoords, true);
            window.removeEventListener('resize', updateCoords);
        };
    }, [isOpen]);

    const toggleOption = (option) => {
        if (selected.includes(option)) {
            onChange(selected.filter(item => item !== option));
        } else {
            onChange([...selected, option]);
        }
    };

    return (
        <div ref={dropdownRef} style={{ position: 'relative', minWidth: '220px' }}>
            <div
                onClick={() => setIsOpen(!isOpen)}
                className="glass-input"
                style={{
                    padding: '10px 16px',
                    borderRadius: '12px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: 'white',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.2s ease',
                    boxShadow: isOpen ? '0 0 0 2px rgba(59, 130, 246, 0.5)' : 'none',
                    fontSize: '0.9rem',
                    fontWeight: 500
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {Icon && <Icon size={16} style={{ color: '#94a3b8' }} />}
                    <span style={{ color: selected.length > 0 ? 'white' : '#94a3b8' }}>
                        {selected.length > 0 ? `${selected.length} Selected` : label}
                    </span>
                </div>
                <ChevronDown size={16} style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
            </div>
            {isOpen && createPortal(
                <div
                    id={`multiselect-portal-${label}`}
                    className="animate-fade-in"
                    style={{
                        position: 'fixed',
                        top: coords.top,
                        left: coords.left,
                        width: coords.width,
                        maxHeight: '300px',
                        overflowY: 'auto',
                        background: '#1e293b',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '12px',
                        zIndex: 9999,
                        padding: '6px',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)'
                    }}
                >
                    <div
                        onClick={() => onChange(selected.length === options.length ? [] : options)}
                        style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            borderBottom: '1px solid rgba(255,255,255,0.1)',
                            marginBottom: '4px',
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            color: '#60a5fa',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}
                    >
                        {selected.length === options.length ? 'Unselect All' : 'Select All'}
                    </div>
                    {options.map(opt => (
                        <div
                            key={opt}
                            onClick={() => toggleOption(opt)}
                            style={{
                                padding: '8px 12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                background: selected.includes(opt) ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                                borderRadius: '8px',
                                marginBottom: '2px',
                                fontSize: '0.9rem',
                                transition: 'background 0.15s',
                                color: selected.includes(opt) ? 'white' : '#cbd5e1'
                            }}
                            onMouseEnter={(e) => !selected.includes(opt) && (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
                            onMouseLeave={(e) => !selected.includes(opt) && (e.currentTarget.style.background = 'transparent')}
                        >
                            <div style={{
                                width: '16px',
                                height: '16px',
                                borderRadius: '4px',
                                border: selected.includes(opt) ? 'none' : '2px solid #475569',
                                background: selected.includes(opt) ? '#3b82f6' : 'transparent',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s'
                            }}>
                                {selected.includes(opt) && <Check size={12} color="white" strokeWidth={3} />}
                            </div>
                            {opt}
                        </div>
                    ))}
                </div>,
                document.body
            )}
        </div>
    );
};

const Select = ({ options, value, onChange, placeholder, icon: Icon, disabled = false, style }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                // Check if click is inside the portal
                const portal = document.getElementById(`select-portal-${placeholder}`);
                if (portal && portal.contains(event.target)) return;
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [placeholder]);

    // Update coords on open and scroll
    useEffect(() => {
        const updateCoords = () => {
            if (dropdownRef.current) {
                const rect = dropdownRef.current.getBoundingClientRect();
                setCoords({
                    top: rect.bottom + 6,
                    left: rect.left,
                    width: rect.width
                });
            }
        };

        if (isOpen) {
            updateCoords();
            window.addEventListener('scroll', updateCoords, true);
            window.addEventListener('resize', updateCoords);
        }

        return () => {
            window.removeEventListener('scroll', updateCoords, true);
            window.removeEventListener('resize', updateCoords);
        };
    }, [isOpen]);

    // Normalize options
    const normalizedOptions = options.map(opt => {
        if (typeof opt === 'object' && opt !== null) {
            return { value: opt.value, label: opt.label || opt.value };
        }
        return { value: opt, label: opt };
    });

    const selectedOption = normalizedOptions.find(opt => opt.value === value);

    return (
        <div ref={dropdownRef} style={{ position: 'relative', width: '100%', ...style }}>
            <div
                onClick={() => !disabled && setIsOpen(!isOpen)}
                className="glass-input"
                style={{
                    padding: '10px 12px',
                    borderRadius: '12px',
                    background: disabled ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.05)',
                    color: value ? 'white' : '#94a3b8',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.2s ease',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    opacity: disabled ? 0.6 : 1
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                    {Icon && <Icon size={16} style={{ color: '#94a3b8', flexShrink: 0 }} />}
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {selectedOption ? selectedOption.label : placeholder}
                    </span>
                </div>
                <ChevronDown size={16} style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }} />
            </div>

            {isOpen && !disabled && createPortal(
                <div
                    id={`select-portal-${placeholder}`}
                    className="animate-fade-in"
                    style={{
                        position: 'fixed',
                        top: coords.top,
                        left: coords.left,
                        width: coords.width,
                        maxHeight: '250px',
                        overflowY: 'auto',
                        background: '#1e293b',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '12px',
                        zIndex: 9999,
                        padding: '6px',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)'
                    }}
                >
                    {normalizedOptions.length > 0 ? normalizedOptions.map(opt => (
                        <div
                            key={opt.value}
                            onClick={() => {
                                onChange(opt.value);
                                setIsOpen(false);
                            }}
                            style={{
                                padding: '8px 12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                background: value === opt.value ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                                borderRadius: '8px',
                                marginBottom: '2px',
                                fontSize: '0.9rem',
                                color: value === opt.value ? 'white' : '#cbd5e1',
                                transition: 'background 0.15s'
                            }}
                            onMouseEnter={(e) => value !== opt.value && (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
                            onMouseLeave={(e) => value !== opt.value && (e.currentTarget.style.background = 'transparent')}
                        >
                            {value === opt.value && <Check size={14} color="#60a5fa" />}
                            {opt.label}
                        </div>
                    )) : (
                        <div style={{ padding: '12px', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                            No options
                        </div>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
};

const Scheduler = () => {
    const auth = useAuth();
    const { userProfile, activeAcademicYear } = auth || {};

    const [viewMode, setViewMode] = useState('horizontal');
    const [viewType, setViewType] = useState('class'); // 'class' or 'faculty'
    const [selectedDepts, setSelectedDepts] = useState([]);
    const [selectedSems, setSelectedSems] = useState([]);
    const [selectedFaculties, setSelectedFaculties] = useState(userProfile?.name ? [userProfile.name] : []);
    const [selectedSubjects, setSelectedSubjects] = useState([]);
    const [selectedLabs, setSelectedLabs] = useState([]);
    const [labRooms, setLabRooms] = useState([]);

    // Data States
    const [schedule, setSchedule] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [faculty, setFaculty] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [subjectDetails, setSubjectDetails] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [semesters, setSemesters] = useState([]);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);

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
        timeSlots: rawTimeSlots
    } = useMasterData();

    useEffect(() => {
        if (!rawRooms || !rawFaculty) return;

        // Process Rooms
        setRooms(rawRooms.map(d => d.name).sort());
        setLabRooms(rawRooms.filter(d => d.type === 'lab').map(d => d.name).sort());

        // Process Faculty
        setFaculty(rawFaculty.map(d => ({ name: d.data?.name || d.name, shortCode: d.data?.shortCode || d.shortCode, empId: d.data?.empId || d.empId })).sort((a, b) => a.name.localeCompare(b.name)));

        // Process Subjects
        const subData = rawSubjects.map(d => ({ name: d.name, shortCode: d.shortCode })).sort((a, b) => a.name.localeCompare(b.name));
        setSubjects(subData.map(d => d.name));
        setSubjectDetails(subData);

        // Process Departments
        const depts = rawDepartments.map(d => d.code || d.name).sort();
        setDepartments(depts);

        // Process Semesters
        setSemesters(rawSemesters); // Already sorted by context

        // Process Groups
        setGroups(rawGroups); // Context doesn't sort by name by default? Context sorts by name if no sortFn.

        // Default to ALL departments and semesters for the view
        if (depts.length > 0) {
            if (selectedDepts.length === 0) setSelectedDepts(depts);
            setQuickAssignData(prev => ({ ...prev, dept: depts[0] }));
        }

        if (rawSemesters.length > 0) {
            const semNames = rawSemesters.map(s => s.name);
            if (selectedSems.length === 0) setSelectedSems(semNames);
            setQuickAssignData(prev => ({ ...prev, sem: rawSemesters[0].name }));
        }

        // Process Days
        const visibleDays = rawDays.filter(d => d.isVisible !== false).map(d => d.name);
        setDays(visibleDays);
        if (visibleDays.length > 0 && !formData.day) {
            setFormData(prev => ({ ...prev, day: visibleDays[0] }));
        }

        // Process Time Slots
        const formatTime = (t) => new Date(`2000-01-01T${t}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        const formattedSlots = rawTimeSlots.map(s => `${formatTime(s.startTime)} - ${formatTime(s.endTime)}`);
        setTimeSlots(formattedSlots);

        if (formattedSlots.length > 0 && !formData.time) {
            setFormData(prev => ({ ...prev, time: formattedSlots[0] }));
        }

    }, [rawRooms, rawFaculty, rawSubjects, rawDepartments, rawSemesters, rawGroups, rawDays, rawTimeSlots]);

    // Fetch Schedule (Real-time)
    useEffect(() => {
        if (!activeAcademicYear) {
            setSchedule([]);
            return;
        }

        console.log("Setting up real-time schedule listener for:", activeAcademicYear);
        setLoading(true);

        const q = query(
            collection(db, 'schedule'),
            where('academicYear', '==', activeAcademicYear)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = [];
            snapshot.forEach((doc) => {
                items.push({ id: doc.id, ...doc.data() });
            });
            console.log("Real-time update: fetched", items.length, "items");
            setSchedule(items);
            setLoading(false);
        }, (err) => {
            console.error("Error loading schedule:", err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [activeAcademicYear]);

    // Filter Logic
    const getFilteredSchedule = () => {
        let filtered = schedule;

        if (viewType === 'class') {
            if (selectedDepts.length > 0) {
                filtered = filtered.filter(item => selectedDepts.includes(item.dept));
            }
            if (selectedSems.length > 0) {
                filtered = filtered.filter(item => selectedSems.includes(item.sem));
            }
        } else if (viewType === 'faculty') {
            if (selectedFaculties.length > 0) {
                filtered = filtered.filter(item => selectedFaculties.includes(item.faculty));
            }
        } else if (viewType === 'subject') {
            if (selectedSubjects.length > 0) {
                filtered = filtered.filter(item => selectedSubjects.includes(item.subject));
            }
        } else if (viewType === 'lab') {
            if (selectedLabs.length > 0) {
                filtered = filtered.filter(item => selectedLabs.includes(item.room));
            }
        }
        return filtered;
    };

    const filteredSchedule = getFilteredSchedule();

    // Enhanced Conflict Detection Logic
    const checkConflict = (newBooking, ignoreId = null) => {
        if (!schedule || !Array.isArray(schedule)) return null;

        // Filter out the current booking if we are editing
        const otherBookings = ignoreId
            ? schedule.filter(item => item.id !== ignoreId)
            : schedule;

        // Filter for same day and time first to optimize
        const sameSlotBookings = otherBookings.filter(item =>
            item.day === newBooking.day && item.time === newBooking.time
        );

        if (sameSlotBookings.length === 0) return null;

        for (const item of sameSlotBookings) {
            // 1. Room Conflict
            if (item.room === newBooking.room) {
                return `Conflict! Room "${newBooking.room}" is already booked for "${item.subject}" (${item.dept}-${item.section}).`;
            }

            // 2. Faculty Conflict
            // Check if New Faculty 1 is busy
            if (newBooking.faculty && (item.faculty === newBooking.faculty || item.faculty2 === newBooking.faculty)) {
                return `Conflict! Faculty "${newBooking.faculty}" is already teaching "${item.subject}" in ${item.room}.`;
            }
            // Check if New Faculty 2 is busy
            if (newBooking.faculty2 && (item.faculty === newBooking.faculty2 || item.faculty2 === newBooking.faculty2)) {
                return `Conflict! Faculty "${newBooking.faculty2}" is already teaching "${item.subject}" in ${item.room}.`;
            }

            // 3. Student Group Conflict
            // Must be same Department and Semester to conflict (usually)
            if (item.dept === newBooking.dept && item.sem === newBooking.sem) {
                // Check Section/Group overlap
                if (item.section === newBooking.section) {
                    // If either is for the whole section (no group or "All"), they conflict
                    const itemIsWholeSection = !item.group || item.group === 'All';
                    const newIsWholeSection = !newBooking.group || newBooking.group === 'All';

                    if (itemIsWholeSection || newIsWholeSection) {
                        return `Conflict! Student Group "${newBooking.dept} ${newBooking.sem} ${newBooking.section}" is already booked for "${item.subject}".`;
                    }

                    // If both have specific groups, check if they match
                    if (item.group === newBooking.group) {
                        return `Conflict! Student Group "${newBooking.dept} ${newBooking.sem} ${newBooking.section}-${newBooking.group}" is already booked for "${item.subject}".`;
                    }
                }
            }
        }

        return null;
    };

    const handleSave = async (e, overrideData = null) => {
        if (e) e.preventDefault();
        setError('');

        const dataToSave = overrideData || formData;

        // Basic Validation
        if (!dataToSave.subject || !dataToSave.room || !dataToSave.faculty || !dataToSave.day || !dataToSave.time) {
            const msg = "Please fill in all required fields (Subject, Room, Faculty, Day, Time).";
            setError(msg);
            if (overrideData) alert(msg);
            return;
        }

        try {
            // Check for conflicts
            const conflictError = checkConflict(dataToSave, editingId);
            if (conflictError) {
                setError(conflictError);
                if (overrideData) alert(conflictError);
                return; // Block saving
            }

            // Lookup Faculty EmpIDs for robust linking
            const faculty1Obj = faculty.find(f => f.name === dataToSave.faculty);
            const faculty2Obj = dataToSave.faculty2 ? faculty.find(f => f.name === dataToSave.faculty2) : null;

            const finalData = {
                ...dataToSave,
                facultyEmpId: faculty1Obj ? faculty1Obj.empId : null,
                faculty2EmpId: faculty2Obj ? faculty2Obj.empId : null,
                academicYear: activeAcademicYear
            };

            if (editingId) {
                await updateDoc(doc(db, 'schedule', editingId), finalData);
            } else {
                await addDoc(collection(db, 'schedule'), finalData);
            }

            if (!overrideData) {
                setIsModalOpen(false);
                setFormData({ ...formData, subject: '', room: '', faculty: '', faculty2: '', group: '' });
                setEditingId(null);
            }
        } catch (err) {
            console.error("Error saving schedule:", err);
            setError("Failed to save schedule.");
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

    const handleDelete = async (id) => {
        if (window.confirm("Are you sure you want to remove this class?")) {
            try {
                await deleteDoc(doc(db, 'schedule', id));
            } catch (err) {
                console.error("Error deleting:", err);
            }
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
        return filteredSchedule.filter(item => item.day === day && item.time === time);
    };

    const isAdmin = userProfile && userProfile.role === 'admin';

    const getFacultyShortCode = (name) => {
        const f = faculty.find(f => f.name === name);
        return f && f.shortCode ? f.shortCode : name;
    };

    const getSubjectShortCode = (name) => {
        const s = subjectDetails.find(s => s.name === name);
        return s && s.shortCode ? s.shortCode : name;
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', height: '100%' }}>
            <style>{`
                @media print {
                    @page { 
                        size: A4 landscape; 
                        margin: 2mm; 
                    }
                    
                    body { 
                        background: white !important; 
                        color: black !important; 
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100vw !important;
                        height: 100vh !important;
                        overflow: hidden !important; 
                    }
                    
                    /* Hide Everything Else */
                    body > *:not(#print-area) {
                        display: none !important;
                    }

                    /* Ensure Print Area is Visible */
                    #print-area {
                        display: flex !important;
                        flex-direction: column !important;
                        position: absolute;
                        top: 0;
                        left: 0;
                        width: 100% !important;
                        height: 100% !important;
                        background: white;
                        z-index: 9999;
                        visibility: visible !important;
                    }

                    #print-area * {
                        visibility: visible !important;
                    }

                    /* Header */
                    .print-header {
                        display: flex !important;
                        justify-content: space-between;
                        align-items: flex-end;
                        padding: 0 0 2px 0;
                        border-bottom: 2px solid #000;
                        margin-bottom: 2px;
                        flex-shrink: 0;
                    }

                    .print-header h1 {
                        font-size: 14pt;
                        font-weight: 900;
                        margin: 0;
                        text-transform: uppercase;
                    }

                    .print-meta {
                        font-size: 9pt;
                        text-align: right;
                        line-height: 1.1;
                    }

                    /* Layout Table */
                    .layout-table {
                        width: 100%;
                        height: 100%; 
                        border-collapse: collapse;
                        table-layout: fixed;
                    }

                    .layout-table th, .layout-table td {
                        border: 1px solid #000;
                        padding: 0;
                        margin: 0;
                        box-sizing: border-box;
                    }

                    /* Header Row */
                    .layout-table th {
                        height: 20px; 
                        background: #eee !important;
                        font-size: 8pt;
                        font-weight: bold;
                        text-transform: uppercase;
                        text-align: center;
                    }

                    /* Day Column */
                    .day-cell {
                        width: 25px; 
                        background: #eee !important;
                        text-align: center;
                        vertical-align: middle;
                        font-weight: bold;
                        font-size: 10pt;
                        text-transform: uppercase;
                    }

                    .vertical-text {
                        writing-mode: vertical-rl;
                        transform: rotate(180deg);
                        white-space: nowrap;
                        margin: 0 auto;
                    }

                    /* Content Cells */
                    .content-cell {
                        height: auto; 
                        vertical-align: top;
                        position: relative;
                    }

                    .cell-inner {
                        display: flex !important;
                        flex-direction: column;
                        width: 100%;
                        height: 100%;
                        justify-content: space-evenly; 
                    }

                    .print-assignment {
                        width: 98%; 
                        background: #fff;
                        border: 1.5px solid #000;
                        border-radius: 6px;
                        padding: 2px 5px;
                        margin: 2px 0 4px 0;
                        box-sizing: border-box;
                        text-align: left;
                        display: flex !important; /* Flexbox for Left/Right alignment */
                        justify-content: space-between;
                        align-items: center;
                        overflow: hidden;
                        box-shadow: 2.5px 2.5px 0px rgba(0,0,0,1);
                        font-family: 'Segoe UI', system-ui, sans-serif;
                    }

                    .print-details {
                        overflow: hidden; 
                        white-space: nowrap; 
                        text-overflow: ellipsis; 
                        padding-right: 4px;
                        flex: 1; /* Allow taking available space */
                    }

                    .vertical-mode .print-details {
                        white-space: normal; /* Wrap text in vertical view */
                        overflow: visible;
                        line-height: 1.1;
                    }

                    /* Dynamic Font Sizing - Optimized for single line */
                    .density-low { font-size: 8.5pt; }
                    .density-med { font-size: 7.5pt; }
                    .density-high { font-size: 6.5pt; letter-spacing: -0.01em; }
                    .density-extreme { font-size: 5.5pt; letter-spacing: -0.02em; }
                    .density-ultra { font-size: 4.8pt; letter-spacing: -0.03em; line-height: 0.95; }

                    /* Inline Elements */
                    .print-sub { font-weight: 800; color: #000; }
                    .print-meta { font-weight: 700; color: #000; }
                    .print-fac { font-style: normal; font-weight: 700; color: #000; }
                }
            `}</style>

            {/* Toolbar (Screen Only) */}
            <div className="glass-panel no-print" style={{
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
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* View Type Switcher */}
                    <div style={{
                        display: 'flex',
                        background: 'rgba(15, 23, 42, 0.6)',
                        padding: '4px',
                        borderRadius: '12px',
                        border: '1px solid rgba(255, 255, 255, 0.05)'
                    }}>
                        {[
                            { id: 'class', label: 'Class', icon: Layers },
                            { id: 'faculty', label: 'Faculty', icon: Users },
                            { id: 'subject', label: 'Subject', icon: BookOpen },
                            { id: 'lab', label: 'Lab', icon: FlaskConical }
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
                                    boxShadow: viewType === type.id ? '0 2px 4px rgba(0,0,0,0.2)' : 'none'
                                }}
                            >
                                <type.icon size={14} />
                                {type.label}
                            </button>
                        ))}
                    </div>

                    <div style={{ width: '1px', height: '32px', background: 'rgba(255,255,255,0.1)' }}></div>

                    {/* Filters */}
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

                    {viewType === 'lab' && (
                        <MultiSelectDropdown
                            options={labRooms.length > 0 ? labRooms : rooms}
                            selected={selectedLabs}
                            onChange={setSelectedLabs}
                            label="Select Lab Rooms"
                            icon={FlaskConical}
                        />
                    )}
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
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
                        onClick={() => window.print()}
                        style={{
                            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                            border: 'none',
                            padding: '10px 16px',
                            fontSize: '0.875rem',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            borderRadius: '10px',
                            fontWeight: 600,
                            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                            transition: 'all 0.2s'
                        }}
                    >
                        <Printer size={16} />
                        Print
                    </button>
                </div>
            </div>

            {/* Quick Assign Configuration Panel */}
            {
                quickAssignMode && (
                    <div className="animate-fade-in" style={{
                        padding: '20px',
                        borderRadius: '16px',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        background: 'linear-gradient(to right, rgba(245, 158, 11, 0.05), rgba(30, 41, 59, 0.9))',
                        backdropFilter: 'blur(12px)',
                        marginTop: '8px',
                        boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.3)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ padding: '8px', background: 'rgba(245, 158, 11, 0.2)', borderRadius: '10px' }}>
                                    <Zap size={20} color="#f59e0b" fill="#f59e0b" />
                                </div>
                                <div>
                                    <span style={{ fontWeight: 800, color: '#f59e0b', fontSize: '1rem', letterSpacing: '0.05em', display: 'block' }}>QUICK ASSIGN</span>
                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Configure class details to quickly add to schedule</span>
                                </div>
                            </div>
                            <button
                                onClick={() => setQuickAssignMode(false)}
                                style={{
                                    background: 'rgba(255,255,255,0.05)',
                                    border: 'none',
                                    color: '#94a3b8',
                                    cursor: 'pointer',
                                    padding: '8px',
                                    borderRadius: '8px',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={e => { e.target.style.background = 'rgba(255,255,255,0.1)'; e.target.style.color = 'white'; }}
                                onMouseLeave={e => { e.target.style.background = 'rgba(255,255,255,0.05)'; e.target.style.color = '#94a3b8'; }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                            <Select
                                options={departments}
                                value={quickAssignData.dept}
                                onChange={val => setQuickAssignData({ ...quickAssignData, dept: val })}
                                placeholder="Select Dept"
                            />
                            <Select
                                options={semesters.map(s => ({ value: s.name, label: s.name }))}
                                value={quickAssignData.sem}
                                onChange={val => setQuickAssignData({ ...quickAssignData, sem: val })}
                                placeholder="Select Sem"
                            />
                            <Select
                                options={subjectDetails.map(s => ({ value: s.name, label: `${s.name} ${s.shortCode ? `[${s.shortCode}]` : ''}` }))}
                                value={quickAssignData.subject}
                                onChange={val => setQuickAssignData({ ...quickAssignData, subject: val })}
                                placeholder="Select Subject"
                            />
                            <Select
                                options={rooms}
                                value={quickAssignData.room}
                                onChange={val => setQuickAssignData({ ...quickAssignData, room: val })}
                                placeholder="Select Room"
                            />
                            <Select
                                options={faculty.map(f => ({ value: f.name, label: `${f.name} ${f.shortCode ? `[${f.shortCode}]` : ''}` }))}
                                value={quickAssignData.faculty}
                                onChange={val => setQuickAssignData({ ...quickAssignData, faculty: val })}
                                placeholder="Faculty 1"
                            />
                            <Select
                                options={faculty.map(f => ({ value: f.name, label: `${f.name} ${f.shortCode ? `[${f.shortCode}]` : ''}` }))}
                                value={quickAssignData.faculty2}
                                onChange={val => setQuickAssignData({ ...quickAssignData, faculty2: val })}
                                placeholder="Faculty 2"
                            />
                            <Select
                                options={groups.map(g => ({ value: g.name, label: g.name }))}
                                value={quickAssignData.section}
                                onChange={val => setQuickAssignData({ ...quickAssignData, section: val, group: '' })}
                                placeholder="Group"
                            />

                            {quickAssignData.section && groups.find(g => g.name === quickAssignData.section)?.subGroups?.length > 0 ? (
                                <Select
                                    options={groups.find(g => g.name === quickAssignData.section)?.subGroups || []}
                                    value={quickAssignData.group}
                                    onChange={val => setQuickAssignData({ ...quickAssignData, group: val })}
                                    placeholder="Sub-Group"
                                />
                            ) : (
                                <div style={{ padding: '10px 12px', fontSize: '0.85rem', width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', color: '#64748b', display: 'flex', alignItems: 'center', height: '42px' }}>
                                    No Sub-Groups
                                </div>
                            )}

                            <Select
                                options={days}
                                value={quickAssignData.day}
                                onChange={val => setQuickAssignData({ ...quickAssignData, day: val })}
                                placeholder="Select Day"
                            />
                            <Select
                                options={timeSlots}
                                value={quickAssignData.time}
                                onChange={val => setQuickAssignData({ ...quickAssignData, time: val })}
                                placeholder="Select Time"
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
                            <button
                                className="btn"
                                onClick={() => setQuickAssignMode(false)}
                                style={{
                                    padding: '10px 20px',
                                    fontSize: '0.85rem',
                                    background: 'rgba(255,255,255,0.05)',
                                    color: '#94a3b8',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '8px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn"
                                onClick={(e) => {
                                    if (quickAssignData.day && quickAssignData.time) {
                                        // Direct Add
                                        if (!quickAssignData.subject || !quickAssignData.room || !quickAssignData.faculty) {
                                            alert("Please select Subject, Room, and Faculty.");
                                            return;
                                        }
                                        handleSave(null, quickAssignData);
                                        const btn = e.target;
                                        const originalText = btn.innerText;
                                        btn.innerText = "✓ Added";
                                        btn.style.background = "#10b981";
                                        btn.style.color = "white";
                                        setTimeout(() => {
                                            btn.innerText = originalText;
                                            btn.style.background = "#f59e0b";
                                            btn.style.color = "black";
                                        }, 2000);
                                    } else {
                                        // Toggle Active Mode
                                        const btn = e.target;
                                        const originalText = btn.innerText;
                                        btn.innerText = "Active!";
                                        btn.style.background = "#10b981";
                                        btn.style.color = "white";
                                        setTimeout(() => {
                                            btn.innerText = originalText;
                                            btn.style.background = "#f59e0b";
                                            btn.style.color = "black";
                                        }, 2000);
                                    }
                                }}
                                style={{
                                    padding: '10px 24px',
                                    fontSize: '0.85rem',
                                    background: '#f59e0b',
                                    color: 'black',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)'
                                }}
                            >
                                {quickAssignData.day && quickAssignData.time ? "Add Class" : "Save Settings"}
                            </button>
                        </div>
                    </div>
                )
            }

            {/* Screen Grid (Original) */}
            <div className="glass-panel" style={{ padding: 0, overflow: 'auto', flex: 1 }}>
                {viewMode === 'horizontal' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: `160px repeat(${timeSlots.length}, minmax(180px, 1fr))`, minWidth: '100%' }}>
                        {/* Header Row */}
                        <div style={{ padding: 'var(--space-md)', background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid var(--glass-border)', borderRight: '1px solid var(--glass-border)', position: 'sticky', left: 0, zIndex: 10, backdropFilter: 'blur(10px)' }}>
                            Day / Time
                        </div>
                        {timeSlots.map(slot => (
                            <div key={slot} style={{ padding: 'var(--space-md)', background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid var(--glass-border)', borderRight: '1px solid var(--glass-border)', textAlign: 'center', fontWeight: 600, fontSize: '0.875rem' }}>
                                {slot}
                            </div>
                        ))}
                        {/* Rows */}
                        {days.map(day => (
                            <React.Fragment key={day}>
                                <div style={{ padding: 'var(--space-md)', borderBottom: '1px solid var(--glass-border)', borderRight: '1px solid var(--glass-border)', fontWeight: 600, background: 'rgba(255,255,255,0.02)', position: 'sticky', left: 0, zIndex: 5, backdropFilter: 'blur(10px)' }}>
                                    {day}
                                </div>
                                {timeSlots.map(time => {
                                    const assignments = getAssignments(day, time);
                                    return (
                                        <div key={`${day}-${time}`} style={{ padding: 'var(--space-xs)', borderBottom: '1px solid var(--glass-border)', borderRight: '1px solid var(--glass-border)', minHeight: '100px', height: 'auto', position: 'relative' }}>
                                            {assignments.length > 0 ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    {assignments.map(assignment => (
                                                        <div
                                                            key={assignment.id}
                                                            className="animate-fade-in"
                                                            onClick={(e) => {
                                                                if (isAdmin) {
                                                                    e.stopPropagation();
                                                                    handleEdit(assignment);
                                                                }
                                                            }}
                                                            style={{
                                                                background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.85) 0%, rgba(15, 23, 42, 0.95) 100%)',
                                                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                                                borderRadius: '10px',
                                                                padding: '10px',
                                                                fontSize: '0.8rem',
                                                                cursor: isAdmin ? 'pointer' : 'default',
                                                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                                                position: 'relative',
                                                                wordBreak: 'break-word',
                                                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2), 0 2px 4px -1px rgba(0, 0, 0, 0.1)',
                                                                borderLeft: '4px solid #3b82f6',
                                                                backdropFilter: 'blur(4px)'
                                                            }}
                                                            onMouseEnter={(e) => {
                                                                if (isAdmin) {
                                                                    e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)';
                                                                    e.currentTarget.style.boxShadow = '0 10px 20px -5px rgba(59, 130, 246, 0.4)';
                                                                    e.currentTarget.style.borderLeft = '4px solid #60a5fa';
                                                                    e.currentTarget.style.background = 'linear-gradient(145deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 1) 100%)';
                                                                }
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                if (isAdmin) {
                                                                    e.currentTarget.style.transform = 'translateY(0) scale(1)';
                                                                    e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.2), 0 2px 4px -1px rgba(0, 0, 0, 0.1)';
                                                                    e.currentTarget.style.borderLeft = '4px solid #3b82f6';
                                                                    e.currentTarget.style.background = 'linear-gradient(145deg, rgba(30, 41, 59, 0.85) 0%, rgba(15, 23, 42, 0.95) 100%)';
                                                                }
                                                            }}
                                                        >
                                                            <div style={{
                                                                fontWeight: '800',
                                                                color: '#fff',
                                                                marginBottom: '6px',
                                                                fontSize: '0.9rem',
                                                                textShadow: '0 2px 4px rgba(0,0,0,0.3)',
                                                                letterSpacing: '0.02em',
                                                                display: 'flex',
                                                                justifyContent: 'space-between',
                                                                alignItems: 'start'
                                                            }}>
                                                                {getSubjectShortCode(assignment.subject)}
                                                            </div>

                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#94a3b8' }}>
                                                                    <Layers size={12} color="#64748b" />
                                                                    <span style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: '4px', color: '#e2e8f0', fontWeight: 500 }}>
                                                                        {assignment.dept}-{assignment.section}{assignment.group && assignment.group !== 'All' ? `-${assignment.group}` : ''}
                                                                    </span>
                                                                </div>

                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                                                                    <FlaskConical size={12} color="#3b82f6" />
                                                                    <span style={{ color: '#60a5fa', fontWeight: 600 }}>{assignment.room}</span>
                                                                </div>

                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                                                                    <Users size={12} color="#a855f7" />
                                                                    <span style={{ color: '#d8b4fe', fontStyle: 'italic' }}>
                                                                        {getFacultyShortCode(assignment.faculty)}{assignment.faculty2 ? `, ${getFacultyShortCode(assignment.faculty2)}` : ''}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <div style={{
                                                                position: 'absolute',
                                                                bottom: '4px',
                                                                right: '6px',
                                                                fontSize: '0.65rem',
                                                                color: 'rgba(255,255,255,0.4)',
                                                                fontWeight: 500,
                                                                letterSpacing: '0.02em'
                                                            }}>
                                                                {assignment.sem}
                                                            </div>

                                                            {isAdmin && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleDelete(assignment.id); }}
                                                                    style={{
                                                                        position: 'absolute',
                                                                        top: '6px',
                                                                        right: '6px',
                                                                        background: 'rgba(239, 68, 68, 0.15)',
                                                                        border: '1px solid rgba(239, 68, 68, 0.2)',
                                                                        color: '#fca5a5',
                                                                        cursor: 'pointer',
                                                                        fontSize: '0.7rem',
                                                                        width: '20px',
                                                                        height: '20px',
                                                                        borderRadius: '6px',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        transition: 'all 0.2s',
                                                                        opacity: 0.6
                                                                    }}
                                                                    onMouseEnter={(e) => {
                                                                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.8)';
                                                                        e.currentTarget.style.color = 'white';
                                                                        e.currentTarget.style.opacity = '1';
                                                                        e.currentTarget.style.transform = 'scale(1.1)';
                                                                    }}
                                                                    onMouseLeave={(e) => {
                                                                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                                                                        e.currentTarget.style.color = '#fca5a5';
                                                                        e.currentTarget.style.opacity = '0.6';
                                                                        e.currentTarget.style.transform = 'scale(1)';
                                                                    }}
                                                                    title="Delete Class"
                                                                >
                                                                    ✕
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                isAdmin && (
                                                    <div style={{ height: '100%', width: '100%', opacity: 0, transition: 'opacity 0.2s', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                                        onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}
                                                        onClick={() => openModal(day, time)}
                                                    >
                                                        <span style={{ fontSize: '1.5rem', color: 'var(--color-text-muted)' }}>+</span>
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    );
                                })}
                            </React.Fragment>
                        ))}
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: `160px repeat(${days.length}, minmax(180px, 1fr))`, minWidth: '100%' }}>
                        {/* Vertical View Implementation (Screen) */}
                        <div style={{ padding: 'var(--space-md)', background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid var(--glass-border)', borderRight: '1px solid var(--glass-border)', position: 'sticky', left: 0, zIndex: 10, backdropFilter: 'blur(10px)' }}>
                            Time / Day
                        </div>
                        {days.map(day => (
                            <div key={day} style={{ padding: 'var(--space-md)', background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid var(--glass-border)', borderRight: '1px solid var(--glass-border)', textAlign: 'center', fontWeight: 600, fontSize: '0.875rem' }}>
                                {day}
                            </div>
                        ))}
                        {timeSlots.map(time => (
                            <React.Fragment key={time}>
                                <div style={{ padding: 'var(--space-md)', borderBottom: '1px solid var(--glass-border)', borderRight: '1px solid var(--glass-border)', fontWeight: 600, background: 'rgba(255,255,255,0.02)', position: 'sticky', left: 0, zIndex: 5, backdropFilter: 'blur(10px)' }}>
                                    {time}
                                </div>
                                {days.map(day => {
                                    const assignments = getAssignments(day, time);
                                    return (
                                        <div key={`${day}-${time}`} style={{ padding: 'var(--space-xs)', borderBottom: '1px solid var(--glass-border)', borderRight: '1px solid var(--glass-border)', minHeight: '100px', height: 'auto', position: 'relative' }}>
                                            {assignments.length > 0 ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    {assignments.map(assignment => (
                                                        <div
                                                            key={assignment.id}
                                                            className="animate-fade-in"
                                                            onClick={(e) => {
                                                                if (isAdmin) {
                                                                    e.stopPropagation();
                                                                    handleEdit(assignment);
                                                                }
                                                            }}
                                                            style={{
                                                                background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)',
                                                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                                                borderRadius: '8px',
                                                                padding: '8px',
                                                                fontSize: '0.75rem',
                                                                cursor: isAdmin ? 'pointer' : 'default',
                                                                transition: 'all 0.2s ease',
                                                                position: 'relative',
                                                                wordBreak: 'break-word',
                                                                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                                                                borderLeft: '3px solid #3b82f6'
                                                            }}
                                                            onMouseEnter={(e) => {
                                                                if (isAdmin) {
                                                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.3)';
                                                                    e.currentTarget.style.borderLeft = '3px solid #60a5fa';
                                                                }
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                if (isAdmin) {
                                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
                                                                    e.currentTarget.style.borderLeft = '3px solid #3b82f6';
                                                                }
                                                            }}
                                                        >
                                                            <div style={{ fontWeight: 'bold', color: '#fff', marginBottom: '4px', fontSize: '0.85rem', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                                                                {getSubjectShortCode(assignment.subject)}
                                                            </div>
                                                            <div style={{ color: '#cbd5e1', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                                                <span style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 4px', borderRadius: '4px', fontSize: '0.7rem' }}>
                                                                    [{assignment.dept}-{assignment.section}{assignment.group ? `-${assignment.group}` : ''}]
                                                                </span>
                                                                <span style={{ color: '#93c5fd' }}>-{assignment.room}</span>
                                                                <span style={{ color: 'rgba(255,255,255,0.5)' }}>[{assignment.sem}]</span>
                                                                <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                                                                    [{getFacultyShortCode(assignment.faculty)}{assignment.faculty2 ? `, ${getFacultyShortCode(assignment.faculty2)}` : ''}]
                                                                </span>
                                                            </div>

                                                            {isAdmin && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleDelete(assignment.id); }}
                                                                    style={{
                                                                        position: 'absolute',
                                                                        top: '4px',
                                                                        right: '4px',
                                                                        background: 'rgba(239, 68, 68, 0.2)',
                                                                        border: 'none',
                                                                        color: '#fca5a5',
                                                                        cursor: 'pointer',
                                                                        fontSize: '0.7rem',
                                                                        width: '18px',
                                                                        height: '18px',
                                                                        borderRadius: '50%',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        transition: 'background 0.2s'
                                                                    }}
                                                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.5)'}
                                                                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'}
                                                                    title="Delete Class"
                                                                >
                                                                    ✕
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                isAdmin && (
                                                    <div style={{ height: '100%', width: '100%', opacity: 0, transition: 'opacity 0.2s', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                                        onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}
                                                        onClick={() => openModal(day, time)}
                                                    >
                                                        <span style={{ fontSize: '1.5rem', color: 'var(--color-text-muted)' }}>+</span>
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    );
                                })}
                            </React.Fragment>
                        ))}
                    </div>
                )}
            </div>

            {/* DEDICATED PRINT AREA (Portal to Body for Print Visibility) */}
            {createPortal(
                <div id="print-area" style={{ display: 'none' }}>
                    <div className="print-header">
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <h1 style={{ fontSize: '24pt', fontWeight: '800', margin: 0, letterSpacing: '-1px' }}>{activeAcademicYear || 'ACADEMIC SCHEDULE'}</h1>
                        </div>
                        <div className="print-meta">
                            <div>
                                <strong>FILTERS:</strong> {viewType === 'class' ? `Dept: ${selectedDepts.join(', ') || 'All'} | Sem: ${selectedSems.join(', ') || 'All'}` :
                                    viewType === 'faculty' ? `Faculty: ${selectedFaculties.join(', ') || 'All'}` :
                                        viewType === 'subject' ? `Subjects: ${selectedSubjects.join(', ')}` :
                                            `Lab: ${selectedLabs.join(', ') || 'All'}`}
                            </div>
                            <div>Generated: {new Date().toLocaleString()}</div>
                        </div>
                    </div>

                    <div className="print-table-container" style={{ flex: 1, position: 'relative' }}>
                        <table className={`layout-table ${viewMode === 'vertical' ? 'vertical-mode' : ''}`}>
                            {viewMode === 'horizontal' ? (
                                <>
                                    <thead>
                                        <tr>
                                            <th style={{ width: '30px' }}></th> {/* Day Column Config */}
                                            {timeSlots.map(time => (
                                                <th key={time}>{time}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {days.map(day => (
                                            <tr key={day} style={{ height: `${100 / days.length}%` }}>
                                                <td className="day-cell">
                                                    <div className="vertical-text">{day}</div>
                                                </td>
                                                {timeSlots.map(time => {
                                                    const assignments = getAssignments(day, time).sort((a, b) => parseInt(a.sem) - parseInt(b.sem));
                                                    const count = assignments.length;
                                                    let densityClass = 'density-low';
                                                    if (count > 10) densityClass = 'density-ultra';
                                                    else if (count > 8) densityClass = 'density-extreme';
                                                    else if (count > 5) densityClass = 'density-high';
                                                    else if (count > 3) densityClass = 'density-med';

                                                    return (
                                                        <td key={`${day}-${time}`} className={`content-cell ${densityClass}`}>
                                                            <div className="cell-inner">
                                                                {assignments.map(assignment => {
                                                                    const conflict = assignments.some(other => other.id !== assignment.id && (other.room === assignment.room || other.faculty === assignment.faculty || (other.faculty2 && other.faculty2 === assignment.faculty) || (assignment.faculty2 && (other.faculty === assignment.faculty2 || other.faculty2 === assignment.faculty2))));
                                                                    return (
                                                                        <div key={assignment.id} className="print-assignment" style={conflict ? { borderColor: 'red', borderWidth: '2px' } : {}}>
                                                                            <div className="print-details">
                                                                                <span className="print-sub">{getSubjectShortCode(assignment.subject)}</span>
                                                                                <span className="print-meta"> [{assignment.dept}-{assignment.section}-{assignment.group && assignment.group !== 'All' ? assignment.group : '1'}]</span>
                                                                                <span className="print-fac"> [{getFacultyShortCode(assignment.faculty)}{assignment.faculty2 ? `,${getFacultyShortCode(assignment.faculty2)}` : ''}]</span>
                                                                                <span className="print-meta"> ➜ {assignment.room}</span>
                                                                            </div>
                                                                            <div style={{ flexShrink: 0, fontWeight: 800, fontSize: '0.95em', display: 'flex', alignItems: 'center', lineHeight: 1 }}>

                                                                                {(() => {
                                                                                    const match = assignment.sem.toUpperCase().match(/(\d+)(ST|ND|RD|TH)/);
                                                                                    if (match) {
                                                                                        return (
                                                                                            <>
                                                                                                <span style={{ fontSize: '1.2em', marginRight: '1px' }}>{match[1]}</span>
                                                                                                <sup style={{ fontSize: '0.7em', top: '-0.4em', position: 'relative' }}>{match[2]}</sup>
                                                                                                <span style={{ fontSize: '0.8em', marginLeft: '2px' }}>SEM</span>
                                                                                            </>
                                                                                        );
                                                                                    }
                                                                                    // Fallback if format is just "1" or "Semester 1" without ordinal (unlikely given your data but safe)
                                                                                    return <span>{assignment.sem.toUpperCase().replace('SEMESTER', 'SEM')}</span>;
                                                                                })()}
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
                                </>
                            ) : (
                                <>
                                    <thead>
                                        <tr>
                                            <th style={{ width: '80px', fontSize: '9pt' }}>TIME</th>
                                            {days.map(day => (
                                                <th key={day}>{day}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {timeSlots.map(time => (
                                            <tr key={time} style={{ height: `${100 / timeSlots.length}%` }}>
                                                <td className="day-cell" style={{ width: '80px', verticalAlign: 'middle' }}>
                                                    <div style={{ fontWeight: '800', fontSize: '9pt', padding: '2px', textAlign: 'center' }}>
                                                        {time.replace(/ - /g, '-').replace(/ AM/g, '').replace(/ PM/g, '')}
                                                    </div>
                                                </td>
                                                {days.map(day => {
                                                    const assignments = getAssignments(day, time).sort((a, b) => parseInt(a.sem) - parseInt(b.sem));
                                                    const count = assignments.length;
                                                    let densityClass = 'density-low';
                                                    if (count > 10) densityClass = 'density-ultra';
                                                    else if (count > 8) densityClass = 'density-extreme';
                                                    else if (count > 5) densityClass = 'density-high';
                                                    else if (count > 3) densityClass = 'density-med';

                                                    return (
                                                        <td key={`${day}-${time}`} className={`content-cell ${densityClass}`}>
                                                            <div className="cell-inner">
                                                                {assignments.map(assignment => {
                                                                    const conflict = assignments.some(other => other.id !== assignment.id && (other.room === assignment.room || other.faculty === assignment.faculty || (other.faculty2 && other.faculty2 === assignment.faculty) || (assignment.faculty2 && (other.faculty === assignment.faculty2 || other.faculty2 === assignment.faculty2))));
                                                                    return (
                                                                        <div key={assignment.id} className="print-assignment" style={conflict ? { borderColor: 'red', borderWidth: '2px' } : {}}>
                                                                            <div className="print-details">
                                                                                <span className="print-sub">{getSubjectShortCode(assignment.subject)}</span>
                                                                                <span className="print-meta"> [{assignment.dept}-{assignment.section}-{assignment.group && assignment.group !== 'All' ? assignment.group : '1'}]</span>
                                                                                <span className="print-fac"> [{getFacultyShortCode(assignment.faculty)}{assignment.faculty2 ? `,${getFacultyShortCode(assignment.faculty2)}` : ''}]</span>
                                                                                <span className="print-meta"> ➜ {assignment.room}</span>
                                                                            </div>
                                                                            <div style={{ flexShrink: 0, fontWeight: 800, fontSize: '0.95em', display: 'flex', alignItems: 'center', lineHeight: 1 }}>

                                                                                {(() => {
                                                                                    const match = assignment.sem.toUpperCase().match(/(\d+)(ST|ND|RD|TH)/);
                                                                                    if (match) {
                                                                                        return (
                                                                                            <>
                                                                                                <span style={{ fontSize: '1.2em', marginRight: '1px' }}>{match[1]}</span>
                                                                                                <sup style={{ fontSize: '0.7em', top: '-0.4em', position: 'relative' }}>{match[2]}</sup>
                                                                                                <span style={{ fontSize: '0.8em', marginLeft: '2px' }}>SEM</span>
                                                                                            </>
                                                                                        );
                                                                                    }
                                                                                    return <span>{assignment.sem.toUpperCase().replace('SEMESTER', 'SEM')}</span>;
                                                                                })()}
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
                                </>
                            )}
                        </table>
                    </div>
                </div>,
                document.body
            )}

            {/* Booking Modal */}
            {
                isModalOpen && createPortal(
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)',
                        display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999
                    }}>
                        <div className="glass-panel" style={{ width: '400px', padding: '2rem', overflow: 'visible' }}>
                            <h3 style={{ marginBottom: '1.5rem' }}>{editingId ? 'Edit Class' : 'Add Class'}</h3>
                            <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>{formData.day} @ {formData.time}</p>

                            {error && (
                                <div style={{ padding: '0.5rem', background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.875rem' }}>
                                    ⚠️ {error}
                                </div>
                            )}

                            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <div style={{ flex: 1 }}>
                                        <Select
                                            options={departments}
                                            value={formData.dept}
                                            onChange={val => setFormData({ ...formData, dept: val })}
                                            placeholder="Select Dept"
                                        />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <Select
                                            options={semesters.map(s => ({ value: s.name, label: s.name }))}
                                            value={formData.sem}
                                            onChange={val => setFormData({ ...formData, sem: val })}
                                            placeholder="Select Sem"
                                        />
                                    </div>
                                </div>
                                <Select
                                    options={subjectDetails.map(s => ({ value: s.name, label: `${s.name} ${s.shortCode ? `[${s.shortCode}]` : ''}` }))}
                                    value={formData.subject}
                                    onChange={val => setFormData({ ...formData, subject: val })}
                                    placeholder="Select Subject"
                                />

                                <Select
                                    options={rooms}
                                    value={formData.room}
                                    onChange={val => setFormData({ ...formData, room: val })}
                                    placeholder="Select Room"
                                />

                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <div style={{ flex: 1 }}>
                                        <Select
                                            options={faculty.map(f => ({ value: f.name, label: `${f.name} ${f.shortCode ? `[${f.shortCode}]` : ''}` }))}
                                            value={formData.faculty}
                                            onChange={val => setFormData({ ...formData, faculty: val })}
                                            placeholder="Faculty 1"
                                        />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <Select
                                            options={faculty.map(f => ({ value: f.name, label: `${f.name} ${f.shortCode ? `[${f.shortCode}]` : ''}` }))}
                                            value={formData.faculty2}
                                            onChange={val => setFormData({ ...formData, faculty2: val })}
                                            placeholder="Faculty 2"
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <div style={{ flex: 1 }}>
                                        <Select
                                            options={groups.map(g => ({ value: g.name, label: g.name }))}
                                            value={formData.section}
                                            onChange={val => setFormData({ ...formData, section: val, group: '' })}
                                            placeholder="Select Group"
                                        />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <Select
                                            options={formData.section && groups.find(g => g.name === formData.section)?.subGroups || []}
                                            value={formData.group}
                                            onChange={val => setFormData({ ...formData, group: val })}
                                            placeholder="Select Sub-Group"
                                            disabled={!formData.section || !groups.find(g => g.name === formData.section)?.subGroups?.length}
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                    <button type="button" onClick={() => setIsModalOpen(false)} className="btn" style={{ flex: 1, background: 'rgba(255,255,255,0.1)' }}>Cancel</button>
                                    <button type="submit" className="btn" style={{ flex: 1, background: 'var(--color-accent)' }}>Save</button>
                                </div>
                            </form>
                        </div>
                    </div>,
                    document.body
                )
            }
        </div >
    );
};

export default Scheduler;
