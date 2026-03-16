import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const AcademicYearSelector = ({ className, style }) => {
    const {
        activeAcademicYear,
        setSelectedAcademicYear,
        academicYears,
        userProfile,
        allowUserYearChange
    } = useAuth();

    const isAdmin = userProfile && userProfile.role === 'admin';
    const canChangeYear = isAdmin || allowUserYearChange;

    if (canChangeYear) {
        return (
            <select
                value={activeAcademicYear}
                onChange={(e) => setSelectedAcademicYear(e.target.value)}
                className={`glass-input ${className || ''}`}
                style={{
                    fontWeight: '600',
                    color: 'var(--color-accent)',
                    cursor: 'pointer',
                    ...style
                }}
            >
                {academicYears.map(year => (
                    <option key={year} value={year} style={{ background: '#1e293b', color: 'white' }}>
                        {year} {year === activeAcademicYear ? '(Active)' : ''}
                    </option>
                ))}
            </select>
        );
    }

    // Read-Only View
    return (
        <div
            className={`glass-input ${className || ''}`}
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '600',
                color: 'var(--color-accent)',
                background: 'rgba(255, 255, 255, 0.05)',
                cursor: 'default',
                ...style
            }}
        >
            {activeAcademicYear}
        </div>
    );
};

export default AcademicYearSelector;
