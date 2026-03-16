import React from 'react';
import { Activity } from 'lucide-react';
import { parseTimeSlot, normalizeStr } from '../../utils/timeUtils';

const FacultyLoadMonitor = ({ facultyId, fullSchedule, faculty }) => {
    if (!facultyId) return null;
    const facObj = faculty.find(f => f.id === facultyId);
    const facultyName = facObj ? facObj.name : '';
    const empId = facObj ? facObj.empId : null;

    const targetName = normalizeStr(facultyName);

    let totalHours = 0;
    fullSchedule.forEach(s => {
        let match = false;
        // logic matches checkFacultyBusy
        if (empId && (s.facultyEmpId === empId || s.faculty2EmpId === empId)) {
            match = true;
        } else {
            // Fallback to Fuzzy Name Match
            const f1 = normalizeStr(s.faculty);
            const f2 = normalizeStr(s.faculty2);
            if (f1 === targetName || f2 === targetName) {
                match = true;
            }
        }

        if (match) {
            const info = parseTimeSlot(s.time);
            totalHours += info ? info.duration : 1;
        }
    });

    // Round to 1 decimal place for neatness
    totalHours = Math.round(totalHours * 10) / 10;

    const max = 18; // Max hours per week
    const percentage = Math.min((totalHours / max) * 100, 100);

    let color = '#10b981'; // Green
    if (totalHours > 12) color = '#f59e0b'; // Orange
    if (totalHours > 16) color = '#ef4444'; // Red

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', marginTop: '0.25rem' }}>
            <Activity size={12} color={color} />
            <span style={{ color: 'var(--color-text-muted)' }}>{totalHours} hrs/week</span>
            <div style={{ width: '60px', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ width: `${percentage}%`, height: '100%', background: color, transition: 'width 0.3s ease' }} />
            </div>
        </div>
    );
};

export default FacultyLoadMonitor;
