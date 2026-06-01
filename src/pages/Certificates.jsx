
import React, { useState, useEffect } from 'react';
import { 
    FileText, CheckCircle2, XCircle, Search, Settings, 
    Download, Trash2, Edit2, Plus, Clock, Building2,
    Database, Table as TableIcon, Layout, RefreshCw, Briefcase,
    Filter, Activity, ShieldCheck, HeartPulse, ChevronRight
} from 'lucide-react';
import QuantumLoader from '../components/QuantumLoader';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import { certApi } from '../utils/certificateApi';

const formatDate = (dateInput) => {
    if (!dateInput) return 'N/A';
    try {
        const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
    } catch (e) { return 'N/A'; }
};

const deriveAcYear = (ts) => {
    if (!ts) return '';
    const date = new Date(ts);
    if (isNaN(date.getTime())) return '';
    const m = date.getMonth() + 1;
    const y = date.getFullYear();
    return (m >= 7) ? (y + '-' + String(y + 1).slice(-2)) : ((y - 1) + '-' + String(y).slice(-2));
};

const Certificates = () => {
    const [activeTab, setActiveTab] = useState('requests');
    const [loading, setLoading] = useState(true);
    const [requests, setRequests] = useState([]);
    const [branches, setBranches] = useState([]);
    const [companies, setCompanies] = useState([]);
    const [academicYears, setAcademicYears] = useState([]);
    const [selectedYear, setSelectedYear] = useState('');
    const [explorerLoading, setExplorerLoading] = useState(false);
    const [liveMode, setLiveMode] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingRow, setEditingRow] = useState(null);
    const [editFormData, setEditFormData] = useState({});
    const [backendSettings, setBackendSettings] = useState({});
    const [newYearInput, setNewYearInput] = useState('');
    const [sheetUrl, setSheetUrl] = useState('');
    const [selectedRequestIds, setSelectedRequestIds] = useState([]);
    const [selectedSheet, setSelectedSheet] = useState('Form Responses 1');
    const [diagnostics, setDiagnostics] = useState(null);

    const CONSTANTS = {
        FORM: "Form Responses 1",
        BRANCHES: "Branch Master",
        COMPANIES: "Company Master",
        AUDIT: "Activity Log"
    };

    const fetchData = async (force = false) => {
        setLoading(true);
        try {
            const res = await certApi.getAdminDashboard(force || liveMode);
            if (res.success) {
                // ... normalize logic remains the same
                setAcademicYears(res.data.academicYears || []);
                const normalize = (list) => (list || []).map(r => ({
                    ...r,
                    studentName: r.StudentFullName || r.StudentName || '',
                    regNo: r.RegistrationNumber || r.RegistrationNo || r.RegistrationID || '',
                    status: (r.Status || 'pending').toLowerCase(),
                    academicYear: r.AcademicYear || deriveAcYear(r.Timestamp)
                }));
                setRequests(normalize(res.data.requests));
                setBranches(res.data.branches || []);
                setCompanies(res.data.companies || []);
                setBackendSettings(res.data.settings || {});
                setSheetUrl(res.data.sheetUrl || '');
                if (res.data.settings?.active_year && !selectedYear) setSelectedYear(res.data.settings.active_year);
                
                if (res.data.fromCache) toast.success("Using System Cache (Fast Mode)", { icon: '⚡' });
            }
        } catch (err) { toast.error("Bridge Connection Failed"); }
        finally { setLoading(false); }
    };

    const loadExplorer = async (sheet) => {
        setExplorerLoading(true);
        setSelectedSheet(sheet);
        const res = await certApi.getSheetData(sheet);
        if (res.success) setExplorerData(res.data);
        setExplorerLoading(false);
    };

    useEffect(() => {
        if (activeTab === 'requests') fetchData();
        else if (activeTab === 'branches') loadExplorer(CONSTANTS.BRANCHES);
        else if (activeTab === 'companies') loadExplorer(CONSTANTS.COMPANIES);
        else if (activeTab === 'audit') loadExplorer(CONSTANTS.AUDIT);
    }, [activeTab]);

    const handleBulkStatusUpdate = async (status) => {
        if (selectedRequestIds.length === 0) return toast.error("Select rows first");
        setLoading(true);
        try {
            await certApi.bulkUpdateStatus(selectedRequestIds, status);
            toast.success(`Bulk ${status} successful`);
            setSelectedRequestIds([]);
            fetchData();
        } catch (err) { toast.error("Bulk action failed"); }
        finally { setLoading(false); }
    };

    const handleStatusUpdate = async (id, status) => {
        const req = requests.find(r => r._row === id);
        try {
            const res = await certApi.updateStatus(id, status, req.RefNo || '', req, new Date().getTime());
            if (res.success) { toast.success(`Request ${status}`); fetchData(); }
        } catch (err) { toast.error("Update failed"); }
    };

    const handleGenericDelete = async (sheet, id) => {
        if (!confirm("Delete this record permanently?")) return;
        const res = await certApi.deleteGenericRow(sheet, id);
        if (res.success) { 
            toast.success("Deleted from database"); 
            if (sheet === CONSTANTS.FORM) fetchData(); else loadExplorer(sheet);
        }
    };

    const handleGenericSave = async (e) => {
        e.preventDefault();
        const res = await certApi.saveGenericRow(selectedSheet, editingRow?._row, editFormData);
        if (res.success) {
            setShowEditModal(false);
            if (activeTab === 'requests') fetchData(); else loadExplorer(selectedSheet);
            toast.success("Record Saved Permanently");
        }
    };

    const openEditModal = async (sheetName, row = null) => {
        setEditingRow(row);
        setEditFormData(row || {});
        setSelectedSheet(sheetName);
        setShowEditModal(true);
        setExplorerLoading(true);
        try {
            const res = await certApi.getSheetData(sheetName);
            if (res.success) {
                setExplorerData(res.data);
            } else {
                toast.error(res.error || "Form failure");
                setShowEditModal(false);
            }
        } catch (err) {
            toast.error("Bridge Connection Error");
            setShowEditModal(false);
        } finally { setExplorerLoading(false); }
    };

    const generatePDF = (req) => {
        // Find HOD and Company Details
        const branchInfo = branches.find(b => b.BranchFullName === req.Branch || b.BranchCode === req.Branch) || {};
        const companyInfo = companies.find(c => c.CompanyName === req.Company) || {};

        const doc = new jsPDF('p', 'mm', 'a4');
        
        // Borders & Header
        doc.setDrawColor(0).setLineWidth(0.5).rect(10, 10, 190, 277);
        doc.setFont("helvetica", "bold").setFontSize(24).setTextColor(20, 50, 150);
        doc.text("TRIDENT ACADEMY OF TECHNOLOGY", 105, 30, { align: 'center' });
        
        doc.setFontSize(10).setFont("helvetica", "normal").setTextColor(100);
        doc.text("Approved by AICTE, New Delhi & Affiliated to BPUT, Odisha", 105, 36, { align: 'center' });
        doc.text("F2/A, Chandaka Industrial Estate, Bhubaneswar - 751024", 105, 41, { align: 'center' });
        
        doc.setDrawColor(20, 50, 150).setLineWidth(1).line(25, 48, 185, 48);
        
        // Title
        doc.setFontSize(18).setFont("helvetica", "bold").setTextColor(0);
        doc.text((req.CertificateType || "BONAFIDE CERTIFICATE").toUpperCase(), 105, 65, { align: 'center' });
        
        // References
        doc.setFontSize(12).setFont("helvetica", "normal");
        doc.text(`Ref No: ${req.RefNo || 'TAT/LAMS/'+req._row}`, 25, 80);
        doc.text(`Date: ${new Date().toLocaleDateString('en-GB')}`, 185, 80, { align: 'right' });
        
        // Content
        const salutation = req.Salutation || 'Mr.';
        const genderWord = salutation.toLowerCase().includes('mr') ? 'son' : 'daughter';
        const pronoun = salutation.toLowerCase().includes('mr') ? 'He' : 'She';
        
        const content = `This is to certify that ${salutation} ${req.studentName}, ${genderWord} of ${req.FatherName || 'N/A'}, bearing Registration No ${req.regNo}, is a bonafide student of this institute in the department of ${req.Branch || 'N/A'}. ${pronoun} has applied for ${req.CertificateType || 'Internship'} at ${req.Company || 'N/A'}. 

The institute has no objection to ${pronoun.toLowerCase()} attending the same for the period of ${req.Duration || 'N/A'} starting from ${formatDate(req.ProposedStartDate)}.`;

        doc.setFontSize(12).setFont("helvetica", "normal").setTextColor(50);
        const splitText = doc.splitTextToSize(content, 160);
        doc.text(splitText, 25, 100, { align: 'justify' });

        // Signature Area
        doc.setFont("helvetica", "bold").setTextColor(0);
        doc.text("Head of Department", 150, 240, { align: 'center' });
        if (branchInfo.HODName) {
            doc.setFontSize(11).setFont("helvetica", "italic");
            doc.text(`(${branchInfo.HODName})`, 150, 246, { align: 'center' });
        }
        
        doc.save(`${req.studentName}_${req.CertificateType}.pdf`);
    };

    const handleHeartbeat = async () => {
        setExplorerLoading(true);
        const res = await certApi.runDiagnostics();
        if (res.success) {
            setDiagnostics(res.data);
            toast.success("System Pulse OK");
        }
        setExplorerLoading(false);
    };

    const filteredRequests = requests.filter(r => {
        const matchSearch = String(r.studentName).toLowerCase().includes(searchTerm.toLowerCase()) || String(r.regNo).includes(searchTerm);
        const matchStatus = filterStatus === 'all' || r.status === filterStatus;
        const matchYear = !selectedYear || r.academicYear === selectedYear;
        return matchSearch && matchStatus && matchYear;
    });

    return (
        <div className="animate-fade-in" style={{ padding: '2rem' }}>
            {/* Header section remains similar but updated */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '50px', height: '50px', background: 'var(--color-accent-gradient)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}><FileText size={30} /></div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800 }}>Certificates HUB</h1>
                        <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>LAMS 2.0 institutional Control Panel</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div 
                        onClick={() => setLiveMode(!liveMode)}
                        style={{ 
                            cursor: 'pointer',
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px', 
                            padding: '6px 12px', 
                            borderRadius: '20px',
                            background: liveMode ? 'rgba(0, 255, 150, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                            border: `1px solid ${liveMode ? 'rgba(0, 255, 150, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
                            transition: 'all 0.3s ease'
                        }}
                    >
                        <div style={{ 
                            width: '8px', 
                            height: '8px', 
                            borderRadius: '50%', 
                            background: liveMode ? '#00ff96' : '#666',
                            boxShadow: liveMode ? '0 0 10px #00ff96' : 'none',
                            animation: liveMode ? 'pulse 2s infinite' : 'none'
                        }} />
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: liveMode ? '#00ff96' : '#999' }}>
                            {liveMode ? 'LIVE SYNC' : 'CACHED'}
                        </span>
                    </div>
                    <button className="btn btn-secondary" onClick={() => fetchData(true)} title="Force Refresh"><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /></button>
                    {sheetUrl && <a href={sheetUrl} target="_blank" rel="noopener" className="btn btn-secondary" title="Google Sheet"><Layout size={18} /> Sheet</a>}
                    <button className="btn btn-primary" onClick={handleHeartbeat} title="Run Diagnostics"><HeartPulse size={18} /></button>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="glass-panel" style={{ padding: '0.5rem', display: 'flex', gap: '5px', marginBottom: '1.5rem', width: 'fit-content' }}>
                <button className={`btn tab-btn ${activeTab === 'requests' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('requests')}><Database size={16} /> Applications</button>
                <button className={`btn tab-btn ${activeTab === 'branches' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('branches')}><Building2 size={16} /> Departments</button>
                <button className={`btn tab-btn ${activeTab === 'companies' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('companies')}><Briefcase size={16} /> Companies</button>
                <button className={`btn tab-btn ${activeTab === 'audit' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('audit')}><Activity size={16} /> Audit Logs</button>
                <button className={`btn tab-btn ${activeTab === 'settings' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('settings')}><Settings size={16} /> Settings</button>
            </div>

            {/* Applications View */}
            {activeTab === 'requests' && (
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'center' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                            <input type="text" className="glass-input" placeholder="Search by name or reg no..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} style={{ paddingLeft: '40px', width: '100%' }} />
                        </div>
                        <select className="glass-input" value={selectedYear} onChange={e=>setSelectedYear(e.target.value)} style={{ width: '150px' }}>
                            <option value="">All Years</option>
                            {academicYears.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <select className="glass-input" value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{ width: '150px' }}>
                            <option value="all">Any Status</option>
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                        </select>
                        <button className="btn btn-primary" onClick={() => openEditModal(CONSTANTS.FORM)}><Plus size={18} /> New Request</button>
                        {selectedRequestIds.length > 0 && (
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button className="btn btn-success mini" onClick={() => handleBulkStatusUpdate('approved')}>Approve Selected</button>
                                <button className="btn btn-danger mini" onClick={() => handleBulkStatusUpdate('rejected')}>Reject</button>
                            </div>
                        )}
                    </div>
                    
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--glass-border)' }}>
                                    <th style={{ padding: '1rem' }}><input type="checkbox" onChange={e => setSelectedRequestIds(e.target.checked ? filteredRequests.map(r => r._row) : [])} checked={selectedRequestIds.length === filteredRequests.length && filteredRequests.length > 0} /></th>
                                    <th style={{ padding: '1rem' }}>Student Details</th>
                                    <th style={{ padding: '1rem' }}>Certificate Info</th>
                                    <th style={{ padding: '1rem' }}>Applied On</th>
                                    <th style={{ padding: '1rem' }}>Status</th>
                                    <th style={{ padding: '1rem', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRequests.map(req => (
                                    <tr key={req._row} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: selectedRequestIds.includes(req._row) ? 'rgba(255,255,255,0.05)' : 'transparent' }}>
                                        <td style={{ padding: '1rem' }}><input type="checkbox" checked={selectedRequestIds.includes(req._row)} onChange={e => setSelectedRequestIds(prev => e.target.checked ? [...prev, req._row] : prev.filter(id => id !== req._row))} /></td>
                                        <td style={{ padding: '1rem' }}>
                                            <div style={{ fontWeight: 700 }}>{req.studentName}</div>
                                            <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>{req.regNo} • {req.Branch}</div>
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            <div style={{ fontSize: '0.85rem' }}>{req.CertificateType}</div>
                                            <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>{req.Company}</div>
                                        </td>
                                        <td style={{ padding: '1rem', fontSize: '0.85rem' }}>{formatDate(req.Timestamp)}</td>
                                        <td style={{ padding: '1rem' }}>
                                            <span className={`badge ${req.status}`} style={{ textTransform: 'uppercase', fontSize: '0.65rem' }}>{req.status}</span>
                                        </td>
                                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                {req.status === 'pending' && <button className="icon-btn-success mini" onClick={() => handleStatusUpdate(req._row, 'approved')} title="Approve"><CheckCircle2 size={16} /></button>}
                                                {req.status === 'approved' && <button className="icon-btn-secondary mini" onClick={() => generatePDF(req)} title="Download PDF"><Download size={16} /></button>}
                                                <button className="icon-btn-secondary mini" onClick={() => openEditModal(CONSTANTS.FORM, req)} title="Edit"><Edit2 size={16} /></button>
                                                <button className="icon-btn-danger mini" onClick={() => handleGenericDelete(CONSTANTS.FORM, req._row)} title="Delete"><Trash2 size={16} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredRequests.length === 0 && !loading && (
                            <div style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}>No applications found matching your filters.</div>
                        )}
                    </div>
                </div>
            )}

            {/* Masters View (Explorer) */}
            {(activeTab === 'branches' || activeTab === 'companies' || activeTab === 'audit') && (
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
                        <h2 style={{ textTransform: 'capitalize', margin: 0 }}>{activeTab} Explorer</h2>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {activeTab !== 'audit' && <button className="btn btn-primary" onClick={() => openEditModal(selectedSheet)}><Plus size={18} /> Add New Entry</button>}
                            <button className="btn btn-secondary" onClick={() => loadExplorer(selectedSheet)}><RefreshCw size={16} /></button>
                        </div>
                    </div>
                    {explorerLoading ? <QuantumLoader /> : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--glass-border)' }}>
                                        {explorerData.headers.map(h => <th key={h} style={{ padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', opacity: 0.7 }}>{h}</th>)}
                                        {activeTab !== 'audit' && <th style={{ padding: '1rem', textAlign: 'right' }}>Actions</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {explorerData.rows.map(row => (
                                        <tr key={row._row} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            {explorerData.headers.map(h => <td key={h} style={{ padding: '1rem', fontSize: '0.85rem' }}>{row[h]?.toString() || '-'}</td>)}
                                            {activeTab !== 'audit' && (
                                                <td style={{ padding: '1rem', textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                        <button className="icon-btn-secondary mini" onClick={() => openEditModal(selectedSheet, row)}><Edit2 size={16} /></button>
                                                        <button className="icon-btn-danger mini" onClick={() => handleGenericDelete(selectedSheet, row._row)}><Trash2 size={16} /></button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'settings' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                    <div className="glass-panel" style={{ padding: '2rem' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Clock size={20} /> Academic Year Hub</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Configure current academic session and track history.</p>
                        <div style={{ marginTop: '1.5rem' }}>
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem' }}>
                                <input type="text" className="glass-input" placeholder="e.g. 2026-27" value={newYearInput} onChange={e=>setNewYearInput(e.target.value)} style={{ flex: 1 }} />
                                <button className="btn btn-primary" onClick={async () => {
                                    if (!newYearInput) return;
                                    const list = Array.from(new Set([...academicYears, newYearInput])).join(',');
                                    await certApi.saveSetting('academic_years_list', list);
                                    toast.success("Year List Updated");
                                    fetchData();
                                    setNewYearInput('');
                                }}>Add Year</button>
                            </div>
                            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '1rem' }}>
                                <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: '8px' }}>Active Session</label>
                                <select className="glass-input" value={backendSettings.active_year} onChange={async (e) => {
                                    await certApi.saveSetting('active_year', e.target.value);
                                    toast.success("Global Year Updated");
                                    fetchData();
                                }} style={{ width: '100%' }}>
                                    {academicYears.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>
                    
                    <div className="glass-panel" style={{ padding: '2rem' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><ShieldCheck size={20} /> System Hardening</h3>
                        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <button className="btn btn-secondary" onClick={handleHeartbeat} style={{ justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><HeartPulse size={18} /> System Heartbeat</div>
                                <ChevronRight size={16} />
                            </button>
                            {diagnostics && (
                                <div style={{ fontSize: '0.8rem', padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                                    {diagnostics.map(d => <div key={d.sheet} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{d.sheet}:</span> <b>{d.rows}</b></div>)}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showEditModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '2rem' }}>
                    <div className="glass-panel animate-scale-in" style={{ width: '100%', maxWidth: '700px', padding: '2.5rem', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
                            <h3 style={{ margin: 0 }}>{editingRow ? 'Update Record' : 'Create New Entry'}</h3>
                            <button className="icon-btn-danger mini" onClick={()=>setShowEditModal(false)}><XCircle size={22} /></button>
                        </div>
                        {explorerLoading ? <QuantumLoader /> : (
                            <form onSubmit={handleGenericSave}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                                    {explorerData.headers.filter(h => h && h !== '_row' && !h.toLowerCase().includes('timestamp')).map(h => (
                                        <div key={h}>
                                            <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '6px', display: 'block', opacity: 0.6 }}>{h}</label>
                                            <input className="glass-input" value={editFormData[h] || ''} onChange={e=>setEditFormData({...editFormData, [h]: e.target.value})} style={{ width: '100%' }} />
                                        </div>
                                    ))}
                                </div>
                                <div style={{ marginTop: '2.5rem', display: 'flex', gap: '1rem' }}>
                                    <button type="button" className="btn btn-secondary" onClick={()=>setShowEditModal(false)} style={{ flex: 1 }}>Discard Changes</button>
                                    <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>Commit to Database</button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Certificates;
