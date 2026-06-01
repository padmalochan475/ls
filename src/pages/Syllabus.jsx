import React, { useState, useEffect } from 'react';
import { BookOpen, ExternalLink, FileText, GraduationCap, Loader2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';

const Syllabus = () => {
    const [activeTab, setActiveTab] = useState('');
    const [syllabusData, setSyllabusData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, 'syllabi'), (snap) => {
            if (!snap.empty) {
                const depts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => a.order - b.order);
                setSyllabusData(depts);
                if (depts.length > 0) {
                    setActiveTab(depts[0].id);
                }
            } else {
                setSyllabusData([]);
            }
            setLoading(false);
        }, (error) => {
            console.error("Error fetching syllabi:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    if (loading) {
        return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><Loader2 className="animate-spin" color="#3b82f6" size={32} /></div>;
    }

    if (syllabusData.length === 0) {
        return <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>No syllabus data available.</div>;
    }

    const activeDepartment = syllabusData.find(d => d.id === activeTab);

    return (
        <div style={{ padding: '2rem 1.5rem', maxWidth: '1200px', margin: '0 auto' }} className="animate-fade-in">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2.5rem' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <BookOpen size={24} />
                </div>
                <div>
                    <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>Course Syllabus</h1>
                    <p style={{ color: 'var(--color-text-muted)', margin: '0.25rem 0 0 0', fontSize: '0.95rem' }}>Department Syllabi</p>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem', overflowX: 'auto' }}>
                {syllabusData.map((dept) => (
                    <button
                        key={dept.id}
                        onClick={() => setActiveTab(dept.id)}
                        style={{
                            padding: '0.75rem 1.5rem',
                            background: activeTab === dept.id ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                            color: activeTab === dept.id ? '#60a5fa' : 'var(--color-text-muted)',
                            border: '1px solid',
                            borderColor: activeTab === dept.id ? 'rgba(59, 130, 246, 0.3)' : 'transparent',
                            borderRadius: '8px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {dept.departmentName}
                    </button>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                {activeDepartment && activeDepartment.sections && activeDepartment.sections.map((section, idx) => (
                    <div key={idx} className="glass-panel" style={{ padding: '1.5rem' }}>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#f8fafc', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <GraduationCap size={18} color="#a855f7" />
                            {section.title}
                        </h2>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {section.items.map((item, itemIdx) => (
                                <a 
                                    key={itemIdx}
                                    href={item.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '1rem',
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid rgba(255,255,255,0.05)',
                                        borderRadius: '10px',
                                        textDecoration: 'none',
                                        color: 'rgba(255,255,255,0.9)',
                                        transition: 'all 0.2s ease',
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
                                        e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.2)';
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)';
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <FileText size={18} color="#94a3b8" />
                                        <span style={{ fontSize: '0.95rem', fontWeight: 500 }}>{item.name}</span>
                                    </div>
                                    <ExternalLink size={16} color="#64748b" />
                                </a>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Syllabus;
