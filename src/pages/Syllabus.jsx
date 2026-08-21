import React, { useState, useEffect } from 'react';
import { BookOpen, ExternalLink, FileText, GraduationCap, Loader2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

const Syllabus = () => {
    const [activeTab, setActiveTab] = useState('');
    const [syllabusData, setSyllabusData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        const fetchSyllabi = async () => {
            try {
                const snap = await getDocs(collection(db, 'syllabi'));
                if (!isMounted) return;
                
                if (!snap.empty) {
                    const depts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => a.order - b.order);
                    setSyllabusData(depts);
                    if (depts.length > 0) {
                        setActiveTab(depts[0].id);
                    }
                } else {
                    setSyllabusData([]);
                }
            } catch (error) {
                console.error("Error fetching syllabi:", error);
            } finally {
                if (isMounted) setLoading(false);
            }
        };
        fetchSyllabi();
        return () => { isMounted = false; };
    }, []);

    if (loading) {
        return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><Loader2 className="animate-spin" color="#3b82f6" size={32} /></div>;
    }

    if (syllabusData.length === 0) {
        return <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>No syllabus data available.</div>;
    }

    const activeDepartment = syllabusData.find(d => d.id === activeTab);

    return (
        <div style={{ padding: '2rem 1.5rem', maxWidth: '1200px', margin: '0 auto', position: 'relative', zIndex: 1 }} className="animate-fade-in">
            {/* Background glowing orb */}
            <div style={{
                position: 'absolute', top: '10%', left: '50%', transform: 'translate(-50%, -50%)',
                width: '600px', height: '600px', background: 'radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, rgba(0,0,0,0) 70%)',
                filter: 'blur(60px)', zIndex: -1, pointerEvents: 'none'
            }}></div>

            <style>{`
                @keyframes slideUpFade {
                    0% { opacity: 0; transform: translateY(30px) scale(0.95); }
                    100% { opacity: 1; transform: translateY(0) scale(1); }
                }
                .syllabus-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
                    gap: 2rem;
                }
                .premium-card {
                    background: rgba(17, 24, 39, 0.7);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 24px;
                    padding: 2rem;
                    box-shadow: 0 4px 30px rgba(0, 0, 0, 0.2);
                    position: relative;
                    overflow: hidden;
                    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                }
                .premium-card::before {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; right: 0;
                    height: 4px;
                    background: linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899);
                    opacity: 0.8;
                }
                .premium-card:hover {
                    transform: translateY(-8px) scale(1.02);
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4), 0 0 20px rgba(59, 130, 246, 0.2);
                    border-color: rgba(139, 92, 246, 0.3);
                }
                .premium-card:hover::before {
                    height: 6px;
                }
                
                /* Animated tab container */
                .tabs-container {
                    display: inline-flex;
                    background: rgba(15, 23, 42, 0.6);
                    padding: 0.5rem;
                    border-radius: 99px;
                    border: 1px solid rgba(255,255,255,0.05);
                    backdrop-filter: blur(10px);
                    margin-bottom: 3rem;
                    box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
                }
                .tab-btn {
                    padding: 0.8rem 2rem;
                    border-radius: 99px;
                    font-weight: 600;
                    font-size: 1.05rem;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    border: none;
                    outline: none;
                    position: relative;
                    color: #94a3b8;
                    background: transparent;
                }
                .tab-btn.active {
                    color: white;
                    background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
                    box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);
                }
                .tab-btn:not(.active):hover {
                    color: #e2e8f0;
                    background: rgba(255,255,255,0.05);
                }

                /* Syllabus items */
                .syllabus-item {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 1.25rem;
                    background: rgba(255,255,255,0.02);
                    border: 1px solid rgba(255,255,255,0.03);
                    border-radius: 16px;
                    text-decoration: none;
                    color: rgba(255,255,255,0.9);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    position: relative;
                    overflow: hidden;
                }
                .syllabus-item::after {
                    content: '';
                    position: absolute;
                    top: 0; left: -100%; width: 100%; height: 100%;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent);
                    transition: all 0.5s;
                }
                .syllabus-item:hover {
                    background: rgba(59, 130, 246, 0.08);
                    border-color: rgba(59, 130, 246, 0.3);
                    transform: translateX(5px);
                    box-shadow: -4px 4px 15px rgba(0,0,0,0.1);
                }
                .syllabus-item:hover::after {
                    left: 100%;
                }
                .item-icon-bg {
                    width: 36px; height: 36px;
                    border-radius: 10px;
                    background: rgba(59, 130, 246, 0.1);
                    display: flex; align-items: center; justify-content: center;
                    margin-right: 12px;
                    transition: all 0.3s;
                }
                .syllabus-item:hover .item-icon-bg {
                    background: rgba(59, 130, 246, 0.2);
                    color: #60a5fa !important;
                }
                .link-arrow {
                    transition: transform 0.3s;
                    opacity: 0.5;
                }
                .syllabus-item:hover .link-arrow {
                    transform: translate(3px, -3px);
                    opacity: 1;
                    color: #60a5fa;
                }
            `}</style>
            
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '2.5rem' }}>
                <div style={{ 
                    width: '64px', height: '64px', borderRadius: '16px', 
                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%)', 
                    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1), 0 8px 24px rgba(0,0,0,0.2)',
                    color: '#60a5fa', display: 'flex', alignItems: 'center', justifyContent: 'center' 
                }}>
                    <BookOpen size={32} />
                </div>
                <div>
                    <h1 style={{ fontSize: '2.5rem', fontWeight: 800, margin: 0, 
                        background: 'linear-gradient(to right, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.5px' }}>
                        Course Syllabus
                    </h1>
                    <p style={{ color: '#64748b', margin: '0.5rem 0 0 0', fontSize: '1.1rem', fontWeight: 500 }}>
                        Select a department to explore curriculum details.
                    </p>
                </div>
            </div>

            {/* Segmented Tabs */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div className="tabs-container">
                    {syllabusData.map((dept) => (
                        <button
                            key={dept.id}
                            onClick={() => setActiveTab(dept.id)}
                            className={`tab-btn ${activeTab === dept.id ? 'active' : ''}`}
                        >
                            {dept.departmentName}
                        </button>
                    ))}
                </div>
            </div>

            {/* Dynamic Grid */}
            <div key={activeTab} className="syllabus-grid">
                {activeDepartment && activeDepartment.sections && activeDepartment.sections.map((section, idx) => (
                    <div 
                        key={idx} 
                        className="premium-card" 
                        style={{ animation: `slideUpFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${idx * 0.12}s forwards`, opacity: 0 }}
                    >
                        <h2 style={{ 
                            fontSize: '1.35rem', fontWeight: 700, color: '#f8fafc', marginBottom: '1.75rem', 
                            display: 'flex', alignItems: 'center', gap: '12px', letterSpacing: '-0.3px' 
                        }}>
                            <div style={{ padding: '8px', background: 'rgba(168, 85, 247, 0.1)', borderRadius: '8px', color: '#a855f7' }}>
                                <GraduationCap size={22} />
                            </div>
                            {section.title}
                        </h2>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {section.items.map((item, itemIdx) => (
                                <a 
                                    key={itemIdx}
                                    href={item.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="syllabus-item"
                                >
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                        <div className="item-icon-bg" style={{ color: '#94a3b8' }}>
                                            <FileText size={18} />
                                        </div>
                                        <span style={{ fontWeight: 500, letterSpacing: '0.2px' }}>{item.name || item.title || 'View Syllabus'}</span>
                                    </div>
                                    <ExternalLink size={18} className="link-arrow" />
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
