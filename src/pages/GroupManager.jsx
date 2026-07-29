import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { db } from '../lib/firebase';
import { writeBatch, doc, collection, onSnapshot, query, where } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useMasterData } from '../contexts/MasterDataContext';
import { Save, Plus, Trash2, GripVertical, AlertTriangle, Layers, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

// ─── Colour per group ──────────────────────────────────────────────────────────
const GROUP_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
const GROUP_BG = ['rgba(59,130,246,0.12)', 'rgba(16,185,129,0.12)', 'rgba(245,158,11,0.12)', 'rgba(239,68,68,0.12)', 'rgba(139,92,246,0.12)'];
const GROUP_BORDER = ['rgba(59,130,246,0.3)', 'rgba(16,185,129,0.3)', 'rgba(245,158,11,0.3)', 'rgba(239,68,68,0.3)', 'rgba(139,92,246,0.3)'];

// ─── GroupManager ──────────────────────────────────────────────────────────────
const GroupManager = () => {
    const { activeAcademicYear, userProfile } = useAuth();
    const isAdmin = userProfile?.role === 'admin';
    const { semesters, groups: masterGroups = [] } = useMasterData();

    // ── fetch students ─────────────────────────────────────────────────────────
    const [allStudents, setAllStudents] = useState([]);
    const [loading, setLoading] = useState(true);

    // ── filters ────────────────────────────────────────────────────────────────
    const [filterYear, setFilterYear] = useState(activeAcademicYear || '');
    const [filterSem, setFilterSem] = useState('');
    const [filterSection, setFilterSection] = useState('');
    const [filterGroup, setFilterGroup] = useState('1');

    useEffect(() => {
        if (!filterSem) {
            setAllStudents([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        const col = collection(db, 'students');
        const q = query(col, where('semester', '==', filterSem));
        const unsub = onSnapshot(q, (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setAllStudents(data);
            setLoading(false);
        }, (err) => {
            console.error('Failed to fetch students for GroupManager:', err);
            toast.error('Failed to load students');
            setLoading(false);
        });
        return () => unsub();
    }, [filterSem]);


    // ── dynamic filter options ─────────────────────────────────────────────────
    const availableSections = useMemo(() => {
        const masterSecs = masterGroups.map(g => g.name).filter(Boolean);
        if (!filterSem) return masterSecs;

        const secs = new Set([
            ...masterSecs,
            ...allStudents
                .map(s => s.section || s.branch)
                .filter(Boolean)
        ]);
        return [...secs].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }, [allStudents, filterSem, masterGroups]);

    // Ensure we always have at least group 1 and 2, plus any existing
    const availableGroups = useMemo(() => {
        if (!filterSem || !filterSection) return ['1', '2'];
        const groups = new Set(['1', '2']);
        allStudents
            .filter(s => (s.section === filterSection || s.branch === filterSection) && s.group)
            .forEach(s => groups.add(String(s.group).trim()));
        return [...groups].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }, [allStudents, filterSem, filterSection]);

    // Reset downstream filters if upstream changes
    useEffect(() => { setFilterSection(''); }, [filterSem]);
    useEffect(() => { setFilterGroup(availableGroups.includes(filterGroup) ? filterGroup : '1'); }, [filterSection, availableGroups]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── derived cohort ────────────────────────────────────────────────────────
    const cohort = useMemo(() => {
        if (!filterSem || !filterSection || !filterGroup) return [];
        return allStudents
            .filter(s => {
                const isSecMatch = s.section === filterSection || s.branch === filterSection;
                const isGrpMatch = String(s.group || '1') === String(filterGroup);
                return isSecMatch && isGrpMatch && s.status !== 'alumni';
            })
            .sort((a, b) => {
                const sa = a.slNo ?? 9999, sb = b.slNo ?? 9999;
                if (sa !== sb) return sa - sb;
                const rA = parseInt(a.rollNo || a.rollno || '0');
                const rB = parseInt(b.rollNo || b.rollno || '0');
                if (rA && rB && rA !== rB) return rA - rB;
                return (a.regNo || '').localeCompare(b.regNo || '');
            });
    }, [allStudents, filterSem, filterSection, filterGroup]);

    // ── local SL-No ordered list (editable) ───────────────────────────────────
    const [localList, setLocalList] = useState(null); 
    const displayList = localList ?? cohort;
    React.useEffect(() => { setLocalList(null); }, [cohort]);

    // ── add student at position ───────────────────────────────────────────────
    const [addModalOpen, setAddModalOpen] = useState(false);
    const [addForm, setAddForm] = useState({ regNo: '', rollNo: '', name: '', position: '' });
    const [isSaving, setIsSaving] = useState(false);

    const handleInsertStudent = useCallback(async () => {
        const { regNo, rollNo, name, position } = addForm;
        if (!regNo || !name) { toast.error('Reg No and Name are required'); return; }
        
        // Roll No uniqueness check
        if (rollNo.trim()) {
            const strRoll = rollNo.trim();
            const numRoll = !isNaN(strRoll) ? Number(strRoll) : null;
            const duplicate = allStudents.find(s => 
                (s.section === filterSection || s.branch === filterSection) &&
                (String(s.rollNo) === strRoll || (numRoll !== null && s.rollNo === numRoll))
            );
            if (duplicate) {
                const dupBatch = `${duplicate.section || ''}-${duplicate.group || '1'}`;
                toast.error(`Roll No ${strRoll} is already taken in ${dupBatch}`);
                return;
            }
        }

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

            const safeId = String(regNo).trim().toUpperCase().replace(/[^a-zA-Z0-9]/g, '_');
            
            let derivedBranch = filterSection;
            let derivedSection = filterSection;
            
            if (displayList.length > 0) {
                derivedBranch = displayList[0].branch || '';
                derivedSection = displayList[0].section || filterSection;
            } else {
                const isBranchOnly = !masterGroups.some(g => g.name === filterSection) && allStudents.some(s => s.branch === filterSection);
                if (isBranchOnly) {
                    derivedSection = '';
                } else {
                    derivedBranch = ''; // We can't safely guess the branch, but they can edit it later
                }
            }

            batch.set(doc(db, 'students', safeId), {
                regNo: String(regNo).trim().toUpperCase(),
                rollNo: String(rollNo || '').trim(),
                name: String(name).trim().toUpperCase(),
                branch: derivedBranch,
                semester: filterSem,
                section: derivedSection,
                academicYear: filterYear,
                slNo: clampedPos,
                group: filterGroup,
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
    }, [addForm, displayList, filterSem, filterSection, filterGroup, filterYear, masterGroups, allStudents]);

    // ── delete student + reorder ──────────────────────────────────────────────
    const handleRemoveStudent = useCallback(async (student) => {
        if (!window.confirm(`Remove ${student.name} from this group? Their SL No will be freed and others re-ordered.`)) return;
        setIsSaving(true);
        try {
            const batch = writeBatch(db);
            const removedSlNo = student.slNo ?? 9999;
            displayList
                .filter(s => s.id !== student.id && (s.slNo ?? 9999) > removedSlNo)
                .forEach(s => batch.update(doc(db, 'students', s.id), { slNo: (s.slNo ?? 9999) - 1 }));
            batch.delete(doc(db, 'students', student.id));
            await batch.commit();
            toast.success(`${student.name} removed`);
        } catch (e) {
            console.error(e);
            toast.error('Failed to remove student');
        } finally {
            setIsSaving(false);
        }
    }, [displayList]);

    // ── move student (change SL No) ───────────────────────────────────────────
    const handleMoveStudent = useCallback((studentId, newSlNo) => {
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

    // ── transfer to another group ─────────────────────────────────────────────
    const handleTransferGroup = useCallback(async (studentId, studentName, newGroup) => {
        if (!newGroup) return;
        if (!window.confirm(`Transfer ${studentName} to Group ${newGroup}? They will be removed from this view.`)) return;
        setIsSaving(true);
        try {
            const batch = writeBatch(db);
            const studentToRemove = displayList.find(s => s.id === studentId);
            const removedSlNo = studentToRemove?.slNo ?? 9999;
            
            // Shift remaining students down
            displayList
                .filter(s => s.id !== studentId && (s.slNo ?? 9999) > removedSlNo)
                .forEach(s => batch.update(doc(db, 'students', s.id), { slNo: (s.slNo ?? 9999) - 1 }));
                
            batch.update(doc(db, 'students', studentId), { group: newGroup, slNo: 9999, updatedAt: new Date().toISOString() });
            await batch.commit();
            toast.success(`${studentName} transferred to Group ${newGroup}`);
        } catch (e) {
            console.error(e);
            toast.error('Failed to transfer student');
        } finally {
            setIsSaving(false);
        }
    }, [displayList]);

    // ── transfer to another section ───────────────────────────────────────────
    const handleTransferSection = useCallback(async (studentId, studentName, newSection) => {
        if (!newSection) return;
        if (!window.confirm(`Transfer ${studentName} to Section ${newSection}? They will be removed from this view, and their Roll No will be cleared to prevent conflicts.`)) return;
        setIsSaving(true);
        try {
            const batch = writeBatch(db);
            const studentToRemove = displayList.find(s => s.id === studentId);
            const removedSlNo = studentToRemove?.slNo ?? 9999;
            
            // Shift remaining students down
            displayList
                .filter(s => s.id !== studentId && (s.slNo ?? 9999) > removedSlNo)
                .forEach(s => batch.update(doc(db, 'students', s.id), { slNo: (s.slNo ?? 9999) - 1 }));
                
            const isBranchOnly = !masterGroups.some(g => g.name === newSection) && allStudents.some(s => s.branch === newSection);
            const updateData = {
                slNo: 9999,
                rollNo: '', // Clear Roll No to prevent duplicates in the new section
                group: '1', // Reset group to 1 in new section
                updatedAt: new Date().toISOString()
            };
            
            if (isBranchOnly) {
                updateData.branch = newSection;
                updateData.section = '';
            } else {
                updateData.section = newSection;
                // keep current branch
            }
            
            batch.update(doc(db, 'students', studentId), updateData);
            await batch.commit();
            toast.success(`${studentName} transferred to Section ${newSection}`);
        } catch (e) {
            console.error(e);
            toast.error('Failed to transfer student');
        } finally {
            setIsSaving(false);
        }
    }, [displayList, allStudents, masterGroups]);

    // ── magic sort ─────────────────────────────────────────────────────────────
    const [magicMenuOpen, setMagicMenuOpen] = useState(false);
    const handleMagicSort = useCallback((type) => {
        setLocalList(prev => {
            const list = [...(prev ?? cohort)];
            if (type === 'alpha') list.sort((a, b) => a.name.localeCompare(b.name));
            else if (type === 'roll') {
                list.sort((a, b) => {
                    const rA = parseInt(a.rollNo || '0');
                    const rB = parseInt(b.rollNo || '0');
                    return rA - rB;
                });
            } else if (type === 'shuffle') list.sort(() => Math.random() - 0.5);
            return list.map((s, i) => ({ ...s, slNo: i + 1 }));
        });
        toast.success(`Locally sorted by ${type}. Click Save SL Numbers to apply.`);
        setMagicMenuOpen(false);
    }, [cohort]);

    // ── save SL Numbers ────────────────────────────────────────────────────────
    const handleSaveGroups = useCallback(async () => {
        if (displayList.length === 0) return;
        setIsSaving(true);
        try {
            const batch = writeBatch(db);
            displayList.forEach((s, idx) => {
                batch.update(doc(db, 'students', s.id), {
                    slNo: idx + 1,
                    updatedAt: new Date().toISOString(),
                });
            });
            await batch.commit();
            setLocalList(null);
            toast.success(`SL Numbers saved! ${displayList.length} students updated.`);
        } catch (e) {
            console.error(e);
            toast.error('Failed to save SL Numbers');
        } finally {
            setIsSaving(false);
        }
    }, [displayList]);

    // ── delete entire batch ────────────────────────────────────────────────────
    const handleDeleteBatch = useCallback(async () => {
        if (!isAdmin || displayList.length === 0) return;
        const confirmDelete = window.confirm(`DANGER: Are you absolutely sure you want to permanently delete all ${displayList.length} students currently displayed in this group?`);
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
    const gIdx = (parseInt(filterGroup) - 1) % GROUP_COLORS.length;
    const groupColor = GROUP_COLORS[gIdx] || '#3b82f6';
    const groupBg = GROUP_BG[gIdx] || 'rgba(59,130,246,0.12)';
    const groupBorder = GROUP_BORDER[gIdx] || 'rgba(59,130,246,0.3)';

    return (
        <div className="fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '3rem' }}>

            {/* ── Filter Panel ─────────────────────────────────────────────── */}
            <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <h3 style={{ margin: '0 0 1.25rem', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.05rem', color: '#e2e8f0' }}>
                    <Layers size={20} color="#3b82f6" /> View & Manage Specific Group
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.2rem' }}>
                    {/* Academic Year */}
                    <div>
                        <label style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Academic Year</label>
                        <input
                            className="glass-select"
                            value={filterYear}
                            onChange={e => setFilterYear(e.target.value)}
                            placeholder={activeAcademicYear || 'e.g. 2026-2027 (ODD)'}
                            style={{ width: '100%', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.1)', padding: '12px', borderRadius: '14px', color: 'white', fontSize: '0.9rem', outline: 'none' }}
                        />
                    </div>
                    {/* Semester */}
                    <div>
                        <label style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Semester</label>
                        <select className="glass-select" value={filterSem} onChange={e => setFilterSem(e.target.value)}>
                            <option value="">-- Select Sem --</option>
                            {semesters.map(s => <option key={s.id} value={s.number}>Sem {s.number}</option>)}
                        </select>
                    </div>
                    {/* Section */}
                    <div>
                        <label style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Section</label>
                        <select className="glass-select" value={filterSection} onChange={e => setFilterSection(e.target.value)} disabled={!filterSem}>
                            <option value="">-- Select Section --</option>
                            {availableSections.map(sec => <option key={sec} value={sec}>{sec}</option>)}
                        </select>
                    </div>
                    {/* Group */}
                    <div>
                        <label style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Group</label>
                        <select className="glass-select" value={filterGroup} onChange={e => setFilterGroup(e.target.value)} disabled={!filterSection}>
                            {availableGroups.map(g => <option key={g} value={g}>Group {g}</option>)}
                        </select>
                    </div>
                </div>

                {loading && (
                    <div style={{ marginTop: '1.25rem', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', textAlign: 'center', color: '#94a3b8' }}>
                        Loading students...
                    </div>
                )}

                {!loading && filterSem && filterSection && filterGroup && !hasCohort && (
                    <div style={{ marginTop: '1.5rem', padding: '12px 16px', background: 'rgba(245,158,11,0.08)', borderRadius: '12px', border: '1px solid rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: '#fcd34d' }}>
                        <AlertTriangle size={18} />
                        <span>No students found in <strong>Group {filterGroup}</strong> of {filterSection}. Check another group or import students.</span>
                    </div>
                )}
            </div>

            {hasCohort && (
                <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: `linear-gradient(90deg, transparent, ${groupColor})` }}></div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                        <div>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', color: '#f8fafc', fontWeight: 700 }}>
                                <GripVertical size={22} color={groupColor} /> Managing Group {filterGroup}
                            </h3>
                            <div style={{ marginTop: '6px', color: '#94a3b8', fontSize: '0.85rem' }}>
                                {displayList.length} Active Students • {filterSection}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ position: 'relative' }}>
                                <button
                                    onClick={() => setMagicMenuOpen(!magicMenuOpen)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 18px', background: 'linear-gradient(135deg, rgba(168,85,247,0.15), rgba(236,72,153,0.15))', border: '1px solid rgba(236,72,153,0.3)', color: '#f472b6', borderRadius: '12px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(236,72,153,0.1)' }}
                                    onMouseEnter={e => e.currentTarget.style.boxShadow = '0 6px 16px rgba(236,72,153,0.2)'}
                                    onMouseLeave={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(236,72,153,0.1)'}
                                >
                                    <Sparkles size={16} /> Auto-Sequence SL
                                </button>
                                {magicMenuOpen && (
                                    <>
                                        <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setMagicMenuOpen(false)}></div>
                                        <div className="fade-in-up" style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '8px', zIndex: 100, minWidth: '240px', display: 'flex', flexDirection: 'column', gap: '4px', boxShadow: '0 10px 40px rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)' }}>
                                            <h4 style={{ margin: '4px 8px 8px', fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>Smart Sequencing</h4>
                                            <button onClick={() => handleMagicSort('alpha')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'transparent', border: 'none', color: '#e2e8f0', cursor: 'pointer', borderRadius: '10px', textAlign: 'left', fontSize: '0.85rem', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>🔤 Sequence Alphabetically (A-Z)</button>
                                            <button onClick={() => handleMagicSort('roll')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'transparent', border: 'none', color: '#e2e8f0', cursor: 'pointer', borderRadius: '10px', textAlign: 'left', fontSize: '0.85rem', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>🔢 Sequence by Roll Number</button>
                                            <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '4px 0' }}></div>
                                            <button onClick={() => handleMagicSort('shuffle')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'transparent', border: 'none', color: '#f472b6', cursor: 'pointer', borderRadius: '10px', textAlign: 'left', fontSize: '0.85rem', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(236,72,153,0.1)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>🔀 Mix Randomly</button>
                                        </div>
                                    </>
                                )}
                            </div>

                            {isAdmin && (
                                <button
                                    onClick={handleDeleteBatch}
                                    disabled={isSaving}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: '12px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' }}
                                    title="Delete ALL students currently visible in this list"
                                >
                                    <Trash2 size={16} /> Delete Group
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
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 22px', background: `linear-gradient(135deg, ${groupColor}, #6366f1)`, border: 'none', color: 'white', borderRadius: '12px', cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem', opacity: isSaving ? 0.7 : 1, boxShadow: `0 4px 15px ${groupBg}` }}
                            >
                                <Save size={16} /> {isSaving ? 'Saving...' : 'Save SL Numbers'}
                            </button>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '60px 180px 1fr 100px 120px 120px 60px', gap: '12px', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', marginBottom: '12px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', color: '#64748b', fontWeight: 700 }}>
                        <div>SL №</div>
                        <div>Reg / Roll No.</div>
                        <div>Student Name</div>
                        <div style={{ textAlign: 'center' }}>Move SL</div>
                        <div style={{ textAlign: 'center' }}>Transfer Group</div>
                        <div style={{ textAlign: 'center' }}>Transfer Section</div>
                        <div style={{ textAlign: 'center' }}>Remove</div>
                    </div>

                    {/* Student rows */}
                    <div style={{ maxHeight: '550px', overflowY: 'auto', paddingRight: '4px' }}>
                        {displayList.map((s, idx) => (
                            <div
                                key={s.id}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '60px 180px 1fr 100px 120px 120px 60px',
                                    gap: '12px',
                                    padding: '12px 16px',
                                    borderRadius: '12px',
                                    marginBottom: '6px',
                                    background: idx % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
                                    borderLeft: `4px solid ${groupColor}`,
                                    alignItems: 'center',
                                    transition: 'all 0.2s',
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                                onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent'}
                            >
                                {/* SL No */}
                                <div style={{ fontWeight: 800, color: '#94a3b8', fontSize: '1rem' }}>{idx + 1}</div>
                                
                                {/* Reg / Roll No */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span style={{ fontFamily: 'monospace', color: '#60a5fa', fontSize: '0.88rem', fontWeight: 600 }}>{s.regNo}</span>
                                    <span style={{ color: '#f59e0b', fontSize: '0.75rem', fontWeight: 700 }}>Roll: {s.rollNo || s.rollno || '--'}</span>
                                </div>
                                
                                {/* Name */}
                                <div style={{ color: '#f1f5f9', fontSize: '0.95rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                                
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
                                        style={{ width: '80%', textAlign: 'center', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: 'white', padding: '8px 6px', fontSize: '0.85rem', outline: 'none', transition: 'border 0.2s' }}
                                        onFocus={e => e.target.style.borderColor = groupColor}
                                    />
                                </div>
                                
                                {/* Group Transfer */}
                                <div style={{ textAlign: 'center' }}>
                                    <select
                                        value=""
                                        onChange={e => handleTransferGroup(s.id, s.name, e.target.value)}
                                        style={{
                                            width: '100%', padding: '6px', borderRadius: '8px',
                                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                            color: '#e2e8f0', fontSize: '0.75rem', outline: 'none', cursor: 'pointer'
                                        }}
                                    >
                                        <option value="" disabled>Move Group</option>
                                        {availableGroups.filter(g => g !== filterGroup).map(g => (
                                            <option key={g} value={g}>To Group {g}</option>
                                        ))}
                                        {!availableGroups.includes(String(parseInt(filterGroup) + 1)) && (
                                            <option value={String(parseInt(filterGroup) + 1)}>To Group {parseInt(filterGroup) + 1}</option>
                                        )}
                                    </select>
                                </div>

                                {/* Section Transfer */}
                                <div style={{ textAlign: 'center' }}>
                                    <select
                                        value=""
                                        onChange={e => handleTransferSection(s.id, s.name, e.target.value)}
                                        style={{
                                            width: '100%', padding: '6px', borderRadius: '8px',
                                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                            color: '#e2e8f0', fontSize: '0.75rem', outline: 'none', cursor: 'pointer'
                                        }}
                                    >
                                        <option value="" disabled>Transfer</option>
                                        {availableSections.filter(sec => sec !== filterSection).map(sec => (
                                            <option key={sec} value={sec}>To {sec}</option>
                                        ))}
                                    </select>
                                </div>
                                
                                {/* Delete */}
                                <div style={{ textAlign: 'center' }}>
                                    <button
                                        onClick={() => handleRemoveStudent(s)}
                                        style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '6px', borderRadius: '8px', transition: 'all 0.2s' }}
                                        onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.background = 'none'; }}
                                        title="Remove student & reorder SL Nos"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Add Student at Position Modal ─────────────────────────── */}
            {
                addModalOpen && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px', padding: '2rem', width: '440px', position: 'relative' }}>
                            <button onClick={() => setAddModalOpen(false)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', padding: '8px', borderRadius: '10px', cursor: 'pointer' }}>✕</button>

                            <h3 style={{ margin: '0 0 1.5rem', color: 'white', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Plus size={20} color="#10b981" /> Add to Group {filterGroup}
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
