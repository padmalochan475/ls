import React from 'react';
import { BookOpen, ExternalLink, FileText, GraduationCap } from 'lucide-react';

const syllabusData = [
    {
        title: "B.Tech First Year",
        items: [
            { name: "1st Year Syllabus (All Branches)", link: "https://tat.ac.in/wp-content/uploads/2024/05/Course-Structure-and-Detailed-Syllabus-for-1st-Year-B.Tech-Admission-Batch-2023-24.pdf" }
        ]
    },
    {
        title: "B.Tech Second Year",
        items: [
            { name: "3rd Semester Syllabus", link: "https://drive.google.com/file/d/1b7pTzhkUwzI4QDGJhWf27AYi78BAgBvK/view?usp=sharing" },
            { name: "4th Semester Syllabus", link: "https://drive.google.com/file/d/1pdGs3qTX7fWgt00nAi2i89uFUVl8tMGJ/view?usp=sharing" }
        ]
    },
    {
        title: "B.Tech Third Year",
        items: [
            { name: "5th Semester Syllabus", link: "https://drive.google.com/file/d/1Y1zmChGWs2-F0Ed22BsaLPV5KUMb9zPQ/view?usp=sharing" },
            { name: "6th Semester Syllabus", link: "https://drive.google.com/file/d/1n0qoTt45DeRzKpPswrOdlG1M5rAnhT20/view?usp=sharing" }
        ]
    },
    {
        title: "B.Tech Fourth Year",
        items: [
            { name: "4th Year Syllabus", link: "https://tat.ac.in/wp-content/uploads/2023/05/Syllabus-B.Tech-4TH-year-CSE-CST-2018-19-Admission-Batch.pdf" }
        ]
    },
    {
        title: "M.Tech",
        items: [
            { name: "M.Tech Syllabus", link: "https://drive.google.com/file/d/1ekG7MrlIt2Ldon2CBeaG30dZ1mDBvSiS/view?usp=sharing" }
        ]
    }
];

const Syllabus = () => {
    return (
        <div style={{ padding: '2rem 1.5rem', maxWidth: '1200px', margin: '0 auto' }} className="animate-fade-in">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2.5rem' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <BookOpen size={24} />
                </div>
                <div>
                    <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>Course Syllabus</h1>
                    <p style={{ color: 'var(--color-text-muted)', margin: '0.25rem 0 0 0', fontSize: '0.95rem' }}>Computer Science & Engineering Department Syllabi</p>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                {syllabusData.map((section, idx) => (
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
