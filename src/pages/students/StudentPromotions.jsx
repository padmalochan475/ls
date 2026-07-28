import React, { useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, doc, writeBatch } from 'firebase/firestore';
import { useMasterData } from '../../contexts/MasterDataContext';
import { useAuth } from '../../contexts/AuthContext';
import QuantumLoader from '../../components/QuantumLoader';
import { ArrowRight, ShieldAlert, History, Users } from 'lucide-react';
import toast from 'react-hot-toast';

const processStudent = (student, batch, mode, targetSem, targetGroup, activeAcademicYear) => {
    const studentRef = doc(db, 'students', student.id);
    const historyRecord = {
        academicYear: activeAcademicYear?.name || 'Unknown',
        semester: student.semester,
        section: student.section,
        rollNo: student.rollNo || student.rollno || null,
        timestamp: new Date().toISOString()
    };

    const newHistory = Array.isArray(student.academicHistory)
        ? [...student.academicHistory, historyRecord]
        : [historyRecord];

    if (mode === 'graduate') {
        batch.update(studentRef, {
            status: 'alumni',
            academicHistory: newHistory,
            graduatedAt: new Date().toISOString()
        });
    } else {
        batch.update(studentRef, {
            semester: targetSem.toString(),
            ...(targetGroup ? { section: targetGroup } : {}),
            academicHistory: newHistory,
            updatedAt: new Date().toISOString()
        });
    }
};

const StudentPromotions = () => {
    const { semesters, groups } = useMasterData();
    const { activeAcademicYear } = useAuth();

    const [fromSem, setFromSem] = useState('');
    const [fromGroup, setFromGroup] = useState(''); // optional — leave blank = ALL batches
    const [targetSem, setTargetSem] = useState('');
    const [targetGroup, setTargetGroup] = useState(''); // optional — leave blank = keep existing section
    const [mode, setMode] = useState('promote'); // promote | graduate

    const [eligibleStudents, setEligibleStudents] = useState([]);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [loading, setLoading] = useState(false);
    const [processing, setProcessing] = useState(false);

    const handleFetchEligible = async () => {
        if (!fromSem) {
            toast.error("Please select a Current Semester first.");
            return;
        }

        setLoading(true);
        try {
            const studentRef = collection(db, 'students');

            // If a specific batch is chosen, filter by it. Otherwise, load ALL of that semester.
            const q = fromGroup
                ? query(studentRef, where('semester', '==', fromSem.toString()), where('section', '==', fromGroup))
                : query(studentRef, where('semester', '==', fromSem.toString()));

            const snapshot = await getDocs(q);

            const data = snapshot.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(s => s.status === 'active')
                .sort((a, b) => {
                    // Sort by section first, then by regNo
                    const secCompare = (a.section || '').localeCompare(b.section || '');
                    if (secCompare !== 0) return secCompare;
                    return (a.regNo || '').localeCompare(b.regNo || '');
                });

            setEligibleStudents(data);
            setSelectedIds(new Set(data.map(s => s.id)));

            // Auto-detect graduation
            if (parseInt(fromSem) >= 8) setMode('graduate');
            else setMode('promote');

            if (data.length === 0) toast.error("No active students found for this selection.");
            else toast.success(`Found ${data.length} eligible students across ${new Set(data.map(s => s.section)).size} batch(es).`);

        } catch (error) {
            toast.error("Failed to fetch eligible students.");
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleExecute = async () => {
        if (selectedIds.size === 0) return;
        if (mode === 'promote' && !targetSem) {
            toast.error("Please select a Target Semester.");
            return;
        }

        const batchNote = targetGroup ? `to ${targetGroup}` : `(keeping their existing section)`;
        if (!window.confirm(
            `Promote ${selectedIds.size} students to Sem ${targetSem} ${batchNote}?\n\nTheir current Sem/Batch will be saved to academic history before updating.`
        )) return;

        setProcessing(true);
        try {
            const selectedStudents = eligibleStudents.filter(s => selectedIds.has(s.id));

            // Chunk into groups of 400 (Firestore batch limit is 500)
            for (let i = 0; i < selectedStudents.length; i += 400) {
                const chunk = selectedStudents.slice(i, i + 400);
                const batch = writeBatch(db);

                for (const student of chunk) {
                    processStudent(student, batch, mode, targetSem, targetGroup, activeAcademicYear);
                }

                await batch.commit();
            }

            toast.success(`✅ ${mode === 'graduate' ? 'Graduated' : 'Promoted'} ${selectedIds.size} students successfully!`);
            setEligibleStudents([]);
            setSelectedIds(new Set());
            setFromSem('');
            setFromGroup('');
            setTargetSem('');
            setTargetGroup('');
        } catch (error) {
            toast.error("Promotion failed. Please try again.");
            console.error(error);
        } finally {
            setProcessing(false);
        }
    };

    // Group students by section for display
    const studentsBySection = eligibleStudents.reduce((acc, s) => {
        const sec = s.section || 'Unknown';
        if (!acc[sec]) acc[sec] = [];
        acc[sec].push(s);
        return acc;
    }, {});

    const getExecuteButtonBg = () => {
        if (selectedIds.size === 0 || (mode === 'promote' && !targetSem)) return 'rgba(255,255,255,0.05)';
        if (mode === 'graduate') return 'linear-gradient(135deg, #8b5cf6, #c084fc)';
        return 'linear-gradient(135deg, #3b82f6, #06b6d4)';
    };

    const getExecuteButtonText = () => {
        if (processing) return 'Processing...';
        const actionName = mode === 'graduate' ? 'Graduation' : 'Promotion';
        return `Execute ${actionName} (${selectedIds.size})`;
    };

    const getRowBg = (s, idx) => {
        if (selectedIds.has(s.id)) return 'rgba(59,130,246,0.07)';
        if (idx % 2 === 0) return 'transparent';
        return 'rgba(255,255,255,0.008)';
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

            {/* Info Banner */}
            <div style={{ background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(217, 119, 6, 0.05))', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '1.25rem 1.75rem', borderRadius: '20px', display: 'flex', gap: '1.25rem', alignItems: 'flex-start', boxShadow: '0 8px 32px rgba(245, 158, 11, 0.05)' }}>
                <ShieldAlert color="#f59e0b" size={24} style={{ flexShrink: 0, marginTop: '2px', filter: 'drop-shadow(0 2px 4px rgba(245, 158, 11, 0.3))' }} />
                <div>
                    <h4 style={{ color: '#fbbf24', margin: '0 0 0.5rem', fontWeight: 800, fontSize: '1rem', letterSpacing: '0.01em' }}>Academic History Vault Active</h4>
                    <p style={{ margin: 0, color: '#fcd34d', fontSize: '0.88rem', lineHeight: 1.6, opacity: 0.9 }}>
                        Before any student is updated, their <b>current Semester, Batch, and Roll No</b> is safely stored in their academic history record ({activeAcademicYear?.name}).
                        If you leave <b>Target Batch blank</b>, each student keeps their existing batch — only the semester number changes.
                    </p>
                </div>
            </div>

            {/* Selection Engine */}
            <div className="glass-panel" style={{ 
                padding: '2.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2.5rem',
                background: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255, 255, 255, 0.05)', 
                borderRadius: '24px', backdropFilter: 'blur(16px)', boxShadow: '0 10px 40px -10px rgba(0,0,0,0.5)'
            }}>

                {/* FROM */}
                <div style={{ background: 'rgba(0,0,0,0.25)', padding: '2rem', borderRadius: '20px', border: '1px dashed rgba(255,255,255,0.08)', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: -10, left: 30, background: '#1e293b', padding: '0 12px', fontSize: '0.8rem', color: '#64748b', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', borderRadius: '10px' }}>Current State</div>
                    <h3 style={{ color: '#94a3b8', margin: '0.5rem 0 1.5rem', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                        <History size={18} /> Will be vaulted
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <div>
                            <label style={{ display: 'block', color: '#94a3b8', marginBottom: '8px', fontSize: '0.82rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Current Semester <span style={{ color: '#f87171' }}>*</span></label>
                            <select style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: '0.9rem', outline: 'none' }} value={fromSem} onChange={e => { setFromSem(e.target.value); setEligibleStudents([]); setSelectedIds(new Set()); }}>
                                <option value="" style={{ background: '#0f172a' }}>— Select Semester —</option>
                                {semesters.map(s => <option key={s.id} value={s.number} style={{ background: '#0f172a' }}>Sem {s.number}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', color: '#94a3b8', marginBottom: '8px', fontSize: '0.82rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                Filter by Batch
                                <span style={{ marginLeft: '10px', fontSize: '0.7rem', background: 'rgba(59,130,246,0.15)', color: '#60a5fa', padding: '4px 8px', borderRadius: '10px', textTransform: 'none' }}>Optional — blank = ALL batches</span>
                            </label>
                            <select style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: '0.9rem', outline: 'none' }} value={fromGroup} onChange={e => { setFromGroup(e.target.value); setEligibleStudents([]); setSelectedIds(new Set()); }}>
                                <option value="" style={{ background: '#0f172a' }}>— All Batches —</option>
                                {groups.map(g => <option key={g.id} value={g.name} style={{ background: '#0f172a' }}>{g.name}</option>)}
                            </select>
                        </div>
                        <button
                            onClick={handleFetchEligible}
                            disabled={loading || !fromSem}
                            style={{ padding: '14px', background: fromSem ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.03)', color: fromSem ? '#60a5fa' : '#475569', border: `1px solid ${fromSem ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.05)'}`, borderRadius: '12px', cursor: fromSem ? 'pointer' : 'not-allowed', marginTop: '0.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s', boxShadow: fromSem ? '0 4px 12px rgba(59,130,246,0.1)' : 'none' }}
                        >
                            {loading ? <QuantumLoader size={20} /> : <><Users size={18} /> Fetch Eligible Students</>}
                        </button>
                    </div>
                </div>

                {/* TO */}
                <div style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.06), rgba(6, 182, 212, 0.03))', padding: '2rem', borderRadius: '20px', border: '1px solid rgba(59, 130, 246, 0.2)', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: -10, left: 30, background: 'linear-gradient(135deg, #3b82f6, #06b6d4)', padding: '2px 14px', fontSize: '0.8rem', color: '#fff', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', borderRadius: '10px', boxShadow: '0 4px 12px rgba(59,130,246,0.4)' }}>Target State</div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', marginTop: '0.5rem' }}>
                        <h3 style={{ color: '#60a5fa', margin: 0, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                            <ArrowRight size={18} /> Moving to
                        </h3>
                        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: '10px', padding: '4px', gap: '4px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <button onClick={() => setMode('promote')} style={{ padding: '6px 16px', background: mode === 'promote' ? '#3b82f6' : 'transparent', color: mode === 'promote' ? 'white' : '#94a3b8', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, transition: 'all 0.2s' }}>Promote</button>
                            <button onClick={() => setMode('graduate')} style={{ padding: '6px 16px', background: mode === 'graduate' ? '#8b5cf6' : 'transparent', color: mode === 'graduate' ? 'white' : '#94a3b8', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, transition: 'all 0.2s' }}>Graduate</button>
                        </div>
                    </div>

                    {mode === 'promote' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div>
                                <label style={{ display: 'block', color: '#94a3b8', marginBottom: '8px', fontSize: '0.82rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Target Semester <span style={{ color: '#f87171' }}>*</span></label>
                                <select style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: '0.9rem', outline: 'none' }} value={targetSem} onChange={e => setTargetSem(e.target.value)}>
                                    <option value="" style={{ background: '#0f172a' }}>— Select Target Semester —</option>
                                    {semesters.map(s => <option key={s.id} value={s.number} style={{ background: '#0f172a' }}>Sem {s.number}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', color: '#94a3b8', marginBottom: '8px', fontSize: '0.82rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                    Target Batch
                                    <span style={{ marginLeft: '10px', fontSize: '0.7rem', background: 'rgba(16,185,129,0.1)', color: '#34d399', padding: '4px 8px', borderRadius: '10px', textTransform: 'none' }}>Optional — blank = keep existing</span>
                                </label>
                                <select style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: '0.9rem', outline: 'none' }} value={targetGroup} onChange={e => setTargetGroup(e.target.value)}>
                                    <option value="" style={{ background: '#0f172a' }}>— Keep Existing Batch —</option>
                                    {groups.map(g => <option key={g.id} value={g.name} style={{ background: '#0f172a' }}>{g.name}</option>)}
                                </select>
                            </div>
                            {targetSem && !targetGroup && (
                                <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '12px', padding: '12px 16px', fontSize: '0.85rem', color: '#6ee7b7', lineHeight: 1.5, marginTop: '0.5rem', display: 'flex', gap: '10px' }}>
                                    <span style={{ fontSize: '1rem' }}>✅</span>
                                    <div>
                                        Students move to <b>Sem {targetSem}</b> and remain in their <b>current batch/section</b>.
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{ padding: '3rem 2rem', textAlign: 'center', background: 'rgba(139,92,246,0.05)', borderRadius: '16px', border: '1px solid rgba(139,92,246,0.1)' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '1.25rem', filter: 'drop-shadow(0 4px 12px rgba(139,92,246,0.4))' }}>🎓</div>
                            <p style={{ color: '#c4b5fd', fontSize: '0.95rem', lineHeight: 1.6, margin: 0, fontWeight: 500 }}>
                                Selected students will be marked as <b>Alumni</b> and excluded from all active searches and attendance sheets.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Student List grouped by section */}
            {eligibleStudents.length > 0 && (
                <div className="glass-panel" style={{ 
                    padding: 0, overflow: 'hidden',
                    background: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255, 255, 255, 0.05)', 
                    borderRadius: '24px', backdropFilter: 'blur(16px)', boxShadow: '0 10px 40px -10px rgba(0,0,0,0.5)'
                }}>
                    {/* Action Bar */}
                    <div style={{ padding: '1.25rem 2rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to right, rgba(0,0,0,0.3), rgba(0,0,0,0.1))', flexWrap: 'wrap', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.3)', width: 36, height: 36, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Users size={18} color="#60a5fa" />
                                </div>
                                <span style={{ color: 'white', fontWeight: 800, fontSize: '1.1rem' }}>
                                    {selectedIds.size} <span style={{ color: '#64748b', fontWeight: 500 }}>/ {eligibleStudents.length} selected</span>
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => setSelectedIds(new Set(eligibleStudents.map(s => s.id)))} style={{ padding: '6px 14px', fontSize: '0.85rem', background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}>Select All</button>
                                <button onClick={() => setSelectedIds(new Set())} style={{ padding: '6px 14px', fontSize: '0.85rem', background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}>Deselect All</button>
                            </div>
                        </div>
                        <button
                            onClick={handleExecute}
                            disabled={processing || selectedIds.size === 0 || (mode === 'promote' && !targetSem)}
                            style={{
                                padding: '12px 32px',
                                background: getExecuteButtonBg(),
                                color: (selectedIds.size === 0 || (mode === 'promote' && !targetSem)) ? '#64748b' : 'white',
                                border: 'none',
                                borderRadius: '14px',
                                fontWeight: 800,
                                fontSize: '0.95rem',
                                cursor: (selectedIds.size > 0 && (mode !== 'promote' || targetSem)) ? 'pointer' : 'not-allowed',
                                opacity: processing ? 0.6 : 1,
                                transition: 'all 0.2s',
                                boxShadow: (selectedIds.size > 0 && (mode !== 'promote' || targetSem)) ? '0 8px 24px rgba(59,130,246,0.3)' : 'none'
                            }}
                        >
                            {getExecuteButtonText()}
                        </button>
                    </div>

                    {/* Grouped by Section */}
                    <div style={{ maxHeight: '600px', overflowY: 'auto', overflowX: 'auto' }}>
                        {Object.entries(studentsBySection).map(([section, sectionStudents]) => {
                            const allSelected = sectionStudents.every(s => selectedIds.has(s.id));
                            const someSelected = sectionStudents.some(s => selectedIds.has(s.id));
                            return (
                                <div key={section}>
                                    {/* Section Header */}
                                    <div style={{ padding: '0.8rem 2rem', background: 'rgba(59,130,246,0.08)', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '1rem', position: 'sticky', top: 0, zIndex: 5, backdropFilter: 'blur(10px)' }}>
                                        <input
                                            type="checkbox"
                                            checked={allSelected}
                                            ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                                            onChange={e => {
                                                const newSet = new Set(selectedIds);
                                                sectionStudents.forEach(s => e.target.checked ? newSet.add(s.id) : newSet.delete(s.id));
                                                setSelectedIds(newSet);
                                            }}
                                            style={{ accentColor: '#3b82f6', width: '18px', height: '18px', cursor: 'pointer' }}
                                        />
                                        <span style={{ fontWeight: 800, color: '#60a5fa', fontSize: '0.9rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                            Batch: {section}
                                        </span>
                                        <span style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#93c5fd', padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600 }}>
                                            {sectionStudents.filter(s => selectedIds.has(s.id)).length} / {sectionStudents.length} selected
                                        </span>
                                    </div>
                                    {/* Students in this section */}
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <tbody>
                                            {sectionStudents.map((s, idx) => (
                                                <tr
                                                    key={s.id}
                                                    onClick={() => {
                                                        const newSet = new Set(selectedIds);
                                                        if (newSet.has(s.id)) newSet.delete(s.id);
                                                        else newSet.add(s.id);
                                                        setSelectedIds(newSet);
                                                    }}
                                                    style={{
                                                        borderBottom: '1px solid rgba(255,255,255,0.025)',
                                                        cursor: 'pointer',
                                                        background: getRowBg(s, idx),
                                                        transition: 'background 0.15s'
                                                    }}
                                                >
                                                    <td style={{ padding: '1rem 2rem', width: '60px' }}>
                                                        <input type="checkbox" checked={selectedIds.has(s.id)} readOnly style={{ accentColor: '#3b82f6', width: '18px', height: '18px', pointerEvents: 'none' }} />
                                                    </td>
                                                    <td style={{ padding: '1rem', fontFamily: 'monospace', color: '#94a3b8', fontSize: '0.9rem', width: '180px' }}>{s.regNo}</td>
                                                    <td style={{ padding: '1rem', color: 'white', fontWeight: 600 }}>{s.name}</td>
                                                    <td style={{ padding: '1rem', color: '#64748b', fontSize: '0.9rem', textAlign: 'right', paddingRight: '2rem' }}>Roll: {s.rollNo || s.rollno || '--'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentPromotions;
