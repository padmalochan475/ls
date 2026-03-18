import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, getDoc, setDoc, updateDoc, deleteDoc, doc, query, writeBatch, orderBy, onSnapshot, or, where, and } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useMasterData } from '../contexts/MasterDataContext';
import QuantumLoader from '../components/QuantumLoader';
import { Plus, Search, Edit2, Trash2, Printer, Upload, Download, Users, ArrowRight, UserCheck, FileText, CheckCircle, X, ShieldAlert, Layers } from 'lucide-react';
import toast from 'react-hot-toast';
import '../styles/design-system.css';
import GroupManager from './GroupManager';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
// ExcelJS removed

const Students = () => {
    const { userProfile, activeAcademicYear } = useAuth();
    const isAdmin = userProfile && userProfile.role === 'admin';
    const { departments, semesters, groups, subjects } = useMasterData();
    const [activeTab, setActiveTab] = useState('manage'); // manage, attendance, promote
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterBatch, setFilterBatch] = useState('');
    const [filterSem, setFilterSem] = useState('');
    const [filterSection] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    // --- Data Fetching (Real-time) ---
    // --- Data Fetching (Surgical & One-time) ---
    const fetchStudents = async () => {
        setLoading(true);
        try {
            const studentRef = collection(db, 'students');
            const filters = [];
            const sorting = [orderBy('regNo')];

            // --- SURGICAL FILTERS ---
            if (filterBatch && filterBatch !== 'All Batches') {
                filters.push(or(
                    where('branch', '==', filterBatch),
                    where('section', '==', filterBatch)
                ));
            }
            if (filterSem && filterSem !== 'All Semesters') {
                filters.push(where('semester', '==', filterSem));
            }

            let q;
            if (filters.length > 1) {
                q = query(studentRef, and(...filters), ...sorting);
            } else if (filters.length === 1) {
                q = query(studentRef, filters[0], ...sorting);
            } else {
                q = query(studentRef, ...sorting);
            }
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setStudents(data);
        } catch (error) {
            console.error('Surgical Fetch Error (likely missing index):', error);
            // Fallback: If index is missing, fetch with simple filter or everything and sort in memory
            try {
                const studentRef = collection(db, 'students');
                let qFallback;
                if (filterSem && filterSem !== 'All Semesters') {
                    qFallback = query(studentRef, where('semester', '==', filterSem));
                } else if (filterBatch && filterBatch !== 'All Batches') {
                    qFallback = query(studentRef, where('branch', '==', filterBatch));
                } else {
                    qFallback = query(studentRef);
                }
                const snapshot = await getDocs(qFallback);
                const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                // Manual sort if server-side sort failed
                data.sort((a,b) => (a.regNo || '').localeCompare(b.regNo || ''));
                setStudents(data);
            } catch (e) {
                toast.error('Failed to load students surgicaly.');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStudents();
    }, [filterBatch, filterSem]); // Refresh whenever filters change


    // --- Manage Tab Logic ---
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingStudent, setEditingStudent] = useState(null);
    const [formData, setFormData] = useState({});

    // Import State
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);

    // eslint-disable-next-line sonarjs/cognitive-complexity
    const handleSaveStudent = async (e) => {
        e.preventDefault();
        try {
            const safeRegNo = String(formData.regNo).trim().toUpperCase();
            if (!safeRegNo) { toast.error("Reg No is required"); return; }

            const docId = safeRegNo.replace(/[^a-zA-Z0-9]/g, '_');
            const data = {
                ...formData,
                regNo: safeRegNo,
                name: String(formData.name).toUpperCase(),
                status: formData.status || 'active', // 'active', 'tc', 'alumni'
                isLateral: formData.isLateral || false,
                updatedAt: new Date().toISOString()
            };

            const ref = doc(db, 'students', docId);

            if (editingStudent) {
                // If ID changes (RegNo edit), we need to delete old doc!
                if (editingStudent.id !== docId) {
                    // Check if new ID already exists to avoid overwriting someone else
                    const snap = await getDoc(ref);
                    if (snap.exists() && !window.confirm(`Warning: RegNo ${safeRegNo} already exists. Overwrite?`)) return;

                    const batch = writeBatch(db);
                    batch.delete(doc(db, 'students', editingStudent.id)); // Delete old
                    batch.set(ref, data); // Create new
                    await batch.commit();
                } else {
                    await updateDoc(ref, data);
                }
                toast.success("Student updated");
            } else {
                // Check if exists
                const snap = await getDoc(ref);
                if (snap.exists()) {
                    if (!window.confirm(`Student with RegNo ${safeRegNo} already exists. Update their details?`)) return;
                    await updateDoc(ref, data);
                    toast.success("Student updated (duplicate merge)");
                } else {
                    await setDoc(ref, { ...data, createdAt: new Date().toISOString() });
                    toast.success("Student added successfully");
                }
            }
            setIsAddModalOpen(false);
            setEditingStudent(null);
            setFormData({});
            fetchStudents(); // Manual Refresh
        } catch (error) {
            console.error(error);
            toast.error("Error saving student");
        }
    };

    const handleDeleteStudent = async (id) => {
        if (!window.confirm("Are you sure?")) return;
        try {
            await deleteDoc(doc(db, 'students', id));
            toast.success("Student deleted");
            fetchStudents(); // Manual Refresh
        } catch (error) {
            toast.error("Error deleting student");
        }
    };

    // --- CSV Import ---


    // Print logic extracted or handled elsewhere

    // --- Filtering Logic ---
    const filteredStudents = students.filter(s => {
        const search = searchTerm.toLowerCase();
        const matchesSearch = !searchTerm || (
            s.name?.toLowerCase().includes(search) ||
            s.regNo?.toLowerCase().includes(search) ||
            (s.rollNo && s.rollNo.toString().includes(search)) ||
            (s.rollno && s.rollno.toString().includes(search))
        );

        // Token-Aware Batch Matching: Handles combined sections
        const matchesBatch = !filterBatch ||
            s.section === filterBatch ||
            (s.section && (
                s.section.toUpperCase().split(/[/_\-\s]+/).some(part => part.trim() === filterBatch.toUpperCase()) ||
                s.section.toUpperCase().includes(filterBatch.toUpperCase())
            ));

        return matchesBatch &&
            (!filterSem || s.semester == filterSem) &&
            (!filterSection || s.section === filterSection) &&
            matchesSearch;
    }).sort((a, b) => {
        // Priority 1: Group by Batch if no explicit batch filter is set
        if (!filterBatch && a.section !== b.section) {
            return (a.section || '').localeCompare(b.section || '');
        }

        // Priority 2: Group by Semester if no explicit sem filter is set
        if (!filterSem && a.semester !== b.semester) {
            const semA = parseInt(a.semester || '0');
            const semB = parseInt(b.semester || '0');
            if (semA !== semB) return semA - semB;
        }

        // Priority 3: Numeric Roll No (College sequence)
        const rollA = parseInt(a.rollNo || a.rollno || '0');
        const rollB = parseInt(b.rollNo || b.rollno || '0');
        if (rollA && rollB && rollA !== rollB) return rollA - rollB;

        // Priority 4: Reg No
        return (a.regNo || '').localeCompare(b.regNo || '');
    });

    // --- Render Methods ---
    // --- Render Methods ---
    return (
        <>
            <div className="fade-in-up" style={{ width: '100%', margin: '0 auto', paddingBottom: '4rem' }}>
                <style>{`
                .glass-select {
                    appearance: none;
                    background-color: rgba(15, 23, 42, 0.6) !important;
                    background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
                    background-position: right 0.75rem center;
                    background-repeat: no-repeat;
                    background-size: 1.25em 1.25em;
                    padding: 12px 16px !important;
                    padding-right: 2.5rem !important;
                    border: 1px solid rgba(255, 255, 255, 0.1) !important;
                    border-radius: 14px !important;
                    color: white !important;
                    font-size: 0.95rem;
                    outline: none;
                    transition: all 0.2s;
                    cursor: pointer;
                    width: 100%;
                }
                .glass-select:focus {
                    border-color: #3b82f6 !important;
                    background-color: rgba(15, 23, 42, 0.8) !important;
                    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
                }
                .glass-select option {
                    background-color: #0f172a;
                    color: white;
                    padding: 10px;
                }
                
                .glass-input {
                    background: rgba(15, 23, 42, 0.4) !important;
                    border: 1px solid rgba(255, 255, 255, 0.1) !important;
                    color: white !important;
                    padding: 12px 16px !important;
                    border-radius: 14px !important;
                    outline: none;
                    transition: all 0.2s;
                    width: 100%;
                }
                .glass-input:focus {
                    border-color: #3b82f6 !important;
                    background: rgba(15, 23, 42, 0.6) !important;
                    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
                }
                
                .modal-overlay {
                    position: fixed;
                    top: 0; 
                    left: 0;
                    right: 0; 
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.7);
                    backdrop-filter: blur(8px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 99999;
                    animation: fadeIn 0.2s ease-out;
                }
                
                .modal-content {
                    animation: scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                    border: 1px solid rgba(255,255,255,0.1);
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                }

                @keyframes scaleUp {
                    from { transform: scale(0.95); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
                
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                
                .label-text {
                    display: block;
                    margin-bottom: 0.5rem;
                    color: #94a3b8;
                    font-size: 0.85rem;
                    font-weight: 500;
                    margin-left: 4px;
                }
            `}</style>

                {/* Header & Stats Area */}
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '1.5rem',
                    marginBottom: '2.5rem',
                    position: 'relative'
                }}>
                    <div>
                        <div style={{
                            textTransform: 'uppercase',
                            letterSpacing: '2px',
                            fontSize: '0.85rem',
                            color: '#64748b',
                            fontWeight: 600,
                            marginBottom: '0.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <span style={{ width: '8px', height: '8px', background: '#3b82f6', borderRadius: '50%', display: 'inline-block' }}></span>
                            Academic Records
                        </div>
                        <h1 className="page-title" style={{
                            fontSize: '3.5rem',
                            fontWeight: 800,
                            margin: 0,
                            lineHeight: 1.1,
                            letterSpacing: '-1px'
                        }}>
                            <span style={{ background: 'linear-gradient(to right, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                                Student
                            </span>
                            <br />
                            <span style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2dd4bf 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 20px rgba(59, 130, 246, 0.3))' }}>
                                Directory
                            </span>
                        </h1>
                    </div>

                    {/* Glass Tab Switcher */}
                    <div className="mobile-scroll-tabs" style={{
                        background: 'rgba(15, 23, 42, 0.6)',
                        backdropFilter: 'blur(12px)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        padding: '6px',
                        borderRadius: '20px',
                        display: 'flex',
                        flexWrap: 'nowrap',
                        gap: '4px',
                        boxShadow: '0 20px 40px -10px rgba(0,0,0,0.3)'
                    }}>
                        {[
                            { id: 'manage', label: 'Directory', icon: Users },
                            { id: 'attendance', label: 'Attendance', icon: FileText },
                            ...(isAdmin ? [{ id: 'groups', label: 'Groups & SL', icon: Layers }] : []),
                            ...(isAdmin ? [{ id: 'promote', label: 'Promotions', icon: ArrowRight }] : [])
                        ].map(tab => {
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    style={{
                                        position: 'relative',
                                        padding: '12px 28px',
                                        borderRadius: '16px',
                                        border: 'none',
                                        background: isActive ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : 'transparent',
                                        color: isActive ? 'white' : '#94a3b8',
                                        fontWeight: isActive ? 600 : 500,
                                        cursor: 'pointer',
                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        fontSize: '0.95rem',
                                        overflow: 'hidden'
                                    }}
                                >
                                    {isActive && (
                                        <div style={{
                                            position: 'absolute',
                                            inset: 0,
                                            background: 'url("https://grainy-gradients.vercel.app/noise.svg")',
                                            opacity: 0.2,
                                            mixBlendMode: 'overlay'
                                        }}></div>
                                    )}
                                    <tab.icon size={18} style={{ position: 'relative', zIndex: 1 }} />
                                    <span style={{ position: 'relative', zIndex: 1 }}>{tab.label}</span>
                                    {isActive && (
                                        <div style={{
                                            position: 'absolute',
                                            bottom: '-10px',
                                            left: '50%',
                                            transform: 'translateX(-50%)',
                                            width: '40%',
                                            height: '10px',
                                            background: 'white',
                                            filter: 'blur(15px)',
                                            opacity: 0.4,
                                            borderRadius: '50%'
                                        }}></div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* MANAGE TAB CONTENT */}
                {activeTab === 'manage' && (
                    <>
                        {/* Floating Control Bar */}
                        {/* Floating Control Bar */}
                        <div className="glass-panel" style={{
                            marginBottom: '2rem',
                            padding: '1.25rem',
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '1.5rem',
                            alignItems: 'center',
                            border: '1px solid rgba(255,255,255,0.08)',
                            background: 'rgba(15, 23, 42, 0.8)',
                            backdropFilter: 'blur(20px)',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                            borderRadius: '24px'
                        }}>
                            {/* Search Input */}
                            <div style={{ flex: '1 1 300px', minWidth: '0', position: 'relative' }}>
                                <Search size={20} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                <input
                                    placeholder="Search students..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    style={{
                                        width: '100%',
                                        background: 'rgba(0,0,0,0.3)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        padding: '14px 16px 14px 48px',
                                        borderRadius: '16px',
                                        color: 'white',
                                        fontSize: '1rem',
                                        outline: 'none',
                                        transition: 'all 0.2s',
                                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
                                    }}
                                    onFocus={(e) => {
                                        e.target.style.background = 'rgba(0,0,0,0.5)';
                                        e.target.style.borderColor = '#3b82f6';
                                        e.target.style.boxShadow = '0 0 0 4px rgba(59, 130, 246, 0.1)';
                                    }}
                                    onBlur={(e) => {
                                        e.target.style.background = 'rgba(0,0,0,0.3)';
                                        e.target.style.borderColor = 'rgba(255,255,255,0.1)';
                                        e.target.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.1)';
                                    }}
                                />
                            </div>

                            {/* Filters */}
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', flex: '1 1 auto' }}>
                                <style>{`
                                .custom-select {
                                    appearance: none;
                                    background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
                                    background-position: right 0.5rem center;
                                    background-repeat: no-repeat;
                                    background-size: 1.5em 1.5em;
                                    padding-right: 2.5rem !important;
                                }
                                .custom-select option {
                                    background-color: #0f172a;
                                    color: white;
                                    padding: 8px;
                                }
                            `}</style>

                                <select
                                    value={filterBatch}
                                    onChange={e => setFilterBatch(e.target.value)}
                                    className="custom-select"
                                    style={{
                                        flex: 1,
                                        minWidth: '140px',
                                        backgroundColor: 'rgba(0,0,0,0.3)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '16px',
                                        padding: '14px 16px',
                                        color: 'white',
                                        fontSize: '0.95rem',
                                        cursor: 'pointer',
                                        outline: 'none',
                                        transition: 'all 0.2s'
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                                    onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                                >
                                    <option value="">All Batches</option>
                                    {groups.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                                </select>

                                <select
                                    value={filterSem}
                                    onChange={e => setFilterSem(e.target.value)}
                                    className="custom-select"
                                    style={{
                                        flex: 1,
                                        minWidth: '120px',
                                        backgroundColor: 'rgba(0,0,0,0.3)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '16px',
                                        padding: '14px 16px',
                                        color: 'white',
                                        fontSize: '0.95rem',
                                        cursor: 'pointer',
                                        outline: 'none',
                                        transition: 'all 0.2s'
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                                    onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                                >
                                    <option value="">All Semesters</option>
                                    {semesters.map(s => <option key={s.id} value={s.number}>Sem {s.number}</option>)}
                                </select>
                            </div>

                            {/* Actions */}
                            {isAdmin && (
                                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', flex: '1 1 auto', justifyContent: 'flex-end' }}>
                                    <button
                                        className="btn"
                                        onClick={() => setIsImportModalOpen(true)}
                                        style={{
                                            background: 'rgba(255,255,255,0.05)',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            color: '#cbd5e1',
                                            padding: '12px 20px',
                                            borderRadius: '14px',
                                            fontWeight: 500,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flex: '1 1 120px',
                                            gap: '8px',
                                            whiteSpace: 'nowrap',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'white'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#cbd5e1'; }}
                                    >
                                        <Upload size={18} />
                                        Import
                                    </button>
                                    <button
                                        className="btn"
                                        onClick={() => { setEditingStudent(null); setFormData({}); setIsAddModalOpen(true); }}
                                        style={{
                                            background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                                            boxShadow: '0 4px 15px rgba(37, 99, 235, 0.3)',
                                            border: 'none',
                                            color: 'white',
                                            padding: '12px 24px',
                                            borderRadius: '14px',
                                            fontWeight: 600,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flex: '1 1 120px',
                                            gap: '8px',
                                            whiteSpace: 'nowrap',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(37, 99, 235, 0.4)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(37, 99, 235, 0.3)'; }}
                                    >
                                        <Plus size={18} />
                                        Add Student
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Data Table */}
                        <div className="glass-panel" style={{ padding: '0', border: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
                            <div className="table-responsive" style={{ overflowX: 'auto', width: '100%' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px', tableLayout: 'auto' }}>
                                    <thead>
                                        <tr style={{
                                            background: 'rgba(255,255,255,0.02)',
                                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                                            textAlign: 'left',
                                            backdropFilter: 'blur(10px)'
                                        }}>
                                            <th style={{ padding: '1.2rem 1.5rem', color: '#94a3b8', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, width: '8%' }}>{filterBatch ? 'Roll No' : 'Sl No'}</th>
                                            <th style={{ padding: '1.2rem 1.5rem', color: '#94a3b8', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, width: '15%' }}>Regd No</th>
                                            <th style={{ padding: '1.2rem 1.5rem', color: '#94a3b8', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, width: '25%' }}>Name</th>
                                            <th style={{ padding: '1.2rem 1.5rem', color: '#94a3b8', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, width: '22%' }}>Branch</th>
                                            <th style={{ padding: '1.2rem 1.5rem', color: '#94a3b8', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, width: '8%' }}>Sem</th>
                                            <th style={{ padding: '1.2rem 1.5rem', color: '#94a3b8', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, width: '10%' }}>Section</th>
                                            <th style={{ padding: '1.2rem 1.5rem', color: '#94a3b8', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, width: '12%' }}>Status</th>
                                            {isAdmin && <th style={{ padding: '1.2rem 1.5rem', color: '#94a3b8', textAlign: 'right', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>Actions</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading ? (
                                            <tr><td colSpan="7" style={{ textAlign: 'center', padding: '4rem' }}><QuantumLoader size={50} /></td></tr>
                                        ) : filteredStudents.map((student, idx) => (
                                            <tr key={student.id}
                                                className="table-row-hover"
                                                style={{
                                                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                                                    transition: 'all 0.2s',
                                                    background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.005)'
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.05)'}
                                                onMouseLeave={(e) => e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.005)'}
                                            >
                                                <td style={{ padding: '1.2rem 1.5rem', color: '#f59e0b', fontWeight: 600 }}>
                                                    {filterBatch ? (student.rollNo || student.rollno || '--') : (idx + 1)}
                                                </td>
                                                <td style={{ padding: '1.2rem 1.5rem', fontFamily: 'monospace', color: '#e2e8f0', fontWeight: 500, fontSize: '0.95rem' }}>
                                                    {student.regNo}
                                                </td>
                                                <td style={{ padding: '1.2rem 1.5rem', color: 'white', fontWeight: 500 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <div style={{ width: '32px', height: '32px', background: 'linear-gradient(135deg, #4f46e5, #818cf8)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: 'white' }}>
                                                            {student.name.charAt(0)}
                                                        </div>
                                                        {student.name}
                                                        {student.isLateral && <span className="badge-lateral">LE</span>}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '1.2rem 1.5rem', color: '#cbd5e1' }}>{student.branch}</td>
                                                <td style={{ padding: '1.2rem 1.5rem', color: '#cbd5e1' }}>{student.semester}</td>
                                                <td style={{ padding: '1.2rem 1.5rem' }}>
                                                    <span style={{
                                                        padding: '4px 10px',
                                                        background: 'rgba(255,255,255,0.1)',
                                                        borderRadius: '6px',
                                                        fontSize: '0.85rem',
                                                        color: '#cbd5e1'
                                                    }}>
                                                        {student.section}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '1.2rem 1.5rem' }}>
                                                    { }
                                                    {student.status === 'tc' ? (
                                                        <span style={{ padding: '4px 12px', background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                                            Transferred
                                                        </span>
                                                    ) : student.status === 'alumni' ? ( // eslint-disable-line sonarjs/no-nested-conditional
                                                        <span style={{ padding: '4px 12px', background: 'rgba(168, 85, 247, 0.1)', color: '#d8b4fe', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, border: '1px solid rgba(168, 85, 247, 0.2)' }}>
                                                            Alumni
                                                        </span>
                                                    ) : (
                                                        <span style={{ padding: '4px 12px', background: 'rgba(34, 197, 94, 0.1)', color: '#4ade80', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                                                            Active
                                                        </span>
                                                    )}
                                                </td>
                                                {isAdmin && (
                                                    <td style={{ padding: '1.2rem 1.5rem', textAlign: 'right' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', opacity: 0.8 }}>
                                                            <button
                                                                onClick={() => { setEditingStudent(student); setFormData(student); setIsAddModalOpen(true); }}
                                                                className="icon-btn"
                                                                style={{ padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', color: '#60a5fa', border: 'none', cursor: 'pointer', transition: 'all 0.2s' }}
                                                                onMouseEnter={(e) => { e.currentTarget.style.background = '#60a5fa'; e.currentTarget.style.color = 'white'; }}
                                                                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#60a5fa'; }}
                                                            >
                                                                <Edit2 size={16} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteStudent(student.id)}
                                                                className="icon-btn"
                                                                style={{ padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', color: '#f87171', border: 'none', cursor: 'pointer', transition: 'all 0.2s' }}
                                                                onMouseEnter={(e) => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = 'white'; }}
                                                                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#f87171'; }}
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {filteredStudents.length === 0 && !loading && (
                                <div style={{ padding: '6rem', textAlign: 'center', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{
                                        width: '80px', height: '80px',
                                        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(168, 85, 247, 0.1))',
                                        borderRadius: '50%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        boxShadow: '0 0 40px rgba(59, 130, 246, 0.1)'
                                    }}>
                                        <Search size={32} color="#60a5fa" />
                                    </div>
                                    <h3 style={{ margin: '1rem 0 0.5rem', color: 'white', fontSize: '1.2rem' }}>No students found</h3>
                                    <p style={{ maxWidth: '300px', margin: '0 auto', fontSize: '0.9rem' }}>Try adjusting your search or filters to find what you're looking for.</p>
                                    <button
                                        onClick={() => { setSearchTerm(''); setFilterBatch(''); setFilterSem(''); }}
                                        style={{
                                            marginTop: '1rem',
                                            padding: '8px 20px',
                                            borderRadius: '20px',
                                            background: 'rgba(255,255,255,0.05)',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            color: 'white',
                                            cursor: 'pointer',
                                            fontSize: '0.9rem'
                                        }}
                                    >
                                        Clear Filters
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                )}
                <style>{`
                .badge-lateral {
                    font-size: 0.65rem;
                    padding: 2px 6px;
                    border-radius: 4px;
                    background: rgba(245, 158, 11, 0.2);
                    color: #f59e0b;
                    border: 1px solid rgba(245, 158, 11, 0.3);
                }
                .table-row-hover:hover {
                    background: rgba(255, 255, 255, 0.05) !important;
                }
            `}</style>

                {/* ATTENDANCE TAB */}
                {activeTab === 'attendance' && (
                    <AttendanceGenerator
                        students={students.filter(s => s.status === 'active')} // only active, exclude tc & alumni
                        departments={departments}
                        semesters={semesters}
                        groups={groups}
                        subjects={subjects}
                        isAdmin={isAdmin}
                    />
                )}

                {/* PROMOTIONS TAB */}
                {activeTab === 'promote' && (
                    <PromotionManager
                        students={students.filter(s => s.status !== 'tc')} // FILTER OUT TC STUDENTS
                        departments={departments}
                        semesters={semesters}
                        refresh={() => window.location.reload()}
                    />
                )}
                {/* GROUPS TAB */}
                {activeTab === 'groups' && (
                    <GroupManager allStudents={students} />
                )}
            </div>

            {/* ADD/EDIT MODAL */}
            {isAddModalOpen && (
                <div className="modal-overlay" onClick={() => setIsAddModalOpen(false)}>
                    <div className="modal-content glass-panel animate-zoom-in" onClick={e => e.stopPropagation()} style={{ width: '500px', position: 'relative', padding: '2.5rem', maxHeight: '90vh', overflowY: 'auto', paddingBottom: '3.5rem' }}>
                        {/* Close Button */}
                        <button
                            onClick={() => setIsAddModalOpen(false)}
                            style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', padding: '8px', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.2s' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'; e.currentTarget.style.color = '#ef4444'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#94a3b8'; }}
                        >
                            <X size={20} />
                        </button>

                        <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {editingStudent ? <Edit2 size={24} color="var(--color-accent)" /> : <Plus size={24} color="var(--color-accent)" />}
                            {editingStudent ? 'Edit Student Details' : 'Register New Student'}
                        </h2>
                        <form onSubmit={handleSaveStudent} style={{ display: 'grid', gap: '1rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '1rem' }}>
                                <input className="glass-input" placeholder="Roll No" value={formData.rollNo || formData.rollno || ''} onChange={e => setFormData({ ...formData, rollNo: e.target.value })} style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }} />
                                <input className="glass-input" placeholder="Regd No" value={formData.regNo || ''} onChange={e => setFormData({ ...formData, regNo: e.target.value })} required />
                            </div>
                            <input className="glass-input" placeholder="Full Name" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <select className="glass-select" value={formData.branch || ''} onChange={e => setFormData({ ...formData, branch: e.target.value })} required>
                                    <option value="">Select Branch</option>
                                    {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                                </select>
                                <select className="glass-select" value={formData.semester || ''} onChange={e => setFormData({ ...formData, semester: e.target.value })} required>
                                    <option value="">Select Sem</option>
                                    {semesters.map(s => <option key={s.id} value={s.number}>{s.number}</option>)}
                                </select>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <select className="glass-select" value={formData.section || ''} onChange={e => setFormData({ ...formData, section: e.target.value })} required>
                                    <option value="">Select Section</option>
                                    {groups.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                                </select>
                                <input className="glass-input" placeholder="Group (e.g. 1)" value={formData.group || ''} onChange={e => setFormData({ ...formData, group: e.target.value })} />
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={formData.isLateral || false}
                                        onChange={e => setFormData({ ...formData, isLateral: e.target.checked })}
                                        style={{ accentColor: 'var(--color-accent)', width: '16px', height: '16px' }}
                                    />
                                    Lateral Entry?
                                </label>
                            </div>

                            <div style={{ marginTop: '0.5rem' }}>
                                <label className="label-text">Status</label>
                                <select className="glass-select" value={formData.status || 'active'} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                                    <option value="active">Active</option>
                                    <option value="tc">TC / Left / Dropped</option>
                                    <option value="alumni">Alumni</option>
                                </select>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                                <button type="button" className="btn" onClick={() => setIsAddModalOpen(false)} style={{ flex: 1, padding: '12px 24px', background: 'rgba(255,255,255,0.05)', color: 'var(--color-text)' }}>Cancel</button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1, padding: '12px 24px', borderRadius: '14px', fontWeight: 600 }}>Save Student</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* IMPORT MODAL */}
            {isImportModalOpen && (
                <ImportModal
                    onClose={() => setIsImportModalOpen(false)}
                    departments={departments}
                    semesters={semesters}
                    groups={groups}
                    activeAcademicYear={activeAcademicYear}
                />
            )}
        </>
    );
};

// --- Import Modal Component ---
// eslint-disable-next-line sonarjs/cognitive-complexity
const ImportModal = ({ onClose, departments: propDepartments, semesters: propSemesters, groups: propGroups, activeAcademicYear }) => {
    // Pull directly from context as a fallback to ensure dropdowns always have data
    const { departments: ctxDepts, semesters: ctxSems, groups: ctxGroups, loading: ctxLoading } = useMasterData();
    const { userProfile } = useAuth();
    const departments = (propDepartments && propDepartments.length > 0) ? propDepartments : ctxDepts;
    const semesters = (propSemesters && propSemesters.length > 0) ? propSemesters : ctxSems;
    const groups = (propGroups && propGroups.length > 0) ? propGroups : ctxGroups;

    // ── Helper: get branch short code from master data ──────────────────────
    const getBranchCode = (branchName) => {
        const dept = departments.find(d => d.name === branchName || d.shortCode === branchName);
        return dept?.shortCode || dept?.code || branchName;
    };

    // ── Helper: robustly match raw strings to master departments ────────────
    const matchDepartment = (rawString) => {
        if (!rawString) return null;
        const sUpper = String(rawString).toUpperCase().trim();

        // 1. Try exact exact word match on short codes (to prevent "IT" matching inside "CSIT")
        const words = sUpper.split(/[\s/\-_:()+]+/).filter(Boolean);
        for (const d of departments) {
            const dCode = String(d.shortCode || d.code || '').toUpperCase();
            if (dCode && words.includes(dCode)) return d;
        }

        // 2. Try regular includes match
        for (const d of departments) {
            const dCode = String(d.shortCode || d.code || '').toUpperCase();
            if (dCode && sUpper.includes(dCode)) return d;
        }

        // 3. Name-based match 
        for (const d of departments) {
            const dName = String(d.name).toUpperCase();
            if (sUpper === dName || sUpper.includes(dName) || dName.includes(sUpper)) return d;
        }
        return null;
    };

    // ── Helper: resolve section redundancy and extract smart section codes ──────────────────
    // Example: "CSIT-A" or "CSDS/CSIT-A" -> "A" (if branch is CSIT)
    // Example: "CSIT" -> "CSIT" (collapses to branch code)
    const resolveSection = (rawSection, branchName) => {
        const branchCode = getBranchCode(branchName);
        const bUpper = (branchName || '').toUpperCase();
        const cUpper = (branchCode || '').toUpperCase();
        const secNorm = String(rawSection || '').trim().toUpperCase();

        if (secNorm === '' || secNorm === cUpper || secNorm === bUpper) {
            return branchCode;
        }

        // Removed aggressive slash handling so combined sections like CSDS/CSIT preserve their literal names.

        // --- Smart Compound Section Handling (e.g. "CSIT-A") ---
        const parts = secNorm.split(/[-\s:]+/).filter(Boolean);
        if (parts.length > 1) {
            const prefix = parts[0].trim();
            const suffix = parts.slice(1).join('-').trim();

            const prefixParts = prefix.split('/');
            const matchesSelectedBranch = prefixParts.some(p => {
                const pn = p.trim();
                return pn === bUpper || pn === cUpper || pn === branchName.toUpperCase();
            });

            if (matchesSelectedBranch && suffix) {
                return suffix;
            }
        }

        return rawSection;
    };

    // ── Helper: map auto_split chunk index → master group name ─────────────────
    const chunkToGroupName = (chunkIndex) => {
        return groups[chunkIndex]?.name || String(chunkIndex + 1);
    };

    const [step, setStep] = useState(1);
    const [config, setConfig] = useState({
        academicYear: activeAcademicYear || '',
        branch: '',
        targetSemester: '',
        admissionType: 'regular',
        section: '',
        splitCount: 2,
        labGroupOverride: '', // used when 'Lab Group' column absent in data
    });
    const [importMode, setImportMode] = useState('file'); // 'file' | 'paste'
    const [file, setFile] = useState(null);
    const [pasteText, setPasteText] = useState('');
    const [parsedData, setParsedData] = useState([]);
    const [detectedColumns, setDetectedColumns] = useState({ hasSection: false, hasGroup: false, hasSlNo: false, hasRollNo: false });
    const [isProcessing, setIsProcessing] = useState(false);
    const [isParsing, setIsParsing] = useState(false);
    // Step 3: conflict resolution
    const [conflicts, setConflicts] = useState([]);  // [{row, existing, type}]
    const [conflictResolutions, setConflictResolutions] = useState({}); // regNo → 'skip'|'overwrite'
    const [pendingImportQueue, setPendingImportQueue] = useState([]);
    const [debugData, setDebugData] = useState(null);

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) setFile(selectedFile);
    };

    // --- Shared Logic: Robust Column Keywords ---
    const COL_ALIASES = {
        id: ['REGDNO', 'REGNO', 'REGISTRATIONNO', 'ROLLNO', 'ENROLLMENTNO', 'UID', 'STUDENTID', 'REGID', 'REG', 'ENRL'],
        roll: ['ROLLNO', 'ROLL', 'UNIROLL', 'COLLEGEROLL', 'CLASSROLL', 'NUM'],
        name: ['NAME', 'STUDENTNAME', 'FULLNAME', 'USERNAME', 'STUDENT'],
        section: ['SECTION', 'SEC', 'CLASS'],
        group: ['LABGROUP', 'GROUP', 'BATCH', 'LABGRP', 'GRP', 'SUBGROUP'],
        slno: ['SNO', 'SLNO', 'SRNO', 'SERIAL', 'ORDER', 'SL', 'SR'],
        branch: ['BRANCH', 'DEPT', 'DEPARTMENT', 'STREAM']
    };

    const normalizeHeader = (h) => String(h ?? '').toUpperCase().trim().replace(/[^A-Z0-9]/g, '');

    const detectColumnsInHeads = (headers) => {
        if (!Array.isArray(headers)) return { indices: {}, ok: false };
        const normalized = headers.map(normalizeHeader);

        const findIdx = (aliases) => {
            const cleanAliases = aliases.map(a => a.toUpperCase());
            // 1. Exact matches first
            for (const a of cleanAliases) {
                const idx = normalized.findIndex(h => h === a);
                if (idx !== -1) return idx;
            }
            // 2. Starts with / includes matches
            for (const a of cleanAliases) {
                const idx = normalized.findIndex(h => {
                    if (!h || h.length < 2) return false;
                    return h.startsWith(a) || a.startsWith(h) || h.includes(a);
                });
                if (idx !== -1) return idx;
            }
            return -1;
        };

        const res = {
            idIdx: findIdx(COL_ALIASES.id),
            rollIdx: findIdx(COL_ALIASES.roll),
            nameIdx: findIdx(COL_ALIASES.name),
            secIdx: findIdx(COL_ALIASES.section),
            grpIdx: findIdx(COL_ALIASES.group),
            slIdx: findIdx(COL_ALIASES.slno),
            branchIdx: findIdx(COL_ALIASES.branch),
        };

        return {
            indices: res,
            hasSection: res.secIdx !== -1,
            hasGroup: res.grpIdx !== -1,
            hasSlNo: res.slIdx !== -1,
            hasRollNo: res.rollIdx !== -1,
            isValid: (res.idIdx !== -1 || res.rollIdx !== -1) && res.nameIdx !== -1
        };
    };

    // Smart Heuristic Paste Parser — header-indexed approach
    // eslint-disable-next-line sonarjs/cognitive-complexity
    const parsePaste = () => {
        const text = pasteText.trim();
        if (!text) { toast.error('Paste your table data first.'); return; }

        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) { toast.error('Need at least a header row and one data row.'); return; }

        // === 1. Determine delimiter & scan for Header Row ===
        let delimiter = '\t';
        let headerRowIndex = -1;
        let detection = { isValid: false, indices: {} };

        for (let i = 0; i < Math.min(lines.length, 50); i++) {
            const line = lines[i];
            let d;
            if (line.includes('\t')) d = '\t';
            else if (line.includes(',')) d = ',';
            else if (/\s{2,}/.test(line)) d = /\s{2,}/;
            else d = /\s+/;

            const rawHeaders = line.split(d).map(h => h.trim());
            const check = detectColumnsInHeads(rawHeaders);
            if (check.isValid) {
                headerRowIndex = i;
                delimiter = d;
                detection = check;
                break;
            }
        }

        if (headerRowIndex === -1 || !detection.isValid) {
            toast.error('Could not identify required columns (ID and Name). Ensure you included the header row in your selection.');
            return;
        }

        const { indices } = detection;
        const primaryIdCol = indices.idIdx !== -1 ? indices.idIdx : indices.rollIdx;

        const rows = [];
        // === 2. Extract Data Rows ===
        lines.slice(headerRowIndex + 1).forEach(line => {
            const cells = line.split(delimiter).map(c => c.trim());
            if (cells.length < 2) return;

            const regNo = cells[primaryIdCol] || '';
            const name = cells[indices.nameIdx] || '';

            // Validation: Must have at least a name and a numeric-looking ID
            if (!regNo || !name || !/\d/.test(regNo)) return;

            rows.push({
                regno: String(regNo).trim().toUpperCase(),
                rollno: indices.rollIdx !== -1 ? String(cells[indices.rollIdx]).trim() : '',
                name: String(name).trim().toUpperCase(),
                section: indices.secIdx !== -1 ? String(cells[indices.secIdx]).trim().toUpperCase() : '',
                group: indices.grpIdx !== -1 ? String(cells[indices.grpIdx]).trim() : '',
                slno: indices.slIdx !== -1 ? String(cells[indices.slIdx]).trim() : '',
                branch: indices.branchIdx !== -1 ? String(cells[indices.branchIdx]).trim().toUpperCase() : '',
            });
        });

        if (rows.length === 0) {
            toast.error('No valid student records found. Check if the registration numbers are numeric.');
            return;
        }

        // Deduplicate by regNo
        const uniqueRows = Array.from(new Map(rows.map(r => [r.regno, r])).values());
        setParsedData(uniqueRows);
        setDetectedColumns({
            hasSection: detection.hasSection,
            hasGroup: detection.hasGroup,
            hasSlNo: detection.hasSlNo,
            hasRollNo: detection.hasRollNo,
        });

        const newConfig = { ...config };
        if (detection.hasSection) newConfig.section = 'from_file';

        const firstRow = uniqueRows[0] || {};
        let detectedBranch = firstRow['branch'] || firstRow['dept'] || firstRow['department'] || '';
        const detectedSem = String(firstRow['sem'] || firstRow['semester'] || '').match(/\d+/)?.[0] || '';

        // If no explicit branch is found in the row, try extracting it from the section string (e.g., "CSDS/CSIT-A" -> CSDS)
        if (!detectedBranch) {
            const secStr = firstRow['section'] || firstRow['sec'] || '';
            const secDept = matchDepartment(secStr);
            if (secDept) detectedBranch = secDept.name;
        }

        if (detectedSem && !newConfig.targetSemester) newConfig.targetSemester = detectedSem;
        if (detectedBranch && detectedBranch.length > 1 && !newConfig.branch) {
            const matchedDept = matchDepartment(detectedBranch);
            if (matchedDept) newConfig.branch = matchedDept.name;
        }

        setConfig(newConfig);

        setStep(2);
    };

    const handleParse = async () => {
        if (!file) return;
        setIsParsing(true);

        try {
            const fileName = file.name.toLowerCase();

            if (fileName.endsWith('.csv')) {
                Papa.parse(file, {
                    header: true,
                    skipEmptyLines: true,

                    complete: (results) => {
                        const normalized = results.data.map(row => {
                            const newRow = {};
                            Object.keys(row).forEach(k => newRow[k.toLowerCase().trim()] = String(row[k] ?? '').trim()); // eslint-disable-line sonarjs/no-nested-functions
                            return newRow;
                        });
                        // ── Detect columns for CSV (same logic as Excel) ──
                        const csvHeaderKeys = Object.keys(normalized[0] || {}).map(k => k.toLowerCase().trim());
                        setDetectedColumns({
                            hasSection: csvHeaderKeys.some(k => k === 'section' || k === 'sec'),
                            hasGroup: csvHeaderKeys.some(k => ['lab group', 'labgroup', 'group', 'batch'].includes(k)),
                            hasSlNo: csvHeaderKeys.some(k => ['s.no', 'sno', 'slno', 'sl.no', 's no', 'sr no'].includes(k)),
                            hasRollNo: csvHeaderKeys.some(k => ['roll no', 'rollno', 'roll #'].includes(k)),
                        });
                        setParsedData(normalized);

                        const newConfig = { ...config };
                        if (csvHeaderKeys.some(k => k === 'section' || k === 'sec')) newConfig.section = 'from_file';

                        const firstRow = normalized[0] || {};
                        let detectedBranch = firstRow['branch'] || firstRow['dept'] || firstRow['department'] || '';
                        const detectedSem = String(firstRow['sem'] || firstRow['semester'] || '').match(/\d+/)?.[0] || '';

                        // Fallback inference from section string
                        if (!detectedBranch) {
                            const secStr = firstRow['section'] || firstRow['sec'] || '';
                            const secDept = matchDepartment(secStr);
                            if (secDept) detectedBranch = secDept.name;
                        }

                        if (detectedSem && !newConfig.targetSemester) newConfig.targetSemester = detectedSem;
                        if (detectedBranch && detectedBranch.length > 1 && !newConfig.branch) {
                            const matchedDept = matchDepartment(detectedBranch);
                            if (matchedDept) newConfig.branch = matchedDept.name;
                        }

                        setConfig(newConfig);
                        setStep(2);
                        setIsParsing(false);
                    },
                    error: (err) => {
                        toast.error("Error parsing CSV: " + err.message);
                        setIsParsing(false);
                    }
                });
            } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
                const reader = new FileReader();

                // eslint-disable-next-line sonarjs/cognitive-complexity
                reader.onload = async (e) => {
                    try {
                        const buffer = e.target.result;

                        // --- 0. Legacy College System Hack ---
                        // Many generic portals export "Excel" files that are actually just raw HTML <table> text.
                        // We check the first few bytes. If it's HTML, we manually parse the DOM tree into a 2D array.
                        const textChunk = new TextDecoder().decode(buffer.slice(0, 2048));
                        const isHTML = textChunk.toLowerCase().includes('<table') || textChunk.toLowerCase().includes('<html');

                        let sheetsData = {};

                        if (isHTML) {
                            const fullText = new TextDecoder().decode(buffer);
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(fullText, 'text/html');
                            const rows = doc.querySelectorAll('tr');
                            sheetsData['HTML_Data'] = Array.from(rows).map(tr =>
                                Array.from(tr.querySelectorAll('td, th')).map(cell => cell.textContent?.trim() || '') // eslint-disable-line sonarjs/no-nested-functions
                            );
                        } else {
                            const workbook = XLSX.read(buffer, { type: 'array' });
                            for (const sheetName of workbook.SheetNames) {
                                sheetsData[sheetName] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
                            }
                        }

                        let data = [];
                        let detection = null;
                        let headerRowIndex = -1;
                        let detectedSheetName = '';
                        let detectedBranch = '';
                        let detectedSem = '';
                        let detectedYear = '';

                        // --- 1. Iterate through all extracted sheets to find valid headers ---
                        for (const sheetName of Object.keys(sheetsData)) {
                            const rawLines = sheetsData[sheetName];
                            if (!rawLines || rawLines.length === 0) continue;

                            for (let i = 0; i < Math.min(rawLines.length, 200); i++) {
                                const rawRow = rawLines[i];
                                if (!Array.isArray(rawRow) || rawRow.length === 0) continue;

                                // Clean the row: filter out pure whitespace, but keep empty strings for spacing mapping
                                const row = rawRow.map(c => String(c ?? '').trim());
                                // Only process if the row has at least 2 actual textual values
                                if (row.filter(c => c.length > 0).length < 2) continue;

                                const detectionResult = detectColumnsInHeads(row);

                                // Super aggressive fallback: check if we can reconstruct the header across 2 rows (due to vertical merging)
                                if (!detectionResult.isValid && i + 1 < rawLines.length) {
                                    const nextRowRaw = Array.isArray(rawLines[i + 1]) ? rawLines[i + 1] : [];
                                    const nextRow = nextRowRaw.map(c => String(c ?? '').trim());

                                    // Combine them
                                    const mergedRow = row.map((val, idx) => {
                                        const nextVal = nextRow[idx] || '';
                                        return val ? val + " " + nextVal : nextVal;
                                    });

                                    // Check merged
                                    const mergedDetection = detectColumnsInHeads(mergedRow);
                                    if (mergedDetection.isValid) {
                                        headerRowIndex = i; // use the primary row, data starts correctly below
                                        detection = mergedDetection;
                                        detectedSheetName = sheetName;
                                    }
                                }

                                if (detectionResult.isValid || detection?.isValid) {
                                    if (headerRowIndex === -1) headerRowIndex = i;
                                    if (!detection) detection = detectionResult;
                                    detectedSheetName = sheetName;

                                    // Found a valid sheet and header row! Let's extract metadata now.
                                    // Scan rows above the header for metadata
                                    for (let j = 0; j <= i; j++) {
                                        if (!Array.isArray(rawLines[j])) continue;
                                        const metaRow = rawLines[j].map(c => String(c ?? '').toUpperCase());
                                        const metaStr = metaRow.join(' ');

                                        if (metaStr.includes('BRANCH') || metaStr.includes('DEPT')) {
                                            const found = metaRow.find(c => c.includes('BRANCH') || c.includes('DEPT'));
                                            if (found) {
                                                const idx = metaRow.indexOf(found);
                                                detectedBranch = found.split(/[:-]/).pop()?.trim() || String(rawLines[j][idx + 1] ?? '').trim();
                                            }
                                        }
                                        if (metaStr.includes('SEM')) {
                                            const found = metaRow.find(c => c.includes('SEM'));
                                            if (found) {
                                                const idx = metaRow.indexOf(found);
                                                detectedSem = found.match(/\d+/)?.[0] || String(rawLines[j][idx + 1] ?? '').match(/\d+/)?.[0] || detectedSem;
                                            }
                                        }
                                        if (metaStr.includes('YEAR') || metaStr.includes('SESSION')) {
                                            const found = metaRow.find(c => c.includes('YEAR') || c.includes('SESSION'));
                                            if (found) {
                                                const idx = metaRow.indexOf(found);
                                                detectedYear = found.split(/[:-]/).pop()?.trim() || String(rawLines[j][idx + 1] ?? '').trim();
                                            }
                                        }
                                    }
                                    break;
                                }
                            }
                            if (headerRowIndex !== -1) break;
                        }

                        if (headerRowIndex === -1) {
                            const debugSheetLines = sheetsData[Object.keys(sheetsData)[0]];
                            // eslint-disable-next-line sonarjs/no-nested-functions
                            const validLines = debugSheetLines.filter(r => Array.isArray(r) && r.some(c => String(c).trim().length > 0));

                            // Safe mapping for diagnostic toast
                            const firstFew = validLines.slice(0, 3).map(r => r.filter(Boolean).slice(0, 5).join(' | '));
                            toast.error(`Columns missing! The file parser saw: \n1) ${firstFew[0] || 'EMPTY'}\n2) ${firstFew[1] || 'EMPTY'}\n3) ${firstFew[2] || 'EMPTY'}`, { duration: 10000 });

                            setIsParsing(false);
                            return;
                        }

                        // Re-fetch rawLines for the working sheet
                        const workingLines = sheetsData[detectedSheetName];
                        const { indices } = detection;
                        const primaryIdIdx = indices.idIdx !== -1 ? indices.idIdx : indices.rollIdx;

                        for (let i = headerRowIndex + 1; i < workingLines.length; i++) {
                            const row = workingLines[i];
                            if (!Array.isArray(row) || row.length === 0) continue;

                            // Skip row 2 sub-header logic (relative to header row)
                            if (i === headerRowIndex + 1) {
                                const vals = row.map(v => String(v ?? '').trim());
                                const looksLikeSubHeader = vals.filter(v => /\d{8,}/.test(v)).length === 0 && vals.some(v => /classes|held|attended|fine|percent/i.test(v));
                                if (looksLikeSubHeader) continue;
                            }

                            const regNo = String(row[primaryIdIdx] ?? '').trim();
                            const name = String(row[indices.nameIdx] ?? '').trim();

                            // Basic validation: must have some data and a key identifier
                            if (regNo && name && /\d/.test(regNo)) {
                                data.push({
                                    regno: regNo.toUpperCase(),
                                    rollno: indices.rollIdx !== -1 ? String(row[indices.rollIdx] ?? '').trim() : '',
                                    name: name.toUpperCase(),
                                    section: indices.secIdx !== -1 ? String(row[indices.secIdx] ?? '').trim().toUpperCase() : '',
                                    group: indices.grpIdx !== -1 ? String(row[indices.grpIdx] ?? '').trim() : '',
                                    slno: indices.slIdx !== -1 ? String(row[indices.slIdx] ?? '').trim() : '',
                                    branch: indices.branchIdx !== -1 ? String(row[indices.branchIdx] ?? '').trim().toUpperCase() : '',
                                });
                            }
                        }

                        if (data.length === 0) {
                            toast.error("No student records found. Check if the data starts below the headers.");
                            setIsParsing(false);
                            return;
                        }

                        setParsedData(data);

                        // ── 2. Smart Pre-fill Config if metadata found ─────────────
                        const firstDataRow = data[0] || {};
                        let finalDetectedBranch = detectedBranch || firstDataRow.branch || '';
                        const finalDetectedSem = detectedSem || String(firstDataRow.sem || firstDataRow.semester || '').match(/\d+/)?.[0] || '';

                        // Fallback inference from section string
                        if (!finalDetectedBranch) {
                            const secStr = firstDataRow.section || firstDataRow.sec || '';
                            const secDept = matchDepartment(secStr);
                            if (secDept) finalDetectedBranch = secDept.name;
                        }

                        const newConfig = { ...config };
                        if (detectedYear) newConfig.academicYear = detectedYear;

                        if (finalDetectedSem && !newConfig.targetSemester) newConfig.targetSemester = finalDetectedSem;

                        if (finalDetectedBranch && finalDetectedBranch.length > 1 && !newConfig.branch) {
                            const matchedDept = matchDepartment(finalDetectedBranch);
                            if (matchedDept) newConfig.branch = matchedDept.name;
                        }

                        // ── 3. Detect Columns ──────────────────────────────────────
                        if (detection.hasSection) newConfig.section = 'from_file';

                        setConfig(newConfig);
                        setDetectedColumns({
                            hasSection: detection.hasSection,
                            hasGroup: detection.hasGroup,
                            hasSlNo: detection.hasSlNo,
                            hasRollNo: detection.hasRollNo,
                        });

                        setStep(2);
                        setIsParsing(false);
                    } catch (err) {
                        toast.error("Error parsing Excel: " + err.message);
                        setIsParsing(false);
                    }
                };
                reader.readAsArrayBuffer(file);
            } else {
                toast.error("Unsupported file format. Use CSV or Excel (.xlsx/.xls)");
                setIsParsing(false);
            }
        } catch (error) {
            console.error(error);
            toast.error("Critical error during parsing.");
            setIsParsing(false);
        }
    };

    // ── Pre-import conflict check ──────────────────────────────────────────────
    // eslint-disable-next-line sonarjs/cognitive-complexity
    const checkAndImport = async () => {
        if (!config.targetSemester) {
            toast.error("Please ensure target Sem is selected.");
            return;
        }
        if (!config.section && !detectedColumns.hasSection) {
            toast.error("Please select a Section from the dropdown.");
            return;
        }
        if (config.section === 'auto_split' && (!config.splitCount || config.splitCount < 2)) {
            toast.error("Please enter a valid split count (min 2).");
            return;
        }
        if (!userProfile || userProfile.role !== 'admin') {
            toast.error(`Permission Denied: Must be 'admin' to import.`);
            return;
        }

        setIsProcessing(true);
        try {
            const existingSnap = await getDocs(collection(db, 'students'));
            const existingMap = {};
            existingSnap.docs.forEach(d => { existingMap[d.id] = { id: d.id, ...d.data() }; });

            const queue = [];
            const foundConflicts = [];
            const splitCount = Number(config.splitCount) || 2;

            for (const [rowIndex, row] of parsedData.entries()) {
                const regNo = String(
                    row['regno'] || row['regdno'] || row['regd.no'] || row['rollno'] ||
                    row['registration number'] || row['registration_number'] || row['roll no'] || ''
                ).trim().toUpperCase();
                const name = String(
                    row['name'] || row['studentname'] || row['student name'] ||
                    row['student_name'] || row['user_name'] || row['username'] || ''
                ).trim().toUpperCase();

                if (!regNo || !name || !/\d/.test(regNo)) continue;

                // ── Dynamic Branch & Semester (row-level fallback) ────────────
                let rowBranch = String(row['branch'] || row['dept'] || row['department'] || '').trim();
                let finalBranch = config.branch;
                const fileSec = (row['section'] || row['sec'] || '').trim().toUpperCase();

                if (!rowBranch && fileSec) {
                    const secDept = matchDepartment(fileSec);
                    if (secDept) rowBranch = secDept.name;
                }

                if (rowBranch) {
                    const matchedDept = matchDepartment(rowBranch);
                    if (matchedDept) finalBranch = matchedDept.name;
                }

                let rowSem = String(row['sem'] || row['semester'] || '').match(/\d+/)?.[0] || '';
                const finalSemester = rowSem || config.targetSemester;

                // ── Section & Group resolution ──────────────────────────────────
                let finalSection;
                let finalGroup;

                if (config.section === 'from_file') {
                    // Always normalise to uppercase for consistent Firestore storage
                    const fileSec = (row['section'] || row['sec'] || '').trim().toUpperCase();
                    // If row has no section value, fall back to the branch code (not a random group)
                    finalSection = fileSec || getBranchCode(finalBranch) || '1';
                } else if (config.section === 'auto_split') {
                    const chunkSize = Math.ceil(parsedData.length / splitCount);
                    const chunkIdx = Math.floor(rowIndex / chunkSize);
                    // Map chunk index to master group name if available
                    finalSection = chunkToGroupName(chunkIdx);
                } else {
                    finalSection = config.section;
                }
                // Removed finalSection = resolveSection(finalSection, finalBranch); so that Literal values are not truncated.

                // ── Lab Group resolution ────────────────────────────────────────
                const rawGroup = String(row['lab group'] || row['labgroup'] || row['lab_group'] || row['group'] || '').trim();
                if (config.section === 'auto_split') {
                    // auto_split: each chunk is already a section — everyone in the chunk is sub-group 1
                    finalGroup = '1';
                } else if (rawGroup) {
                    // Accept any non-empty value from file (numeric "1" or alpha "A", "Batch1", etc.)
                    finalGroup = rawGroup;
                } else if (config.labGroupOverride) {
                    // Admin override when column is absent in file
                    finalGroup = config.labGroupOverride;
                } else {
                    finalGroup = '1';
                }

                // ── SL No resolution ────────────────────────────────────────────
                const rawSlNo = row['s.no'] || row['sno'] || row['sl.no'] || row['slno'] || row['s no'] || row['sr no'];
                const parsedSlNo = rawSlNo ? parseInt(rawSlNo) : NaN;
                const finalSlNo = !isNaN(parsedSlNo) && parsedSlNo > 0 ? parsedSlNo : rowIndex + 1;

                const safeId = regNo.replace(/[^a-zA-Z0-9]/g, '_');
                const existing = existingMap[safeId];

                // Conflict detection
                if (existing) {
                    const nameMismatch = existing.name && existing.name.toUpperCase() !== name;
                    const cohortMismatch = existing.branch && existing.branch !== finalBranch;
                    if (nameMismatch || cohortMismatch) {
                        foundConflicts.push({
                            regNo,
                            newName: name,
                            existingName: existing.name,
                            newSlNo: finalSlNo,
                            existingSlNo: existing.slNo,
                            type: nameMismatch ? 'name_mismatch' : 'cohort_mismatch',
                            payload: {
                                regNo, name,
                                rollNo: String(row['rollno'] || row['roll no'] || '').trim(),
                                branch: finalBranch,
                                semester: finalSemester,
                                section: finalSection,
                                slNo: finalSlNo,
                                group: finalGroup,
                                academicYear: config.academicYear || '',
                                isLateral: config.admissionType === 'lateral',
                                status: 'active',
                                updatedAt: new Date().toISOString(),
                            },
                            safeId,
                        });
                        continue; // will be handled after user review
                    }
                }

                queue.push({
                    safeId,
                    payload: {
                        regNo, name,
                        rollNo: String(row['rollno'] || row['roll no'] || '').trim(),
                        branch: finalBranch,
                        semester: finalSemester,
                        section: finalSection,
                        slNo: finalSlNo,
                        group: finalGroup,
                        academicYear: config.academicYear || '',
                        isLateral: config.admissionType === 'lateral',
                        status: 'active',
                        updatedAt: new Date().toISOString(),
                    }
                });
            }

            if (foundConflicts.length > 0) {
                // Init resolutions to 'overwrite' by default
                const initRes = {};
                foundConflicts.forEach(c => { initRes[c.regNo] = 'overwrite'; });
                setConflictResolutions(initRes);
                setConflicts(foundConflicts);
                setPendingImportQueue(queue);
                setStep(3); // Show conflict resolution screen
            } else {
                await commitImport(queue);
            }
        } catch (err) {
            console.error("Pre-check Error:", err);
            toast.error("Check failed: " + err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    // ── Commit the actual import after conflict resolution ─────────────────────
    const commitImport = async (queue, conflictsToHandle = [], resolutions = {}) => {
        setIsProcessing(true);
        let batch = writeBatch(db);
        let count = 0;
        try {
            const writeTs = new Date().toISOString(); // single consistent timestamp for this import batch
            // Write clean rows
            for (const { safeId, payload } of queue) {
                batch.set(doc(db, 'students', safeId), { ...payload, updatedAt: writeTs }, { merge: true });
                count++;
                if (count % 250 === 0) { await batch.commit(); batch = writeBatch(db); }
            }
            // Write conflict rows based on resolution
            for (const conflict of conflictsToHandle) {
                if (resolutions[conflict.regNo] === 'overwrite') {
                    batch.set(doc(db, 'students', conflict.safeId), { ...conflict.payload, updatedAt: writeTs }, { merge: true });
                    count++;
                    if (count % 250 === 0) { await batch.commit(); batch = writeBatch(db); }
                }
                // 'skip' → do nothing
            }
            if (count === 0) {
                toast.error('⚠️ No students were imported — check your data and section settings.');
                return;
            }
            if (count % 250 !== 0) await batch.commit();
            toast.success(`✅ Successfully imported ${count} students!`);
            setTimeout(() => window.location.reload(), 1200);
        } catch (err) {
            console.error("Import Error:", err);
            const isPermission = err.code === 'permission-denied' || err.message?.includes('permission');
            toast.error(isPermission
                ? "Permission Denied: Firestore role must be 'admin'."
                : "Import Failed: " + err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    // ── kept for direct non-conflict path ─────────────────────────────────────
    const executeImport = checkAndImport;



    return (
        <div className="modal-overlay" style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.8)' }}>
            <div className="modal-content glass-panel animate-zoom-in" style={{ width: '640px', padding: '2.5rem', position: 'relative', border: '1px solid rgba(255,255,255,0.1)' }}>
                {/* Close Button */}
                <button
                    onClick={onClose}
                    style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', padding: '8px', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'; e.currentTarget.style.color = '#ef4444'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#94a3b8'; }}
                >
                    <X size={20} />
                </button>

                <div style={{ marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', padding: '12px', borderRadius: '14px', boxShadow: '0 8px 20px rgba(59, 130, 246, 0.3)' }}>
                            <FileText size={28} color="white" />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: 'white' }}>Students Bulk Import</h2>
                            <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '0.9rem' }}>Fast-track population of your student database</p>
                        </div>
                    </div>
                </div>

                {step === 1 && (
                    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {/* Header hint */}
                        <div style={{ padding: '1.5rem', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '16px', border: '1px solid rgba(59, 130, 246, 0.2)', position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', top: -10, right: -10, opacity: 0.1 }}><ShieldAlert size={80} color="#3b82f6" /></div>
                            <h4 style={{ margin: '0 0 10px', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '8px' }}><ArrowRight size={18} /> Recognised Columns</h4>
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                {['Regd.No / RegNo', 'Name'].map(h => <span key={h} style={{ padding: '4px 12px', background: 'rgba(59, 130, 246, 0.2)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#bfdbfe', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600 }}>{h} ✓ required</span>)}
                                {['S.No', 'Section', 'Lab Group', 'Branch'].map(h => <span key={h} style={{ padding: '4px 12px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', color: '#6ee7b7', borderRadius: '8px', fontSize: '0.8rem' }}>{h} ✓ auto-imported</span>)}
                            </div>
                            <p style={{ marginTop: '12px', fontSize: '0.825rem', color: '#94a3b8', lineHeight: 1.5 }}>
                                {importMode === 'paste'
                                    ? <>Copy any table from <strong>Excel / Google Sheets</strong> and paste below. Column headers like <strong>Regd. No.</strong>, <strong>RegNo</strong>, <strong>Roll No</strong> are all recognised. S.No. column is skipped automatically.</>
                                    : <>Supports <strong>Excel (.xlsx, .xls)</strong> or <strong>CSV</strong>. Ensure no merged cells or hidden rows.</>}
                            </p>
                        </div>

                        {/* Mode Toggle */}
                        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: '14px', padding: '4px', gap: '4px' }}>
                            {[{ id: 'file', label: '📁  Upload File' }, { id: 'paste', label: '📋  Paste Data' }].map(m => (
                                <button key={m.id}
                                    onClick={() => { setImportMode(m.id); setFile(null); setPasteText(''); }}
                                    style={{
                                        flex: 1, padding: '10px', border: 'none', borderRadius: '11px', cursor: 'pointer',
                                        fontWeight: 600, fontSize: '0.9rem', transition: 'all 0.2s',
                                        background: importMode === m.id ? 'linear-gradient(135deg,#3b82f6,#6366f1)' : 'transparent',
                                        color: importMode === m.id ? 'white' : '#64748b',
                                        boxShadow: importMode === m.id ? '0 4px 12px rgba(59,130,246,0.3)' : 'none'
                                    }}>{m.label}
                                </button>
                            ))}
                        </div>

                        {/* ── FILE MODE ── */}
                        {importMode === 'file' && (
                            <div style={{ border: '2px dashed rgba(255,255,255,0.1)', borderRadius: '20px', padding: '3rem 2rem', textAlign: 'center', background: file ? 'rgba(59,130,246,0.05)' : 'rgba(255,255,255,0.02)', transition: 'all 0.3s', position: 'relative' }}>
                                {!file ? (
                                    <>
                                        <div style={{ width: '64px', height: '64px', background: 'rgba(255,255,255,0.05)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                                            <Upload size={32} color="#60a5fa" />
                                        </div>
                                        <h5 style={{ margin: '0 0 8px', color: 'white', fontSize: '1.1rem' }}>Click to Browse Files</h5>
                                        <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>or drag and drop your spreadsheet here</p>
                                        <input type="file" accept=".csv, .xlsx, .xls" onChange={handleFileChange} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                                    </>
                                ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                                        <div style={{ padding: '12px', background: '#059669', borderRadius: '12px' }}><CheckCircle size={24} color="white" /></div>
                                        <div style={{ textAlign: 'left' }}>
                                            <div style={{ color: 'white', fontWeight: 600 }}>{file.name}</div>
                                            <div style={{ color: '#64748b', fontSize: '0.8rem' }}>{(file.size / 1024).toFixed(1)} KB • Ready to process</div>
                                        </div>
                                        <button onClick={() => setFile(null)} style={{ background: 'none', border: 'none', color: '#f87171', padding: '8px', cursor: 'pointer' }}><Trash2 size={20} /></button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── PASTE MODE ── */}
                        {importMode === 'paste' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                                <textarea
                                    value={pasteText}
                                    onChange={e => setPasteText(e.target.value)}
                                    placeholder={"Paste your table here (copied from Excel or Google Sheets):\n\nS.no.\tName\t\t\tRegd. No.\n1\tADIKANTA DAS\t\tF25205001001\n2\tUDIT KUMAR BEHERA\tF25205001005\n3\tBISWAJIT NAYAK\t\tF25205001002\n..."}
                                    style={{
                                        width: '100%', height: '220px', resize: 'vertical',
                                        background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '16px', color: '#e2e8f0', fontSize: '0.82rem',
                                        fontFamily: 'monospace', padding: '1rem', outline: 'none',
                                        lineHeight: 1.7, boxSizing: 'border-box', transition: 'border-color 0.2s'
                                    }}
                                    onFocus={e => e.target.style.borderColor = 'rgba(59,130,246,0.5)'}
                                    onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                                />
                                {pasteText.trim() && (
                                    <div style={{ fontSize: '0.8rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <CheckCircle size={13} />
                                        {/* Accurate live count: counts lines containing an 8+ digit RegNo */}
                                        {pasteText.split(/\r?\n/).filter(l => /\d{7,20}/.test(l)).length} students identified — click Next to continue
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Footer */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                            <button className="btn" onClick={onClose} style={{ color: '#94a3b8' }}>Cancel</button>
                            <button
                                className="btn btn-primary"
                                disabled={importMode === 'file' ? (!file || isParsing) : !pasteText.trim()}
                                onClick={importMode === 'file' ? handleParse : parsePaste}
                                style={{ padding: '12px 30px', borderRadius: '15px' }}
                            >
                                {isParsing ? <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>Parsing...</div> : <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>Next: Assign Class <ArrowRight size={18} /></div>}
                            </button>
                        </div>

                        {/* ── DIAGNOSTIC VIEW ── */}
                        {debugData && (
                            <div className="animate-fade-in" style={{ marginTop: '1rem', padding: '16px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                                <h4 style={{ color: '#fca5a5', marginTop: 0, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <ShieldAlert size={16} /> Diagnostic Data View
                                </h4>
                                <p style={{ fontSize: '0.85rem', color: '#f87171', marginBottom: '12px' }}>
                                    The system could not identify your headers. Please screenshot the raw data below from the first 20 rows of your Excel sheet so we can see why keywords like "Regd.No" and "Name" were missed.
                                </p>
                                <div style={{ maxHeight: '300px', overflowY: 'auto', background: 'rgba(0,0,0,0.5)', padding: '12px', borderRadius: '8px' }}>
                                    {debugData.map((row, idx) => (
                                        <div key={idx} style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontFamily: 'monospace', fontSize: '13px', color: '#cbd5e1' }}>
                                            <span style={{ color: '#64748b', marginRight: '8px' }}>[{idx}]</span>
                                            {JSON.stringify(row)}
                                        </div>
                                    ))}
                                </div>
                                <button className="glass-btn btn-secondary" onClick={() => setDebugData(null)} style={{ marginTop: '12px', fontSize: '0.85rem', padding: '8px 16px' }}>Close Diagnostic Tool</button>
                            </div>
                        )}

                    </div>
                )}

                {step === 2 && (
                    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                        {/* Academic Year */}
                        <div className="form-group">
                            <label className="label-text" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                                <CheckCircle size={14} color="#60a5fa" /> Academic Year
                            </label>
                            <input
                                className="glass-select"
                                value={config.academicYear}
                                onChange={e => setConfig({ ...config, academicYear: e.target.value })}
                                placeholder="e.g. 2025-2026 (ODD)"
                                style={{ padding: '12px', width: '100%', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', color: 'white', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }}
                            />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                            <div className="form-group">
                                <label className="label-text" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}><ShieldAlert size={14} color="#60a5fa" /> Target Branch</label>
                                <select className="glass-select" value={config.branch} onChange={e => setConfig({ ...config, branch: e.target.value })} style={{ padding: '12px' }}>
                                    <option value="">{ctxLoading && departments.length === 0 ? "Loading Branches..." : "Select Branch"}</option>
                                    {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="label-text" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}><Layers size={14} color="#60a5fa" /> Entry Semester</label>
                                <select className="glass-select" value={config.targetSemester} onChange={e => setConfig({ ...config, targetSemester: e.target.value })} style={{ padding: '12px' }}>
                                    <option value="">{ctxLoading && semesters.length === 0 ? "Loading Semesters..." : "Select Sem"}</option>
                                    {semesters.map(s => <option key={s.id} value={s.number}>Sem {s.number}</option>)}
                                </select>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                            <div className="form-group">
                                <label className="label-text" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}><UserCheck size={14} color="#60a5fa" /> Admission Type</label>
                                <select className="glass-select" value={config.admissionType} onChange={e => setConfig({ ...config, admissionType: e.target.value })} style={{ padding: '12px' }}>
                                    <option value="regular">Regular Students</option>
                                    <option value="lateral">Lateral Entry (LE)</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="label-text" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}><Users size={14} color="#60a5fa" /> Section *</label>
                                <select
                                    className="glass-select"
                                    value={config.section}
                                    onChange={e => setConfig({ ...config, section: e.target.value })}
                                    style={{ padding: '12px' }}
                                >
                                    <option value="">{ctxLoading && groups.length === 0 ? "Loading Sections..." : "-- Select Section --"}</option>
                                    <option value="from_file" style={{ fontWeight: 600, color: '#60a5fa' }}>✨ Auto-detect from File</option>
                                    <option value="auto_split" style={{ fontWeight: 600, color: '#f59e0b' }}>✂️ Auto-Split Sequentially</option>
                                    {groups.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Auto-Split Config */}
                        {config.section === 'auto_split' && (
                            <div className="animate-fade-in" style={{ padding: '15px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '12px', marginTop: '-1rem', marginBottom: '1rem' }}>
                                <label className="label-text" style={{ color: '#fcd34d' }}>Split into how many sections?</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <input
                                        type="number"
                                        min="2" max="10"
                                        value={config.splitCount}
                                        onChange={e => setConfig({ ...config, splitCount: Math.max(2, parseInt(e.target.value) || 2) })}
                                        style={{ width: '80px', padding: '8px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }}
                                    />
                                    <span style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                                        ~{Math.ceil(parsedData.length / config.splitCount)} students per section
                                        {groups.length > 0
                                            ? ` (${groups.slice(0, config.splitCount).map(g => g.name).join(', ')}${config.splitCount > groups.length ? '...' : ''})` // eslint-disable-line sonarjs/no-nested-conditional
                                            : ' (1, 2, ...)'}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* ══ AMBIGUITY REVIEW PANEL ════════════════════════════════════════════ */}
                        {/* eslint-disable-next-line sonarjs/cognitive-complexity */}
                        {(() => {
                            const issues = [];

                            // 1a. Section column absent AND no section chosen (blocking)
                            if (!detectedColumns.hasSection && config.section === '') {
                                issues.push({ id: 'no_section', level: 'error', icon: '🔴', msg: 'No Section column detected in file. Please select a section using the dropdown above.' });
                            }
                            // 1b. Admin picked "Auto-detect" but file has no section column (warn, still runnable)
                            if (!detectedColumns.hasSection && config.section === 'from_file') {
                                issues.push({ id: 'no_sec_from_file', level: 'warn', icon: '🟡', msg: `"Auto-detect from File" selected, but no Section column found in the file. All students will be stored under the branch code (${getBranchCode(config.branch) || config.branch || '?'}). Consider selecting a fixed section.` });
                            }
                            // 2. Lab Group column absent
                            if (!detectedColumns.hasGroup && config.section !== 'auto_split') {
                                if (config.section === 'from_file') {
                                    // For from_file, can't force a single override — just inform
                                    issues.push({ id: 'no_group_ff', level: 'info', icon: '🔵', msg: 'No Lab Group column detected. Students will be assigned to sub-group "1" unless a valid group key is found per row.' });
                                } else {
                                    // Fixed section — override panel below can assign all to one group
                                    issues.push({ id: 'no_group', level: 'warn', icon: '🟡', msg: 'No "Lab Group" column found. Use the override panel below to assign all students to a specific sub-group.' });
                                }
                            }
                            // 3. Section from file equals branch name (will be deduplicated)
                            if (config.section === 'from_file' && config.branch) {
                                const branchUpper = (getBranchCode(config.branch) || config.branch).toUpperCase();
                                const redundantCount = parsedData.filter(r =>
                                    (r['section'] || r['sec'] || '').toUpperCase().trim() === branchUpper ||
                                    (r['section'] || r['sec'] || '').toUpperCase().trim() === config.branch.toUpperCase()
                                ).length;
                                if (redundantCount > 0) {
                                    issues.push({ id: 'sec_eq_branch', level: 'info', icon: '🔵', msg: `${redundantCount} row(s) have Section = Branch ("${config.branch}"). These will be stored collapsed — no duplication in labels.` });
                                }
                            }
                            // 4. Section value not in master data groups
                            if (config.section === 'from_file') {
                                const uniqueFileSecs = [...new Set(parsedData.map(r => resolveSection((r['section'] || r['sec'] || '').toUpperCase().trim(), config.branch)).filter(Boolean))];
                                const masterNames = groups.map(g => g.name.toUpperCase());
                                const branchUpper = (getBranchCode(config.branch) || config.branch || '').toUpperCase();
                                const unknown = uniqueFileSecs.filter(s => !masterNames.includes(s) && s !== branchUpper && s !== (config.branch || '').toUpperCase());
                                if (unknown.length > 0) {
                                    issues.push({ id: 'unknown_sec', level: 'warn', icon: '🟡', msg: `Section value(s) not in Master Data: ${unknown.map(s => `"${s}"`).join(', ')}. Will be stored as-is. Consider choosing a fixed section.` }); // eslint-disable-line sonarjs/no-nested-template-literals
                                }
                            }
                            // 5. Lab Group values not in master subGroups for that section
                            if (detectedColumns.hasGroup && !['auto_split', 'from_file', ''].includes(config.section)) {
                                const rawGroups = [...new Set(parsedData.map(r => String(r['lab group'] || r['labgroup'] || r['lab_group'] || r['group'] || r['batch'] || '').trim()).filter(Boolean))];
                                const masterGrp = groups.find(g => g.name === config.section);
                                if (masterGrp && masterGrp.subGroups && masterGrp.subGroups.length > 0) {
                                    const bad = rawGroups.filter(g => !masterGrp.subGroups.includes(g));
                                    if (bad.length > 0) {
                                        issues.push({ id: 'unknown_grp', level: 'warn', icon: '🟡', msg: `Lab Group value(s) [${bad.join(', ')}] not found in "${masterGrp.name}" sub-groups [${masterGrp.subGroups.join(', ')}]. They will be stored as-is.` });
                                    } else {
                                        issues.push({ id: 'grp_ok', level: 'ok', icon: '✅', msg: `All Lab Group values [${rawGroups.join(', ')}] verified against Master Data sub-groups for "${masterGrp.name}".` });
                                    }
                                }
                            }
                            // 6. Mixed (multiple) sections detected in the file
                            if (config.section === 'from_file') {
                                const uniqueFileSecs = [...new Set(parsedData.map(r => resolveSection((r['section'] || r['sec'] || '').trim(), config.branch)).filter(Boolean))];
                                if (uniqueFileSecs.length > 1) {
                                    issues.push({ id: 'mixed_sections', level: 'info', icon: '🔵', msg: `File has ${uniqueFileSecs.length} distinct section values: ${uniqueFileSecs.join(' · ')}. Students will be split across sections accordingly.` });
                                }
                            }
                            // 7. Everything looks clean
                            if (issues.length === 0 && parsedData.length > 0) {
                                issues.push({ id: 'all_ok', level: 'ok', icon: '✅', msg: `All ${parsedData.length} records look clean — section and sub-group values verified against Master Data.` });
                            }

                            if (issues.length === 0) return null;

                            const S = {
                                error: { bg: 'rgba(239,68,68,0.07)', bd: 'rgba(239,68,68,0.4)', tx: '#f87171' },
                                warn: { bg: 'rgba(245,158,11,0.07)', bd: 'rgba(245,158,11,0.4)', tx: '#fbbf24' },
                                info: { bg: 'rgba(59,130,246,0.07)', bd: 'rgba(59,130,246,0.4)', tx: '#93c5fd' },
                                ok: { bg: 'rgba(16,185,129,0.07)', bd: 'rgba(16,185,129,0.4)', tx: '#34d399' },
                            };
                            return (
                                <div style={{ marginBottom: '1rem', borderRadius: '14px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                                    <div style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>🔍 Data Ambiguity Review</span>
                                        {issues.some(i => i.level === 'error') && <span style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: '6px', background: 'rgba(239,68,68,0.15)', color: '#f87171', fontSize: '0.72rem', fontWeight: 700 }}>Action Required</span>}
                                        {!issues.some(i => i.level === 'error') && issues.some(i => i.level === 'warn') && <span style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: '6px', background: 'rgba(245,158,11,0.15)', color: '#fbbf24', fontSize: '0.72rem', fontWeight: 700 }}>Review Recommended</span>}
                                        {!issues.some(i => ['error', 'warn'].includes(i.level)) && <span style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: '6px', background: 'rgba(16,185,129,0.15)', color: '#34d399', fontSize: '0.72rem', fontWeight: 700 }}>All Clear</span>}
                                    </div>
                                    {issues.map(issue => {
                                        const st = S[issue.level] || S.info;
                                        return (
                                            <div key={issue.id} style={{ padding: '10px 16px', background: st.bg, borderLeft: `3px solid ${st.bd}`, display: 'flex', alignItems: 'flex-start', gap: '10px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                <span style={{ fontSize: '0.85rem', flexShrink: 0 }}>{issue.icon}</span>
                                                <span style={{ fontSize: '0.8rem', color: st.tx, lineHeight: 1.6 }}>{issue.msg}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })()}

                        {/* Admin Overrides — shown when columns are absent in uploaded data */}

                        {(!detectedColumns.hasGroup || !detectedColumns.hasSection) && (
                            <div style={{ padding: '14px', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: '12px', marginBottom: '1rem' }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#a78bfa', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    ⚙️ Admin Overrides — columns not detected in file
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: !detectedColumns.hasGroup && !detectedColumns.hasSection ? '1fr 1fr' : '1fr', gap: '12px' }}>
                                    {!detectedColumns.hasGroup && (
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Assign all to Lab Sub-Group</label>
                                            <select
                                                className="glass-select"
                                                value={config.labGroupOverride}
                                                onChange={e => setConfig({ ...config, labGroupOverride: e.target.value })}
                                                style={{ padding: '8px 12px', fontSize: '0.85rem' }}
                                            >
                                                <option value="">-- Default (Sub-Group 1) --</option>
                                                {/* Pull subGroups from master data: show "SECTION-SUBGROUP" labels */}
                                                {groups.flatMap(g =>
                                                    (g.subGroups && g.subGroups.length > 0)
                                                        ? g.subGroups.map(sg => (
                                                            <option key={`${g.id}-${sg}`} value={sg}>
                                                                {g.name}-{sg}
                                                            </option>
                                                        ))
                                                        : [<option key={g.id} value="1">{g.name}-1</option>]
                                                )}
                                                {/* Fallback if master data has no groups yet */}
                                                {groups.length === 0 && [1, 2, 3, 4, 5, 6].map(n => (
                                                    <option key={n} value={String(n)}>Group {n}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                    {!detectedColumns.hasSection && config.section === '' && (
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Section not in file — set manually</label>
                                            <select
                                                className="glass-select"
                                                value={config.section}
                                                onChange={e => setConfig({ ...config, section: e.target.value })}
                                                style={{ padding: '8px 12px', fontSize: '0.85rem' }}
                                            >
                                                <option value="">-- Select Section --</option>
                                                <option value="auto_split">✂️ Auto-Split into Sections</option>
                                                {groups.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}


                        <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                            <div style={{ padding: '12px 20px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#94a3b8' }}>DATA PREVIEW <span className="count-badge">{parsedData.length} records</span></span>
                            </div>
                            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead style={{ position: 'sticky', top: 0, background: '#1e293b', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}>
                                        <tr style={{ textAlign: 'left', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b' }}>
                                            <th style={{ padding: '12px 10px' }}>SL</th>
                                            <th style={{ padding: '12px 10px' }}>Roll No</th>
                                            <th style={{ padding: '12px 10px' }}>Reg No</th>
                                            <th style={{ padding: '12px 10px' }}>Student Name</th>
                                            <th style={{ padding: '12px 10px' }}>Section</th>
                                            <th style={{ padding: '12px 10px' }}>Lab Grp</th>
                                        </tr>
                                    </thead>
                                    <tbody style={{ fontSize: '0.85rem' }}>
                                        {parsedData.map((row, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                                <td style={{ padding: '8px 10px', color: '#64748b', fontSize: '0.8rem' }}>{row['slno'] || row['s.no'] || i + 1}</td>
                                                <td style={{ padding: '8px 10px', color: '#f59e0b', fontFamily: 'monospace', fontSize: '0.82rem' }}>{row['rollno'] || row['roll no'] || '--'}</td>
                                                <td style={{ padding: '8px 10px', color: '#60a5fa', fontFamily: 'monospace', fontSize: '0.82rem' }}>{row['regno'] || row['regdno'] || row['regd.no'] || row['rollno'] || 'ERR'}</td>
                                                <td style={{ padding: '8px 10px', color: '#cbd5e1' }}>{row['name'] || row['studentname'] || 'ERR'}</td>
                                                <td style={{ padding: '8px 10px' }}>
                                                    {(() => {
                                                        let rawSec = '';
                                                        if (config.section === 'from_file') {
                                                            rawSec = (row['section'] || row['sec'] || '').toUpperCase().trim();
                                                        } else if (config.section === 'auto_split') {
                                                            const chunkSize = Math.ceil(parsedData.length / (config.splitCount || 2));
                                                            const chunk = Math.floor(i / chunkSize) + 1;
                                                            return <span style={{ color: '#f59e0b', fontWeight: 600 }}>{chunk}</span>;
                                                        } else {
                                                            rawSec = (config.section || '').toUpperCase().trim();
                                                        }

                                                        if (!rawSec) return <span style={{ opacity: 0.3 }}>--</span>;

                                                        return (
                                                            <span style={{ padding: '2px 8px', borderRadius: '6px', background: 'rgba(59,130,246,0.12)', color: '#93c5fd', fontWeight: 600, fontSize: '0.8rem' }}>
                                                                {rawSec}
                                                            </span>
                                                        );
                                                    })()}
                                                </td>
                                                <td style={{ padding: '8px 10px' }}>
                                                    {(() => {
                                                        const rawGrp = (
                                                            row['lab group'] || row['labgroup'] || row['lab_group'] ||
                                                            row['group'] || row['batch'] ||
                                                            config.labGroupOverride || ''
                                                        ).toString().trim();

                                                        if (!rawGrp) return <span style={{ opacity: 0.3, fontSize: '0.8rem' }}>--</span>;

                                                        return (
                                                            <span style={{ padding: '2px 8px', borderRadius: '6px', background: 'rgba(16,185,129,0.15)', color: '#34d399', fontWeight: 600, fontSize: '0.8rem' }}>
                                                                {rawGrp}
                                                            </span>
                                                        );
                                                    })()}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
                            <button className="btn" onClick={() => setStep(1)} style={{ color: '#94a3b8' }}>Back</button>
                            <button
                                className="btn btn-primary"
                                disabled={isProcessing || (!config.section && !detectedColumns.hasSection)}
                                onClick={executeImport}
                                style={{ padding: '12px 40px', borderRadius: '15px' }}
                                title={!config.section && !detectedColumns.hasSection ? 'Select a section first' : ''}
                            >
                                {isProcessing ? <QuantumLoader size={18} /> : '🔍 Check & Import'}
                            </button>
                        </div>
                    </div>
                )}

                {/* ─── STEP 3: Conflict Resolution ──────────────────────────── */}
                {step === 3 && (
                    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <div style={{ padding: '16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '14px' }}>
                            <div style={{ fontWeight: 700, color: '#f87171', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                ⚠️ {conflicts.length} Conflict{conflicts.length > 1 ? 's' : ''} Detected — Review Before Importing
                            </div>
                            <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                                These students already exist in the database with different details. Decide per student: <strong style={{ color: '#f59e0b' }}>Overwrite</strong> (use new data) or <strong style={{ color: '#60a5fa' }}>Skip</strong> (keep existing).
                            </div>
                        </div>

                        <div style={{ maxHeight: '360px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {conflicts.map(c => (
                                <div key={c.regNo} style={{ padding: '14px 16px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: '12px' }}>
                                    <div>
                                        <div style={{ fontFamily: 'monospace', color: '#60a5fa', fontSize: '0.85rem', fontWeight: 600 }}>{c.regNo}</div>
                                        {c.type === 'name_mismatch' ? (
                                            <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                                                <span style={{ color: '#94a3b8' }}>DB: </span>
                                                <span style={{ color: '#f87171', textDecoration: 'line-through', marginRight: '6px' }}>{c.existingName}</span>
                                                <span style={{ color: '#94a3b8' }}>→ New: </span>
                                                <span style={{ color: '#34d399' }}>{c.newName}</span>
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: '0.8rem', marginTop: '4px', color: '#fcd34d' }}>
                                                ⚠️ Branch mismatch — currently in a different cohort
                                            </div>
                                        )}
                                        {c.existingSlNo !== c.newSlNo && (
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                                                SL: {c.existingSlNo} → {c.newSlNo}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <button
                                            onClick={() => setConflictResolutions(r => ({ ...r, [c.regNo]: 'overwrite' }))}
                                            style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', background: conflictResolutions[c.regNo] === 'overwrite' ? '#f59e0b' : 'rgba(245,158,11,0.15)', color: conflictResolutions[c.regNo] === 'overwrite' ? '#0f172a' : '#f59e0b', transition: 'all 0.15s' }}
                                        >Overwrite</button>
                                        <button
                                            onClick={() => setConflictResolutions(r => ({ ...r, [c.regNo]: 'skip' }))}
                                            style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', background: conflictResolutions[c.regNo] === 'skip' ? '#3b82f6' : 'rgba(59,130,246,0.15)', color: conflictResolutions[c.regNo] === 'skip' ? 'white' : '#60a5fa', transition: 'all 0.15s' }}
                                        >Skip</button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div style={{ fontSize: '0.8rem', color: '#64748b', textAlign: 'right' }}>
                            {conflicts.filter(c => conflictResolutions[c.regNo] === 'overwrite').length} will overwrite ·{' '}
                            {conflicts.filter(c => conflictResolutions[c.regNo] === 'skip').length} will be skipped ·{' '}
                            {pendingImportQueue.length} clean records ready
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <button className="btn" onClick={() => setStep(2)} style={{ color: '#94a3b8' }}>← Reconfigure</button>
                            <button
                                className="btn btn-primary"
                                disabled={isProcessing}
                                onClick={() => commitImport(pendingImportQueue, conflicts, conflictResolutions)}
                                style={{ padding: '12px 32px', borderRadius: '15px', background: 'linear-gradient(135deg, #ef4444, #f59e0b)' }}
                            >
                                {isProcessing ? <QuantumLoader size={18} /> : `✅ Confirm & Import ${pendingImportQueue.length + conflicts.filter(c => conflictResolutions[c.regNo] === 'overwrite').length} Students`}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div >
    );
};
// --- Sub-Components ---
// eslint-disable-next-line sonarjs/cognitive-complexity
const AttendanceGenerator = ({ students, departments: propDepts, semesters: propSems, subjects: propSubjects, isAdmin }) => {
    // Helper for ordinal suffixes (1st, 2nd, 3rd, etc.)
    const getOrdinal = (n) => {
        const s = ["th", "st", "nd", "rd"], v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    // Pull from context directly to guarantee dropdowns are always populated
    const { departments: ctxDepts, semesters: ctxSems, subjects: ctxSubjects } = useMasterData();
    // eslint-disable-next-line sonarjs/no-dead-store, no-unused-vars
    const departments = (propDepts && propDepts.length > 0) ? propDepts : ctxDepts; // kept for dropdowns

    const semesters = (propSems && propSems.length > 0) ? propSems : ctxSems;

    const subjects = (propSubjects && propSubjects.length > 0) ? propSubjects : ctxSubjects;
    const [config, setConfig] = useState({
        branch: '',
        semester: '',
        groups: [], // multi-select lab batches e.g., ["CSE-B-1", "CSDS-2"]
        subject: '',
        labNo: '',
        date: ''
    });

    // Customization State for Print
    const [printSettings, setPrintSettings] = useState({
        fontSize: 15, // Default font size set per request
        rowHeight: 27,  // Slightly increased default row height
        showFooter: true
    });


    // (Dynamic Section Discovery removed, integrated directly into dynamicGroups below)

    const sheetStudents = React.useMemo(() => {
        // Must select both a semester and at least one lab batch to build a sheet
        if (!config.semester || !config.groups || config.groups.length === 0) return [];

        return students.filter(s => {
            if (String(s.semester) !== String(config.semester)) return false;

            if (config.groups && config.groups.length > 0) {
                const sSection = (s.section || '').trim();
                const sGroup = String(s.group || '1').trim();
                const subStr = sSection ? sSection : (s.branch || '').trim();
                const badge = `${subStr}-${sGroup}`.toUpperCase();

                if (!config.groups.includes(badge)) return false;
            }

            return true;
        }).sort((a, b) => {
            // Priority 1: Numeric Roll No
            const rollA = parseInt(a.rollNo || a.rollno || '0');
            const rollB = parseInt(b.rollNo || b.rollno || '0');
            if (rollA && rollB && rollA !== rollB) return rollA - rollB;

            // Priority 2: Reg No
            return (a.regNo || '').localeCompare(b.regNo || '');
        });
    }, [students, config.semester, config.groups]);

    useEffect(() => {
        if (sheetStudents.length > 0) {
            // Auto-calculate the best perfect fit for the initial load
            const bestFitHeight = Math.floor(740 / sheetStudents.length);
            // Don't let default go above 27 or below 14
            const initialDefault = Math.min(27, Math.max(14, bestFitHeight));
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setPrintSettings(prev => ({ ...prev, rowHeight: initialDefault }));
        }
    }, [sheetStudents.length]);

    const { showBranchColumn } = React.useMemo(() => {
        return {
            showBranchColumn: false // Disabled per user request (already in header)
        };
    }, []);

    // Smart Group Discovery: Builds labels like "CSE-B-1", "CSDS-1", etc.
    const dynamicGroups = React.useMemo(() => {
        if (!config.semester) return []; // ONLY SHOW BATCHES WHEN SEMESTER IS SELECTED

        const groupSet = new Set();

        students.forEach(s => {
            const matchSem = String(s.semester) === String(config.semester);

            if (matchSem) {
                const sSection = (s.section || '').trim();
                const sGroup = String(s.group || '1').trim();
                // If the section is empty, fallback to branch name.
                const subStr = sSection ? sSection : (s.branch || '').trim();

                const badge = `${subStr}-${sGroup}`.toUpperCase();
                groupSet.add(badge);
            }
        });

        // Return alphabetically sorted array
        return Array.from(groupSet)
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            .map(badge => ({ value: badge, label: badge }));
    }, [students, config.semester]);

    // Auto-reset group filter if the new dynamic list doesn't contain it
    useEffect(() => {
        if (!config.groups) return;
        const validGroups = config.groups.filter(g => dynamicGroups.some(dg => dg.value === g));
        if (validGroups.length !== config.groups.length) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setConfig(prev => ({ ...prev, groups: validGroups }));
        }
    }, [dynamicGroups, config.groups]);

    const handleExportExcel = () => {
        if (sheetStudents.length === 0) return;

        const dataForExcel = sheetStudents.map((s, idx) => ({
            'Sl No': idx + 1,
            'Roll No': s.rollNo || s.rollno || '--',
            'Regd No': s.regNo || '--',
            'Student Name': (s.name || 'Unnamed Student').toUpperCase(),
            'Branch': s.branch || '--'
        }));

        const ws = XLSX.utils.json_to_sheet(dataForExcel);

        // Auto-sizing columns (basic)
        ws['!cols'] = [
            { wch: 6 }, // Sl No
            { wch: 10 }, // Roll No
            { wch: 15 }, // Regd No
            { wch: 35 }, // Name
            { wch: 30 }  // Branch
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Attendance Sheet");

        let branchStr = config.groups.length > 0 ? config.groups.join('-') : 'All';
        const fileName = `Attendance_Sem${config.semester}_${branchStr}_${config.subject}.xlsx`;

        XLSX.writeFile(wb, fileName);
    };


    const printCss = `
        @import url('https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap');

        /* === Table styles — apply on screen AND in print === */
        .print-table {
            border: none;
            width: 100%;
            table-layout: auto;
            border-collapse: collapse;
        }
        .print-table thead { display: table-header-group; }
        .print-table tbody tr { page-break-inside: avoid; page-break-after: auto; }
        .print-table th, .print-table td {
            padding: 1px 2px;
            box-sizing: border-box;
            border: 1px solid black;
        }
        .print-table th:first-child, .print-table td:first-child { border-left: none; }
        .print-table th:last-child,  .print-table td:last-child  { border-right: none; }
        .print-table tr:first-child th { border-top: none; }
        .print-table tbody tr:last-child td { border-bottom: none; }
        .print-table th {
            border-bottom: 2px solid black;
            font-weight: 900 !important;
            text-align: center;
            background: #f8fafc;
        }
        /* Signature standalone table — no borders */
        .sig-table, .sig-table td { border: none !important; }

        /* === Print-only overrides === */
        @media print {
            @page { margin: 1.0cm 0.4cm 0.4cm 0.4cm; size: A4 portrait; }
            body * { visibility: hidden; }
            .print-area, .print-area * { visibility: visible; }
            .print-area {
                position: absolute; left: 0; top: 0;
                width: 100%; height: auto;
                margin: 0; padding: 0 !important;
                box-shadow: none !important;
                border-radius: 0 !important;
                min-width: 0 !important;
                max-width: none !important;
                background: white !important;
                color: black !important;
                font-family: 'Lato', 'Arial', sans-serif !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            .print-area * { font-family: 'Lato', 'Arial', sans-serif !important; }
            .preview-wrapper { margin: 0 !important; padding: 0 !important; border: none !important; box-shadow: none !important; background: transparent !important; border-radius: 0 !important; }
            .glass-panel, header, aside, .page-title, .no-print { display: none !important; }
        }
    `;

    let dynamicFontSize = printSettings.fontSize;
    if (sheetStudents.length > 50) {
        dynamicFontSize = Math.max(7, printSettings.fontSize - 2.5);
    } else if (sheetStudents.length > 25) {
        dynamicFontSize = Math.max(8, printSettings.fontSize - 1.5);
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

            {/* ══ CONFIG PANEL ══════════════════════════════════════════════════ */}
            <div className="glass-panel no-print" style={{
                padding: 0, overflow: 'hidden',
                border: '1px solid rgba(59,130,246,0.25)',
                borderRadius: '20px',
                boxShadow: '0 8px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.04) inset'
            }}>

                {/* ── Header bar ────────────────────────────── */}
                <div style={{
                    padding: '1.25rem 1.75rem',
                    background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(139,92,246,0.08))',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ padding: '10px', background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', borderRadius: '12px', boxShadow: '0 4px 14px rgba(59,130,246,0.4)' }}>
                            <Printer size={22} color="white" />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'white', letterSpacing: '0.2px' }}>Attendance Sheet Generator</h3>
                            <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>Configure and print your lab attendance sheet</p>
                        </div>
                    </div>
                    {/* Live student count chip */}
                    <div style={{
                        padding: '6px 16px', borderRadius: '30px',
                        background: sheetStudents.length > 0 ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${sheetStudents.length > 0 ? 'rgba(16,185,129,0.35)' : 'rgba(255,255,255,0.08)'}`,
                        display: 'flex', alignItems: 'center', gap: '6px'
                    }}>
                        <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: sheetStudents.length > 0 ? '#10b981' : '#475569', boxShadow: sheetStudents.length > 0 ? '0 0 6px #10b981' : 'none' }} />
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: sheetStudents.length > 0 ? '#34d399' : '#64748b' }}>
                            {sheetStudents.length} student{sheetStudents.length !== 1 ? 's' : ''} matched
                        </span>
                    </div>
                </div>

                {/* ── Form fields ────────────────────────────── */}
                <div style={{ padding: '1.5rem 1.75rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                    {/* Row 1: Semester + Batch + Subject */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                        <div className="form-group">
                            <label className="label-text" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#8b5cf6', display: 'inline-block' }} />
                                Semester
                            </label>
                            <select className="glass-select" value={config.semester}
                                onChange={e => setConfig({ ...config, semester: e.target.value, groups: [] })}>
                                <option value="">{semesters.length === 0 ? '⚠ Add in Master Data' : '— Select Semester —'}</option>
                                {semesters.map(s => <option key={s.id} value={s.number}>Sem {s.number}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="label-text" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                                Lab Batch / Sub-Group
                            </label>
                            <select className="glass-select" value={config.groups[0] || ''}
                                onChange={e => setConfig({ ...config, groups: e.target.value ? [e.target.value] : [] })}
                                disabled={!config.semester}
                                style={{ opacity: !config.semester ? 0.5 : 1 }}
                            >
                                <option value="">{dynamicGroups.length === 0 ? '— Select Semester first —' : '— Select Batch —'}</option>
                                {dynamicGroups.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="label-text" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
                                Subject
                            </label>
                            <select className="glass-select" value={config.subject}
                                onChange={e => setConfig({ ...config, subject: e.target.value })}>
                                <option value="">— Select Subject —</option>
                                {subjects.map(s => <option key={s.id} value={s.name}>{s.name}{s.code ? ` (${s.code})` : ''}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Row 2: Lab No + Date */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="form-group">
                            <label className="label-text" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                                Lab Number / Hall
                            </label>
                            <input className="glass-input" placeholder="e.g. Lab-1, Hall-A" value={config.labNo}
                                onChange={e => setConfig({ ...config, labNo: e.target.value })}
                                style={{ padding: '12px', width: '100%', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', color: 'white', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                        <div className="form-group">
                            <label className="label-text" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ec4899', display: 'inline-block' }} />
                                Date
                            </label>
                            <input type="date" value={config.date}
                                onChange={e => setConfig({ ...config, date: e.target.value })}
                                style={{ padding: '12px', width: '100%', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', color: 'white', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box', colorScheme: 'dark' }} />
                        </div>
                    </div>



                    {/* ── Print settings ─────────────────────── */}
                    <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <p style={{ margin: '0 0 12px', fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Print Layout Adjustments</p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Font Size</span>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#60a5fa' }}>{printSettings.fontSize}px</span>
                                </div>
                                <input type="range" min="9" max="16" step="1" value={printSettings.fontSize}
                                    onChange={e => setPrintSettings({ ...printSettings, fontSize: Number(e.target.value) })}
                                    style={{ width: '100%', accentColor: '#3b82f6', cursor: 'pointer' }} />
                            </div>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                                        Row Height {sheetStudents.length > 0 && printSettings.rowHeight * sheetStudents.length > 740 && <span style={{ color: '#f59e0b', marginLeft: '6px', fontSize: '0.7rem' }}>(May span 2 pages)</span>}
                                    </span>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#a78bfa' }}>{printSettings.rowHeight}px</span>
                                </div>
                                <input type="range"
                                    min="14"
                                    max="50"
                                    step="1"
                                    value={printSettings.rowHeight}
                                    onChange={e => setPrintSettings({ ...printSettings, rowHeight: Number(e.target.value) })}
                                    style={{ width: '100%', accentColor: '#8b5cf6', cursor: 'pointer' }} />
                            </div>
                        </div>
                    </div>

                    {/* ── CTA Buttons ──────────────────────────── */}
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        <button
                            onClick={() => window.print()}
                            disabled={sheetStudents.length === 0}
                            style={{
                                flex: 1, padding: '14px', borderRadius: '14px', border: 'none',
                                cursor: sheetStudents.length === 0 ? 'not-allowed' : 'pointer',
                                background: sheetStudents.length === 0
                                    ? 'rgba(255,255,255,0.05)'
                                    : 'linear-gradient(135deg, #3b82f6, #6366f1)',
                                color: sheetStudents.length === 0 ? '#475569' : 'white',
                                fontWeight: 800, fontSize: '1rem',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                                boxShadow: sheetStudents.length === 0 ? 'none' : '0 6px 20px rgba(59,130,246,0.4)',
                                transition: 'all 0.2s'
                            }}>
                            <Printer size={20} />
                            {sheetStudents.length === 0
                                ? 'Select filters to generate sheet'
                                : `Print / Save as PDF — ${sheetStudents.length} Students`}
                        </button>
                        {isAdmin && (
                            <button
                                onClick={handleExportExcel}
                                disabled={sheetStudents.length === 0}
                                style={{
                                    flex: 1, padding: '14px', borderRadius: '14px', border: 'none',
                                    cursor: sheetStudents.length === 0 ? 'not-allowed' : 'pointer',
                                    background: sheetStudents.length === 0
                                        ? 'rgba(255,255,255,0.05)'
                                        : 'linear-gradient(135deg, #10b981, #059669)',
                                    color: sheetStudents.length === 0 ? '#475569' : 'white',
                                    fontWeight: 800, fontSize: '1rem',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                                    boxShadow: sheetStudents.length === 0 ? 'none' : '0 6px 20px rgba(16,185,129,0.4)',
                                    transition: 'all 0.2s'
                                }}>
                                <Download size={20} />
                                Export to Excel
                            </button>
                        )}
                    </div>
                </div>
            </div>


            {/* PREVIEW AREA / PRINT AREA */}
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                padding: 'min(2.5rem, 5vw)',
                background: 'linear-gradient(135deg, rgba(15,23,42,0.4), rgba(30,41,59,0.4))',
                borderRadius: 'min(24px, 5vw)',
                marginTop: '1.5rem',
                border: '1px solid rgba(255,255,255,0.05)',
                boxShadow: 'inset 0 4px 20px rgba(0,0,0,0.3)',
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch'
            }} className="preview-wrapper">
                <div className="print-area" style={{
                    background: 'white', color: 'black',
                    padding: 'min(24px, 4vw)', // adds padding to look like a physical page on screen, responsive
                    borderRadius: '8px',
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)',
                    fontFamily: "'Lato', 'Arial', sans-serif",
                    fontSize: `${dynamicFontSize}px`,
                    boxSizing: 'border-box',
                    width: '100%',
                    maxWidth: '1050px',
                    minWidth: 'min(800px, max-content)',
                    transition: 'all 0.3s ease'
                }}>
                    <div style={{ border: '2px solid black', width: '100%', boxSizing: 'border-box' }}>
                        {/* Trident Academy Header */}
                        <div style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid black', boxSizing: 'border-box' }}>
                            {/* Top Institute Header */}
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                padding: '8px 10px 4px 10px', background: '#f8fafc', boxSizing: 'border-box'
                            }}>
                                <img src="/logo.png" alt="Trident Academy Logo" style={{ height: '36px', width: '36px', objectFit: 'contain', marginRight: '10px' }} />
                                <h1 style={{ textAlign: 'center', fontSize: '1.25em', fontWeight: '900', margin: '0', textTransform: 'uppercase', letterSpacing: '1px', color: '#020617', fontFamily: '"Arial Black", "Segoe UI Black", Impact, sans-serif' }}>
                                    TRIDENT ACADEMY OF TECHNOLOGY, BBSR
                                </h1>
                            </div>

                            {/* Title Bar - "ATTENDANCE SHEET" */}
                            <div style={{
                                borderTop: '1px solid black',
                                background: '#e2e8f0', // Light premium gray
                                padding: '3px 0',
                                textAlign: 'center'
                            }}>
                                <h2 style={{ fontSize: '1.05em', fontWeight: '900', margin: 0, textTransform: 'uppercase', letterSpacing: '5px', color: '#0f172a', fontFamily: '"Arial Black", "Segoe UI Black", Impact, sans-serif' }}>
                                    Laboratory Attendance Sheet
                                </h2>
                            </div>
                        </div>

                        {/* Meta Data Row 1: Date & Branch */}
                        <div style={{ display: 'flex', borderBottom: '1px solid black' }}>
                            <div style={{ width: '40%', borderRight: '1px solid black', padding: '4px 8px', display: 'flex', alignItems: 'flex-end' }}>
                                <span style={{ fontWeight: '900', marginRight: '5px', fontSize: '1em' }}>Date:</span>
                                <span style={{ borderBottom: '1px dotted black', flex: 1, paddingBottom: '1px', textAlign: 'center', fontWeight: '900' }}>{config.date}</span>
                            </div>
                            <div style={{ flex: 1, padding: '4px 8px', display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-end' }}>
                                <span style={{ fontWeight: '900', marginRight: '5px', fontSize: '1em' }}>Branch:</span>
                                <span style={{ borderBottom: '1px dotted black', flex: 1, textAlign: 'center', textTransform: 'uppercase', fontWeight: '900', paddingBottom: '1px' }}>
                                    {(() => {
                                        if (config.groups.length > 0) return config.groups.join(', ');
                                        const uniqueBranches = Array.from(new Set(sheetStudents.map(s => s.branch))).filter(Boolean);
                                        return uniqueBranches.length > 0 ? uniqueBranches.join(', ') : '';
                                    })()}
                                </span>
                            </div>
                        </div>

                        {/* Meta Data Row 2: Sem, Subject, Lab No */}
                        <div style={{ display: 'flex', borderBottom: '1.5px solid black', background: '#ffffff' }}>
                            <div style={{ width: '20%', borderRight: '1px solid black', padding: '4px 8px', display: 'flex', alignItems: 'flex-end' }}>
                                <span style={{ fontWeight: '900', marginRight: '5px', fontSize: '1em' }}>Sem:</span>
                                <span style={{ borderBottom: '1px dotted black', flex: 1, textTransform: 'uppercase', textAlign: 'center', fontWeight: '900', paddingBottom: '1px' }}>
                                    {config.semester ? getOrdinal(parseInt(config.semester)).toUpperCase() : ''}
                                </span>
                            </div>
                            <div style={{ flex: 1, borderRight: '1px solid black', padding: '4px 8px', display: 'flex', alignItems: 'flex-end' }}>
                                <span style={{ fontWeight: '900', marginRight: '5px', fontSize: '1em' }}>Subject:</span>
                                <span style={{ borderBottom: '1px dotted black', minWidth: '0', width: '100%', textAlign: 'center', textTransform: 'uppercase', fontWeight: '900', paddingBottom: '1px' }}>{config.subject}</span>
                            </div>
                            <div style={{ width: '20%', padding: '4px 8px', display: 'flex', alignItems: 'flex-end' }}>
                                <span style={{ fontWeight: '900', marginRight: '5px', fontSize: '1em' }}>Lab No:</span>
                                <span style={{ borderBottom: '1px dotted black', flex: 1, textAlign: 'center', textTransform: 'uppercase', fontWeight: '900', paddingBottom: '1px' }}>{config.labNo}</span>
                            </div>
                        </div>

                        {/* Student Records Table */}
                        <table className="print-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'inherit', border: 'none' }}>
                            <thead>
                                <tr>
                                    <th style={{ width: '35px', textAlign: 'center', background: 'transparent', borderTop: 'none', padding: '1px 2px', fontSize: '0.8em', fontWeight: '900' }}>Roll<br />No</th>
                                    <th style={{ width: '85px', textAlign: 'center', background: 'transparent', borderTop: 'none', padding: '1px 2px', fontSize: '0.85em', fontWeight: '900' }}>Regd. No</th>
                                    <th style={{ width: '220px', textAlign: 'center', background: 'transparent', borderTop: 'none', fontWeight: '900' }}>Name of the Student</th>
                                    {showBranchColumn && <th style={{ width: '45px', textAlign: 'center', background: 'transparent', borderTop: 'none', padding: '1px 2px', fontSize: '0.8em', fontWeight: '900' }}>Branch</th>}
                                    <th style={{ width: '320px', textAlign: 'center', background: 'transparent', borderTop: 'none', fontWeight: '900' }}>Signature</th>
                                    <th style={{ width: '26px', fontSize: '0.70rem', background: 'transparent', borderTop: 'none', fontWeight: '900' }}>DP&amp;A<br />(2)</th>
                                    <th style={{ width: '26px', fontSize: '0.70rem', background: 'transparent', borderTop: 'none', fontWeight: '900' }}>LR<br />(2)</th>
                                    <th style={{ width: '26px', fontSize: '0.70rem', background: 'transparent', borderTop: 'none', fontWeight: '900' }}>LQ<br />(1)</th>
                                    <th style={{ width: '26px', fontSize: '0.70rem', background: 'transparent', borderTop: 'none', fontWeight: '900' }}>E&amp;V<br />(5)</th>
                                    <th style={{ width: '38px', fontSize: '0.70rem', fontWeight: '900', background: 'transparent', borderTop: 'none' }}>TOTAL<br />(10)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sheetStudents.map((student) => {
                                    return (
                                        <tr key={student.id} style={{ height: `${printSettings.rowHeight}px` }}>
                                            <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{student.rollNo || student.rollno || '--'}</td>
                                            <td style={{ textAlign: 'center', fontFamily: "'Lato','Arial',sans-serif", fontSize: '0.88em', letterSpacing: '0px' }}>{student.regNo || '--'}</td>
                                            <td style={{
                                                padding: sheetStudents.length > 50 ? '0px 4px' : '1px 6px',
                                                fontWeight: '600',
                                                fontSize: (student.name || '').length > 28 ? '0.75em' : '0.85em',
                                                lineHeight: '1',
                                                wordBreak: 'break-word',
                                                whiteSpace: 'normal',
                                                fontFamily: "'Lato','Arial',sans-serif",
                                                textAlign: 'left'
                                            }}>
                                                {(student.name || 'Unnamed Student').toUpperCase()}
                                            </td>
                                            {showBranchColumn && <td style={{ textAlign: 'center', fontSize: '0.85em' }}>{student.branch || '--'}</td>}
                                            <td></td> {/* Signature */}
                                            <td></td> {/* DP&A */}
                                            <td></td> {/* LR */}
                                            <td></td> {/* LQ */}
                                            <td></td> {/* E&V */}
                                            <td></td> {/* TOT */}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Signature section — standalone table OUTSIDE the student grid */}
                    <table className="sig-table" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '6px', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                        <tbody>
                            <tr style={{ pageBreakInside: "avoid", breakInside: "avoid" }}>
                                <td style={{ width: "50%", textAlign: "center", border: "none", paddingTop: "52px", paddingRight: "40px", verticalAlign: "bottom" }}>
                                    <div style={{ borderTop: "2px solid black", paddingTop: "3px", fontWeight: "900", fontSize: "12px", textAlign: "center" }}>Faculty Signature</div>
                                </td>
                                <td style={{ width: "50%", textAlign: "center", border: "none", paddingTop: "52px", paddingLeft: "40px", verticalAlign: "bottom" }}>
                                    <div style={{ borderTop: "2px solid black", paddingTop: "3px", fontWeight: "900", fontSize: "12px", textAlign: "center" }}>HOD Signature</div>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                </div>
            </div>
            <style dangerouslySetInnerHTML={{ __html: printCss }} />
        </div >
    );
};

// --- Smart Promotion Manager ---
const PromotionManager = ({ students, departments: propDepts, semesters: propSems, refresh }) => {
    const { departments: ctxDepts, semesters: ctxSems } = useMasterData();
    const departments = (propDepts && propDepts.length > 0) ? propDepts : ctxDepts;
    const semesters = (propSems && propSems.length > 0) ? propSems : ctxSems;
    const [fromSem, setFromSem] = useState('');
    const [targetBranch, setTargetBranch] = useState('');
    const [processing, setProcessing] = useState(false);
    const [selectedStudentIds, setSelectedStudentIds] = useState(new Set());
    const [mode, setMode] = useState('promote'); // 'promote' or 'graduate'

    // Smart Filtering: Only Active students are eligible
    // We strictly exclude 'tc' or 'alumni' from promotions
    const eligibleStudents = React.useMemo(() => {
        return students.filter(s =>
            (targetBranch ? s.branch === targetBranch : true) &&
            (fromSem ? s.semester == fromSem : true) &&
            s.status === 'active'
        ).sort((a, b) => {
            const rA = parseInt(a.rollNo || a.rollno || '0');
            const rB = parseInt(b.rollNo || b.rollno || '0');
            if (rA && rB && rA !== rB) return rA - rB;
            return a.regNo.localeCompare(b.regNo);
        });
    }, [students, targetBranch, fromSem]);

    // Auto-select all when filter changes
    useEffect(() => {
        const ids = new Set(eligibleStudents.map(s => s.id));
        setSelectedStudentIds(ids);

        // Smart Mode Detection: Are we graduating?
        // Assuming Max Sem is 8 (B.Tech) or user can manually set. 
        // For now, heuristic: If Sem >= 8, Mode = Graduate
        if (fromSem && parseInt(fromSem) >= 8) {
            setMode('graduate');
        } else {
            setMode('promote');
        }
    }, [eligibleStudents, fromSem]);

    const toggleSelection = (id) => {
        const newSet = new Set(selectedStudentIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedStudentIds(newSet);
    };

    const handleSelectAll = () => {
        if (selectedStudentIds.size === eligibleStudents.length) {
            setSelectedStudentIds(new Set());
        } else {
            setSelectedStudentIds(new Set(eligibleStudents.map(s => s.id)));
        }
    };

    const handleExecute = async () => {
        if (!fromSem) return;

        const count = selectedStudentIds.size;
        if (count === 0) {
            toast.error("No students selected!");
            return;
        }

        const actionVerbs = mode === 'graduate' ? ['Graduate', 'to Alumni'] : ['Promote', `to Sem ${parseInt(fromSem) + 1}`];

        const confirmMsg = `Dynamic Safety Check:\n\nYou are about to ${actionVerbs[0]} ${count} students ${actionVerbs[1]}.\n\n${eligibleStudents.length - count} students were deselected (Year Back/Retained).\n\nProceed?`;

        if (!window.confirm(confirmMsg)) return;

        setProcessing(true);
        try {
            const batch = writeBatch(db);
            const nextSem = parseInt(fromSem) + 1;

            // Convert Set to Array for iteration
            const selectedIds = Array.from(selectedStudentIds);

            selectedIds.forEach(id => {
                const ref = doc(db, 'students', id);
                if (mode === 'graduate') {
                    // Graduation Logic: Status -> Alumni, Semester -> 'Graduated'
                    batch.update(ref, {
                        status: 'alumni',
                        semester: 'Alumni',
                        updatedAt: new Date().toISOString()
                    });
                } else {
                    // Promotion Logic: Sem + 1
                    batch.update(ref, {
                        semester: nextSem.toString(),
                        updatedAt: new Date().toISOString()
                    });
                }
            });

            await batch.commit();
            toast.success(`Success! ${count} students processed.`);
            refresh();
        } catch (e) {
            console.error(e);
            toast.error("Operation failed. Check console.");
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="glass-panel fade-in-up" style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
            <h2 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ArrowRight size={24} className={mode === 'graduate' ? 'text-success' : 'text-accent'} />
                {mode === 'graduate' ? 'Batch Graduation' : 'Cohort Promotion'}
            </h2>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '2rem' }}>
                {mode === 'graduate'
                    ? "Move final year students to 'Alumni' status. Deselect any students who have not cleared their exams."
                    : "Move students to the next semester. Deselect students who are retaining the year (Year Back)."
                }
            </p>

            {/* Filters */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) minmax(200px, 1fr) auto', gap: '1rem', alignItems: 'end', marginBottom: '2rem' }}>
                <div>
                    <label className="label-text">Filter Branch</label>
                    <select className="glass-select" value={targetBranch} onChange={e => setTargetBranch(e.target.value)}>
                        <option value="">All Branches</option>
                        {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="label-text">Current Semester</label>
                    <select className="glass-select" value={fromSem} onChange={e => setFromSem(e.target.value)}>
                        <option value="">Select Sem</option>
                        {semesters.map(s => <option key={s.id} value={s.number}>{s.number}</option>)}
                    </select>
                </div>
                {/* Stats */}
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', lineHeight: 1 }}>{eligibleStudents.length}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Eligible</div>
                </div>
            </div>

            {/* Selection List */}
            {eligibleStudents.length > 0 && (
                <div style={{ marginBottom: '2rem', border: '1px solid var(--glass-border)', borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{
                        padding: '10px 15px',
                        background: 'rgba(255,255,255,0.05)',
                        borderBottom: '1px solid var(--glass-border)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <input
                                type="checkbox"
                                checked={selectedStudentIds.size === eligibleStudents.length && eligibleStudents.length > 0}
                                onChange={handleSelectAll}
                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                            />
                            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Select All</span>
                        </div>
                        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                            {selectedStudentIds.size} selected for {mode === 'graduate' ? 'Graduation' : 'Promotion'}
                        </span>
                    </div>

                    <div style={{ maxHeight: '400px', overflowY: 'auto', background: 'var(--glass-bg)' }}>
                        {eligibleStudents.map(student => (
                            <div
                                key={student.id}
                                onClick={() => toggleSelection(student.id)}
                                style={{
                                    padding: '10px 15px',
                                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                                    display: 'flex', alignItems: 'center', gap: '15px',
                                    cursor: 'pointer',
                                    background: selectedStudentIds.has(student.id) ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                                    transition: 'background 0.2s'
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedStudentIds.has(student.id)}
                                    readOnly
                                    style={{ width: '16px', height: '16px', pointerEvents: 'none' }}
                                />
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <span style={{ fontWeight: 600, color: '#f59e0b', width: '40px' }}>{student.rollNo || student.rollno || '--'}</span>
                                    <span style={{ fontFamily: 'monospace', color: 'var(--color-text-muted)', width: '120px' }}>{student.regNo}</span>
                                    <span style={{ fontWeight: 500 }}>{student.name}</span>
                                    {student.isLateral && <span className="badge-lateral">Lateral</span>}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{student.section}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Action Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <ShieldAlert size={18} color="#f59e0b" />
                    <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                        <strong>Tip:</strong> Uncheck students who have a "Year Back" or are retained in the current semester.
                    </span>
                </div>
                <button
                    className={`btn ${mode === 'graduate' ? 'btn-success' : 'btn-primary'}`}
                    style={{ padding: '0.75rem 2rem', fontSize: '1rem', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}
                    disabled={processing || selectedStudentIds.size === 0}
                    onClick={handleExecute}
                >
                    {processing && <QuantumLoader size={20} />}
                    {!processing && mode === 'graduate' && `Graduate ${selectedStudentIds.size} Students`}
                    {!processing && mode !== 'graduate' && `Promote ${selectedStudentIds.size} Students`}
                </button>
            </div>

            <style>{`
                .badge-lateral {
                    font-size: 0.65rem;
                    padding: 2px 6px;
                    border-radius: 4px;
                    background: rgba(245, 158, 11, 0.2);
                    color: #f59e0b;
                    border: 1px solid rgba(245, 158, 11, 0.3);
                }
                .btn-success {
                    background: #10b981;
                    color: white;
                    border: none;
                }
                .btn-success:hover {
                    background: #059669;
                }
            `}</style>
        </div>
    );
};

export default Students;
