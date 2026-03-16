import React from 'react';
import { Library, FileText, FolderOpen, ExternalLink } from 'lucide-react';

const Resources = () => {
    return (
        <div style={{ padding: '1rem' }} className="animate-fade-in">
            <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
                <div style={{
                    width: '72px', height: '72px',
                    background: 'rgba(41, 151, 255, 0.1)',
                    border: '1px solid rgba(41, 151, 255, 0.2)',
                    borderRadius: '18px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 1.5rem'
                }}>
                    <Library size={36} color="#60a5fa" />
                </div>
                <h2 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.75rem' }}>
                    Resources
                </h2>
                <p style={{ color: 'var(--color-text-muted)', marginBottom: '2rem', maxWidth: '480px', margin: '0 auto 2rem' }}>
                    Central repository for academic resources, course materials, and reference documents.
                    This section is under active development.
                </p>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '1rem',
                    maxWidth: '640px',
                    margin: '0 auto'
                }}>
                    {[
                        { icon: <FileText size={24} />, title: 'Course Materials', desc: 'Lecture notes & slides', color: '#60a5fa' },
                        { icon: <FolderOpen size={24} />, title: 'Lab Manuals', desc: 'Lab exercises & guides', color: '#a78bfa' },
                        { icon: <ExternalLink size={24} />, title: 'Reference Links', desc: 'External resources', color: '#34d399' },
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

export default Resources;
