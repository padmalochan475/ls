import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, X, ArrowRightLeft, AlertTriangle, BookOpen, Users, CheckCircle2 } from 'lucide-react';

/* 
  Swap Faculty Modal
  Allows simple Faculty A <-> Faculty B assignment swap.
  Logic:
  1. Source Assignment (A) is already selected.
  2. User selects Target Faculty (B) via smart search.
  3. System lists Faculty B's classes.
  4. System color codes validity:
     - GREEN: Faculty A is free during B's class.
     - RED: Faculty A has a conflict during B's class.
  5. User clicks a GREEN class -> Triggers atomic swap.
*/

const SwapFacultyModal = ({
    isOpen,
    onClose,
    sourceAssignment,
    schedule, // Full schedule data
    facultyList, // List of all faculty for dropdown
    onConfirmSwap, // (sourceId, targetId) => Promise
    getSubjectShortCode
}) => {
     
    // State for which source faculty member to swap (if multiple)
    const [sourceMemberToSwap, setSourceMemberToSwap] = useState(sourceAssignment?.faculty || '');

    // --- EXTENDED UI STATE ---
    const [targetFaculty, setTargetFaculty] = useState('');
    const [isSwapping, setIsSwapping] = useState(false);
    const [facultySearch, setFacultySearch] = useState('');
    const [hideConflicts, setHideConflicts] = useState(false);
    const [activeDayFilter, setActiveDayFilter] = useState('ALL');

    // Reset and Initialize state on open
    useEffect(() => {
        if (isOpen && sourceAssignment) {
            setSourceMemberToSwap(sourceAssignment.faculty);
            setTargetFaculty('');
            setIsSwapping(false);
            setFacultySearch('');
            setHideConflicts(false);
            setActiveDayFilter('ALL');
        }
    }, [isOpen, sourceAssignment]);

    // Filter schedule to find Target Faculty's classes
     
    const targetSchedule = useMemo(() => {
        if (!targetFaculty || !schedule) return [];

        // Exclude Source Fac from the target list? 
        // No, targetFaculty is the ONE we want to swap WITH.
        return schedule.filter(item =>
            (item.faculty === targetFaculty || item.faculty2 === targetFaculty) &&
            item.id !== sourceAssignment?.id
        ).sort((a, b) => {
            const days = { "Monday": 1, "Tuesday": 2, "Wednesday": 3, "Thursday": 4, "Friday": 5, "Saturday": 6, "Sunday": 7 };
            const d1 = days[a.day] || 99;
            const d2 = days[b.day] || 99;

            const getTimeVal = (tStr) => {
                if (!tStr) return 0;
                const match = tStr.match(/(\d{1,2})[:.]?(\d{2})?\s*([ap]m)?/i);
                if (!match) return 0;
                // eslint-disable-next-line sonarjs/no-unused-vars
                let [_sw, hStr, mStr, marker] = match;
                let h = parseInt(hStr, 10);
                let m = mStr ? parseInt(mStr, 10) : 0;
                const isPM = marker ? marker.toLowerCase() === 'pm' : tStr.toUpperCase().includes('PM');
                const isAM = marker ? marker.toLowerCase() === 'am' : tStr.toUpperCase().includes('AM');
                if (isPM && h < 12) h += 12;
                if (isAM && h === 12) h = 0;
                return h * 60 + m;
            };

            return (d1 - d2) || (getTimeVal(a.time) - getTimeVal(b.time));
        });
    }, [targetFaculty, schedule, sourceAssignment]);

    // Check availability
    const checkSwapValidity = (targetItem) => {
        const sourceFac = sourceMemberToSwap; // Use SELECTED member
        // Robust Normalizer: Handles dots, spaces, case
        const normalizeTime = (t) => t ? t.toString().toLowerCase().replace(/\s+/g, '').replace(/[ap]m/g, '').replace(/\./g, ':').replace(/\b0(\d):/g, '$1:') : '';

        // 1. Check if Source Fac is busy at Target Time
        const conflict = schedule.find(s =>
            s.id !== sourceAssignment.id &&
            s.day === targetItem.day &&
            normalizeTime(s.time) === normalizeTime(targetItem.time) &&
            (s.faculty === sourceFac || s.faculty2 === sourceFac)
        );

        if (conflict) {
            return { possible: false, reason: `Conflict: ${sourceFac} is in ${conflict.room}` };
        }

        // 2. Check if Target Fac is busy at Source Time
        const reverseConflict = schedule.find(s =>
            s.id !== targetItem.id &&
            s.day === sourceAssignment.day &&
            normalizeTime(s.time) === normalizeTime(sourceAssignment.time) &&
            (s.faculty === targetFaculty || s.faculty2 === targetFaculty)
        );

        if (reverseConflict) {
            return { possible: false, reason: `Conflict: ${targetFaculty} is busy at Source Time` };
        }

        return { possible: true };
    };

    // Filtered Display List
    const displaySchedule = useMemo(() => {
        let items = targetSchedule;

        if (hideConflicts) {
            items = items.filter(item => checkSwapValidity(item).possible);
        }

        if (activeDayFilter !== 'ALL') {
            items = items.filter(item => item.day === activeDayFilter);
        }

        return items;
    }, [targetSchedule, hideConflicts, activeDayFilter, sourceMemberToSwap]); // eslint-disable-line react-hooks/exhaustive-deps

    // Helper for Day Chips
    const uniqueDays = useMemo(() => ['ALL', ...new Set(targetSchedule.map(i => i.day))].sort((a, b) => {
        if (a === 'ALL') return -1;
        if (b === 'ALL') return 1;
        const days = { "Monday": 1, "Tuesday": 2, "Wednesday": 3, "Thursday": 4, "Friday": 5, "Saturday": 6, "Sunday": 7 };
        return (days[a] || 99) - (days[b] || 99);
    }), [targetSchedule]);

    // Filtered Faculty List for Search
    const filteredFacultyList = facultyList.filter(f =>
        f.name !== sourceMemberToSwap &&
        f.name.toLowerCase().includes(facultySearch.toLowerCase())
    );

    if (!isOpen || !sourceAssignment) return null;

    const handleSwap = async (targetItem) => {
        if (!window.confirm(`Confirm Swap?\n\n${sourceMemberToSwap} -> ${targetItem.day} ${targetItem.time}\n${targetFaculty} -> ${sourceAssignment.day} ${sourceAssignment.time}`)) return;

        setIsSwapping(true);
        try {
            await onConfirmSwap(sourceAssignment, targetItem, targetFaculty, sourceMemberToSwap);
            onClose();
        } catch (e) {
            console.error(e);
            alert("Swap Failed");
        } finally {
            setIsSwapping(false);
        }
    };

    return createPortal(
        <div className="modal-overlay animate-fade-in" onClick={onClose} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
            <div
                className="glass-panel"
                onClick={e => e.stopPropagation()}
                style={{
                    width: '95%', maxWidth: '750px', maxHeight: '90vh',
                    display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden',
                    background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)'
                }}
            >
                {/* Header */}
                <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '10px', borderRadius: '10px' }}>
                            <ArrowRightLeft size={22} className="text-amber-500" />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc' }}>Smart Faculty Swap</h2>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>Advanced scheduling management</p>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px', borderRadius: '4px' }} className="hover:bg-slate-800 transition-colors">
                        <X size={26} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>

                    {/* 1. Source Card (Compact) */}
                    <div style={{
                        background: 'linear-gradient(145deg, rgba(59, 130, 246, 0.1), rgba(30, 41, 59, 0.6))',
                        border: '1px solid rgba(59, 130, 246, 0.25)',
                        padding: '16px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                    }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', letterSpacing: '0.5px', textTransform: 'uppercase', color: '#60a5fa', fontWeight: 700, marginBottom: '6px' }}>
                                Source Assignment
                            </div>

                            {sourceAssignment.faculty2 ? (
                                <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '6px 10px', borderRadius: '6px', background: sourceMemberToSwap === sourceAssignment.faculty ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.03)', border: sourceMemberToSwap === sourceAssignment.faculty ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent', transition: 'all 0.2s' }}>
                                        <input
                                            type="radio"
                                            name="sourceMember"
                                            checked={sourceMemberToSwap === sourceAssignment.faculty}
                                            onChange={() => setSourceMemberToSwap(sourceAssignment.faculty)}
                                            style={{ accentColor: '#3b82f6' }}
                                        />
                                        <span style={{ color: sourceMemberToSwap === sourceAssignment.faculty ? 'white' : '#94a3b8', fontWeight: 600 }}>
                                            {sourceAssignment.faculty}
                                        </span>
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '6px 10px', borderRadius: '6px', background: sourceMemberToSwap === sourceAssignment.faculty2 ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.03)', border: sourceMemberToSwap === sourceAssignment.faculty2 ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent', transition: 'all 0.2s' }}>
                                        <input
                                            type="radio"
                                            name="sourceMember"
                                            checked={sourceMemberToSwap === sourceAssignment.faculty2}
                                            onChange={() => setSourceMemberToSwap(sourceAssignment.faculty2)}
                                            style={{ accentColor: '#3b82f6' }}
                                        />
                                        <span style={{ color: sourceMemberToSwap === sourceAssignment.faculty2 ? 'white' : '#94a3b8', fontWeight: 600 }}>
                                            {sourceAssignment.faculty2}
                                        </span>
                                    </label>
                                </div>
                            ) : (
                                <div style={{ fontSize: '1.2rem', fontWeight: 600, color: '#f8fafc' }}>{sourceAssignment.faculty}</div>
                            )}

                            <div style={{ fontSize: '0.9rem', color: '#cbd5e1', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ background: '#334155', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 500 }}>{sourceAssignment.day}</span>
                                <span>{sourceAssignment.time}</span>
                                <span style={{ color: '#475569' }}>|</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <BookOpen size={14} className="text-slate-400" />
                                    <span>{getSubjectShortCode(sourceAssignment.subject)}</span>
                                </div>
                            </div>
                        </div>
                        <div style={{ background: 'rgba(59, 130, 246, 0.2)', padding: '12px', borderRadius: '50%', boxShadow: '0 0 15px rgba(59, 130, 246, 0.2)' }}>
                            <ArrowRightLeft size={28} className="text-blue-400" />
                        </div>
                    </div>

                    {/* 2. Target Selection (Unified Search) */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'flex-end' }}>
                            <label style={{ fontSize: '0.95rem', color: '#e2e8f0', fontWeight: 500 }}>Select Target Faculty</label>
                            {targetFaculty && (
                                <button
                                    onClick={() => { setTargetFaculty(''); setFacultySearch(''); }}
                                    style={{ background: 'none', border: 'none', color: '#f87171', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}
                                >
                                    Change Faculty
                                </button>
                            )}
                        </div>

                        {!targetFaculty ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="text"
                                        placeholder="Search by Name..."
                                        value={facultySearch}
                                        onChange={e => setFacultySearch(e.target.value)}
                                        style={{
                                            width: '100%', padding: '12px 12px 12px 40px', borderRadius: '8px',
                                            background: '#1e293b', border: '1px solid #475569', color: 'white', outline: 'none',
                                            fontSize: '1rem'
                                        }}
                                        autoFocus
                                    />
                                    <Users size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                </div>

                                {/* Custom Results List */}
                                <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', padding: '4px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                                    {filteredFacultyList.slice(0, 10).map(f => (
                                        <div
                                            key={f.id}
                                            onClick={() => { setTargetFaculty(f.name); setFacultySearch(''); }}
                                            style={{
                                                padding: '10px 14px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)',
                                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
                                                transition: 'background 0.2s', border: '1px solid transparent'
                                            }}
                                            className="hover:bg-slate-700/50 hover:border-slate-600"
                                        >
                                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#3b82f6', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.9rem' }}>
                                                {f.name.charAt(0)}
                                            </div>
                                            <span style={{ fontSize: '0.95rem', color: '#e2e8f0' }}>{f.name}</span>
                                        </div>
                                    ))}
                                    {filteredFacultyList.length === 0 && (
                                        <div style={{ padding: '12px', textAlign: 'center', color: '#64748b', fontSize: '0.9rem' }}>
                                            No faculty found matching "{facultySearch}"
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div style={{
                                padding: '12px 16px', background: '#3b82f6', borderRadius: '8px', color: 'white',
                                display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 600
                            }}>
                                <CheckCircle2 size={20} />
                                <span style={{ flex: 1 }}>{targetFaculty}</span>
                                <span style={{ fontSize: '0.8rem', opacity: 0.8, fontWeight: 400 }}>Selected Target</span>
                            </div>
                        )}
                    </div>

                    {/* 3. Advanced Grid, Filters & Chips */}
                    {targetFaculty && (
                        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minHeight: 0 }}>

                            {/* Toolbar */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e293b', padding: '8px 12px', borderRadius: '8px' }}>
                                <div style={{ display: 'flex', gap: '6px', overflowX: 'auto' }}>
                                    {uniqueDays.map(day => (
                                        <button
                                            key={day}
                                            onClick={() => setActiveDayFilter(day)}
                                            style={{
                                                padding: '4px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', border: 'none',
                                                background: activeDayFilter === day ? '#3b82f6' : 'transparent',
                                                color: activeDayFilter === day ? 'white' : '#94a3b8',
                                                transition: 'all 0.2s'
                                            }}
                                            className={activeDayFilter !== day ? "hover:bg-slate-700 hover:text-white" : ""}
                                        >
                                            {day}
                                        </button>
                                    ))}
                                </div>

                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#cbd5e1', cursor: 'pointer', userSelect: 'none' }}>
                                    <input
                                        type="checkbox"
                                        checked={hideConflicts}
                                        onChange={e => setHideConflicts(e.target.checked)}
                                        style={{ accentColor: '#10b981', width: '16px', height: '16px' }}
                                    />
                                    Available Only
                                </label>
                            </div>

                            {/* Scrollable Results */}
                            <div style={{
                                display: 'flex', flexDirection: 'column', gap: '12px',
                                overflowY: 'auto', paddingRight: '6px', height: '100%'
                            }}>
                                {displaySchedule.map(item => {
                                    const { possible, reason } = checkSwapValidity(item);
                                    if (hideConflicts && !possible) return null;

                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => possible && !isSwapping && handleSwap(item)}
                                            style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                padding: '16px', borderRadius: '12px',
                                                background: possible ? 'rgba(16, 185, 129, 0.03)' : 'rgba(239, 68, 68, 0.03)',
                                                border: `1px solid ${possible ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.15)'}`,
                                                cursor: possible ? 'pointer' : 'default',
                                                opacity: isSwapping ? 0.6 : 1,
                                                position: 'relative',
                                                transition: 'border-color 0.2s, background-color 0.2s'
                                            }}
                                            className={possible ? 'hover:bg-emerald-500/10 hover:border-emerald-500/40' : ''}
                                        >
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                                    <span style={{
                                                        fontSize: '0.8rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px',
                                                        background: possible ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                                        color: possible ? '#34d399' : '#f87171'
                                                    }}>
                                                        {item.day}
                                                    </span>
                                                    <span style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9' }}>{item.time}</span>
                                                </div>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: '#94a3b8' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <BookOpen size={14} className="text-slate-500" />
                                                        <span>{getSubjectShortCode(item.subject)}</span>
                                                    </div>
                                                    <span style={{ opacity: 0.2 }}>|</span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ color: '#cbd5e1' }}>{item.room}</span>
                                                    </div>
                                                </div>

                                                {!possible && <div style={{ fontSize: '0.8rem', color: '#ef4444', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(239, 68, 68, 0.05)', padding: '4px 8px', borderRadius: '4px', width: 'fit-content' }}>
                                                    <AlertTriangle size={14} /> {reason}
                                                </div>}
                                            </div>

                                            <div style={{ paddingLeft: '20px' }}>
                                                {possible ?
                                                    <button style={{
                                                        background: '#10b981', color: 'white', border: 'none',
                                                        padding: '10px 20px', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600,
                                                        display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
                                                        boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.2)'
                                                    }}>
                                                        {isSwapping ? 'Processing...' : 'Swap'} <RefreshCw size={16} />
                                                    </button>
                                                    :
                                                    <div style={{
                                                        width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                    }}>
                                                        <X size={20} className="text-red-400" />
                                                    </div>
                                                }
                                            </div>
                                        </div>
                                    );
                                })}

                                {displaySchedule.length === 0 && (
                                    <div style={{
                                        padding: '60px 20px', textAlign: 'center', color: '#64748b', fontStyle: 'italic',
                                        border: '2px dashed #334155', borderRadius: '16px', background: 'rgba(30, 41, 59, 0.3)'
                                    }}>
                                        {hideConflicts ? (
                                            <div>
                                                <p>No available slots found.</p>
                                                <button onClick={() => setHideConflicts(false)} style={{ marginTop: '8px', color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                                                    Show Conflicts
                                                </button>
                                            </div>
                                        ) : `No classes found for ${targetFaculty}.`}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {!targetFaculty && (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.2, flexDirection: 'column', gap: '16px' }}>
                            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '24px', borderRadius: '50%' }}>
                                <Users size={56} />
                            </div>
                            <p style={{ fontSize: '1.1rem', fontWeight: 500 }}>Select a faculty member above to begin</p>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default SwapFacultyModal;
