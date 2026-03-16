/* eslint-disable sonarjs/no-nested-conditional */
import React, { useState, useEffect } from 'react';
import { Lightbulb, Send, MessageSquare, ThumbsUp, Sparkles, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import toast from 'react-hot-toast';

const Suggestions = () => {
    const { userProfile, currentUser } = useAuth();
    const [formData, setFormData] = useState({
        subject: '',
        category: 'Feature Request',
        description: '',
        priority: 'Medium'
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    // History
    const [mySuggestions, setMySuggestions] = useState([]);

    const categories = ['Feature Request', 'Bug Report', 'UI/UX Improvement', 'Performance', 'Other'];
    const priorities = ['Low', 'Medium', 'High'];

    useEffect(() => {
        if (!currentUser?.uid) return;

        const fetchSuggestions = async () => {
            try {
                // Query without sorting to avoid requiring a composite index immediately
                const q = query(
                    collection(db, 'suggestions'),
                    where('userId', '==', currentUser.uid)
                );

                const snapshot = await getDocs(q);
                const list = [];
                snapshot.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));

                // Client-side sort
                list.sort((a, b) => {
                    const timeA = a.createdAt?.seconds || 0;
                    const timeB = b.createdAt?.seconds || 0;
                    return timeB - timeA;
                });

                setMySuggestions(list);
            } catch (error) {
                console.error("Error fetching history:", error);
            }
        };

        fetchSuggestions();
    }, [currentUser?.uid]);


    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.subject || !formData.description) return;

        setIsSubmitting(true);
        try {
            await addDoc(collection(db, 'suggestions'), {
                ...formData,
                status: 'New',
                userId: currentUser?.uid || 'anonymous',
                userName: userProfile?.name || 'Anonymous',
                userRole: userProfile?.role || 'user',
                createdAt: serverTimestamp(),
                votes: 0
            });

            setSubmitted(true);
            toast.success('Suggestion submitted successfully!');

            // Reset form after a delay or keep the success state
            setTimeout(() => {
                setSubmitted(false);
                setFormData({ subject: '', category: 'Feature Request', description: '', priority: 'Medium' });
            }, 3000);

        } catch (error) {
            console.error(error);
            toast.error('Failed to submit suggestion.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (submitted) {
        return (
            <div style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                animation: 'fadeInUp 0.5s ease'
            }}>
                <div style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    background: 'rgba(46, 213, 115, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '2rem',
                    border: '1px solid rgba(46, 213, 115, 0.2)'
                }}>
                    <CheckCircle2 size={40} color="#2ed573" />
                </div>
                <h2 style={{ fontSize: '2rem', marginBottom: '1rem', background: 'linear-gradient(to right, #fff, #a5b4fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Thank You!</h2>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '1.1rem', maxWidth: '400px', lineHeight: '1.6' }}>
                    Your suggestion has been beamed to our development team. We appreciate your contribution to making LAMS better.
                </p>
                <div style={{ marginTop: '2rem' }}>
                    <button
                        onClick={() => setSubmitted(false)}
                        className="btn btn-primary"
                        style={{ padding: '0.75rem 2rem' }}
                    >
                        Submit Another
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="animate-fade-in" style={{ padding: '1rem', maxWidth: '1200px', margin: '0 auto' }}>
            <style>
                {`
                    .suggestions-container {
                        display: grid;
                        grid-template-columns: 1fr 350px;
                        gap: 2rem;
                    }
                    .hero-section {
                        padding: 4rem;
                        margin-bottom: 3rem;
                        border-radius: 32px;
                        position: relative;
                        overflow: hidden;
                        background: radial-gradient(circle at top right, #1e1b4b, #0f172a);
                        box-shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.5);
                        border: 1px solid rgba(255, 255, 255, 0.05);
                    }
                    .hero-title {
                        font-size: 3.5rem;
                    }
                    
                    @media (max-width: 900px) {
                        .suggestions-container {
                            grid-template-columns: 1fr;
                        }
                    }

                    @media (max-width: 768px) {
                        .hero-section {
                            padding: 2rem;
                        }
                        .hero-title {
                            font-size: 2rem;
                        }
                    }
                `}
            </style>
            {/* Hero Section */}
            {/* Premium Hero Section */}
            <div className="hero-section">
                {/* Background Blobs */}
                <div style={{
                    position: 'absolute', top: '-20%', right: '-10%', width: '600px', height: '600px',
                    background: 'radial-gradient(circle, rgba(79, 70, 229, 0.15) 0%, transparent 70%)',
                    borderRadius: '50%', filter: 'blur(80px)', zIndex: 0
                }}></div>
                <div style={{
                    position: 'absolute', bottom: '-20%', left: '-10%', width: '500px', height: '500px',
                    background: 'radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%)',
                    borderRadius: '50%', filter: 'blur(80px)', zIndex: 0
                }}></div>

                {/* Grid Pattern Overlay */}
                <div style={{
                    position: 'absolute', inset: 0,
                    backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)',
                    backgroundSize: '40px 40px',
                    opacity: 0.3, zIndex: 0
                }}></div>

                <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                    <div className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
                        <span style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '99px',
                            background: 'rgba(99, 102, 241, 0.1)',
                            border: '1px solid rgba(99, 102, 241, 0.3)',
                            color: '#818cf8',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            letterSpacing: '1px',
                            textTransform: 'uppercase',
                            display: 'inline-flex', alignItems: 'center', gap: '0.5rem'
                        }}>
                            <Sparkles size={14} /> Community Driven
                        </span>
                    </div>

                    <h1 className="animate-slide-up hero-title" style={{
                        fontWeight: '800',
                        lineHeight: 1.1,
                        margin: 0,
                        background: 'linear-gradient(to right, #ffffff, #c7d2fe)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        animationDelay: '0.2s',
                        maxWidth: '800px'
                    }}>
                        Shape the Future of <span style={{ color: '#818cf8', WebkitTextFillColor: '#818cf8' }}>LAMS</span>
                    </h1>

                    <p className="animate-slide-up" style={{
                        color: '#94a3b8',
                        fontSize: '1.25rem',
                        maxWidth: '650px',
                        lineHeight: '1.7',
                        margin: 0,
                        animationDelay: '0.3s'
                    }}>
                        Your insights drive our innovation. Share your brilliant ideas, report improved workflows, or spot pesky bugs to help us build a better platform for everyone.
                    </p>
                </div>
            </div>

            <div className="suggestions-container">
                {/* Form Section */}
                <div className="glass-panel" style={{ padding: '2rem' }}>
                    <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.25rem' }}>
                        <Lightbulb size={20} color="#fbbf24" />
                        Submit a Suggestion
                    </h3>

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Category</label>
                                <select
                                    className="glass-input"
                                    value={formData.category}
                                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                >
                                    {categories.map(c => <option key={c} value={c} style={{ background: '#1e293b' }}>{c}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Priority</label>
                                <select
                                    className="glass-input"
                                    value={formData.priority}
                                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                                >
                                    {priorities.map(p => <option key={p} value={p} style={{ background: '#1e293b' }}>{p}</option>)}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Subject</label>
                            <input
                                type="text"
                                className="glass-input"
                                placeholder="E.g., Dark mode toggle for scheudle"
                                value={formData.subject}
                                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                                required
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Description</label>
                            <textarea
                                className="glass-input"
                                rows="6"
                                placeholder="Describe your idea in detail..."
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                required
                                style={{ resize: 'vertical' }}
                            ></textarea>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={isSubmitting}
                                style={{
                                    paddingLeft: '2rem',
                                    paddingRight: '2rem',
                                    minWidth: '150px'
                                }}
                            >
                                {isSubmitting ? (
                                    'Sending...'
                                ) : (
                                    <>
                                        Submit <Send size={16} />
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>

                {/* Sidebar Info Section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="glass-panel" style={{ padding: '1.5rem', background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.1)' }}>
                        <h4 style={{ color: '#60a5fa', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <ThumbsUp size={16} /> Community Guidelines
                        </h4>
                        <ul style={{ paddingLeft: '1.25rem', color: 'var(--color-text-muted)', fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <li>Be specific and constructive.</li>
                            <li>Check if the feature already exists.</li>
                            <li>Keep each suggestion focused on one topic.</li>
                            <li>Respectful language is appreciated.</li>
                        </ul>
                    </div>

                    <div className="glass-panel" style={{ padding: '1.5rem' }}>
                        <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <MessageSquare size={16} color="#a78bfa" /> My History
                        </h4>
                        {mySuggestions.length === 0 ? (
                            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                                No suggestions submitted yet.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '400px', overflowY: 'auto' }}>
                                {mySuggestions.map(s => (
                                    <div key={s.id} style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {s.subject}
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                                {s.createdAt?.seconds ? new Date(s.createdAt.seconds * 1000).toLocaleDateString('en-GB') : 'Just now'}
                                            </span>
                                            <span style={{
                                                fontSize: '0.75rem',
                                                fontWeight: '600',

                                                color: s.status === 'New' ? '#60a5fa'
                                                    : s.status === 'In Review' ? '#f59e0b'
                                                        : s.status === 'Planned' ? '#a78bfa'
                                                            : s.status === 'Implemented' ? '#34d399'
                                                                : '#94a3b8'
                                            }}>
                                                {s.status}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Suggestions;
