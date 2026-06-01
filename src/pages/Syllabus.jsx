import React, { useState } from 'react';
import { BookOpen, ExternalLink, FileText, GraduationCap } from 'lucide-react';

const syllabusData = {
    CSE: [
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
    ],
    CSAIML: [
        {
            title: "B.Tech First Year",
            items: [
                { name: "1st Year Syllabus (All Branches)", link: "https://tat.ac.in/wp-content/uploads/2024/05/Course-Structure-and-Detailed-Syllabus-for-1st-Year-B.Tech-Admission-Batch-2023-24.pdf" }
            ]
        },
        {
            title: "B.Tech Second Year",
            items: [
                { name: "3rd Semester Syllabus", link: "https://drive.google.com/file/d/1oxAkDXsFK31cYUrgV6XxhFXng_nDOO7p/view?usp=sharing" },
                { name: "4th Semester Syllabus", link: "https://drive.google.com/file/d/14600goH8pZT3cXNCfFuEZm6aKUT0YH_0/view?usp=sharing" }
            ]
        },
        {
            title: "B.Tech Third Year",
            items: [
                { name: "5th Semester Syllabus", link: "https://drive.google.com/file/d/1cGJNa6c53AVltdjSPurO_9iK5OTWEUYx/view?usp=sharing" },
                { name: "6th Semester Syllabus", link: "https://drive.google.com/file/d/1CATgGuw4i81ETjmOUmgoI_FEq664sF8w/view?usp=sharing" }
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
                { name: "M.Tech Syllabus", link: "https://drive.google.com/file/d/135k3EwY3glj8WI9677K74xUzCH7augsM/view?usp=sharing" }
            ]
        }
    ],
    CSDS: [
        {
            title: "B.Tech First Year",
            items: [
                { name: "1st Year Syllabus (All Branches)", link: "https://tat.ac.in/wp-content/uploads/2024/05/Course-Structure-and-Detailed-Syllabus-for-1st-Year-B.Tech-Admission-Batch-2023-24.pdf" }
            ]
        },
        {
            title: "B.Tech Second Year",
            items: [
                { name: "3rd Semester Syllabus", link: "https://drive.google.com/file/d/1nwVhGARTim7sYuyDbsM41H1xe2Loy51z/view?usp=sharing" },
                { name: "4th Semester Syllabus", link: "https://drive.google.com/file/d/1gRqVgMrYtwnHifdU01B4lDm9vSXmT-sE/view?usp=sharing" }
            ]
        },
        {
            title: "B.Tech Third Year",
            items: [
                { name: "5th Semester Syllabus", link: "https://drive.google.com/file/d/1cGZnQ-FaNvR7V6wkneaisssn2t6p5YUS/view?usp=sharing" },
                { name: "6th Semester Syllabus", link: "https://drive.google.com/file/d/1Xp5gGByuVxJjMic9TS1PvVjr6OXZvEiS/view?usp=sharing" }
            ]
        },
        {
            title: "M.Tech",
            items: [
                { name: "M.Tech Syllabus", link: "https://drive.google.com/file/d/16Hw2Hfbkut2eOLO_mTbZOTX6FbaFgBDE/view?usp=sharing" }
            ]
        }
    ]
};

const Syllabus = () => {
    const [activeTab, setActiveTab] = useState('CSE');

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
                {Object.keys(syllabusData).map((dept) => (
                    <button
                        key={dept}
                        onClick={() => setActiveTab(dept)}
                        style={{
                            padding: '0.75rem 1.5rem',
                            background: activeTab === dept ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                            color: activeTab === dept ? '#60a5fa' : 'var(--color-text-muted)',
                            border: '1px solid',
                            borderColor: activeTab === dept ? 'rgba(59, 130, 246, 0.3)' : 'transparent',
                            borderRadius: '8px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {dept}
                    </button>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                {syllabusData[activeTab].map((section, idx) => (
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
