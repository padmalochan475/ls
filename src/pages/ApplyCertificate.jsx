
import React, { useState, useEffect } from 'react';
import { GraduationCap, Send, ShieldCheck, Info, FileText, CheckCircle2 } from 'lucide-react';
import QuantumLoader from '../components/QuantumLoader';
import toast from 'react-hot-toast';
import { certApi } from '../utils/certificateApi';

const ApplyCertificate = () => {
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [settings, setSettings] = useState({});
    const [branches, setBranches] = useState([]);
    
    const [formData, setFormData] = useState({
        studentName: '',
        regNo: '',
        branch: '',
        year: '4th Year',
        session: '2025-26',
        type: 'Internship',
        company: '',
        duration: '',
        startDate: '',
        salutation: 'Mr.',
        contact: ''
    });

    const [companies, setCompanies] = useState([]);

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const res = await certApi.getBranches();
                if (res.success) {
                    setBranches(res.data.map(b => b.BranchFullName || b.BranchName || b.name).filter(Boolean).sort());
                }

                // Fetch Companies
                const compRes = await certApi.getSheetData("Company Master");
                if (compRes.success) {
                    setCompanies(compRes.data.rows.map(c => c["Company Name"]).filter(Boolean).sort());
                }
            } catch (err) {
                console.error(err);
                toast.error("Cloud sync failed. Using local mode.");
                setBranches(["CSE", "CST", "CSIT", "ETC", "EE", "ME", "CE"]);
            } finally {
                setLoading(false);
            }
        };
        fetchInitialData();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const res = await certApi.submitApplication(formData);
            if (res.success) {
                setSubmitted(true);
                toast.success("Application submitted to Sheets!");
            } else {
                toast.error("Backend not configured. Check Apps Script URL.");
            }
        } catch (err) {
            console.error(err);
            toast.error("Failed to submit to Google Sheets");
        }
        setSubmitting(false);
    };

    if (loading) return <QuantumLoader />;

    if (submitted) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', padding: '2rem' }}>
                <div className="glass-panel" style={{ maxWidth: '500px', textAlign: 'center', padding: '3rem' }}>
                    <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem' }}>
                        <CheckCircle2 size={48} />
                    </div>
                    <h1 style={{ color: 'white', marginBottom: '1rem' }}>Application Submitted!</h1>
                    <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>Your request for an {formData.type} certificate has been received. Our administration will review it shortly. You can check back later for updates.</p>
                    <button onClick={() => setSubmitted(false)} className="btn btn-primary" style={{ width: '100%' }}>Submit Another</button>
                </div>
            </div>
        );
    }

    return (
        <div className="animate-fade-in" style={{ minHeight: '100vh', padding: 'var(--space-xl) var(--space-md)' }}>
            <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                {/* Hero Section */}
                <div className="profile-hero animate-fade-in stagger-1" style={{ marginBottom: 'var(--space-2xl)' }}>
                    <div className="profile-avatar-container" style={{ background: 'var(--color-accent-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                        <GraduationCap size={64} />
                    </div>
                    <div className="profile-hero-content">
                        <h1 className="text-clamp" style={{ margin: 0, color: 'white' }}>Certificate Portal</h1>
                        <p style={{ margin: 0, opacity: 0.9 }}>Trident Academy of Technology • Official Student Services</p>
                    </div>
                </div>

                <div className="responsive-grid stagger-2" style={{ gap: 'var(--space-lg)' }}>
                    {/* Main Form */}
                    <div style={{ gridColumn: 'span 2' }}>
                        <form onSubmit={handleSubmit} className="glass-panel animate-fade-in stagger-3" style={{ padding: 'var(--space-xl)' }}>
                            <div className="section-header" style={{ marginBottom: 'var(--space-xl)', borderBottom: '1px solid var(--glass-border)', paddingBottom: 'var(--space-md)' }}>
                                <FileText size={20} color="var(--color-accent)" />
                                <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Student Information</h2>
                            </div>

                            <div className="responsive-grid" style={{ marginBottom: 'var(--space-xl)' }}>
                                <div>
                                    <label className="form-label" style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '8px', display: 'block' }}>Full Name (Official)</label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <select 
                                            className="glass-input" 
                                            style={{ width: '100px' }}
                                            value={formData.salutation}
                                            onChange={e => setFormData({...formData, salutation: e.target.value})}
                                        >
                                            <option>Mr.</option>
                                            <option>Ms.</option>
                                            <option>Mrs.</option>
                                        </select>
                                        <input 
                                            required 
                                            type="text" 
                                            className="glass-input" 
                                            placeholder="Full name as per ID" 
                                            value={formData.studentName}
                                            onChange={e => setFormData({...formData, studentName: e.target.value})}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="form-label" style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '8px', display: 'block' }}>Registration No.</label>
                                    <input 
                                        required 
                                        type="text" 
                                        className="glass-input" 
                                        placeholder="e.g. 2101234567" 
                                        value={formData.regNo}
                                        onChange={e => setFormData({...formData, regNo: e.target.value})}
                                    />
                                </div>

                                <div>
                                    <label className="form-label" style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '8px', display: 'block' }}>Student Contact No.</label>
                                    <input 
                                        required 
                                        type="tel" 
                                        className="glass-input" 
                                        placeholder="Mobile Number" 
                                        value={formData.contact}
                                        onChange={e => setFormData({...formData, contact: e.target.value})}
                                    />
                                </div>

                                <div>
                                    <label className="form-label" style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '8px', display: 'block' }}>Department / Branch</label>
                                    <select 
                                        required 
                                        className="glass-input"
                                        value={formData.branch}
                                        onChange={e => setFormData({...formData, branch: e.target.value})}
                                    >
                                        <option value="">Select Branch</option>
                                        {branches.map(b => <option key={b} value={b}>{b}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label className="form-label" style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '8px', display: 'block' }}>Year of Study</label>
                                    <select 
                                        required 
                                        className="glass-input"
                                        value={formData.year}
                                        onChange={e => setFormData({...formData, year: e.target.value})}
                                    >
                                        <option>1st Year</option>
                                        <option>2nd Year</option>
                                        <option>3rd Year</option>
                                        <option>4th Year</option>
                                    </select>
                                </div>
                            </div>

                            <div className="section-header" style={{ margin: 'var(--space-xl) 0 var(--space-xl)', borderBottom: '1px solid var(--glass-border)', paddingBottom: 'var(--space-md)' }}>
                                <ShieldCheck size={20} color="var(--color-success)" />
                                <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Certificate Details</h2>
                            </div>

                            <div className="responsive-grid" style={{ marginBottom: 'var(--space-xl)' }}>
                                <div>
                                    <label className="form-label" style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '8px', display: 'block' }}>Certificate Type</label>
                                    <select 
                                        required 
                                        className="glass-input"
                                        value={formData.type}
                                        onChange={e => setFormData({...formData, type: e.target.value})}
                                    >
                                        <option>Internship</option>
                                        <option>Apprenticeship</option>
                                        <option>Industrial Training</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="form-label" style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '8px', display: 'block' }}>Company Name</label>
                                    {companies.length > 0 ? (
                                        <select 
                                            required 
                                            className="glass-input"
                                            value={formData.company}
                                            onChange={e => setFormData({...formData, company: e.target.value})}
                                        >
                                            <option value="">Select Company</option>
                                            {companies.map(c => <option key={c} value={c}>{c}</option>)}
                                            <option value="Other">Other (Type below)</option>
                                        </select>
                                    ) : (
                                        <input 
                                            required 
                                            type="text" 
                                            className="glass-input" 
                                            placeholder="e.g. Tata Motors" 
                                            value={formData.company}
                                            onChange={e => setFormData({...formData, company: e.target.value})}
                                        />
                                    )}
                                    {formData.company === "Other" && (
                                        <input 
                                            required 
                                            type="text" 
                                            className="glass-input" 
                                            style={{ marginTop: '8px' }}
                                            placeholder="Type Company Name" 
                                            onChange={e => setFormData({...formData, company: e.target.value})}
                                        />
                                    )}
                                </div>

                                <div>
                                    <label className="form-label" style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '8px', display: 'block' }}>Duration</label>
                                    <input 
                                        required 
                                        type="text" 
                                        className="glass-input" 
                                        placeholder="e.g. 4 Weeks" 
                                        value={formData.duration}
                                        onChange={e => setFormData({...formData, duration: e.target.value})}
                                    />
                                </div>

                                <div>
                                    <label className="form-label" style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '8px', display: 'block' }}>Start Date</label>
                                    <input 
                                        required 
                                        type="date" 
                                        className="glass-input" 
                                        value={formData.startDate}
                                        onChange={e => setFormData({...formData, startDate: e.target.value})}
                                    />
                                </div>
                            </div>

                            <div style={{ padding: 'var(--space-md)', background: 'var(--color-accent-subtle)', borderRadius: 'var(--radius-md)', display: 'flex', gap: '1rem', alignItems: 'flex-start', marginBottom: 'var(--space-xl)' }}>
                                <Info size={18} color="var(--color-accent)" style={{ marginTop: '2px', flexShrink: 0 }} />
                                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: 0 }}>
                                    Your application will be synced with the TAT Google Sheets backend. Our staff will review and generate the PDF based on this data.
                                </p>
                            </div>

                            <button 
                                type="submit" 
                                className="btn btn-primary" 
                                disabled={submitting}
                                style={{ width: '100%', height: '56px', fontSize: '1.1rem' }}
                            >
                                {submitting ? <RefreshCw className="spin-animation" /> : <><Send size={20} /> Submit Application</>}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ApplyCertificate;
