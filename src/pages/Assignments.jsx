import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../lib/firebase';
import { collection, addDoc, getDocs, query, where, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useMasterData } from '../contexts/MasterDataContext';
import {
    Check, Users, MapPin, BookOpen, Layers, Hash, X, Zap, RefreshCw,
    AlertTriangle, Info, Keyboard, Settings, Calendar, Clock, Search, Trash2,
    User, Monitor, GraduationCap, ChevronDown, Brain, Activity, List
} from 'lucide-react';
import MasterData from './MasterData';
import ConfirmModal from '../components/ConfirmModal';
import { analyzeSchedule } from '../utils/conflictDetection';

const Select = ({ options, value, onChange, placeholder, icon: Icon, disabled = false, style }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const [search, setSearch] = useState('');
    const searchInputRef = useRef(null);
    const dropdownRef = useRef(null);
    const listRef = useRef(null);
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });



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
                // Check if click is inside the portal - use ref instead of ID search if possible, or simple check
                // Since we removed the ID from the portal div, we need to rely on ref containment more robustly if needed
                // But generally, the portal is outside the root.
                // For now, simpler: just close. The listRef check handles internal clicks if structured right,
                // but actually, clicking option closes it anyway.
                // Clicking search input shouldn't close.
                if (listRef.current && listRef.current.contains(event.target)) return;
                setIsOpen(false);
                setSearch('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const { activeAcademicYear, userProfile, maxFacultyLoad, currentUser } = useAuth();
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
        groups: contextGroups
    } = useMasterData();

    useEffect(() => {
        if (!rawDepartments || !rawSemesters) return;

        setDepartments(rawDepartments.map(d => d.code || d.name).sort());
        setSemesters(rawSemesters.map(d => d.name)); // Context sorts by number already? Check context: yes. But local sort used parseInt? It's fine.
        setSubjects(rawSubjects.map(d => ({ name: d.name, shortCode: d.shortCode || '' })).sort((a, b) => a.name.localeCompare(b.name)));
        setFaculty(rawFaculty.map(d => ({ name: d.name, empId: d.empId, shortCode: d.shortCode || '', uid: d.uid, id: d.id })).sort((a, b) => a.name.localeCompare(b.name)));
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
            setLoading(false);
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
    // Helper: Parse time slot duration and range
    const parseTimeSlot = useCallback((timeStr) => {
        try {
            const parts = timeStr.replace(/\s+/g, ' ').split(' - ');
            if (parts.length !== 2) return null;

            const base = '2000/01/01 '; // Arbitrary date for time comparison
            const start = new Date(base + parts[0]);
            const end = new Date(base + parts[1]);

            let startTime = start.getTime();
            let endTime = end.getTime();

            if (isNaN(startTime) || isNaN(endTime)) return null;

            // Handle cross-midnight (e.g., 11 PM - 1 AM)
            if (endTime < startTime) {
                endTime += 24 * 60 * 60 * 1000;
            }

            const durationHours = (endTime - startTime) / (1000 * 60 * 60);

            return { start: startTime, end: endTime, duration: durationHours };
        } catch {
            return null;
        }
    }, []);

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

        const analysis = analyzeSchedule(candidate, fullSchedule, {
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
    }, [fullSchedule, selectedDay, selectedTime, selectedDept, selectedSem, selectedMainGroup, selectedSubGroup, selectedFaculty, selectedFaculty2, selectedRoom, selectedSubject, faculty, rooms]);

    const conflict = checkConflict();

    // Faculty Load Monitor (Calculates HOURS)
    const renderFacultyLoad = (facultyId) => {
        if (!facultyId) return null;
        const facObj = faculty.find(f => f.id === facultyId);
        const facultyName = facObj ? facObj.name : '';
        const empId = facObj ? facObj.empId : null;

        let totalHours = 0;
        fullSchedule.forEach(s => {
            let match = false;
            // logic matches checkFacultyBusy
            if (empId && (s.facultyEmpId === empId || s.faculty2EmpId === empId)) {
                match = true;
            } else if (s.faculty === facultyName || s.faculty2 === facultyName) {
                match = true;
            }

            if (match) {
                const info = parseTimeSlot(s.time);
                totalHours += info ? info.duration : 1;
            }
        });

        // Round to 1 decimal place for neatness
        totalHours = Math.round(totalHours * 10) / 10;

        const max = maxFacultyLoad || 18;
        const percentage = Math.min((totalHours / max) * 100, 100);

        let statusColor = '#4ade80'; // Green
        let statusText = 'Optimal';

        if (totalHours >= max) {
            statusColor = '#ef4444'; // Red
            statusText = 'Overloaded';
        } else if (totalHours >= max * 0.8) {
            statusColor = '#facc15'; // Yellow
            statusText = 'Heavy';
        }

        return (
            <div className="animate-fade-in" style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.8rem' }}>
                    <span style={{ color: '#94a3b8' }}>Weekly Load</span>
                    <span style={{ color: statusColor, fontWeight: 600 }}>{totalHours} / {max} Hours ({statusText})</span>
                </div>
                <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${percentage}%`, height: '100%', background: statusColor, transition: 'width 0.5s ease' }} />
                </div>
            </div>
        );
    };

    const handleAssign = async () => {
        // Validation: Enforce Sub-Group selection if available
        const groupObj = rawGroups.find(g => g.name === selectedMainGroup);
        const hasSubGroups = groupObj && groupObj.subGroups && groupObj.subGroups.length > 0;

        if (hasSubGroups && !selectedSubGroup) {
            alert("Please choose a Sub Group.");
            return;
        }

        if (!navigator.onLine) {
            alert("You are offline. Cannot save assignments.");
            return;
        }

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
            const facultyObj = faculty.find(f => f.id === selectedFaculty);
            const faculty2Obj = selectedFaculty2 ? faculty.find(f => f.id === selectedFaculty2) : null;


            await addDoc(collection(db, 'schedule'), {
                academicYear: activeAcademicYear,
                dept: selectedDept,
                sem: selectedSem,
                subject: selectedSubject,
                faculty: facultyObj ? facultyObj.name : '',
                facultyEmpId: facultyObj?.empId || null,
                faculty2: faculty2Obj ? faculty2Obj.name : null,
                faculty2EmpId: faculty2Obj?.empId || null,
                room: selectedRoom,
                group: selectedSubGroup,
                section: selectedMainGroup,
                day: selectedDay,
                time: selectedTime,
                createdBy: currentUser ? currentUser.uid : 'system',
                createdByName: userProfile ? userProfile.name : 'Unknown',
                createdAt: new Date().toISOString()
            });

            setSuccessMsg('Assignment Created!');


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

        if (!canDelete(assignment)) {
            alert("Permission denied.");
            return;
        }

        setConfirmModal({ isOpen: true, id: assignment.id });
    };

    const executeDelete = async () => {
        const id = confirmModal.id;
        if (!id) return;

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
            const search = searchTerm.toLowerCase().trim();

            // 1. Filter by Department
            if (filterDepts.length > 0 && !filterDepts.includes(s.dept)) return false;

            // 2. Filter by Semester
            if (filterSems.length > 0 && !filterSems.includes(s.sem)) return false;

            // 3. Filter by Group
            if (filterGroups.length > 0 && !filterGroups.includes(s.section)) return false;

            // 4. Filter by Subject
            if (filterSubjects.length > 0 && !filterSubjects.includes(s.subject)) return false;

            // 5. Search Filter
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
            const getDayIndex = (dName) => {
                if (!days) return -1;
                return days.findIndex(d => d.name === dName);
            };

            const ia = getDayIndex(a.day);
            const ib = getDayIndex(b.day);
            if (ia !== ib) return ia - ib;

            // Sort by Start Time
            try {
                const timeA = new Date('2000/01/01 ' + a.time.split(' - ')[0]).getTime();
                const timeB = new Date('2000/01/01 ' + b.time.split(' - ')[0]).getTime();
                return timeA - timeB;
            } catch {
                return 0;
            }
        });
    }, [fullSchedule, searchTerm, filterDepts, filterSems, filterGroups, filterSubjects, days]);

    const availableSubGroups = React.useMemo(() => {
        const groupObj = rawGroups.find(g => g.name === selectedMainGroup);
        return groupObj && groupObj.subGroups ? groupObj.subGroups : [];
    }, [rawGroups, selectedMainGroup]);


    return (
        <div className="assignments-container animate-fade-in">
            {loading && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.8)', zIndex: 100, backdropFilter: 'blur(4px)' }}>
                    <RefreshCw className="spin" size={32} color="#60a5fa" />
                </div>
            )}
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
                    <h2 className="page-title">Assignments <span className="academic-year-badge">({activeAcademicYear})</span></h2>
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
                            <div className="form-group-row">
                                <div className="form-group"><label>Day</label><Select options={days} value={selectedDay} onChange={setSelectedDay} placeholder="Select Day" /></div>
                                <div className="form-group"><label>Time</label><Select options={timeSlots} value={selectedTime} onChange={setSelectedTime} placeholder="Select Time" /></div>
                                <div className="form-group"><label>Room</label><Select options={rooms} value={selectedRoom} onChange={setSelectedRoom} placeholder="Select Room" /></div>
                                <div className="form-group" style={{ flex: 1.5 }}><label>Subject</label><Select options={subjects.map(s => ({ value: s.name, label: `${s.name} ${s.shortCode ? `[${s.shortCode}]` : ''}` }))} value={selectedSubject} onChange={setSelectedSubject} placeholder="Search Subject..." /></div>
                            </div>

                            {/* Row 2: Class Target */}
                            <div className="form-group-row">
                                <div className="form-group"><label>Department</label><Select options={departments} value={selectedDept} onChange={setSelectedDept} placeholder="Dept" /></div>
                                <div className="form-group"><label>Semester</label><Select options={semesters} value={selectedSem} onChange={setSelectedSem} placeholder="Sem" /></div>
                                <div className="form-group"><label>Group</label><Select options={rawGroups.map(g => ({ value: g.name, label: g.name }))} value={selectedMainGroup} onChange={val => { setSelectedMainGroup(val); setSelectedSubGroup(''); }} placeholder="Main Group" /></div>
                                <div className="form-group"><label>Sub-Group</label><Select options={availableSubGroups} value={selectedSubGroup} onChange={setSelectedSubGroup} placeholder="All Sub-groups" disabled={!selectedMainGroup || availableSubGroups.length === 0} /></div>
                            </div>

                            {/* Row 3: Faculty */}
                            <div className="form-group-row">
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label>Faculty 1</label>
                                    <Select options={faculty.map(f => ({ value: f.id, label: `${f.name} ${f.shortCode ? `[${f.shortCode}]` : ''}` }))} value={selectedFaculty} onChange={setSelectedFaculty} placeholder="Select Faculty..." />
                                    {renderFacultyLoad(selectedFaculty)}
                                </div>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label>Faculty 2</label>
                                    <Select options={faculty.map(f => ({ value: f.id, label: `${f.name} ${f.shortCode ? `[${f.shortCode}]` : ''}` }))} value={selectedFaculty2} onChange={setSelectedFaculty2} placeholder="Select Assistant..." />
                                    {renderFacultyLoad(selectedFaculty2)}
                                </div>
                            </div>
                        </div>

                        {/* Status Console Box */}
                        <div className="status-console-box">
                            {/* Console Screen */}
                            <div className={`console-screen ${conflict ? 'state-error' : successMsg ? 'state-success' : 'state-idle'}`}>
                                {isAnalyzing ? (
                                    <div className="console-line"><RefreshCw size={16} className="spin" /> <span>System analyzing schedule conflicts...</span></div>
                                ) : conflict ? (
                                    <div className="console-line"><AlertTriangle size={16} /> <span>Conflict: {conflict.message}</span></div>
                                ) : successMsg ? (
                                    <div className="console-line"><Check size={16} /> <span>Success: {successMsg}</span></div>
                                ) : aiInsight ? (
                                    <div className="console-line"><Brain size={16} /> <span>AI Insight: {aiInsight.message}</span></div>
                                ) : (
                                    <div className="console-line idle"><span>Waiting for input... System ready.</span></div>
                                )}
                            </div>

                            {/* Control Buttons */}
                            <div className="console-controls">
                                <button className="premium-btn clear" onClick={() => { setSelectedSubject(''); setSelectedFaculty(''); setSelectedRoom(''); setSelectedFaculty2(''); setSuccessMsg(''); }}>
                                    <X size={18} /> Clear
                                </button>
                                <button className="premium-btn create" onClick={handleAssign} disabled={saving || !!conflict}>
                                    {saving ? <RefreshCw className="spin" size={18} /> : <Check size={18} />} Create Assignment
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Section: Assignment History */}
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
                    </div>

                    <div className="table-content">
                        <table className="assignments-table">
                            <thead><tr><th>Time</th><th>Subject</th><th>Faculty</th><th>Room</th><th>Group</th><th className="actions-col"></th></tr></thead>
                            <tbody>
                                {filteredAssignments.length > 0 ? filteredAssignments.map((assignment) => (
                                    <tr key={assignment.id} className="table-row-hover">
                                        <td><div className="cell-primary">{assignment.day}</div><div className="cell-secondary"><Clock size={12} /> {assignment.time}</div></td>
                                        <td><div className="cell-primary" title={assignment.subject}>{assignment.subject}</div>{(() => { const sub = subjects.find(s => s.name === assignment.subject); return sub && sub.shortCode ? (<div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px', fontWeight: '500' }}>{sub.shortCode}</div>) : null; })()}</td>
                                        <td><div className="faculty-list"><div className="badge badge-blue"><User size={12} /><span>{assignment.faculty}</span></div>{assignment.faculty2 && (<div className="badge badge-purple"><User size={12} /><span>{assignment.faculty2}</span></div>)}</div></td>
                                        <td><div className="badge badge-pink"><MapPin size={12} /><span>{assignment.room}</span></div></td>
                                        <td><div className="badge badge-green"><Users size={12} /><span>{assignment.dept}-{assignment.section}{assignment.group ? `-${assignment.group}` : ''}</span></div></td>
                                        <td className="actions-col">{assignment.id && canDelete(assignment) && (<button onClick={(e) => handleDelete(e, assignment)} className="icon-btn-danger" title={deletingIds.has(assignment.id) ? "Deleting..." : "Delete"} disabled={deletingIds.has(assignment.id)} style={deletingIds.has(assignment.id) ? { opacity: 0.7, cursor: 'wait' } : {}}>{deletingIds.has(assignment.id) ? (<RefreshCw size={16} className="spin" />) : (<Trash2 size={16} />)}</button>)}</td>
                                    </tr>
                                )) : (<tr><td colSpan="6" className="empty-state"><div className="empty-content"><div className="empty-icon"><Search size={24} /></div><div>No assignments found</div></div></td></tr>)}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>

            {/* Manage Data Modal */}
            {isManageModalOpen && (<div className="modal-overlay"><div className="modal-content glass-panel animate-scale-in"><button onClick={() => setIsManageModalOpen(false)} className="modal-close-btn"><X size={20} /></button><div className="modal-body"><MasterData initialTab={manageModalTab} /></div></div></div>)}

            {/* CSS Styles */}
            <style>{`
                .assignments-container {
                    display: flex;
                    flex-direction: column;
                    min-height: 100vh;
                    gap: 1.5rem;
                    padding: 1rem 2rem 3rem 2rem;
                    color: #fff;
                    overflow-y: auto; /* Allow full page scroll */
                    height: auto;
                }

                .page-subtitle {
                    color: #94a3b8;
                    font-size: 0.9rem;
                    margin-top: 4px;
                }

                /* Panel Styling */

                /* Panel Styling */
                .glass-panel {
                    background: rgba(30, 41, 59, 0.7);
                    backdrop-filter: blur(20px);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 20px;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.2);
                    padding: 1.5rem;
                    overflow: visible; /* Prevent clipping */
                }

                .form-panel {
                    border-top: 4px solid #60a5fa;
                }

                .table-panel {
                    border-top: 4px solid #a78bfa;
                }

                .panel-header {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    margin-bottom: 2rem;
                    padding-bottom: 1rem;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                }

                .panel-header.compact-header {
                   margin-bottom: 1.5rem;
                   padding-bottom: 1rem;
                   justify-content: space-between;
                   align-items: center; /* Enforce center alignment */
                }

                .status-pill {
                   font-size: 0.8rem;
                   font-weight: 500;
                   padding: 6px 14px;
                   border-radius: 99px;
                   background: rgba(255,255,255,0.03);
                   color: #94a3b8;
                   border: 1px solid rgba(255,255,255,0.08);
                   display: flex;
                   align-items: center;
                   gap: 8px;
                   box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                   transition: all 0.3s ease;
                }
                .status-pill.saving { background: rgba(59, 130, 246, 0.1); color: #60a5fa; border-color: rgba(59, 130, 246, 0.2); }
                .status-pill.conflict { background: rgba(239, 68, 68, 0.1); color: #f87171; border-color: rgba(239, 68, 68, 0.2); }
                .status-pill.ready { background: rgba(16, 185, 129, 0.1); color: #34d399; border-color: rgba(16, 185, 129, 0.2); }
                
                .status-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: currentColor;
                    box-shadow: 0 0 8px currentColor;
                }

                /* Compact Form Grid */
                .form-grid-compact {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .form-group-row {
                    display: flex;
                    gap: 12px;
                    width: 100%;
                }

                .form-group {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 5px;
                }

                .form-group label {
                    font-size: 0.9rem;
                    font-weight: 600;
                    color: #cbd5e1; /* Lighter for visibility */
                    margin-left: 2px;
                    margin-bottom: 0.25rem;
                }

                /* Unified Action Bar Alignment */
                .action-bar-unified {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-top: 1.5rem;
                    padding-top: 1rem;
                    border-top: 1px solid rgba(255,255,255,0.05);
                    gap: 1.5rem; /* Increased gap for better separation */
                }

                .feedback-zone {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    min-height: 40px; 
                    /* Ensure it takes space even if empty to align buttons */
                }

                .assignments-content {
                    display: flex;
                    flex-direction: column;
                    gap: 2rem;
                    width: 100%;
                    max-width: 95vw; /* Extended Size to nearly full screen width */
                    margin: 0 auto;
                }


                .mini-alert {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 12px;
                    border-radius: 8px;
                    font-size: 0.85rem;
                    font-weight: 500;
                    width: 100%;
                    animation: fadeIn 0.3s ease;
                }
                
                .mini-alert.analyzing { background: rgba(255,255,255,0.05); color: #94a3b8; }
                .mini-alert.error { background: rgba(239, 68, 68, 0.15); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.2); }
                /* Action Bar Unified overrides */
                .action-bar-unified {
                    background: rgba(0,0,0,0.2);
                    padding: 1rem;
                    border-radius: 12px;
                    margin-top: 1rem;
                }

                /* Table Panel & History Styles */
                .table-panel {
                    border-top: none; /* Remove old border */
                    background: rgba(30, 41, 59, 0.6); /* Slightly more transparent */
                    padding: 0; /* Let content flush */
                    overflow: hidden; /* For rounded corners */
                }

                .table-header-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 1.5rem;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                    background: rgba(30, 41, 59, 0.4);
                    flex-wrap: wrap; /* Allow wrapping on small screens */
                    gap: 1rem;
                }

                .search-wrapper {
                   position: relative;
                   display: flex;
                   align-items: center;
                   width: 300px;
                   max-width: 100%;
                }

                .search-input {
                   width: 100%;
                   padding: 10px 10px 10px 38px;
                   background: rgba(0,0,0,0.2) !important;
                   border: 1px solid rgba(255,255,255,0.05) !important;
                   border-radius: 99px !important;
                   font-size: 0.9rem;
                }
                .search-input:focus {
                   background: rgba(0,0,0,0.4) !important;
                   border-color: rgba(255,255,255,0.1) !important;
                   box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.2);
                }

                .search-icon {
                    position: absolute;
                    left: 12px;
                    color: #94a3b8;
                    pointer-events: none;
                }

                .count-badge {
                    background: rgba(255,255,255,0.1);
                    padding: 2px 8px;
                    border-radius: 12px;
                    font-size: 0.8rem;
                    color: #94a3b8;
                    margin-left: 8px;
                }

                .filters-bar {
                     margin: 0;
                     padding: 1rem 1.5rem;
                     background: rgba(15, 23, 42, 0.3);
                     border-bottom: 1px solid rgba(255,255,255,0.05);
                     display: flex; /* Changed from grid to flex for better control */
                     gap: 1.5rem;   /* Increased gap for positive spacing */
                     align-items: center;
                     flex-wrap: nowrap; /* Keep on one line if possible */
                     overflow-x: auto; /* Allow scroll on very small screens */
                }
                
                .filters-bar > div {
                    flex: 1; /* Make each filter take equal available space */
                    min-width: 150px; /* But don't shrink too much */
                }

                .table-content {

                    overflow-x: auto;
                    width: 100%;
                }

                .assignments-table {
                    width: 100%;
                    border-collapse: separate; /* For border-radius on rows */
                    border-spacing: 0 4px; /* Spacing between rows */
                    padding: 0 1rem 1rem 1rem;
                    min-width: 800px;
                }

                .assignments-table thead th {
                    text-align: left;
                    padding: 1rem;
                    color: #94a3b8;
                    font-size: 0.75rem;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    font-weight: 600;
                }

                .assignments-table tbody tr {
                    background: rgba(255, 255, 255, 0.03);
                    transition: all 0.2sease;
                }

                .assignments-table tbody tr:hover {
                    background: rgba(255, 255, 255, 0.08); /* Brighter hover */
                    transform: scale(1.005); /* Subtle pop */
                    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                }

                .assignments-table td {
                    padding: 1rem;
                    font-size: 0.9rem;
                    vertical-align: middle;
                    border-top: 1px solid rgba(255,255,255,0.02);
                    border-bottom: 1px solid rgba(255,255,255,0.02);
                }
                
                .assignments-table td:first-child {
                    border-top-left-radius: 8px;
                    border-bottom-left-radius: 8px;
                    border-left: 1px solid rgba(255,255,255,0.02);
                }
                .assignments-table td:last-child {
                    border-top-right-radius: 8px;
                    border-bottom-right-radius: 8px;
                    border-right: 1px solid rgba(255,255,255,0.02);
                }

                /* --- PREMIUM FORM STYLES --- */
                .premium-form-panel {
                    padding: 2.5rem !important; /* Restored Spacing */
                    background: linear-gradient(160deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%) !important;
                    border: 1px solid rgba(255,255,255,0.08);
                    box-shadow: 0 20px 40px -10px rgba(0,0,0,0.5) !important;
                    width: 100% !important;
                    max-width: 100% !important;
                    box-sizing: border-box;
                }

                .premium-table-panel {
                     background: linear-gradient(160deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%) !important;
                     border: 1px solid rgba(255,255,255,0.08);
                     box-shadow: 0 20px 40px -10px rgba(0,0,0,0.5) !important;
                     padding: 0 !important; /* Reset padding for full-width table */
                     overflow: hidden;
                }

                .form-grid-premium {
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem; /* Increased vertical gap */
                    margin-bottom: 2.5rem;
                }

                .form-group-row {
                    display: flex;
                    gap: 1.5rem; /* Increased horizontal gap */
                    width: 100%;
                }

                /* Premium Status Console */
                .status-console-box {
                    background: rgba(4, 7, 13, 0.6);
                    border-radius: 16px;
                    padding: 1.5rem 2rem;
                    border: 1px solid rgba(255,255,255,0.05);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    box-shadow: inset 0 2px 10px rgba(0,0,0,0.4);
                    min-height: 80px;
                    gap: 2rem;
                }

                .console-screen {
                    flex: 1;
                    font-family: 'JetBrains Mono', 'Fira Code', monospace;
                    font-size: 0.95rem;
                    display: flex;
                    align-items: center;
                    padding-right: 1rem;
                }

                .console-line {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    animation: slideInRight 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }

                .console-screen.idle { color: #475569; }
                .console-screen.state-error { color: #f87171; }
                .console-screen.state-success { color: #4ade80; }
                .console-screen.state-idle span { opacity: 0.6; }

                /* Premium Buttons */
                .console-controls {
                    display: flex;
                    gap: 1rem;
                }

                .premium-btn {
                    padding: 0.75rem 1.5rem;
                    border-radius: 10px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 0.9rem;
                    letter-spacing: 0.02em;
                }

                .premium-btn.clear {
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    color: #94a3b8;
                }
                .premium-btn.clear:hover {
                    background: rgba(255, 255, 255, 0.1);
                    color: #fff;
                    transform: translateY(-1px);
                }

                .premium-btn.create {
                    background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
                    border: none;
                    color: #0f172a;
                    box-shadow: 0 4px 12px rgba(255, 255, 255, 0.1);
                }
                .premium-btn.create:hover:not(:disabled) {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 20px rgba(255, 255, 255, 0.2);
                }
                .premium-btn.create:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                    background: #334155;
                    color: #64748b;
                    box-shadow: none;
                }

                @keyframes slideInRight {
                    from { opacity: 0; transform: translateX(-10px); }
                    to { opacity: 1; transform: translateX(0); }
                }

                /* Hide scrollbar for clean look */
                .assignments-container::-webkit-scrollbar {
                  width: 8px;
                }
                .assignments-container::-webkit-scrollbar-track {
                  background: rgba(0,0,0,0.1);
                }
                .assignments-container::-webkit-scrollbar-thumb {
                  background: rgba(255,255,255,0.1);
                  border-radius: 4px;
                }


                .cell-primary {
                    font-weight: 600;
                    color: #f1f5f9;
                    margin-bottom: 2px;
                }
                .cell-secondary {
                    color: #94a3b8;
                    font-size: 0.8rem;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 4px 10px;
                    border-radius: 6px;
                    font-size: 0.8rem;
                    font-weight: 500;
                    white-space: nowrap;
                    border: 1px solid transparent;
                }
                
                .badge-blue { background: rgba(59, 130, 246, 0.15); color: #93c5fd; border-color: rgba(59, 130, 246, 0.2); }
                .badge-purple { background: rgba(168, 85, 247, 0.15); color: #d8b4fe; border-color: rgba(168, 85, 247, 0.2); }
                .badge-pink { background: rgba(236, 72, 153, 0.15); color: #f9a8d4; border-color: rgba(236, 72, 153, 0.2); }
                .badge-green { background: rgba(16, 185, 129, 0.15); color: #6ee7b7; border-color: rgba(16, 185, 129, 0.2); }

                .faculty-list {
                     display: flex;
                     flex-direction: column;
                     gap: 4px;
                }

                .icon-btn-danger {
                    background: rgba(239, 68, 68, 0.1);
                    color: #f87171;
                    border: none;
                    width: 32px;
                    height: 32px;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .icon-btn-danger:hover {
                    background: rgba(239, 68, 68, 0.2);
                    transform: scale(1.1);
                    color: #fca5a5;
                }

                .empty-state {
                    text-align: center;
                    padding: 4rem 2rem !important; /* Force padding */
                    background: transparent !important; /* No row background */
                }
                
                .empty-content {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 1rem;
                    color: #64748b;
                }

                .empty-icon {
                    width: 64px;
                    height: 64px;
                    border-radius: 50%;
                    background: rgba(255,255,255,0.03);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                /* Scrollbar styling for table content */
                .table-content::-webkit-scrollbar { height: 8px; }
                .table-content::-webkit-scrollbar-track { background: transparent; }
                .table-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
                .table-content::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }



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

                /* Tab Switcher Removed */
                    display: flex;
                    background: rgba(255,255,255,0.05);
                    padding: 4px;
                    border-radius: 12px;
                    gap: 4px;
                }

                .tab-btn {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 16px;
                    border-radius: 8px;
                    background: transparent;
                    color: #94a3b8;
                    border: none;
                    cursor: pointer;
                    font-size: 0.85rem;
                    font-weight: 500;
                    transition: all 0.2s;
                }

                .tab-btn.active {
                    background: rgba(255,255,255,0.1);
                    color: white;
                    font-weight: 600;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                }

                .assignments-content {
                    display: flex;
                    flex-direction: column;
                    flex: 1;
                    overflow: hidden;
                    padding: 0.5rem;
                }

                /* Form Panel */
                .form-panel {
                    flex: 1;
                    padding: 1.5rem;
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                    overflow-y: auto;
                    background: linear-gradient(145deg, rgba(30, 41, 59, 0.6), rgba(15, 23, 42, 0.6));
                    border: 1px solid rgba(255,255,255,0.08);
                    backdrop-filter: blur(12px);
                    max-width: 800px;
                    margin: 0 auto;
                    width: 100%;
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
                    background: #0f172a;
                    z-index: 50 !important;
                    box-shadow: -4px 0 12px -4px rgba(0,0,0,0.5);
                    width: 48px;
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
                /* Global Responsiveness Fixes */
                @media (max-width: 1024px) {
                    .assignments-container {
                        padding: 1rem;
                    }
                    .filters-bar {
                        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
                    }
                }

                @media (max-width: 768px) {
                     .form-grid-compact > div {
                        flex-direction: column;
                        gap: 10px;
                     }
                     .action-bar-unified {
                        flex-direction: column;
                        align-items: stretch;
                        gap: 1rem;
                     }
                     .button-group-compact {
                        justify-content: stretch;
                     }
                     .button-group-compact button {
                        flex: 1;
                        justify-content: center;
                     }
                     .feedback-zone {
                        width: 100%;
                     }
                     .panel-header {
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 10px;
                     }
                     .status-pill {
                        align-self: flex-start;
                     }
                }
            `}</style>
        </div >
    );
};

export default Assignments;
