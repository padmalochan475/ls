import React from 'react';
import { X, Clock, MapPin, User, BookOpen, Users, Layers, Calendar, FlaskConical } from 'lucide-react';

/**
 * AssignmentDetailsModal
 * A premium slide-in modal that shows the full details of a schedule assignment.
 * Props:
 *   isOpen: boolean
 *   onClose: function
 *   assignment: object | null (schedule item)
 *   subjectDetails: array of master subject objects (optional, for enrichment)
 *   facultyList: array of master faculty objects (optional, for enrichment)
 */
const AssignmentDetailsModal = ({ isOpen, onClose, assignment, subjectDetails = [], facultyList = [] }) => {
    if (!isOpen || !assignment) return null;

    // Enrich with master data if available
    const subjectData = subjectDetails?.find(s => s.name === assignment.subject);
    const isLab = subjectData?.type === 'lab' ||
        assignment.subject?.toLowerCase().includes('lab') ||
        assignment.room?.toLowerCase().includes('lab');

    const InfoRow = ({ icon, label, value, color = '#94a3b8' }) => {
        if (!value) return null;
        return (
            <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '1rem',
                padding: '0.875rem 0',
                borderBottom: '1px solid rgba(255,255,255,0.05)'
            }}>
                <div style={{
                    width: '36px', height: '36px',
                    borderRadius: '8px',
                    background: `rgba(${hexToRgb(color)}, 0.1)`,
                    border: `1px solid rgba(${hexToRgb(color)}, 0.2)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, color
                }}>
                    {icon}
                </div>
                <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' }}>
                        {label}
                    </div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 500, color: 'white' }}>{value}</div>
                </div>
            </div>
        );
    };

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed', inset: 0, zIndex: 3000,
                    background: 'rgba(0,0,0,0.6)',
                    backdropFilter: 'blur(6px)',
                    animation: 'fadeIn 0.2s ease'
                }}
            />

            {/* Panel */}
            <div style={{
                position: 'fixed',
                right: 0, top: 0, bottom: 0,
                zIndex: 3001,
                width: '100%',
                maxWidth: '420px',
                background: 'linear-gradient(165deg, #0f172a 0%, #1e293b 100%)',
                borderLeft: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '-20px 0 60px rgba(0,0,0,0.5)',
                display: 'flex',
                flexDirection: 'column',
                animation: 'slideInRight 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            }}>
                {/* Header */}
                <div style={{
                    padding: '1.5rem',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexShrink: 0
                }}>
                    <div>
                        <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '3px 10px',
                            borderRadius: '20px',
                            background: isLab ? 'rgba(59,130,246,0.15)' : 'rgba(168,85,247,0.15)',
                            color: isLab ? '#60a5fa' : '#c084fc',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            letterSpacing: '0.08em',
                            marginBottom: '0.5rem'
                        }}>
                            {isLab ? <FlaskConical size={12} /> : <BookOpen size={12} />}
                            {isLab ? 'LAB SESSION' : 'THEORY CLASS'}
                        </div>
                        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, lineHeight: 1.2, color: 'white' }}>
                            {assignment.subject}
                        </h2>
                        {assignment.isSubstitution && (
                            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#f472b6', fontWeight: 700 }}>
                                ⚡ You are substituting for {assignment.originalFacultyName}
                            </div>
                        )}
                        {assignment.isSubstituted && (
                            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#10b981', fontWeight: 700 }}>
                                ✓ Substituted by {assignment.substituteName}
                            </div>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255,255,255,0.07)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px',
                            color: 'white',
                            width: '36px', height: '36px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer',
                            flexShrink: 0,
                            marginLeft: '1rem'
                        }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
                    <InfoRow icon={<Clock size={18} />} label="Time" value={assignment.time} color="#60a5fa" />
                    <InfoRow icon={<MapPin size={18} />} label="Room" value={assignment.room} color="#f472b6" />
                    <InfoRow icon={<Calendar size={18} />} label="Day" value={assignment.day} color="#34d399" />
                    <InfoRow
                        icon={<User size={18} />}
                        label="Faculty"
                        value={[assignment.faculty, assignment.faculty2].filter(Boolean).join(' & ')}
                        color="#a78bfa"
                    />
                    <InfoRow
                        icon={<Users size={18} />}
                        label="Group"
                        value={`${assignment.dept || ''} — ${assignment.section || ''}${assignment.group && assignment.group !== 'All' ? ` / ${assignment.group}` : ''}`}
                        color="#fbbf24"
                    />
                    <InfoRow icon={<Layers size={18} />} label="Semester" value={assignment.sem} color="#fb923c" />
                    {subjectData?.description && (
                        <div style={{
                            marginTop: '1.5rem',
                            padding: '1rem',
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: '10px'
                        }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                Subject Info
                            </div>
                            <p style={{ margin: 0, fontSize: '0.9rem', color: '#cbd5e1', lineHeight: 1.6 }}>
                                {subjectData.description}
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '1rem 1.5rem',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    flexShrink: 0
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            width: '100%',
                            padding: '0.875rem',
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '10px',
                            color: 'white',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: '0.95rem'
                        }}
                    >
                        Close
                    </button>
                </div>
            </div>

            <style>{`
                @keyframes slideInRight {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `}</style>
        </>
    );
};

// Helper: convert hex to rgb components string "r, g, b"
function hexToRgb(hex) {
    if (!hex || !hex.startsWith('#')) return '148, 163, 184';
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r}, ${g}, ${b}`;
}

export default AssignmentDetailsModal;
