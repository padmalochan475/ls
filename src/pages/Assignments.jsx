import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../lib/firebase';
import { collection, addDoc, getDocs, query, where, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useMasterData } from '../contexts/MasterDataContext';
import {
    Check, Users, MapPin, BookOpen, Layers, Hash, X, Zap, RefreshCw,
    AlertTriangle, Info, Keyboard, Settings, Calendar, Clock, Search, Trash2,
    User, Monitor, GraduationCap, ChevronDown, Brain, Activity
} from 'lucide-react';
import MasterData from './MasterData';

const Select = ({ options, value, onChange, placeholder, icon: Icon, disabled = false, style }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const [search, setSearch] = useState('');
    const searchInputRef = useRef(null);
    const dropdownRef = useRef(null);
    const listRef = useRef(null);
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

    // Generate a safe ID for the portal
    const portalId = `select-portal-${placeholder.replace(/[^a-zA-Z0-9]/g, '-')}`;

    // Normalize options
    const normalizedOptions = options.map(opt => {
        if (typeof opt === 'object' && opt !== null) {
            return { ...opt, value: opt.value, label: opt.label || opt.value };
        }
        return { value: opt, label: opt };
    });

    // Filter options based on search
    const filteredOptions = normalizedOptions.filter(opt =>
        opt.label.toString().toLowerCase().includes(search.toLowerCase())
    );

    const selectedOption = normalizedOptions.find(opt => opt.value === value);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                // Check if click is inside the portal
                const portal = document.getElementById(portalId);
                if (portal && portal.contains(event.target)) return;
                setIsOpen(false);
                setSearch('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [portalId]);

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

            // Focus search input
            if (searchInputRef.current) {
                searchInputRef.current.focus();
            }

            // Set initial highlighted index
            const index = filteredOptions.findIndex(opt => opt.value === value);
            setHighlightedIndex(index >= 0 ? index : 0);
        } else {
            setSearch('');
        }

        return () => {
            window.removeEventListener('scroll', updateCoords, true);
            window.removeEventListener('resize', updateCoords);
        };
    }, [isOpen, value]); // eslint-disable-line react-hooks/exhaustive-deps

    // Scroll highlighted item into view
    useEffect(() => {
        if (isOpen && listRef.current && highlightedIndex >= 0) {
            const list = listRef.current;
            // Adjust for search input being the first child
            const element = list.children[highlightedIndex + 1];
            if (element) {
                element.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [highlightedIndex, isOpen]);

    const handleKeyDown = (e) => {
        if (disabled) return;

        // Prevent double entry if typing in search input
        if (e.target === searchInputRef.current && e.key.length === 1) {
            return;
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            if (isOpen) {
                if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
                    const option = filteredOptions[highlightedIndex];
                    if (!option.disabled) {
                        onChange(option.value);
                        setIsOpen(false);
                        setSearch('');
                        // Return focus to the main div so tab order is preserved
                        if (dropdownRef.current) dropdownRef.current.querySelector('[tabindex]').focus();
                    }
                }
            } else {
                setIsOpen(true);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!isOpen) {
                setIsOpen(true);
            } else {
                setHighlightedIndex(prev => (prev + 1) % filteredOptions.length);
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!isOpen) {
                setIsOpen(true);
            } else {
                setHighlightedIndex(prev => (prev - 1 + filteredOptions.length) % filteredOptions.length);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setIsOpen(false);
            setSearch('');
            if (dropdownRef.current) dropdownRef.current.querySelector('[tabindex]').focus();
        } else if (e.key === 'Tab') {
            if (isOpen) {
                // Select current item on Tab and move to next
                if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
                    const option = filteredOptions[highlightedIndex];
                    if (!option.disabled) {
                        onChange(option.value);
                    }
                }
                setIsOpen(false);
                setSearch('');
                // Restore focus to trigger so default Tab behavior moves to the NEXT element from here
                if (dropdownRef.current) dropdownRef.current.querySelector('[tabindex]').focus();
            }
        } else if (!isOpen && e.key.length === 1) {
            e.preventDefault();
            // Open and start searching if typing while closed
            setIsOpen(true);
            setSearch(e.key);
        }
    };

    return (
        <div ref={dropdownRef} style={{ position: 'relative', width: '100%', ...style }}>
            <div
                onClick={() => !disabled && setIsOpen(!isOpen)}
                onKeyDown={handleKeyDown}
                tabIndex={disabled ? -1 : 0}
                className={`glass-input premium-input ${isOpen ? 'focused' : ''}`}
                style={{
                    padding: '0.75rem 1rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.6 : 1,
                    background: disabled ? 'rgba(255,255,255,0.02)' : 'rgba(15, 23, 42, 0.6)',
                    borderColor: isOpen ? 'var(--color-accent)' : undefined,
                    boxShadow: isOpen ? '0 0 0 3px var(--color-accent-subtle)' : undefined
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                    {Icon && <Icon size={16} style={{ color: isOpen ? 'var(--color-accent)' : '#94a3b8', flexShrink: 0, transition: 'color 0.2s' }} />}
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: value ? 'white' : '#94a3b8' }}>
                        {selectedOption ? selectedOption.label : placeholder}
                    </span>
                </div>
                <ChevronDown size={16} style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0, color: isOpen ? 'var(--color-accent)' : '#94a3b8' }} />
            </div>

            {isOpen && !disabled && createPortal(
                <div
                    id={portalId}
                    ref={listRef}
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
                        borderRadius: '10px',
                        zIndex: 9999,
                        padding: '6px',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)'
                    }}
                >
                    {/* Search Input */}
                    <div style={{ padding: '4px 4px 8px 4px', position: 'sticky', top: 0, background: '#1e293b', zIndex: 10 }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            background: 'rgba(255,255,255,0.05)',
                            borderRadius: '6px',
                            padding: '6px 10px',
                            border: '1px solid rgba(255,255,255,0.1)'
                        }}>
                            <Search size={14} color="#94a3b8" style={{ marginRight: '8px' }} />
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value);
                                    setHighlightedIndex(0);
                                }}
                                onKeyDown={(e) => {
                                    // Let global handler handle navigation, but stop propagation for typing
                                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape' || e.key === 'Tab') {
                                        handleKeyDown(e);
                                    } else {
                                        e.stopPropagation();
                                    }
                                }}
                                placeholder="Search..."
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'white',
                                    fontSize: '0.9rem',
                                    width: '100%',
                                    outline: 'none'
                                }}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                    </div>

                    {filteredOptions.length > 0 ? filteredOptions.map((opt, index) => (
                        <div
                            key={opt.value}
                            onClick={() => {
                                if (opt.disabled) return;
                                onChange(opt.value);
                                setIsOpen(false);
                                setSearch('');
                                if (dropdownRef.current) dropdownRef.current.querySelector('[tabindex]').focus();
                            }}
                            onMouseEnter={() => setHighlightedIndex(index)}
                            style={{
                                padding: '8px 12px',
                                cursor: opt.disabled ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                background: (value === opt.value || index === highlightedIndex) ? 'var(--color-accent)' : 'transparent',
                                borderRadius: '8px',
                                marginBottom: '2px',
                                fontSize: '0.9rem',
                                color: (value === opt.value || index === highlightedIndex) ? 'white' : (opt.disabled ? '#64748b' : '#cbd5e1'),
                                transition: 'all 0.15s',
                                fontWeight: (value === opt.value || index === highlightedIndex) ? 600 : 400,
                                opacity: opt.disabled ? 0.6 : 1
                            }}
                        >
                            {(value === opt.value || index === highlightedIndex) && <Check size={14} color="white" />}
                            <span style={{ flex: 1 }}>{opt.label}</span>
                        </div>
                    )) : (
                        <div style={{ padding: '12px', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                            No options found
                        </div>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
};

const MultiSelectDropdown = ({ options, selected, onChange, label, icon: Icon }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                // Check if click is inside the portal
                const portal = document.getElementById(`multiselect-portal-${label.replace(/\s+/g, '-')}`);
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
        <div ref={dropdownRef} style={{ position: 'relative', width: '100%' }}>
            <div
                onClick={() => setIsOpen(!isOpen)}
                className="glass-input"
                style={{
                    padding: '0.75rem 1rem',
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
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                    {Icon && <Icon size={16} style={{ color: '#94a3b8', flexShrink: 0 }} />}
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: selected.length > 0 ? 'white' : '#94a3b8' }}>
                        {selected.length > 0 ? `${selected.length} Selected` : label}
                    </span>
                </div>
                <ChevronDown size={16} style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }} />
            </div>
            {isOpen && createPortal(
                <div
                    id={`multiselect-portal-${label.replace(/\s+/g, '-')}`}
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
                                transition: 'all 0.2s',
                                flexShrink: 0
                            }}>
                                {selected.includes(opt) && <Check size={12} color="white" strokeWidth={3} />}
                            </div>
                            <span style={{ flex: 1 }}>{opt}</span>
                        </div>
                    ))}
                </div>,
                document.body
            )}
        </div>
    );
};

const Assignments = () => {
    const { activeAcademicYear, userProfile, maxFacultyLoad } = useAuth();
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
    const [fullSchedule, setFullSchedule] = useState([]);

    // Form State
    const [selectedDay, setSelectedDay] = useState('');
    const [selectedTime, setSelectedTime] = useState('');
    const [selectedDept, setSelectedDept] = useState('');
    const [selectedSem, setSelectedSem] = useState('');

    // Group State
    const [selectedMainGroup, setSelectedMainGroup] = useState('');
    const [selectedSubGroup, setSelectedSubGroup] = useState('');

    const [selectedSubject, setSelectedSubject] = useState('');
    const [selectedRoom, setSelectedRoom] = useState('');
    const [selectedFaculty, setSelectedFaculty] = useState('');
    const [selectedFaculty2, setSelectedFaculty2] = useState('');

    // Table Filters State
    const [filterDepts, setFilterDepts] = useState([]);
    const [filterSems, setFilterSems] = useState([]);
    const [filterGroups, setFilterGroups] = useState([]);
    const [filterSubjects, setFilterSubjects] = useState([]);

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
            const activeSlots = fullSchedule.filter(s => s.day === selectedDay && s.time === selectedTime);
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
                const subjectCount = fullSchedule.filter(s =>
                    s.section === selectedMainGroup &&
                    s.subject === selectedSubject &&
                    s.day === selectedDay
                ).length;

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
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [lastSavedCount, setLastSavedCount] = useState(0);
    const [isManageModalOpen, setIsManageModalOpen] = useState(false);
    const [manageModalTab, setManageModalTab] = useState('faculty');
    const [searchTerm, setSearchTerm] = useState('');


    const openManageModal = (tab = 'faculty') => {
        setManageModalTab(tab);
        setIsManageModalOpen(true);
    };

    // Derived Group String
    const getEffectiveGroup = useCallback(() => {
        if (!selectedMainGroup) return '';
        if (selectedMainGroup === 'All') return 'All';
        if (selectedSubGroup && selectedSubGroup !== 'All') {
            return `${selectedMainGroup}-${selectedSubGroup}`;
        }
        return selectedMainGroup;
    }, [selectedMainGroup, selectedSubGroup]);



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
        groups: contextGroups
    } = useMasterData();

    useEffect(() => {
        if (!rawDepartments || !rawSemesters) return;

        setDepartments(rawDepartments.map(d => d.code || d.name).sort());
        setSemesters(rawSemesters.map(d => d.name)); // Context sorts by number already? Check context: yes. But local sort used parseInt? It's fine.
        setSubjects(rawSubjects.map(d => ({ name: d.name, shortCode: d.shortCode || '' })).sort((a, b) => a.name.localeCompare(b.name)));
        setFaculty(rawFaculty.map(d => ({ name: d.name, empId: d.empId, shortCode: d.shortCode || '' })).sort((a, b) => a.name.localeCompare(b.name)));
        setRooms(rawRooms.map(d => d.name).sort());

        const visibleDays = rawDays.filter(d => d.isVisible !== false).map(d => d.name);
        setDays(visibleDays);

        const formatTime = (t) => new Date(`2000-01-01T${t}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        setTimeSlots(rawTimeSlots.map(s => `${formatTime(s.startTime)} - ${formatTime(s.endTime)}`));

        if (contextGroups) {
            setRawGroups(contextGroups);
        }

        // Manage loading state - we want it to be false once master data is here.
        // But we also have schedule fetching which sets loading.
        // Assuming fetchSchedule handles its own loading or we combine them.
        // Actually fetchSchedule sets loading(true) then false.
        // If master data arrives later, it just updates state.
        // We can set loading(false) here too just in case.
        setLoading(false);

    }, [rawDepartments, rawSemesters, rawSubjects, rawFaculty, rawRooms, rawDays, rawTimeSlots, contextGroups]);

    // Fetch Schedule (Real-time)
    useEffect(() => {
        if (!activeAcademicYear) {
            setFullSchedule([]);
            return;
        }

        setLoading(true);
        const q = query(collection(db, 'schedule'), where('academicYear', '==', activeAcademicYear));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const scheduleData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setFullSchedule(scheduleData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching schedule:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [activeAcademicYear]);

    // Conflict Logic
    const checkConflict = useCallback(() => {
        if (!selectedDay || !selectedTime) return null;
        const effectiveGroup = getEffectiveGroup();

        // 1. Student Conflict
        const studentBusy = fullSchedule.find(s => {
            if (s.day !== selectedDay || s.time !== selectedTime || s.dept !== selectedDept || s.sem !== selectedSem) return false;

            // Check Section (Main Group)
            if (s.section !== selectedMainGroup) return false;

            // Check Sub-Group
            if (!s.group || s.group === 'All') return true;
            if (!selectedSubGroup || selectedSubGroup === 'All') return true;
            if (s.group === selectedSubGroup) return true;

            return false;
        });
        if (studentBusy) return {
            type: 'student',
            message: `⚠️ Conflict: ${studentBusy.dept} ${selectedMainGroup}${selectedSubGroup ? `-${selectedSubGroup}` : ''} already has ${studentBusy.subject} in Room ${studentBusy.room}.`
        };

        // 2. Faculty Conflict
        const checkFacultyBusy = (facName) => {
            if (!facName) return null;
            const facObj = faculty.find(f => f.name === facName);
            const empId = facObj ? facObj.empId : null;

            return fullSchedule.find(s => {
                if (s.day !== selectedDay || s.time !== selectedTime) return false;
                if (s.faculty === facName || s.faculty2 === facName) return true;
                if (empId && s.facultyEmpId === empId) return true;
                return false;
            });
        };

        const f1Busy = checkFacultyBusy(selectedFaculty);
        if (f1Busy) return {
            type: 'faculty',
            message: `⚠️ Conflict: ${selectedFaculty} is teaching ${f1Busy.subject} (${f1Busy.dept}-${f1Busy.sem}) at this time.`
        };

        const f2Busy = checkFacultyBusy(selectedFaculty2);
        if (f2Busy) return {
            type: 'faculty',
            message: `⚠️ Conflict: ${selectedFaculty2} is teaching ${f2Busy.subject} (${f2Busy.dept}-${f2Busy.sem}) at this time.`
        };

        // 3. Room Conflict
        if (selectedRoom) {
            const roomBusy = fullSchedule.find(s => s.day === selectedDay && s.time === selectedTime && s.room === selectedRoom);
            if (roomBusy) return {
                type: 'room',
                message: `⚠️ Conflict: Room ${selectedRoom} is booked for ${roomBusy.subject} (${roomBusy.dept}-${roomBusy.sem}).`
            };
        }

        // 4. Self-Conflict (Same Faculty)
        if (selectedFaculty && selectedFaculty2 && selectedFaculty === selectedFaculty2) {
            return { type: 'faculty', message: `⚠️ Invalid: Cannot select the same faculty (${selectedFaculty}) twice.` };
        }

        return null;
    }, [fullSchedule, selectedDay, selectedTime, selectedDept, selectedSem, selectedMainGroup, selectedSubGroup, selectedFaculty, selectedFaculty2, selectedRoom, faculty, getEffectiveGroup]);

    const conflict = checkConflict();

    // Faculty Load Monitor
    const renderFacultyLoad = (facultyName) => {
        if (!facultyName) return null;
        const load = fullSchedule.filter(s => s.faculty === facultyName || s.faculty2 === facultyName).length;
        const max = maxFacultyLoad || 18;
        const percentage = Math.min((load / max) * 100, 100);

        let statusColor = '#4ade80'; // Green
        let statusText = 'Optimal';

        if (load >= max) {
            statusColor = '#ef4444'; // Red
            statusText = 'Overloaded';
        } else if (load >= max * 0.8) {
            statusColor = '#facc15'; // Yellow
            statusText = 'Heavy';
        }

        return (
            <div className="animate-fade-in" style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.8rem' }}>
                    <span style={{ color: '#94a3b8' }}>Weekly Load</span>
                    <span style={{ color: statusColor, fontWeight: 600 }}>{load} / {max} Hours ({statusText})</span>
                </div>
                <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${percentage}%`, height: '100%', background: statusColor, transition: 'width 0.5s ease' }} />
                </div>
            </div>
        );
    };

    const handleAssign = async () => {
        if (!selectedDay || !selectedTime || !selectedSubject || !selectedFaculty || !selectedRoom || !selectedDept || !selectedSem || !selectedMainGroup) {
            alert("Please fill in all required fields.");
            return;
        }

        if (conflict) {
            alert(`Cannot assign: ${conflict.message}`);
            return;
        }

        setSaving(true);
        try {
            const facultyObj = faculty.find(f => f.name === selectedFaculty);
            const effectiveGroup = getEffectiveGroup();

            await addDoc(collection(db, 'schedule'), {
                academicYear: activeAcademicYear,
                dept: selectedDept,
                sem: selectedSem,
                subject: selectedSubject,
                faculty: selectedFaculty,
                facultyEmpId: facultyObj ? facultyObj.empId : null,
                faculty2: selectedFaculty2 || null,
                room: selectedRoom,
                room: selectedRoom,
                group: selectedSubGroup,
                section: selectedMainGroup,
                day: selectedDay,
                time: selectedTime,
                createdAt: new Date().toISOString()
            });

            setSuccessMsg('Assignment Created!');
            setLastSavedCount(prev => prev + 1);

            // Clear fields to prevent immediate self-conflict and prepare for next entry
            setSelectedTime('');
            setSelectedSubject('');
            setSelectedRoom('');
            setSelectedFaculty('');
            setSelectedFaculty2('');

        } catch (err) {
            console.error("Error saving:", err);
            alert("Failed to save assignment.");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Delete this assignment?")) return;
        try {
            await deleteDoc(doc(db, 'schedule', id));
            setLastSavedCount(prev => prev + 1);
        } catch (e) {
            console.error("Error deleting:", e);
        }
    };

    const filteredAssignments = fullSchedule.filter(s => {
        const search = searchTerm.toLowerCase().trim();

        // 1. Filter by Department
        if (filterDepts.length > 0 && !filterDepts.includes(s.dept)) return false;

        // 2. Filter by Semester
        if (filterSems.length > 0 && !filterSems.includes(s.sem)) return false;

        // 3. Filter by Group
        if (filterGroups.length > 0 && !filterGroups.includes(s.section)) return false;

        // 4. Filter by Subject
        if (filterSubjects.length > 0 && !filterSubjects.includes(s.subject)) return false;

        // 3. Search Filter
        if (!search) return true;

        return (
            (s.subject && s.subject.toLowerCase().includes(search)) ||
            (s.faculty && s.faculty.toLowerCase().includes(search)) ||
            (s.faculty2 && s.faculty2.toLowerCase().includes(search)) ||
            (s.group && s.group.toLowerCase().includes(search)) ||
            (s.room && s.room.toLowerCase().includes(search)) ||
            (s.day && s.day.toLowerCase().includes(search)) ||
            (s.time && s.time.toLowerCase().includes(search))
        );
    }).sort((a, b) => {
        const dayOrder = days.indexOf(a.day) - days.indexOf(b.day);
        if (dayOrder !== 0) return dayOrder;
        return timeSlots.indexOf(a.time) - timeSlots.indexOf(b.time);
    });

    const availableSubGroups = React.useMemo(() => {
        const groupObj = rawGroups.find(g => g.name === selectedMainGroup);
        return groupObj && groupObj.subGroups ? groupObj.subGroups : [];
    }, [rawGroups, selectedMainGroup]);





    return (
        <div className="assignments-container animate-fade-in">
            {/* Header */}
            <div className="assignments-header">
                <div>
                    <h2 className="page-title">
                        {isAdmin ? 'Create Assignment' : 'Assignments'} <span className="academic-year-badge">({activeAcademicYear})</span>
                    </h2>
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

            {/* Main Content Grid */}
            <div className="assignments-content" style={!isAdmin ? { gridTemplateColumns: '1fr' } : {}}>

                {/* Left Column: Form */}
                {isAdmin && (
                    <div className="glass-panel form-panel">

                        {/* Section 1: Schedule */}
                        <div className="form-section">
                            <h3 className="section-title" style={{ color: '#60a5fa' }}>
                                <Clock size={16} /> Schedule
                            </h3>
                            <div className="form-grid-2">
                                <div className="form-group">
                                    <label>Day</label>
                                    <Select
                                        options={days}
                                        value={selectedDay}
                                        onChange={setSelectedDay}
                                        placeholder="Select Day..."
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Time</label>
                                    <Select
                                        options={timeSlots}
                                        value={selectedTime}
                                        onChange={setSelectedTime}
                                        placeholder="Select Time..."
                                    />
                                </div>
                            </div>

                            {/* AI Insight Banner */}
                            {(selectedDay && selectedTime) && (
                                <div className="glass-panel" style={{
                                    marginTop: '1rem',
                                    padding: '0.75rem',
                                    background: isAnalyzing ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.2)',
                                    border: isAnalyzing ? '1px solid rgba(255,255,255,0.1)' : `1px solid ${aiInsight?.color || 'transparent'}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    borderRadius: '12px',
                                    transition: 'all 0.3s ease'
                                }}>
                                    {isAnalyzing ? (
                                        <RefreshCw size={18} className="spin-slow" style={{ color: '#94a3b8' }} />
                                    ) : (
                                        <Brain size={18} style={{ color: aiInsight?.color }} className={aiInsight?.status === 'optimal' ? 'pulse-slow' : ''} />
                                    )}

                                    <div style={{ flex: 1 }}>
                                        {isAnalyzing ? (
                                            <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                                AI Analysis running...
                                            </span>
                                        ) : (
                                            <div className="animate-fade-in">
                                                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: aiInsight?.color }}>
                                                    {aiInsight?.message}
                                                </div>
                                                {aiInsight?.utilization > 0 && (
                                                    <div style={{
                                                        height: '4px',
                                                        background: 'rgba(255,255,255,0.1)',
                                                        borderRadius: '2px',
                                                        marginTop: '6px',
                                                        overflow: 'hidden'
                                                    }}>
                                                        <div style={{
                                                            height: '100%',
                                                            width: `${aiInsight.utilization}%`,
                                                            background: aiInsight.color,
                                                            transition: 'width 1s ease-out'
                                                        }} />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Section 2: Class Info */}
                        <div className="form-section">
                            <h3 className="section-title" style={{ color: '#34d399' }}>
                                <Layers size={16} /> Class Info
                            </h3>
                            <div className="form-grid-2">
                                <div className="form-group">
                                    <label>Dept</label>
                                    <Select
                                        options={departments}
                                        value={selectedDept}
                                        onChange={setSelectedDept}
                                        placeholder="Select..."
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Sem</label>
                                    <Select
                                        options={semesters}
                                        value={selectedSem}
                                        onChange={setSelectedSem}
                                        placeholder="Select..."
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Group</label>
                                    <Select
                                        options={rawGroups.map(g => ({ value: g.name, label: g.name }))}
                                        value={selectedMainGroup}
                                        onChange={val => { setSelectedMainGroup(val); setSelectedSubGroup(''); }}
                                        placeholder="Select Group..."
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Sub Group</label>
                                    <Select
                                        options={availableSubGroups}
                                        value={selectedSubGroup}
                                        onChange={setSelectedSubGroup}
                                        placeholder="Select Sub Group..."
                                        disabled={!selectedMainGroup || selectedMainGroup === 'All' || availableSubGroups.length === 0}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Section 3: Details */}
                        <div className="form-section">
                            <h3 className="section-title" style={{ color: '#f472b6' }}>
                                <BookOpen size={16} /> Details
                            </h3>
                            <div className="form-grid-2">
                                <div className="form-group full-width">
                                    <label>Subject</label>
                                    <Select
                                        options={subjects.map(s => ({ value: s.name, label: `${s.name} ${s.shortCode ? `[${s.shortCode}]` : ''}` }))}
                                        value={selectedSubject}
                                        onChange={setSelectedSubject}
                                        placeholder="Select Subject..."
                                    />
                                </div>
                                <div className="form-group full-width">
                                    <label>Room</label>
                                    <Select
                                        options={rooms}
                                        value={selectedRoom}
                                        onChange={setSelectedRoom}
                                        placeholder="Select Room..."
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Section 4: Faculty */}
                        <div className="form-section">
                            <h3 className="section-title" style={{ color: '#fbbf24' }}>
                                <Users size={16} /> Faculty
                            </h3>
                            <div className="form-grid-1">
                                <div className="form-group">
                                    <label>Faculty 1</label>
                                    <Select
                                        options={faculty.map(f => ({ value: f.name, label: `${f.name} ${f.shortCode ? `[${f.shortCode}]` : ''}` }))}
                                        value={selectedFaculty}
                                        onChange={setSelectedFaculty}
                                        placeholder="Select Faculty..."
                                    />
                                    {renderFacultyLoad(selectedFaculty)}
                                </div>
                                <div className="form-group">
                                    <label>Faculty 2</label>
                                    <Select
                                        options={faculty.map(f => ({ value: f.name, label: `${f.name} ${f.shortCode ? `[${f.shortCode}]` : ''}` }))}
                                        value={selectedFaculty2}
                                        onChange={setSelectedFaculty2}
                                        placeholder="Select Faculty..."
                                    />
                                    {renderFacultyLoad(selectedFaculty2)}
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="form-actions">
                            {/* Conflict Alert */}
                            {conflict && !saving && !successMsg && (
                                <div className="alert-box error animate-fade-in">
                                    <AlertTriangle size={18} className="alert-icon" />
                                    <div className="alert-content">{conflict.message}</div>
                                </div>
                            )}

                            {/* Success Message */}
                            {successMsg && (
                                <div className="alert-box success animate-fade-in">
                                    <Check size={18} className="alert-icon" />
                                    <div className="alert-content">{successMsg}</div>
                                    <button onClick={() => setSuccessMsg('')} className="alert-close">
                                        <X size={14} />
                                    </button>
                                </div>
                            )}

                            <div className="button-group">
                                <button className="btn btn-secondary" onClick={() => {
                                    setSelectedSubject(''); setSelectedFaculty(''); setSelectedRoom(''); setSelectedFaculty2('');
                                }}>
                                    Clear
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleAssign}
                                    disabled={saving || !!conflict}
                                >
                                    {saving ? <RefreshCw className="spin" size={18} /> : <Check size={18} />}
                                    {saving ? 'Creating...' : 'Create Assignment'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Right Column: Existing Assignments Table */}
                <div className="glass-panel table-panel">
                    <div className="table-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 className="table-title">
                                Assignments <span className="count-badge">{filteredAssignments.length}</span>
                            </h3>
                            <div className="search-wrapper">
                                <Search size={16} className="search-icon" />
                                <input
                                    type="text"
                                    placeholder="Search..."
                                    className="glass-input search-input"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Table Filters */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                            <MultiSelectDropdown
                                options={departments}
                                selected={filterDepts}
                                onChange={setFilterDepts}
                                label="Filter Dept"
                                icon={BookOpen}
                            />
                            <MultiSelectDropdown
                                options={semesters}
                                selected={filterSems}
                                onChange={setFilterSems}
                                label="Filter Sem"
                                icon={Layers}
                            />
                            <MultiSelectDropdown
                                options={rawGroups.map(g => g.name)}
                                selected={filterGroups}
                                onChange={setFilterGroups}
                                label="Filter Group"
                                icon={Users}
                            />
                            <MultiSelectDropdown
                                options={subjects.map(s => s.name)}
                                selected={filterSubjects}
                                onChange={setFilterSubjects}
                                label="Filter Subject"
                                icon={BookOpen}
                            />
                        </div>
                    </div>

                    <div className="table-content">
                        <table className="assignments-table">
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Subject</th>
                                    <th>Faculty</th>
                                    <th>Room</th>
                                    <th>Group</th>
                                    <th className="actions-col"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredAssignments.length > 0 ? filteredAssignments.map((assignment, index) => (
                                    <tr key={index} className="table-row-hover">
                                        <td>
                                            <div className="cell-primary">{assignment.day}</div>
                                            <div className="cell-secondary">
                                                <Clock size={12} /> {assignment.time}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="cell-primary" title={assignment.subject}>{assignment.subject}</div>
                                            {(() => {
                                                const sub = subjects.find(s => s.name === assignment.subject);
                                                return sub && sub.shortCode ? (
                                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px', fontWeight: '500' }}>{sub.shortCode}</div>
                                                ) : null;
                                            })()}
                                        </td>
                                        <td>
                                            <div className="faculty-list">
                                                <div className="badge badge-blue">
                                                    <User size={12} />
                                                    <span>{assignment.faculty}</span>
                                                </div>
                                                {assignment.faculty2 && (
                                                    <div className="badge badge-purple">
                                                        <User size={12} />
                                                        <span>{assignment.faculty2}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="badge badge-pink">
                                                <MapPin size={12} />
                                                <span>{assignment.room}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="badge badge-green">
                                                <Users size={12} />
                                                <span>{assignment.dept}-{assignment.section}{assignment.group ? `-${assignment.group}` : ''}</span>
                                            </div>
                                        </td>
                                        <td className="actions-col">
                                            {assignment.id && isAdmin && (
                                                <button
                                                    onClick={() => handleDelete(assignment.id)}
                                                    className="icon-btn-danger"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="6" className="empty-state">
                                            <div className="empty-content">
                                                <div className="empty-icon">
                                                    <Search size={24} />
                                                </div>
                                                <div>
                                                    No assignments found for {selectedDept} - {selectedSem}
                                                    {searchTerm && <span className="search-hint">matching "{searchTerm}"</span>}
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Manage Data Modal */}
            {isManageModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content glass-panel animate-scale-in">
                        <button
                            onClick={() => { setIsManageModalOpen(false); fetchMasterData(); }}
                            className="modal-close-btn"
                        >
                            <X size={20} />
                        </button>
                        <div className="modal-body">
                            <MasterData initialTab={manageModalTab} />
                        </div>
                    </div>
                </div>
            )}

            {/* CSS Styles */}
            <style>{`
                .assignments-container {
                    display: flex;
                    flex-direction: column;
                    height: calc(100vh - 80px);
                    gap: 1rem;
                    overflow: hidden;
                    padding: 0.5rem;
                    color: #fff;
                }

                .assignments-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 0 0.5rem;
                    flex-shrink: 0;
                }

                .page-title {
                    font-size: 1.8rem;
                    font-weight: 800;
                    margin: 0;
                    background: linear-gradient(to right, #fff, #94a3b8);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    letter-spacing: -0.5px;
                }

                .academic-year-badge {
                    font-size: 1rem;
                    font-weight: 500;
                    color: #64748b;
                    -webkit-text-fill-color: #64748b;
                }

                .manage-btn {
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.1);
                    font-size: 0.85rem;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.5rem 1rem;
                    border-radius: 8px;
                    transition: all 0.2s;
                    color: #e2e8f0;
                }

                .assignments-content {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 1.5rem;
                    flex: 1;
                    overflow: hidden;
                }

                @media (min-width: 1024px) {
                    .assignments-content {
                        grid-template-columns: 380px 1fr;
                    }
                }

                /* Form Panel */
                .form-panel {
                    padding: 1.5rem;
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                    overflow-y: auto;
                    background: linear-gradient(145deg, rgba(30, 41, 59, 0.6), rgba(15, 23, 42, 0.6));
                    border: 1px solid rgba(255,255,255,0.08);
                    backdrop-filter: blur(12px);
                }

                .form-section {
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                }

                .section-title {
                    font-size: 0.85rem;
                    margin: 0;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    font-weight: 600;
                }

                .form-grid-2 {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 1rem;
                }

                .form-grid-1 {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 1rem;
                }

                .form-group label {
                    font-size: 0.75rem;
                    color: #94a3b8;
                    margin-bottom: 6px;
                    display: block;
                    font-weight: 500;
                }

                .full-width {
                    grid-column: span 2;
                }

                .premium-input {
                    width: 100%;
                    padding: 0.75rem;
                    font-size: 0.9rem;
                    background: rgba(15, 23, 42, 0.6);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                    color: white;
                    transition: all 0.2s;
                }

                .premium-input:focus {
                    outline: none;
                    border-color: #60a5fa;
                    box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.2);
                    background: rgba(15, 23, 42, 0.8);
                }

                .premium-input option {
                    background: #0f172a;
                    color: white;
                    padding: 8px;
                }

                /* Actions */
                .form-actions {
                    margin-top: auto;
                    padding-top: 1.5rem;
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }

                .alert-box {
                    padding: 0.75rem;
                    border-radius: 8px;
                    display: flex;
                    align-items: flex-start;
                    gap: 10px;
                    font-size: 0.85rem;
                    position: relative;
                }

                .alert-box.error {
                    background: rgba(239, 68, 68, 0.1);
                    border: 1px solid rgba(239, 68, 68, 0.2);
                    color: #fca5a5;
                }

                .alert-box.success {
                    background: rgba(16, 185, 129, 0.1);
                    border: 1px solid rgba(16, 185, 129, 0.2);
                    color: #6ee7b7;
                }

                .alert-icon {
                    margin-top: 2px;
                    flex-shrink: 0;
                }

                .alert-content {
                    flex: 1;
                }

                .alert-close {
                    background: none;
                    border: none;
                    color: inherit;
                    cursor: pointer;
                    padding: 0;
                    opacity: 0.7;
                    transition: opacity 0.2s;
                }

                .alert-close:hover {
                    opacity: 1;
                }

                .button-group {
                    display: flex;
                    gap: 1rem;
                }

                .btn {
                    padding: 0.75rem 1rem;
                    border-radius: 10px;
                    font-weight: 600;
                    font-size: 0.9rem;
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.5rem;
                    border: none;
                }

                .btn-secondary {
                    flex: 1;
                    background: transparent;
                    border: 1px solid rgba(255,255,255,0.1);
                    color: #94a3b8;
                }

                .btn-secondary:hover {
                    background: rgba(255,255,255,0.05);
                    color: white;
                }

                .btn-primary {
                    flex: 2;
                    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                    color: white;
                    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
                }

                .btn-primary:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 6px 16px rgba(37, 99, 235, 0.4);
                }

                .btn-primary:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                    transform: none;
                }

                /* Table Panel */
                .table-panel {
                    padding: 0;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    border: 1px solid rgba(255,255,255,0.08);
                    background: rgba(15, 23, 42, 0.6);
                    backdrop-filter: blur(12px);
                }

                .table-header {
                    padding: 1.5rem;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .table-title {
                    font-size: 1.1rem;
                    margin: 0;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                .count-badge {
                    font-size: 0.8rem;
                    background: rgba(255,255,255,0.1);
                    padding: 2px 8px;
                    border-radius: 12px;
                    color: #94a3b8;
                }

                .search-wrapper {
                    position: relative;
                }

                .search-icon {
                    position: absolute;
                    left: 12px;
                    top: 50%;
                    transform: translateY(-50%);
                    color: var(--color-text-muted);
                }

                .search-input {
                    padding-left: 36px;
                    width: 240px;
                    font-size: 0.85rem;
                    border-radius: 20px;
                    background: rgba(0,0,0,0.2);
                    border: 1px solid rgba(255,255,255,0.1);
                    color: white;
                    padding-top: 8px;
                    padding-bottom: 8px;
                }

                .table-content {
                    flex: 1;
                    overflow: auto;
                }

                .assignments-table {
                    width: 100%;
                    border-collapse: separate;
                    border-spacing: 0;
                    font-size: 0.85rem;
                    white-space: nowrap;
                }

                .assignments-table th {
                    padding: 1rem;
                    color: #94a3b8;
                    font-weight: 600;
                    font-size: 0.75rem;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    border-bottom: 1px solid rgba(255,255,255,0.1);
                    text-align: left;
                    background: rgba(15, 23, 42, 0.95);
                    position: sticky;
                    top: 0;
                    z-index: 10;
                }

                .assignments-table td {
                    padding: 1rem;
                    vertical-align: top;
                    border-bottom: 1px solid rgba(255,255,255,0.03);
                }

                .table-row-hover:hover {
                    background: rgba(255, 255, 255, 0.03);
                }

                .cell-primary {
                    font-weight: 600;
                    color: #e2e8f0;
                    margin-bottom: 4px;
                }

                .cell-secondary {
                    font-size: 0.75rem;
                    color: #64748b;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }

                .faculty-list {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    align-items: flex-start;
                }

                .badge {
                    padding: 4px 8px;
                    border-radius: 6px;
                    font-size: 0.75rem;
                    font-weight: 500;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    white-space: nowrap;
                }

                .badge-blue { background: rgba(59, 130, 246, 0.1); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.2); }
                .badge-purple { background: rgba(139, 92, 246, 0.1); color: #a78bfa; border: 1px solid rgba(139, 92, 246, 0.2); }
                .badge-pink { background: rgba(236, 72, 153, 0.1); color: #f472b6; border: 1px solid rgba(236, 72, 153, 0.2); }
                .badge-green { background: rgba(16, 185, 129, 0.1); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.2); }

                .actions-col {
                    text-align: right;
                    position: sticky;
                    right: 0;
                    background: #0f172a; /* Solid background to prevent overlap */
                    z-index: 5;
                    box-shadow: -4px 0 12px -4px rgba(0,0,0,0.5); /* Shadow for separation */
                    width: 48px; /* Fixed width */
                }
                
                .table-row-hover .actions-col {
                    background: #0f172a; /* Ensure sticky col has solid bg */
                }
                
                /* Fix for sticky column background on hover */
                .table-row-hover:hover .actions-col {
                    background: #1e293b; /* Match hover color (lighter slate) */
                }

                .icon-btn-danger {
                    background: transparent;
                    border: none;
                    color: #ef4444;
                    cursor: pointer;
                    padding: 8px;
                    border-radius: 8px;
                    transition: background 0.2s;
                    opacity: 0.7;
                }

                .icon-btn-danger:hover {
                    background: rgba(239, 68, 68, 0.15);
                    opacity: 1;
                }

                .empty-state {
                    padding: 4rem;
                    text-align: center;
                    color: #64748b;
                }

                .empty-content {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 1rem;
                }

                .empty-icon {
                    width: 64px;
                    height: 64px;
                    border-radius: 50%;
                    background: rgba(255,255,255,0.05);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #475569;
                }

                .search-hint {
                    display: block;
                    margin-top: 4px;
                    color: #94a3b8;
                }

                /* Modal */
                .modal-overlay {
                    position: fixed;
                    inset: 0;
                    z-index: 2000;
                    background: rgba(0,0,0,0.8);
                    backdrop-filter: blur(8px);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    padding: 2rem;
                }

                .modal-content {
                    width: 90%;
                    height: 90%;
                    display: flex;
                    flex-direction: column;
                    position: relative;
                    overflow: hidden;
                    background: var(--color-bg-main);
                    border: 1px solid rgba(255,255,255,0.1);
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                }

                .modal-close-btn {
                    position: absolute;
                    top: 1rem;
                    right: 1rem;
                    z-index: 10;
                    background: rgba(255,255,255,0.1);
                    border: none;
                    border-radius: 50%;
                    width: 32px;
                    height: 32px;
                    color: white;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background 0.2s;
                }

                .modal-close-btn:hover {
                    background: rgba(255,255,255,0.2);
                }

                .modal-body {
                    flex: 1;
                    overflow: auto;
                    padding: 1rem;
                }

                /* Mobile Optimizations */
                @media (max-width: 1023px) {
                    .assignments-container {
                        height: auto;
                        overflow-y: auto;
                        padding-bottom: 80px; /* Space for bottom nav if any */
                    }
                    
                    .assignments-content {
                        display: flex;
                        flex-direction: column;
                        overflow: visible;
                    }

                    .form-panel, .table-panel {
                        overflow: visible;
                        height: auto;
                    }

                    .table-panel {
                        min-height: 400px;
                    }

                    .hide-on-mobile {
                        display: none;
                    }

                    .search-input {
                        width: 160px;
                    }
                    
                    .assignments-table th, .assignments-table td {
                        padding: 0.75rem 0.5rem;
                    }
                }
            `}</style>
        </div>
    );
};

export default Assignments;
