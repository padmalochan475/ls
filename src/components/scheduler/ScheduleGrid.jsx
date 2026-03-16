import React from 'react';
import { Layers, FlaskConical, Users, RefreshCw, ArrowRightLeft, BookOpen } from 'lucide-react';

const ScheduleGrid = ({
    viewMode,
    days,
    timeSlots,
    getAssignments,
    isAdmin,
    onEdit,
    onDelete,
    deletingIds,
    onAdd,
    onViewDetails, // NEW

    onSwap,
    getSubjectShortCode,
    getFacultyShortCode,
    subjects // Master Data Subjects for Type Checking
}) => {
    // Shared Cell Component to reduce duplication
     
    const ScheduleCell = ({ day, time }) => {
        const assignments = getAssignments(day, time);
        return (
            <div style={{ padding: 'var(--space-xs)', borderBottom: '1px solid var(--glass-border)', borderRight: '1px solid var(--glass-border)', minHeight: '100px', height: 'auto', position: 'relative' }}>
                {assignments.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {assignments.map(assignment => {
                            // Determine Type: Lab vs Theory
                            let isLab = false;
                            if (subjects) {
                                const subjectData = subjects.find(s => s.name === assignment.subject);
                                if (subjectData && subjectData.type === 'lab') isLab = true;
                            }
                            if (!isLab) {
                                const sub = assignment.subject ? assignment.subject.toString().toLowerCase() : '';
                                const rm = assignment.room ? assignment.room.toString().toLowerCase() : '';
                                if (sub.includes('lab') || rm.includes('lab')) {
                                    isLab = true;
                                }
                            }

                            // Theme Config
                            const themeColor = isLab ? '#ec4899' : '#a855f7'; // Pink vs Purple
                            const themeGradient = isLab
                                ? 'linear-gradient(145deg, rgba(80, 7, 36, 0.85) 0%, rgba(15, 23, 42, 0.95) 100%)' // Deep Pink/Red Logic
                                : 'linear-gradient(145deg, rgba(88, 28, 135, 0.25) 0%, rgba(59, 7, 100, 0.35) 100%)';

                            return (
                                <div
                                    key={assignment.id}
                                    className="animate-fade-in"
                                    onClick={(e) => {
                                        if (isAdmin) {
                                            e.stopPropagation();
                                            onEdit(assignment);
                                        } else {
                                            e.stopPropagation();
                                            onViewDetails && onViewDetails(assignment);
                                        }
                                    }}
                                    style={{
                                        background: themeGradient,
                                        border: '1px solid rgba(255, 255, 255, 0.08)',
                                        borderRadius: '10px',
                                        padding: '10px',
                                        fontSize: '0.8rem',
                                        cursor: 'pointer',
                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                        position: 'relative',
                                        wordBreak: 'break-word',
                                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2), 0 2px 4px -1px rgba(0, 0, 0, 0.1)',
                                        borderLeft: `4px solid ${themeColor}`,
                                        backdropFilter: 'blur(4px)'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (isAdmin) {
                                            e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)';
                                            e.currentTarget.style.boxShadow = `0 10px 20px -5px ${themeColor}66`;
                                            e.currentTarget.style.borderLeft = `4px solid ${isLab ? '#f472b6' : '#c084fc'}`;
                                            e.currentTarget.style.background = isLab
                                                ? 'linear-gradient(145deg, rgba(83, 10, 40, 0.95) 0%, rgba(30, 0, 15, 1) 100%)'
                                                : 'linear-gradient(145deg, rgba(88, 28, 135, 0.35) 0%, rgba(59, 7, 100, 0.45) 100%)';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (isAdmin) {
                                            e.currentTarget.style.transform = 'translateY(0) scale(1)';
                                            e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.2), 0 2px 4px -1px rgba(0, 0, 0, 0.1)';
                                            e.currentTarget.style.borderLeft = `4px solid ${themeColor}`;
                                            e.currentTarget.style.background = themeGradient;
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
                                            {isLab ? <FlaskConical size={12} color="#ec4899" /> : <BookOpen size={12} color="#a855f7" />}
                                            <span style={{ color: isLab ? '#f472b6' : '#d8b4fe', fontWeight: 600 }}>{assignment.room}</span>
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
                                        <>
                                            {/* SWAP BUTTON */}
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onSwap(assignment); }}
                                                style={{
                                                    position: 'absolute',
                                                    top: '6px',
                                                    right: '32px', // Left of Delete
                                                    background: 'rgba(59, 130, 246, 0.15)',
                                                    border: '1px solid rgba(59, 130, 246, 0.3)',
                                                    color: '#60a5fa',
                                                    cursor: 'pointer',
                                                    fontSize: '0.7rem',
                                                    width: '20px',
                                                    height: '20px',
                                                    borderRadius: '6px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    transition: 'all 0.2s',
                                                    opacity: 0.7
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.8)';
                                                    e.currentTarget.style.color = 'white';
                                                    e.currentTarget.style.opacity = '1';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)';
                                                    e.currentTarget.style.color = '#60a5fa';
                                                    e.currentTarget.style.opacity = '0.7';
                                                }}
                                                title="Swap Faculty"
                                            >
                                                <ArrowRightLeft size={10} />
                                            </button>

                                            <button
                                                onClick={(e) => { e.stopPropagation(); onDelete(assignment.id); }}
                                                style={{
                                                    position: 'absolute',
                                                    top: '6px',
                                                    right: '6px',
                                                    background: deletingIds.has(assignment.id) ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.15)',
                                                    border: '1px solid rgba(239, 68, 68, 0.2)',
                                                    color: '#fca5a5',
                                                    cursor: deletingIds.has(assignment.id) ? 'wait' : 'pointer',
                                                    fontSize: '0.7rem',
                                                    width: '20px',
                                                    height: '20px',
                                                    borderRadius: '6px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    transition: 'all 0.2s',
                                                    opacity: deletingIds.has(assignment.id) ? 0.5 : 0.6
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (!deletingIds.has(assignment.id)) {
                                                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.8)';
                                                        e.currentTarget.style.color = 'white';
                                                        e.currentTarget.style.opacity = '1';
                                                        e.currentTarget.style.transform = 'scale(1.1)';
                                                    }
                                                }}
                                                onMouseLeave={(e) => {
                                                    if (!deletingIds.has(assignment.id)) {
                                                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                                                        e.currentTarget.style.color = '#fca5a5';
                                                        e.currentTarget.style.opacity = '0.6';
                                                        e.currentTarget.style.transform = 'scale(1)';
                                                    }
                                                }}
                                                title={deletingIds.has(assignment.id) ? "Deleting..." : "Delete Class"}
                                                disabled={deletingIds.has(assignment.id)}
                                            >
                                                {deletingIds.has(assignment.id) ? <RefreshCw size={10} className="spin" /> : '✕'}
                                            </button>
                                        </>

                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    isAdmin && (
                        <div style={{ height: '100%', width: '100%', opacity: 0, transition: 'opacity 0.2s', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                            onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}
                            onClick={() => onAdd(day, time)}
                        >
                            <span style={{ fontSize: '1.5rem', color: 'var(--color-text-muted)' }}>+</span>
                        </div>
                    )
                )}
            </div>
        );
    };

    if (viewMode === 'horizontal') {
        return (
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
                        {timeSlots.map(time => (
                            <ScheduleCell key={`${day}-${time}`} day={day} time={time} />
                        ))}
                    </React.Fragment>
                ))}
            </div>
        );
    } else {
        return (
            <div style={{ display: 'grid', gridTemplateColumns: `160px repeat(${days.length}, minmax(180px, 1fr))`, minWidth: '100%' }}>
                {/* Header Row */}
                <div style={{ padding: 'var(--space-md)', background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid var(--glass-border)', borderRight: '1px solid var(--glass-border)', position: 'sticky', left: 0, zIndex: 10, backdropFilter: 'blur(10px)' }}>
                    Time / Day
                </div>
                {days.map(day => (
                    <div key={day} style={{ padding: 'var(--space-md)', background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid var(--glass-border)', borderRight: '1px solid var(--glass-border)', textAlign: 'center', fontWeight: 600, fontSize: '0.875rem' }}>
                        {day}
                    </div>
                ))}
                {/* Rows */}
                {timeSlots.map(time => (
                    <React.Fragment key={time}>
                        <div style={{ padding: 'var(--space-md)', borderBottom: '1px solid var(--glass-border)', borderRight: '1px solid var(--glass-border)', fontWeight: 600, background: 'rgba(255,255,255,0.02)', position: 'sticky', left: 0, zIndex: 5, backdropFilter: 'blur(10px)' }}>
                            {time}
                        </div>
                        {days.map(day => (
                            <ScheduleCell key={`${day}-${time}`} day={day} time={time} />
                        ))}
                    </React.Fragment>
                ))}
            </div>
        );
    }
};

export default ScheduleGrid;
