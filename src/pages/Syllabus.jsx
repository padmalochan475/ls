import React from 'react';
import { BookOpen, BookMarked, ClipboardList, GraduationCap } from 'lucide-react';

const Syllabus = () => {
    return (
        <div style={{ padding: '1rem' }} className="animate-fade-in">
            <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
                <div style={{
                    width: '72px', height: '72px',
                    background: 'rgba(167, 139, 250, 0.1)',
                    border: '1px solid rgba(167, 139, 250, 0.2)',
                    borderRadius: '18px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 1.5rem'
                }}>
                    <BookOpen size={36} color="#a78bfa" />
                </div>
                <h2 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.75rem' }}>
                    Syllabus Management
                </h2>
                <p style={{ color: 'var(--color-text-muted)', marginBottom: '2rem', maxWidth: '480px', margin: '0 auto 2rem' }}>
                    Track and manage syllabi for all branches and semesters. Monitor coverage
                    progress and ensure curriculum compliance across all departments.
                </p>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '1rem',
                    maxWidth: '640px',
                    margin: '0 auto'
                }}>
                    {[
                        { icon: <BookMarked size={24} />, title: 'Branch Syllabi', desc: 'Department-wise curriculum', color: '#a78bfa' },
                        { icon: <ClipboardList size={24} />, title: 'Coverage Tracking', desc: 'Monitor topic completion', color: '#60a5fa' },
                        { icon: <GraduationCap size={24} />, title: 'Semester Plans', desc: 'Semester-wise syllabus', color: '#34d399' },
                    ].map((item, i) => (
                        <div key={i} className="glass-panel-static" style={{
                            padding: '1.25rem',
                            textAlign: 'center',
                            border: '1px solid rgba(255,255,255,0.08)',
                            opacity: 0.7
                        }}>
                            <div style={{ color: item.color, marginBottom: '0.5rem' }}>{item.icon}</div>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem' }}>{item.title}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{item.desc}</div>
                        </div>
                    ))}
                </div>

                <div style={{
                    marginTop: '2rem',
                    padding: '1rem 1.5rem',
                    background: 'rgba(251, 191, 36, 0.1)',
                    border: '1px solid rgba(251, 191, 36, 0.2)',
                    borderRadius: 'var(--radius-md)',
                    color: '#fbbf24',
                    fontSize: '0.875rem',
                    display: 'inline-block'
                }}>
                    🚧 Coming Soon — This feature is currently being built.
                </div>
            </div>
        </div>
    );
};

export default Syllabus;
