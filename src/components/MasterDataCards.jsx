import React from 'react';
import { Layers, Box, Calendar, Clock, MapPin, Hash, CalendarOff } from 'lucide-react';

export const FacultyCard = ({ item }) => {
    const renderAvatar = () => {
        if (item.photoURL) {
            return <img src={item.photoURL} alt={item.name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />;
        }
        return (item.name && typeof item.name === 'string') ? item.name.charAt(0) : '?';
    };

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
                width: '48px', height: '48px', borderRadius: '50%',
                background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.2rem', fontWeight: 'bold', color: 'white'
            }}>
                {renderAvatar()}
            </div>
            <div>
                <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{item.name || 'Unnamed Faculty'}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{item.designation} • {item.department}</div>
                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
                    ID: {item.empId} {item.shortCode && `• Code: ${item.shortCode}`}
                </div>
            </div>
        </div>
    );
};

export const DepartmentCard = ({ item }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{
            padding: '10px', borderRadius: '12px',
            background: 'rgba(16, 185, 129, 0.1)', color: '#34d399'
        }}>
            <Layers size={24} />
        </div>
        <div>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{item.name || 'Unnamed Department'}</div>
            <div style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', fontFamily: 'monospace', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', display: 'inline-block', marginTop: '4px' }}>
                {item.code}
            </div>
        </div>
    </div>
);

export const SubjectCard = ({ item }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{item.name || 'Unnamed Subject'}</div>
            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '10px', background: item.type === 'lab' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.2)', color: item.type === 'lab' ? '#fbbf24' : '#60a5fa' }}>
                {item.type === 'lab' ? 'LAB' : 'THEORY'}
            </span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            <span style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>{item.code}</span>
            {item.shortCode && <span style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>{item.shortCode}</span>}
            <span>•</span>
            <span>{item.department}</span>
            <span>•</span>
            <span>{item.semester}</span>
        </div>
    </div>
);

export const RoomCard = ({ item }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{
            padding: '10px', borderRadius: '12px',
            background: 'rgba(236, 72, 153, 0.1)', color: '#f472b6'
        }}>
            <MapPin size={24} />
        </div>
        <div>
            <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{item.name || 'Unnamed Room'}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                {(item.type && typeof item.type === 'string') ? (item.type.charAt(0).toUpperCase() + item.type.slice(1)) : 'Unknown Type'} • Capacity: {item.capacity}
            </div>
        </div>
    </div>
);

export const GroupCard = ({ item }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{
            padding: '10px', borderRadius: '12px',
            background: 'rgba(249, 115, 22, 0.1)', color: '#fb923c'
        }}>
            <Box size={24} />
        </div>
        <div>
            <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{item.name}</div>
            {item.subGroups && item.subGroups.length > 0 && (
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                    {item.subGroups.map((sg, idx) => (
                        <span key={idx} style={{
                            fontSize: '0.75rem',
                            background: 'rgba(255,255,255,0.1)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            color: 'var(--color-text-muted)'
                        }}>
                            {sg}
                        </span>
                    ))}
                </div>
            )}
        </div>
    </div>
);

export const DayCard = ({ item }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{
            padding: '10px', borderRadius: '12px',
            background: 'rgba(16, 185, 129, 0.1)', color: '#34d399'
        }}>
            <Calendar size={24} />
        </div>
        <div>
            <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{item.name}</div>
            <div style={{ fontSize: '0.85rem', color: item.isVisible ? '#34d399' : '#f87171' }}>
                {item.isVisible ? 'Visible' : 'Hidden'} • Order: {item.order}
            </div>
        </div>
    </div>
);

export const TimeSlotCard = ({ item }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{
            padding: '10px', borderRadius: '12px',
            background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa'
        }}>
            <Clock size={24} />
        </div>
        <div>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{item.label}</div>
            <div style={{ fontSize: '0.9rem', color: 'white', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px', marginTop: '4px', display: 'inline-block' }}>
                {(() => {
                    const format = (t) => {
                        if (!t) return '??:??';
                        try {
                            const match = t.match(/(\d{1,2})[:.]?(\d{2})?\s*([ap]m)?/i);
                            if (!match) return t;
                            let [, hStr, mStr, marker] = match;
                            let h = parseInt(hStr, 10);
                            let m = mStr ? parseInt(mStr, 10) : 0;
                            const isPM = marker ? marker.toLowerCase() === 'pm' : t.toUpperCase().includes('PM');
                            const isAM = marker ? marker.toLowerCase() === 'am' : t.toUpperCase().includes('AM');
                            if (isPM && h < 12) h += 12;
                            if (isAM && h === 12) h = 0;
                            return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                        } catch { return t; }
                    };
                    return `${format(item.startTime)} - ${format(item.endTime)}`;
                })()}
            </div>
        </div>
    </div>
);

export const SemesterCard = ({ item }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{
            padding: '10px', borderRadius: '12px',
            background: 'rgba(139, 92, 246, 0.1)', color: '#a78bfa'
        }}>
            <Hash size={24} />
        </div>
        <div>
            <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{item.name}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                Semester Number: {item.number}
            </div>
        </div>
    </div>
);

export const HolidayCard = ({ item }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{
            padding: '10px', borderRadius: '12px',
            background: 'rgba(239, 68, 68, 0.1)', color: '#f87171'
        }}>
            <CalendarOff size={24} />
        </div>
        <div>
            <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{item.name || 'Holiday'}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                {item.date ? new Date(item.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'No Date'}
            </div>
        </div>
    </div>
);
