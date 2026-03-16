import React, { useState, useMemo, useCallback } from 'react';
import { db } from '../lib/firebase';
import { writeBatch, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useMasterData } from '../contexts/MasterDataContext';
import { Users, Save, Plus, Trash2, GripVertical, CheckCircle, AlertTriangle, Layers, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

// ─── Colour per group ──────────────────────────────────────────────────────────
const GROUP_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
const GROUP_BG = ['rgba(59,130,246,0.12)', 'rgba(16,185,129,0.12)', 'rgba(245,158,11,0.12)', 'rgba(239,68,68,0.12)'];
const GROUP_BORDER = ['rgba(59,130,246,0.3)', 'rgba(16,185,129,0.3)', 'rgba(245,158,11,0.3)', 'rgba(239,68,68,0.3)'];

// ─── GroupManager ──────────────────────────────────────────────────────────────
const GroupManager = ({ allStudents }) => {
    const { activeAcademicYear, userProfile } = useAuth();
    const isAdmin = userProfile?.role === 'admin';
    const { departments, semesters, groups: masterGroups = [] } = useMasterData();

    // ── filters ────────────────────────────────────────────────────────────────
    const [filterYear, setFilterYear] = useState(activeAcademicYear || '');
    const [filterBranch, setFilterBranch] = useState('');
    const [filterSem, setFilterSem] = useState('');
    const [filterSection, setFilterSection] = useState('');

    // ── derived cohort ────────────────────────────────────────────────────────
    // Students for the selected cohort, sorted by slNo then regNo as fallback
    const cohort = useMemo(() => {
        if (!filterBranch || !filterSem) return [];
        return allStudents
            .filter(s => {
                const bUpper = (filterBranch || '').toUpperCase();
                const isBranchMatch = s.branch === filterBranch ||
                    (s.section && s.section.toUpperCase().split('/').some(part => part.trim() === bUpper));

                const isSemMatch = String(s.semester) === String(filterSem);
                const isSecMatch = filterSection === '' || s.section === filterSection || (!s.section && filterSection === 'NO_SECTION');

                return isBranchMatch && isSemMatch && isSecMatch && s.status !== 'alumni';
            })
            .sort((a, b) => {
                const sa = a.slNo ?? 9999, sb = b.slNo ?? 9999;
                if (sa !== sb) return sa - sb;
                // Fallback: Numeric Roll No
                const rA = parseInt(a.rollNo || a.rollno || '0');
                const rB = parseInt(b.rollNo || b.rollno || '0');
                if (rA && rB && rA !== rB) return rA - rB;
                // Final fallback: Reg No
                return (a.regNo || '').localeCompare(b.regNo || '');
            });
    }, [allStudents, filterBranch, filterSem, filterSection]);

    // ── local SL-No ordered list (editable) ───────────────────────────────────
    const [localList, setLocalList] = useState(null); // null = use cohort directly
    const displayList = localList ?? cohort;

    // Reset local list when cohort changes
    React.useEffect(() => { setLocalList(null); }, [cohort]);

    // ── unique sections found in the full students list AND master data ──────
    const availableSections = useMemo(() => {
        const masterSecs = masterGroups.map(g => g.name).filter(Boolean);
        if (!filterBranch || !filterSem) return masterSecs;

        const bUpper = (filterBranch || '').toUpperCase();
        const secs = new Set([
            ...masterSecs,
            ...allStudents
                .filter(s => {
                    const isBranchMatch = s.branch === filterBranch ||
                        (s.section && s.section.toUpperCase().split('/').some(part => part.trim() === bUpper));
                    return isBranchMatch && String(s.semester) === String(filterSem);
                })
                .map(s => s.section)
                .filter(Boolean)
        ]);
        return [...secs].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }, [allStudents, filterBranch, filterSem, masterGroups]);

    // ── group configuration ───────────────────────────────────────────────────
    const [batchStrategy, setBatchStrategy] = useState('existing'); // 'auto' | 'existing'
    const [numGroups, setNumGroups] = useState(2);
    // splitPoints: array of (numGroups-1) numbers — last SL No in each group except last
    const [splitPoints, setSplitPoints] = useState([]);   // e.g. [40] for 2 groups where G1 = SL 1-40

    // Recalculate default split points whenever numGroups or displayList changes
    React.useEffect(() => {
        if (displayList.length === 0) { setSplitPoints([]); return; }
        const total = displayList.length;
        const pts = [];
        for (let i = 1; i < numGroups; i++) {
            pts.push(Math.floor((total / numGroups) * i));
        }
        setSplitPoints(pts);
    }, [numGroups, displayList.length]);

    // Group membership derived from splitPoints, respecting manual overrides
    const groupedStudents = useMemo(() => {
        let actualNumGroups = numGroups;
        if (batchStrategy === 'existing') {
            const maxG = Math.max(1, ...displayList.map(s => parseInt(s.manualGroup || s.group || '1') || 1));
            actualNumGroups = Math.max(actualNumGroups, maxG);
        }

        const groupsArr = Array.from({ length: actualNumGroups }, () => []);
        displayList.forEach((s, idx) => {
            if (batchStrategy === 'existing') {
                const gIdx = (parseInt(s.manualGroup || s.group || '1') || 1) - 1;
                if (groupsArr[gIdx]) {
                    groupsArr[gIdx].push({ ...s, _localIdx: idx });
                    return;
                }
            }

            if (s.manualGroup) {
                const gIdx = parseInt(s.manualGroup) - 1;
                if (!isNaN(gIdx) && groupsArr[gIdx]) {
                    groupsArr[gIdx].push({ ...s, _localIdx: idx, _isManual: true });
                    return;
                }
            }
            let g = numGroups - 1; // default: last group
            for (let i = 0; i < splitPoints.length; i++) {
                if (idx < splitPoints[i]) { g = i; break; }
            }
            groupsArr[g].push({ ...s, _localIdx: idx });
        });
        return groupsArr;
    }, [displayList, numGroups, splitPoints, batchStrategy]);

    // ── add student at position ───────────────────────────────────────────────
    const [addModalOpen, setAddModalOpen] = useState(false);
    const [addForm, setAddForm] = useState({ regNo: '', rollNo: '', name: '', position: '' });
    const [isSaving, setIsSaving] = useState(false);

    const handleInsertStudent = useCallback(async () => {
        const { regNo, rollNo, name, position } = addForm;
        if (!regNo || !name) { toast.error('Reg No and Name are required'); return; }
        const pos = parseInt(position) || (displayList.length + 1);
        const clampedPos = Math.max(1, Math.min(pos, displayList.length + 1));

        setIsSaving(true);
        try {
            const batch = writeBatch(db);

            // Shift existing students with slNo >= clampedPos up by 1
            const toShift = displayList.filter(s => (s.slNo ?? 9999) >= clampedPos);
            toShift.forEach(s => {
                batch.update(doc(db, 'students', s.id), { slNo: (s.slNo ?? clampedPos) + 1 });
            });

            // Create the new student
            const safeId = String(regNo).trim().toUpperCase().replace(/[^a-zA-Z0-9]/g, '_');
            batch.set(doc(db, 'students', safeId), {
                regNo: String(regNo).trim().toUpperCase(),
                rollNo: String(rollNo || '').trim(),
                name: String(name).trim().toUpperCase(),
                branch: filterBranch,
                semester: filterSem,
                section: filterSection,
                academicYear: filterYear,
                slNo: clampedPos,
                group: '1',
                status: 'active',
                isLateral: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            }, { merge: true });

            await batch.commit();
            toast.success(`Student inserted at SL No. ${clampedPos}`);
            setAddModalOpen(false);
            setAddForm({ regNo: '', rollNo: '', name: '', position: '' });
        } catch (e) {
            console.error(e);
            toast.error('Failed to insert student');
        } finally {
            setIsSaving(false);
        }
    }, [addForm, displayList, filterBranch, filterSem, filterSection, filterYear]);

    // ── delete student + reorder ──────────────────────────────────────────────
    const handleRemoveStudent = useCallback(async (student) => {
        if (!window.confirm(`Remove ${student.name} from this cohort? Their SL No will be freed and others re-ordered.`)) return;
        setIsSaving(true);
        try {
            const batch = writeBatch(db);
            // Shift everyone after this student down
            const removedSlNo = student.slNo ?? 9999;
            displayList
                .filter(s => s.id !== student.id && (s.slNo ?? 9999) > removedSlNo)
                .forEach(s => batch.update(doc(db, 'students', s.id), { slNo: s.slNo - 1 }));
            // Delete the student
            batch.delete(doc(db, 'students', student.id));
            await batch.commit();
            toast.success(`${student.name} removed and SL Nos reordered`);
        } catch (e) {
            console.error(e);
            toast.error('Failed to remove student');
        } finally {
            setIsSaving(false);
        }
    }, [displayList]);

    // ── move student (change SL No) ───────────────────────────────────────────
    const handleMoveStudent = useCallback((studentId, newSlNo) => {
        // Optimistic local update only — persisted on "Save Groups"
        setLocalList(prev => {
            const list = [...(prev ?? cohort)];
            const fromIdx = list.findIndex(s => s.id === studentId);
            if (fromIdx === -1) return prev;
            const [moved] = list.splice(fromIdx, 1);
            const toIdx = Math.max(0, Math.min(newSlNo - 1, list.length));
            list.splice(toIdx, 0, moved);
            return list.map((s, i) => ({ ...s, slNo: i + 1 }));
        });
    }, [cohort]);

    // ── manual group override ─────────────────────────────────────────────────
    const handleOverrideGroup = useCallback((studentId, newGroup) => {
        setLocalList(prev => {
            const list = [...(prev ?? cohort)];
            return list.map(s => s.id === studentId ? { ...s, manualGroup: newGroup } : s);
        });
    }, [cohort]);

    // ── move to another section ───────────────────────────────────────────────
    const handleMoveToSection = useCallback(async (studentId, studentName, newSection) => {
        if (!newSection) return;
        if (!window.confirm(`Move ${studentName} to Section ${newSection}? They will be removed from this view.`)) return;
        setIsSaving(true);
        try {
            await updateDoc(doc(db, 'students', studentId), { section: newSection, slNo: 9999, group: '1' });
            // Remove from localList (optimistic view) so they disappear immediately
            setLocalList(prev => prev ? prev.filter(s => s.id !== studentId) : null);
            toast.success(`Moved ${studentName} to Section ${newSection}`);
        } catch (e) {
            console.error(e);
            toast.error('Failed to move section');
        } finally {
            setIsSaving(false);
        }
    }, []);

    // ── AI Smart Allocation ───────────────────────────────────────────────────
    const [magicMenuOpen, setMagicMenuOpen] = useState(false);

    const handleMagicSort = useCallback((type) => {
        let sorted = [...(localList ?? cohort)];

        if (type === 'alpha') {
            sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        } else if (type === 'roll') {
            sorted.sort((a, b) => {
                const rA = parseInt(a.rollNo || a.rollno || '0');
                const rB = parseInt(b.rollNo || b.rollno || '0');
                if (!isNaN(rA) && !isNaN(rB) && rA !== rB) return rA - rB;
                return (a.name || '').localeCompare(b.name || '');
            });
        } else if (type === 'shuffle') {
            for (let i = sorted.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1)); // eslint-disable-line sonarjs/pseudo-random
                [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
            }
        }

        // Apply the new order linearly as SL Nos, and clear manual overrides so batches naturally follow.
        sorted = sorted.map((s, idx) => ({ ...s, slNo: idx + 1, manualGroup: null }));
        setLocalList(sorted);
        setMagicMenuOpen(false);
        toast.success(`Smart Sort applied! Click Save to confirm.`);
    }, [localList, cohort]);

    // ── save all group assignments to Firestore ────────────────────────────────
    const handleSaveGroups = useCallback(async () => {
        if (displayList.length === 0) { toast.error('No students to save'); return; }
        setIsSaving(true);
        try {
            const batch = writeBatch(db);
            displayList.forEach((s, idx) => {
                let finalGroup;
                if (batchStrategy === 'existing') {
                    finalGroup = s.manualGroup || s.group || '1';
                } else {
                    let g = numGroups;
                    for (let i = 0; i < splitPoints.length; i++) {
                        if (idx < splitPoints[i]) { g = i + 1; break; }
                    }
                    finalGroup = s.manualGroup || String(g);
                }

                batch.update(doc(db, 'students', s.id), {
                    slNo: idx + 1,
                    group: finalGroup,
                    updatedAt: new Date().toISOString(),
                });
            });
            await batch.commit();
            setLocalList(null); // pull fresh from allStudents
            toast.success(`Groups saved! ${displayList.length} students updated.`);
        } catch (e) {
            console.error(e);
            toast.error('Failed to save groups');
        } finally {
            setIsSaving(false);
        }
    }, [displayList, numGroups, splitPoints, batchStrategy]);

    // ── delete entire batch ────────────────────────────────────────────────────
    const handleDeleteBatch = useCallback(async () => {
        if (!isAdmin || displayList.length === 0) return;
        const confirmDelete = window.confirm(`DANGER: Are you absolutely sure you want to permanently delete all ${displayList.length} students currently displayed in this batch?`);
        if (!confirmDelete) return;

        setIsSaving(true);
        try {
            const batch = writeBatch(db);
            displayList.forEach(s => {
                batch.delete(doc(db, 'students', s.id));
            });
            await batch.commit();
            setLocalList(null);
            toast.success(`Successfully deleted ${displayList.length} students.`);
        } catch (e) {
            console.error(e);
            toast.error('Failed to delete batch');
        } finally {
            setIsSaving(false);
        }
    }, [displayList, isAdmin]);

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────────
    const hasCohort = displayList.length > 0;

    return (
        <div className="fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* ── Filter Panel ─────────────────────────────────────────────── */}
            <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <h3 style={{ margin: '0 0 1.25rem', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.05rem', color: '#e2e8f0' }}>
                    <Layers size={20} color="#3b82f6" /> Select Cohort
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
                    {/* Academic Year */}
                    <div>
                        <label style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Academic Year</label>
                        <input
                            className="glass-select"
                            value={filterYear}
                            onChange={e => setFilterYear(e.target.value)}
                            placeholder={activeAcademicYear || 'e.g. 2025-2026 (ODD)'}
                            style={{ width: '100%', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.1)', padding: '12px', borderRadius: '14px', color: 'white', fontSize: '0.9rem', outline: 'none' }}
                        />
                    </div>
                    {/* Branch */}
                    <div>
                        <label style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Branch</label>
                        <select className="glass-select" value={filterBranch} onChange={e => { setFilterBranch(e.target.value); setFilterSection(''); }}>
                            <option value="">-- Branch --</option>
                            {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                        </select>
                    </div>
                    {/* Semester */}
                    <div>
                        <label style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Semester</label>
                        <select className="glass-select" value={filterSem} onChange={e => { setFilterSem(e.target.value); setFilterSection(''); }}>
                            <option value="">-- Semester --</option>
                            {semesters.map(s => <option key={s.id} value={s.number}>Sem {s.number}</option>)}
                        </select>
                    </div>
                </div>

                {/* ── Modern Section Badges ── */}
                {filterBranch && filterSem && (
                    <div style={{ marginTop: '1.25rem' }}>
                        <label style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '8px' }}>
                            Section / Filter
                        </label>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                                onClick={() => setFilterSection('')}
                                style={{
                                    padding: '7px 18px', borderRadius: '10px', cursor: 'pointer',
                                    fontWeight: 600, fontSize: '0.82rem', transition: 'all 0.18s',
                                    border: filterSection === '' ? '1.5px solid #10b981' : '1px solid rgba(255,255,255,0.1)',
                                    background: filterSection === '' ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.04)',
                                    color: filterSection === '' ? '#34d399' : '#64748b',
                                }}>
                                All Students
                            </button>
                            {availableSections.map(secName => {
                                const active = filterSection === secName;
                                return (
                                    <button key={secName} onClick={() => setFilterSection(secName)}
                                        style={{
                                            padding: '7px 18px', borderRadius: '10px', cursor: 'pointer',
                                            fontWeight: 700, fontSize: '0.82rem', transition: 'all 0.18s',
                                            border: active ? '1.5px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                                            background: active ? 'linear-gradient(135deg,#3b82f6,#6366f1)' : 'rgba(255,255,255,0.04)',
                                            color: active ? 'white' : '#94a3b8',
                                            boxShadow: active ? '0 4px 14px rgba(59,130,246,0.35)' : 'none',
                                            display: 'flex', alignItems: 'center', gap: '6px'
                                        }}>
                                        {active && <CheckCircle size={13} />}
                                        {secName}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {hasCohort && (
                    <div style={{ marginTop: '1.25rem', padding: '10px 16px', background: 'rgba(59,130,246,0.1)', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.875rem', color: '#93c5fd' }}>
                        <CheckCircle size={16} />
                        <span><strong>{displayList.length}</strong> active students found in {filterBranch} · Sem {filterSem} {filterSection ? `· Sect ${filterSection}` : ''}</span>
                    </div>
                )}
                {filterBranch && filterSem && !hasCohort && (
                    <div style={{ marginTop: '1rem', padding: '10px 16px', background: 'rgba(245,158,11,0.08)', borderRadius: '12px', border: '1px solid rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.875rem', color: '#fcd34d' }}>
                        <AlertTriangle size={16} />
                        <span>No students found for this combination. Import students first.</span>
                    </div>
                )}
            </div>

            {hasCohort && (<>
                {/* ── Group Configuration ──────────────────────────────────── */}
                <div className="glass-panel" style={{ padding: '2rem', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.08)', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(90deg, #10b981, #3b82f6)' }}></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', color: '#f8fafc', fontWeight: 700 }}>
                            <Users size={22} color="#10b981" /> Batch Configuration
                        </h3>

                        {/* Strategy Toggle */}
                        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <button
                                onClick={() => setBatchStrategy('auto')}
                                style={{
                                    padding: '8px 16px', borderRadius: '10px', cursor: 'pointer', border: 'none',
                                    background: batchStrategy === 'auto' ? 'rgba(59,130,246,0.2)' : 'transparent',
                                    color: batchStrategy === 'auto' ? '#60a5fa' : '#64748b',
                                    fontWeight: batchStrategy === 'auto' ? 700 : 500,
                                    fontSize: '0.85rem', transition: 'all 0.2s'
                                }}
                            >
                                Auto-Divide
                            </button>
                            <button
                                onClick={() => setBatchStrategy('existing')}
                                style={{
                                    padding: '8px 16px', borderRadius: '10px', cursor: 'pointer', border: 'none',
                                    background: batchStrategy === 'existing' ? 'rgba(245,158,11,0.2)' : 'transparent',
                                    color: batchStrategy === 'existing' ? '#fcd34d' : '#64748b',
                                    fontWeight: batchStrategy === 'existing' ? 700 : 500,
                                    fontSize: '0.85rem', transition: 'all 0.2s'
                                }}
                            >
                                Keep Imported Batches
                            </button>
                        </div>
                    </div>

                    {batchStrategy === 'existing' ? (
                        <div style={{ padding: '1.5rem', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '16px' }}>
                            <h4 style={{ color: '#fcd34d', margin: '0 0 8px', fontSize: '1rem' }}>Using Existing Data Mode</h4>
                            <p style={{ color: '#cbd5e1', fontSize: '0.9rem', margin: 0 }}>
                                Students will strictly remain in the groups assigned to them when they were imported (or previously saved).
                                Change "Act" SL to reorder students within their assigned batches, or use the individual dropdowns below to forcibly switch a student's batch.
                            </p>

                            <div style={{ marginTop: '1.25rem', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                {groupedStudents.map((g, i) => (
                                    <div key={i} style={{ padding: '8px 16px', borderRadius: '12px', background: GROUP_BG[i] || 'rgba(255,255,255,0.05)', border: `1px solid ${GROUP_BORDER[i] || 'rgba(255,255,255,0.1)'}` }}>
                                        <div style={{ color: GROUP_COLORS[i] || '#cbd5e1', fontWeight: 700, fontSize: '0.95rem' }}>Batch {i + 1}</div>
                                        <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{g.length} Students</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2.5rem', alignItems: 'flex-start' }}>
                                {/* Number of groups toggle */}
                                <div>
                                    <label style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'block', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>Batches</label>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        {[1, 2, 3, 4].map(n => (
                                            <button
                                                key={n}
                                                onClick={() => setNumGroups(n)}
                                                style={{
                                                    width: '50px', height: '50px',
                                                    borderRadius: '14px',
                                                    border: numGroups === n ? `2px solid ${GROUP_COLORS[n - 1] || '#a855f7'}` : '1px solid rgba(255,255,255,0.1)',
                                                    background: numGroups === n ? (GROUP_BG[n - 1] || 'rgba(168,85,247,0.15)') : 'rgba(255,255,255,0.03)',
                                                    color: numGroups === n ? (GROUP_COLORS[n - 1] || '#d8b4fe') : '#64748b',
                                                    fontWeight: 800,
                                                    fontSize: '1.2rem',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                                    boxShadow: numGroups === n ? `0 8px 16px ${GROUP_BG[n - 1] || 'rgba(168,85,247,0.15)'}` : 'none',
                                                }}
                                            >
                                                {n}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Visual Buckets */}
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'block', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>Estimated Splits</label>
                                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                        {groupedStudents.map((g, i) => (
                                            <div key={i} style={{
                                                padding: '12px 20px', borderRadius: '16px',
                                                background: GROUP_BG[i] || 'rgba(168,85,247,0.15)',
                                                border: `1px solid ${GROUP_BORDER[i] || 'rgba(168,85,247,0.3)'}`,
                                                display: 'flex', flexDirection: 'column', gap: '4px',
                                                minWidth: '140px'
                                            }}>
                                                <span style={{ color: GROUP_COLORS[i] || '#d8b4fe', fontWeight: 800, fontSize: '1.1rem' }}>
                                                    Batch {i + 1}
                                                </span>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#cbd5e1', fontSize: '0.85rem' }}>
                                                    <span>{g.length} Students</span>
                                                </div>
                                                {g.length > 0 && <div style={{ fontSize: '0.75rem', color: GROUP_COLORS[i] || '#d8b4fe', opacity: 0.8, marginTop: '2px' }}>
                                                    SL: {g[0]._localIdx + 1} → {g[g.length - 1]._localIdx + 1}
                                                </div>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Fine Tuning / Advanced Split bounds */}
                            {numGroups > 1 && (
                                <details style={{ marginTop: '2rem', background: 'rgba(15,23,42,0.4)', border: '1px solid rgba(255,255,255,0.05)', padding: '1.25rem', borderRadius: '16px', cursor: 'pointer' }}>
                                    <summary style={{ fontSize: '0.9rem', color: '#94a3b8', outline: 'none', fontWeight: 600, userSelect: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        ⚙️ Custom Batch Boundaries (Advanced)
                                        <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#64748b' }}>— Click to expand and drag sliders</span>
                                    </summary>
                                    <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', cursor: 'default' }} onClick={e => e.stopPropagation()}>
                                        {splitPoints.map((pt, i) => (
                                            <div key={i}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                    <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                                                        Batch {i + 1} ends at student <span style={{ color: 'white', fontWeight: 800 }}>#{pt}</span>
                                                        <span style={{ marginLeft: '8px', color: '#64748b' }}>(Batch {i + 2} starts at #{pt + 1})</span>
                                                    </label>
                                                </div>
                                                <input
                                                    type="range"
                                                    min={i === 0 ? 1 : splitPoints[i - 1] + 1}
                                                    max={i < splitPoints.length - 1 ? splitPoints[i + 1] - 1 : displayList.length - 1}
                                                    value={pt}
                                                    onChange={e => {
                                                        const newPts = [...splitPoints];
                                                        newPts[i] = parseInt(e.target.value);
                                                        setSplitPoints(newPts);
                                                    }}
                                                    style={{ width: '100%', accentColor: GROUP_COLORS[i] }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            )}
                        </>
                    )}
                </div>

                {/* ── Student List ─────────────────────────────────────────── */}
                <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.05rem', color: '#e2e8f0' }}>
                            <GripVertical size={20} color="#8b5cf6" /> Student Roster &amp; SL No.
                        </h3>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>

                            <div style={{ position: 'relative' }}>
                                <button
                                    onClick={() => setMagicMenuOpen(!magicMenuOpen)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 18px', background: 'linear-gradient(135deg, rgba(168,85,247,0.15), rgba(236,72,153,0.15))', border: '1px solid rgba(236,72,153,0.3)', color: '#f472b6', borderRadius: '12px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(236,72,153,0.1)' }}
                                    onMouseEnter={e => e.currentTarget.style.boxShadow = '0 6px 16px rgba(236,72,153,0.2)'}
                                    onMouseLeave={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(236,72,153,0.1)'}
                                >
                                    <Sparkles size={16} /> AI Smart Allocation
                                </button>
                                {magicMenuOpen && (
                                    <>
                                        <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setMagicMenuOpen(false)}></div>
                                        <div className="fade-in-up" style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '8px', zIndex: 100, minWidth: '240px', display: 'flex', flexDirection: 'column', gap: '4px', boxShadow: '0 10px 40px rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)' }}>
                                            <h4 style={{ margin: '4px 8px 8px', fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>Smart allocation</h4>
                                            <button onClick={() => handleMagicSort('alpha')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'transparent', border: 'none', color: '#e2e8f0', cursor: 'pointer', borderRadius: '10px', textAlign: 'left', fontSize: '0.85rem', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>🔤 Sort SL Alphabetically A-Z</button>
                                            <button onClick={() => handleMagicSort('roll')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'transparent', border: 'none', color: '#e2e8f0', cursor: 'pointer', borderRadius: '10px', textAlign: 'left', fontSize: '0.85rem', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>🔢 Sort SL by Roll Number</button>
                                            <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '4px 0' }}></div>
                                            <button onClick={() => handleMagicSort('shuffle')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'transparent', border: 'none', color: '#f472b6', cursor: 'pointer', borderRadius: '10px', textAlign: 'left', fontSize: '0.85rem', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(236,72,153,0.1)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>🔀 Mix Randomly (Fair Distribution)</button>
                                        </div>
                                    </>
                                )}
                            </div>

                            {isAdmin && (
                                <button
                                    onClick={handleDeleteBatch}
                                    disabled={isSaving || displayList.length === 0}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: '12px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' }}
                                    title="Delete ALL students currently visible in this list"
                                >
                                    <Trash2 size={16} /> Delete Entire Batch
                                </button>
                            )}
                            <button
                                onClick={() => setAddModalOpen(true)}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#34d399', borderRadius: '12px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' }}
                            >
                                <Plus size={16} /> Add Student
                            </button>
                            <button
                                onClick={handleSaveGroups}
                                disabled={isSaving}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 22px', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', border: 'none', color: 'white', borderRadius: '12px', cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem', opacity: isSaving ? 0.7 : 1 }}
                            >
                                <Save size={16} /> {isSaving ? 'Saving...' : 'Save Groups'}
                            </button>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '60px 100px 180px 1fr 90px 110px 80px 50px', gap: '12px', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', marginBottom: '8px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', color: '#64748b', fontWeight: 700 }}>
                        <div>SL №</div>
                        <div>Batch</div>
                        <div>Reg / Roll No.</div>
                        <div>Student Name</div>
                        <div style={{ textAlign: 'center' }}>Move SL</div>
                        <div style={{ textAlign: 'center' }}>Section Transfer</div>
                        <div style={{ textAlign: 'center' }}>Status</div>
                        <div style={{ textAlign: 'center' }}>Act</div>
                    </div>

                    {/* Student rows */}
                    <div style={{ maxHeight: '480px', overflowY: 'auto' }}>
                        {displayList.map((s, idx) => { // eslint-disable-line sonarjs/cognitive-complexity
                            // Which group is this student in?
                            let gIdx;
                            if (batchStrategy === 'existing') {
                                gIdx = parseInt(s.manualGroup || s.group || '1') - 1;
                                if (isNaN(gIdx) || gIdx < 0) gIdx = 0;
                            } else {
                                gIdx = numGroups - 1;
                                for (let i = 0; i < splitPoints.length; i++) {
                                    if (idx < splitPoints[i]) { gIdx = i; break; }
                                }
                                if (s.manualGroup) {
                                    const mIdx = parseInt(s.manualGroup) - 1;
                                    if (!isNaN(mIdx) && mIdx >= 0) gIdx = mIdx;
                                }
                            }

                            return (
                                <div
                                    key={s.id}
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '60px 100px 180px 1fr 90px 110px 80px 50px',
                                        gap: '12px',
                                        padding: '12px 16px',
                                        borderRadius: '12px',
                                        marginBottom: '6px',
                                        background: idx % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
                                        borderLeft: `4px solid ${s.manualGroup ? '#f472b6' : (GROUP_COLORS[gIdx] || '#d8b4fe')}`,
                                        alignItems: 'center',
                                        transition: 'all 0.2s',
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                                    onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent'}
                                >
                                    {/* SL No */}
                                    <div style={{ fontWeight: 800, color: '#94a3b8', fontSize: '0.95rem' }}>{idx + 1}</div>
                                    {/* Group badge / manual override */}
                                    <div>
                                        <select
                                            value={s.manualGroup || (batchStrategy === 'existing' ? s.group || '1' : "")}
                                            onChange={e => handleOverrideGroup(s.id, e.target.value)}
                                            style={{
                                                padding: '4px 8px',
                                                borderRadius: '8px',
                                                background: s.manualGroup ? 'rgba(244,114,182,0.15)' : (GROUP_BG[gIdx] || 'rgba(168,85,247,0.15)'),
                                                border: `1px solid ${s.manualGroup ? 'rgba(244,114,182,0.3)' : (GROUP_BORDER[gIdx] || 'rgba(168,85,247,0.3)')}`,
                                                color: s.manualGroup ? '#f472b6' : (GROUP_COLORS[gIdx] || '#d8b4fe'),
                                                fontWeight: 700,
                                                fontSize: '0.8rem',
                                                outline: 'none',
                                                cursor: 'pointer',
                                                width: '100%',
                                                textAlign: 'center'
                                            }}
                                            title="Override batch manually"
                                        >
                                            <option value={batchStrategy === 'existing' ? (s.group || '1') : ""}>{batchStrategy === 'existing' ? `B${s.group || '1'} (Imported)` : `B${gIdx + 1} (Auto)`}</option>
                                            {Array.from({ length: Math.max(numGroups, groupedStudents.length, s.group || 1) }, (_, i) => (
                                                <option key={i} value={String(i + 1)}>B{i + 1} (Manual)</option>
                                            ))}
                                        </select>
                                    </div>
                                    {/* Reg / Roll No */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        <span style={{ fontFamily: 'monospace', color: '#60a5fa', fontSize: '0.88rem', fontWeight: 600 }}>{s.regNo}</span>
                                        <span style={{ color: '#f59e0b', fontSize: '0.75rem', fontWeight: 700 }}>Roll: {s.rollNo || s.rollno || '--'}</span>
                                    </div>
                                    {/* Name */}
                                    <div style={{ color: '#f1f5f9', fontSize: '0.9rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                                    {/* Move to SL input */}
                                    <div style={{ textAlign: 'center' }}>
                                        <input
                                            type="number"
                                            min={1}
                                            max={displayList.length}
                                            defaultValue={idx + 1}
                                            onBlur={e => {
                                                e.target.style.borderColor = 'rgba(255,255,255,0.15)';
                                                const newSl = parseInt(e.target.value);
                                                if (newSl !== idx + 1 && newSl >= 1 && newSl <= displayList.length) {
                                                    handleMoveStudent(s.id, newSl);
                                                }
                                            }}
                                            style={{ width: '100%', textAlign: 'center', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: 'white', padding: '6px', fontSize: '0.85rem', outline: 'none', transition: 'border 0.2s' }}
                                            onFocus={e => e.target.style.borderColor = '#3b82f6'}
                                        />
                                    </div>
                                    {/* Section Transfer */}
                                    <div style={{ textAlign: 'center' }}>
                                        <select
                                            value=""
                                            onChange={e => handleMoveToSection(s.id, s.name, e.target.value)}
                                            style={{
                                                width: '100%',
                                                padding: '4px',
                                                borderRadius: '6px',
                                                background: 'rgba(255,255,255,0.05)',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                color: '#e2e8f0',
                                                fontSize: '0.75rem',
                                                outline: 'none',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <option value="" disabled>Transfer</option>
                                            {availableSections.filter(sec => sec !== filterSection).map(sec => (
                                                <option key={sec} value={sec}>To {sec}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {/* Status */}
                                    <div style={{ textAlign: 'center' }}>
                                        {s.status === 'tc' ? (
                                            <span style={{ fontSize: '0.72rem', padding: '4px 10px', borderRadius: '8px', fontWeight: 700, background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>TC</span>
                                        ) : (
                                            <span style={{ fontSize: '0.72rem', padding: '4px 10px', borderRadius: '8px', fontWeight: 700, background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)' }}>Active</span>
                                        )}
                                    </div>
                                    {/* Delete */}
                                    <div style={{ textAlign: 'center' }}>
                                        <button
                                            onClick={() => handleRemoveStudent(s)}
                                            style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: '6px', borderRadius: '8px', transition: 'all 0.2s' }}
                                            onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.color = '#475569'; e.currentTarget.style.background = 'none'; }}
                                            title="Remove student &amp; reorder SL Nos"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div style={{ marginTop: '1rem', padding: '10px 16px', background: 'rgba(139,92,246,0.08)', borderRadius: '12px', border: '1px solid rgba(139,92,246,0.2)', fontSize: '0.8rem', color: '#a78bfa' }}>
                        💡 <strong>Tip:</strong> Change the "Move to SL" number to reposition a student. All other SL Nos update automatically. Click "Save Groups" to persist changes to Firestore.
                    </div>
                </div>

            </>)
            }

            {/* ── Add Student at Position Modal ─────────────────────────── */}
            {
                addModalOpen && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px', padding: '2rem', width: '440px', position: 'relative' }}>
                            <button onClick={() => setAddModalOpen(false)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', padding: '8px', borderRadius: '10px', cursor: 'pointer' }}>✕</button>

                            <h3 style={{ margin: '0 0 1.5rem', color: 'white', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Plus size={20} color="#10b981" /> Add Student at Position
                            </h3>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '1rem' }}>
                                    <div>
                                        <label style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Roll No</label>
                                        <input
                                            value={addForm.rollNo}
                                            onChange={e => setAddForm(f => ({ ...f, rollNo: e.target.value }))}
                                            placeholder="e.g. 37"
                                            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(245,158,11,0.2)', padding: '12px 16px', borderRadius: '12px', color: 'white', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Reg No *</label>
                                        <input
                                            value={addForm.regNo}
                                            onChange={e => setAddForm(f => ({ ...f, regNo: e.target.value.toUpperCase() }))}
                                            placeholder="e.g. 22CSE001"
                                            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '12px 16px', borderRadius: '12px', color: 'white', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Full Name *</label>
                                    <input
                                        value={addForm.name}
                                        onChange={e => setAddForm(f => ({ ...f, name: e.target.value.toUpperCase() }))}
                                        placeholder="e.g. JOHN DOE"
                                        style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '12px 16px', borderRadius: '12px', color: 'white', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Insert at SL No. (1–{displayList.length + 1})</label>
                                    <input
                                        type="number"
                                        value={addForm.position}
                                        onChange={e => setAddForm(f => ({ ...f, position: e.target.value }))}
                                        placeholder={`Default: end of list (${displayList.length + 1})`}
                                        min={1}
                                        max={displayList.length + 1}
                                        style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '12px 16px', borderRadius: '12px', color: 'white', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }}
                                    />
                                    <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                                        Students at or after this SL No. will shift down by 1.
                                    </p>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '0.5rem' }}>
                                    <button onClick={() => setAddModalOpen(false)} style={{ padding: '10px 20px', background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: '12px', cursor: 'pointer' }}>Cancel</button>
                                    <button
                                        onClick={handleInsertStudent}
                                        disabled={isSaving}
                                        style={{ padding: '10px 24px', background: 'linear-gradient(135deg, #10b981, #3b82f6)', border: 'none', color: 'white', borderRadius: '12px', cursor: 'pointer', fontWeight: 700 }}
                                    >
                                        {isSaving ? 'Adding...' : 'Add & Reorder'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
        </div>
    );
};

export default GroupManager;
