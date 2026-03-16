import React, { useState, useEffect } from 'react';
import { generateTimetablePDF } from '../utils/pdfGenerator';
import { RefreshCw, Download, AlertTriangle, Calendar } from 'lucide-react';
import QuantumLoader from '../components/QuantumLoader';
import '../styles/design-system.css';

// Lightweight Public Viewer
const PublicView = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [data, setData] = useState({
        schedule: [],
        days: [],
        timeSlots: [],
        subjectMap: {},
        deptMap: {},
        roomMap: {},
        semMap: {},
        facultyMap: {},
        activeAcademicYear: ''
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Secure API Call (Sanitized Data)
                const response = await fetch('/api/public-schedule');
                if (!response.ok) throw new Error('Unable to Connect to Public Schedule Service');

                const result = await response.json();

                setData({
                    schedule: result.schedule,
                    days: result.days,
                    timeSlots: result.timeSlots,
                    subjectMap: result.subjectMap || {},
                    deptMap: result.deptMap || {},
                    roomMap: result.roomMap || {},
                    semMap: result.semMap || {},
                    facultyMap: result.facultyMap || {},
                    activeAcademicYear: result.activeAcademicYear
                });
                setLoading(false);

            } catch (err) {
                console.error("Public Fetch Error:", err);
                setError(err.message || "Failed to load schedule.");
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const handleDownload = () => {
        const { schedule, days, timeSlots, activeAcademicYear, subjectMap, deptMap, roomMap, semMap, facultyMap } = data;
        const pdfMeta = {
            title: activeAcademicYear,
            subtitle: 'Public Schedule View',
            user: 'Guest User',
            academicYear: activeAcademicYear,
            filterText: 'FULL SCHEDULE (PUBLIC ACCESS)'
        };

        // Helper strictly matching Scheduler.jsx logic
        const normalize = (str) => String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');

        const getSemesterFormatted = (name) => {
            if (!name) return '';
            const key = normalize(name);
            // Lookup Code (Normalized Key)
            let code = (semMap && semMap[key]) ? semMap[key] : name.trim();

            // FALLBACK: Manual strip if "Semester" or "Sem" is still in the string
            // This handles cases where map lookup fails or map contains the full name
            if (typeof code === 'string' && (code.includes('Semester') || code.includes('Sem'))) {
                code = code.replace(/Semester/i, '').replace(/Sem/i, '').trim();
            }

            // Add ordinal only if it's a raw number
            if (!isNaN(code)) {
                const s = ["th", "st", "nd", "rd"];
                const v = code % 100;
                return code + (s[(v - 20) % 10] || s[v] || s[0]) + " SEM";
            }
            return code; // Returns "4th" or "2nd" which pdfGenerator turns into "-2nd SEM"
        };

        // Helper for map lookup with normalization
        const getMapped = (map, val) => {
            if (!val) return '';
            const key = normalize(val);
            return (map && map[key]) ? map[key] : val.trim();
        }

        // Sanitize for PDF and Apply Short Codes
        const cleanSchedule = schedule.map(s => ({
            ...s,
            subject: getMapped(subjectMap, s.subject),
            dept: getMapped(deptMap, s.dept),
            room: getMapped(roomMap, s.room),
            // Faculty Short Codes
            faculty: getMapped(facultyMap, s.faculty),
            faculty2: getMapped(facultyMap, s.faculty2),
            // Semester Formatting
            sem: getSemesterFormatted(s.sem)
        }));

        generateTimetablePDF({ days, timeSlots, assignments: cleanSchedule }, pdfMeta);
    };

    if (loading) return <QuantumLoader />;

    if (error) {
        return (
            <div style={{
                height: '100vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#0f172a',
                color: 'white',
                gap: '1rem',
                textAlign: 'center',
                padding: '2rem'
            }}>
                <AlertTriangle size={48} color="#ef4444" />
                <h2>Unable to Load Schedule</h2>
                <p style={{ color: '#94a3b8' }}>{error}</p>
                <div style={{ fontSize: '0.8rem', color: '#64748b', maxWidth: '400px' }}>
                    Note: If you are an administrator, please ensure your database permissions allow public read access to the schedule.
                </div>
            </div>
        );
    }

    return (
        <div style={{
            minHeight: '100vh',
            background: '#0f172a',
            color: 'white',
            padding: '20px',
            fontFamily: "'Inter', sans-serif"
        }}>
            {/* Header */}
            <div style={{
                maxWidth: '1200px',
                margin: '0 auto 30px auto',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(30, 41, 59, 0.5)',
                padding: '20px',
                borderRadius: '16px',
                border: '1px solid rgba(255,255,255,0.1)',
                backdropFilter: 'blur(10px)'
            }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Academic Schedule</h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', marginTop: '4px' }}>
                        <Calendar size={14} />
                        <span>{data.activeAcademicYear}</span>
                    </div>
                </div>
                <button
                    onClick={handleDownload}
                    className="btn"
                    style={{
                        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 20px',
                        borderRadius: '8px',
                        border: 'none',
                        cursor: 'pointer',
                        fontWeight: 600,
                        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
                    }}
                >
                    <Download size={18} />
                    Download PDF
                </button>
            </div>

            {/* Content Placeholder / Preview */}
            <div style={{
                maxWidth: '600px',
                margin: '100px auto',
                textAlign: 'center',
                color: '#94a3b8'
            }}>
                <div style={{ marginBottom: '20px' }}>
                    <RefreshCw size={64} style={{ opacity: 0.2 }} />
                </div>
                <h3>Public View Mode</h3>
                <p>You can download the full PDF schedule using the button above.</p>
                <p style={{ fontSize: '0.85rem', marginTop: '20px', opacity: 0.6 }}>
                    This is a simplified view for students and guests.
                </p>
            </div>
        </div>
    );
};

export default PublicView;
