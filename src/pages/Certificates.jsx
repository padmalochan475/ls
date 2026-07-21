import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
    FileText, CheckCircle2, XCircle, Search, Settings, 
    Download, Trash2, Edit2, Plus, Clock, Building2,
    Layout, RefreshCw, Briefcase,
    Activity, ShieldCheck, HeartPulse, ChevronRight, FileSpreadsheet,
    MessageCircle, Users, FileQuestion, GraduationCap
} from 'lucide-react';
import QuantumLoader from '../components/QuantumLoader';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import QRCode from 'qrcode';
import { certApi } from '../utils/certificateApi';

const CONSTANTS = {
    FORM: "Form Responses 1",
    BRANCHES: "Branch Master",
    COMPANIES: "Company Master",
    AUDIT: "Activity Log"
};

const formatDate = (dateInput) => {
    if (!dateInput) return 'N/A';
    try {
        const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
    } catch { return 'N/A'; }
};

const deriveAcYear = (ts) => {
    if (!ts) return '';
    const date = new Date(ts);
    if (isNaN(date.getTime())) return '';
    const m = date.getMonth() + 1;
    const y = date.getFullYear();
    return (m >= 7) ? (y + '-' + String(y + 1).slice(-2)) : ((y - 1) + '-' + String(y).slice(-2));
};

function StatCard({ icon, value, label, glow, gradient }) {
  const IconComponent = icon;
  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '20px', padding: '20px', display: 'flex', alignItems: 'center', gap: 16,
      position: 'relative', overflow: 'hidden', flex: '1 1 200px',
      boxShadow: '0 4px 24px -4px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.05)',
    }}>
      <div style={{
        position: 'absolute', top: -40, right: -40, width: 120, height: 120,
        borderRadius: '50%', background: gradient, opacity: 0.15, filter: 'blur(30px)',
      }} />
      <div style={{
        width: 50, height: 50, borderRadius: '16px',
        background: gradient, display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 8px 16px ${glow}44`, position: 'relative', zIndex: 1
      }}>
        <IconComponent size={24} color="#fff" />
      </div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>{value}</div>
      </div>
    </div>
  );
}

// eslint-disable-next-line sonarjs/cognitive-complexity
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
    const [selectedSheet, setSelectedSheet] = useState(CONSTANTS.FORM);
    const [diagnostics, setDiagnostics] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [explorerData, setExplorerData] = useState({ headers: [], rows: [] });
    
    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(25);

    const fetchData = useCallback(async (force = false) => {
        setLoading(true);
        try {
            const res = await certApi.getAdminDashboard(force || liveMode);
            if (res.success) {
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
                if (res.data.settings?.active_year && !selectedYear) {
                    setSelectedYear(res.data.settings.active_year);
                }
                if (res.data.fromCache) toast.success("Using System Cache (Fast Mode)", { icon: '⚡' });
            } else {
                toast.error(res.error || "Failed to load dashboard");
            }
        } catch (err) { 
            toast.error(err.message || "Bridge Connection Failed"); 
        } finally { 
            setLoading(false); 
        }
    }, [liveMode, selectedYear]);

    const loadExplorer = useCallback(async (sheet) => {
        setExplorerLoading(true);
        setSelectedSheet(sheet);
        try {
            const res = await certApi.getSheetData(sheet);
            if (res.success) setExplorerData(res.data);
            else toast.error(res.error || "Failed to load data");
        } catch (err) {
            toast.error(err.message || "Explorer Connection Failed");
        } finally {
            setExplorerLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeTab === 'requests') fetchData();
        else if (activeTab === 'branches') loadExplorer(CONSTANTS.BRANCHES);
        else if (activeTab === 'companies') loadExplorer(CONSTANTS.COMPANIES);
        else if (activeTab === 'audit') loadExplorer(CONSTANTS.AUDIT);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, loadExplorer]); // Intentionally omitting fetchData to prevent duplicate initial fetches

    // Data Filtering & Stats
    const filteredRequests = useMemo(() => {
        return requests.filter(r => {
            const matchSearch = String(r.studentName).toLowerCase().includes(searchTerm.toLowerCase()) || String(r.regNo).includes(searchTerm);
            const matchStatus = filterStatus === 'all' || r.status === filterStatus;
            const matchYear = !selectedYear || r.academicYear === selectedYear;
            return matchSearch && matchStatus && matchYear;
        }).sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
    }, [requests, searchTerm, filterStatus, selectedYear]);

    const stats = useMemo(() => {
        const total = requests.length;
        const pending = requests.filter(r => r.status === 'pending').length;
        const approved = requests.filter(r => r.status === 'approved').length;
        const rejected = requests.filter(r => r.status === 'rejected').length;
        return { total, pending, approved, rejected };
    }, [requests]);

    const paginatedRequests = useMemo(() => {
        const start = (currentPage - 1) * rowsPerPage;
        return filteredRequests.slice(start, start + rowsPerPage);
    }, [filteredRequests, currentPage, rowsPerPage]);

    const totalPages = Math.ceil(filteredRequests.length / rowsPerPage);

    const handleBulkStatusUpdate = async (status) => {
        if (selectedRequestIds.length === 0) return toast.error("Select rows first");
        setLoading(true);
        try {
            await certApi.bulkUpdateStatus(selectedRequestIds, status);
            toast.success(`Bulk ${status} successful`);
            setSelectedRequestIds([]);
            fetchData();
        } catch (err) { 
            toast.error(err.message || "Bulk action failed"); 
        } finally { 
            setLoading(false); 
        }
    };

    const handleStatusUpdate = async (id, status) => {
        const req = requests.find(r => r._row === id);
        try {
            const res = await certApi.updateStatus(id, status, req.RefNo || '', req, new Date().getTime());
            if (res.success) { toast.success(`Request ${status}`); fetchData(); }
            else toast.error(res.error || "Update failed");
        } catch (err) { toast.error(err.message || "Update failed"); }
    };

    const handleGenericDelete = async (sheet, id) => {
        if (!window.confirm("Delete this record permanently?")) return;
        try {
            const res = await certApi.deleteGenericRow(sheet, id);
            if (res.success) { 
                toast.success("Deleted from database"); 
                if (sheet === CONSTANTS.FORM) fetchData(); else loadExplorer(sheet);
            } else {
                toast.error(res.error || "Failed to delete");
            }
        } catch (err) {
            toast.error(err.message || "Delete failed");
        }
    };

    const handleGenericSave = async (e) => {
        e.preventDefault();
        try {
            const res = await certApi.saveGenericRow(selectedSheet, editingRow?._row, editFormData);
            if (res.success) {
                setShowEditModal(false);
                if (activeTab === 'requests') fetchData(); else loadExplorer(selectedSheet);
                toast.success("Record Saved Permanently");
            } else {
                toast.error(res.error || "Failed to save");
            }
        } catch (err) {
            toast.error(err.message || "Save failed");
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
            toast.error(err.message || "Bridge Connection Error");
            setShowEditModal(false);
        } finally { setExplorerLoading(false); }
    };

    const generatePDF = async (req) => {
        try {
            const branchInfo = branches.find(b => b.BranchFullName === req.Branch || b.BranchCode === req.Branch) || {};
            const companyInfo = companies.find(c => c.CompanyName === req.Company) || {};
            
            const doc = new jsPDF('p', 'mm', 'a4');
            
            // Borders
            doc.setDrawColor(20, 50, 150).setLineWidth(0.8).rect(10, 10, 190, 277);
            doc.setDrawColor(220).setLineWidth(0.3).rect(12, 12, 186, 273); // inner border

            // Header
            doc.setFont("helvetica", "bold").setFontSize(26).setTextColor(20, 50, 150);
            doc.text("TRIDENT ACADEMY OF TECHNOLOGY", 105, 32, { align: 'center' });
            
            doc.setFontSize(10).setFont("helvetica", "normal").setTextColor(80);
            doc.text("Approved by AICTE, New Delhi & Affiliated to BPUT, Odisha", 105, 38, { align: 'center' });
            doc.text("F2/A, Chandaka Industrial Estate, Bhubaneswar - 751024", 105, 43, { align: 'center' });
            
            doc.setDrawColor(20, 50, 150).setLineWidth(1).line(20, 50, 190, 50);
            
            // Title
            doc.setFontSize(20).setFont("helvetica", "bold").setTextColor(30);
            doc.text((req.CertificateType || "BONAFIDE CERTIFICATE").toUpperCase(), 105, 68, { align: 'center' });
            
            // References
            doc.setFontSize(11).setFont("helvetica", "normal");
            doc.text(`Ref No: ${req.RefNo || 'TAT/LAMS/'+req._row}`, 20, 85);
            doc.text(`Date: ${new Date().toLocaleDateString('en-GB')}`, 190, 85, { align: 'right' });
            
            // Addressed To (Company)
            if (companyInfo.CompanyName) {
                doc.setFontSize(12).setFont("helvetica", "bold");
                doc.text("To,", 20, 100);
                doc.text(companyInfo.HRName || 'The HR Manager', 20, 106);
                doc.text(companyInfo.CompanyName, 20, 112);
                doc.setFont("helvetica", "normal");
                if (companyInfo.Address) {
                    const addrSplit = doc.splitTextToSize(companyInfo.Address, 80);
                    doc.text(addrSplit, 20, 118);
                }
            }

            // Body
            const salutation = req.Salutation || 'Mr.';
            const genderWord = salutation.toLowerCase().includes('mr') ? 'son' : 'daughter';
            const pronoun = salutation.toLowerCase().includes('mr') ? 'He' : 'She';
            
            const startY = companyInfo.CompanyName ? 140 : 110;
            
            doc.setFontSize(12).setFont("helvetica", "normal").setTextColor(40);
            const content = `This is to certify that ${salutation} ${req.studentName}, ${genderWord} of ${req.FatherName || 'N/A'}, bearing Registration No ${req.regNo}, is a bonafide student of this institute in the department of ${req.Branch || 'N/A'}. ${pronoun} has applied for ${req.CertificateType || 'Internship'} at ${req.Company || 'N/A'}. 

The institute has no objection to ${pronoun.toLowerCase()} attending the same for the period of ${req.Duration || 'N/A'} starting from ${formatDate(req.ProposedStartDate)}.`;

            const splitText = doc.splitTextToSize(content, 170);
            doc.text(splitText, 20, startY, { align: 'justify', lineHeightFactor: 1.5 });

            // Signature Area
            doc.setFontSize(12).setFont("helvetica", "bold").setTextColor(30);
            doc.text("Head of Department", 150, startY + 90, { align: 'center' });
            if (branchInfo.HODName) {
                doc.setFontSize(11).setFont("helvetica", "italic");
                doc.text(`(${branchInfo.HODName})`, 150, startY + 96, { align: 'center' });
            }

            // Generate QR Code for Verification
            try {
                const qrData = JSON.stringify({
                    id: req._row, name: req.studentName, reg: req.regNo,
                    type: req.CertificateType, date: new Date().toLocaleDateString('en-GB')
                });
                const qrUrl = await QRCode.toDataURL(qrData, { margin: 0, width: 80 });
                doc.addImage(qrUrl, 'PNG', 20, 240, 30, 30);
                doc.setFontSize(8).setFont("helvetica", "normal").setTextColor(100);
                doc.text("Scan to verify authenticity", 20, 275);
            } catch (qrErr) {
                console.warn("QR Generation skipped", qrErr);
            }
            
            doc.save(`${req.studentName}_${req.CertificateType}.pdf`);
            toast.success("PDF Generated with QR Code");
        } catch (err) {
            toast.error("Failed to generate PDF: " + err.message);
        }
    };

    const handleHeartbeat = async () => {
        setExplorerLoading(true);
        try {
            const res = await certApi.runDiagnostics();
            if (res.success) {
                setDiagnostics(res.data);
                toast.success("System Pulse OK");
            } else {
                toast.error(res.error || "Diagnostics failed");
            }
        } catch (err) {
            toast.error(err.message || "Diagnostics failed");
        } finally {
            setExplorerLoading(false);
        }
    };

    const exportToExcel = () => {
        try {
            const dataToExport = filteredRequests.map(r => ({
                "Timestamp": formatDate(r.Timestamp),
                "Student Name": r.studentName,
                "Registration No": r.regNo,
                "Branch": r.Branch,
                "Company": r.Company,
                "Certificate Type": r.CertificateType,
                "Status": r.status.toUpperCase(),
                "Academic Year": r.academicYear
            }));
            const ws = XLSX.utils.json_to_sheet(dataToExport);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Applications");
            XLSX.writeFile(wb, `Certificates_Export_${new Date().getTime()}.xlsx`);
            toast.success("Exported to Excel");
        } catch (err) {
            toast.error("Export failed: " + err.message);
        }
    };

    const sendWhatsApp = (req) => {
        const phone = req.Phone || req.Mobile || req.ContactNumber;
        if (!phone) {
            toast.error("No phone number found for this student");
            return;
        }
        const message = `Hello ${req.studentName}, your request for ${req.CertificateType} has been ${req.status.toUpperCase()}. Please check your portal or contact the department.`;
        window.open(`https://wa.me/${phone.replace(/\D/g,'')}?text=${encodeURIComponent(message)}`, '_blank');
    };

    // Sub-renders
    const renderApplications = () => (
        <>
            <div style={{ display: 'flex', gap: '20px', marginBottom: '24px', flexWrap: 'wrap' }}>
                <StatCard icon={Users} value={stats.total} label="Total Requests" glow="#3b82f6" gradient="linear-gradient(135deg,#3b82f6,#1d4ed8)" />
                <StatCard icon={FileQuestion} value={stats.pending} label="Pending Review" glow="#f59e0b" gradient="linear-gradient(135deg,#f59e0b,#b45309)" />
                <StatCard icon={CheckCircle2} value={stats.approved} label="Approved" glow="#10b981" gradient="linear-gradient(135deg,#10b981,#047857)" />
                <StatCard icon={XCircle} value={stats.rejected} label="Rejected" glow="#ef4444" gradient="linear-gradient(135deg,#ef4444,#b91c1c)" />
            </div>

            <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: '1 1 250px' }}>
                        <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                        <input type="text" className="glass-input" placeholder="Search by name or reg no..." value={searchTerm} onChange={e=>{setSearchTerm(e.target.value); setCurrentPage(1);}} style={{ paddingLeft: '40px', width: '100%' }} />
                    </div>
                    <select className="glass-input" value={selectedYear} onChange={e=>{setSelectedYear(e.target.value); setCurrentPage(1);}} style={{ width: '150px' }}>
                        <option value="">All Years</option>
                        {academicYears.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <select className="glass-input" value={filterStatus} onChange={e=>{setFilterStatus(e.target.value); setCurrentPage(1);}} style={{ width: '150px' }}>
                        <option value="all">Any Status</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                    </select>
                    
                    <button className="btn btn-secondary" onClick={exportToExcel} title="Export to Excel"><FileSpreadsheet size={18} /> Export</button>
                    <button className="btn btn-primary" onClick={() => openEditModal(CONSTANTS.FORM)}><Plus size={18} /> New</button>
                    
                    {selectedRequestIds.length > 0 && (
                        <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                            <button className="btn btn-success mini" onClick={() => handleBulkStatusUpdate('approved')}>Approve Selected ({selectedRequestIds.length})</button>
                            <button className="btn btn-danger mini" onClick={() => handleBulkStatusUpdate('rejected')}>Reject ({selectedRequestIds.length})</button>
                        </div>
                    )}
                </div>
                
                <div style={{ overflowX: 'auto', minHeight: '300px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--glass-border)' }}>
                                <th style={{ padding: '1rem' }}><input type="checkbox" onChange={e => setSelectedRequestIds(e.target.checked ? paginatedRequests.map(r => r._row) : [])} checked={paginatedRequests.length > 0 && selectedRequestIds.length === paginatedRequests.length} /></th>
                                <th style={{ padding: '1rem' }}>Student Details</th>
                                <th style={{ padding: '1rem' }}>Certificate Info</th>
                                <th style={{ padding: '1rem' }}>Applied On</th>
                                <th style={{ padding: '1rem' }}>Status</th>
                                <th style={{ padding: '1rem', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '3rem' }}><QuantumLoader /></td></tr>
                            ) : paginatedRequests.map(req => (
                                <tr key={req._row} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: selectedRequestIds.includes(req._row) ? 'rgba(255,255,255,0.05)' : 'transparent', transition: 'background 0.2s' }} className="hover-row">
                                    <td style={{ padding: '1rem' }}><input type="checkbox" checked={selectedRequestIds.includes(req._row)} onChange={e => setSelectedRequestIds(prev => e.target.checked ? [...prev, req._row] : prev.filter(id => id !== req._row))} /></td>
                                    <td style={{ padding: '1rem' }}>
                                        <div style={{ fontWeight: 700 }}>{req.studentName}</div>
                                        <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>{req.regNo} • {req.Branch}</div>
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-accent)' }}>{req.CertificateType}</div>
                                        <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>{req.Company}</div>
                                    </td>
                                    <td style={{ padding: '1rem', fontSize: '0.85rem' }}>{formatDate(req.Timestamp)}</td>
                                    <td style={{ padding: '1rem' }}>
                                        <span className={`badge ${req.status}`} style={{ textTransform: 'uppercase', fontSize: '0.65rem' }}>{req.status}</span>
                                    </td>
                                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                            {req.status === 'pending' && <button className="icon-btn-success mini" onClick={() => handleStatusUpdate(req._row, 'approved')} title="Approve"><CheckCircle2 size={16} /></button>}
                                            {req.status === 'approved' && (
                                                <>
                                                    <button className="icon-btn-secondary mini" onClick={() => generatePDF(req)} title="Download Secured PDF"><Download size={16} /></button>
                                                    <button className="icon-btn-secondary mini" onClick={() => sendWhatsApp(req)} title="Send WhatsApp alert"><MessageCircle size={16} /></button>
                                                </>
                                            )}
                                            <button className="icon-btn-secondary mini" onClick={() => openEditModal(CONSTANTS.FORM, req)} title="Edit"><Edit2 size={16} /></button>
                                            <button className="icon-btn-danger mini" onClick={() => handleGenericDelete(CONSTANTS.FORM, req._row)} title="Delete"><Trash2 size={16} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {!loading && paginatedRequests.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}>No applications found.</div>
                    )}
                </div>

                {/* Pagination Controls */}
                {!loading && totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--glass-border)' }}>
                        <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                            Showing {((currentPage - 1) * rowsPerPage) + 1} to {Math.min(currentPage * rowsPerPage, filteredRequests.length)} of {filteredRequests.length} entries
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <select className="glass-input" style={{ padding: '4px 10px', height: 'auto' }} value={rowsPerPage} onChange={e=>{setRowsPerPage(Number(e.target.value)); setCurrentPage(1);}}>
                                <option value={10}>10 per page</option>
                                <option value={25}>25 per page</option>
                                <option value={50}>50 per page</option>
                                <option value={100}>100 per page</option>
                            </select>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <button className="btn btn-secondary mini" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>Prev</button>
                                <span style={{ padding: '4px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>{currentPage} / {totalPages}</span>
                                <button className="btn btn-secondary mini" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>Next</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );

    const renderExplorer = () => (
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
    );

    const renderSettings = () => (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
            <div className="glass-panel" style={{ padding: '2rem' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Clock size={20} /> Academic Year Hub</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Configure current academic session and track history.</p>
                <div style={{ marginTop: '1.5rem' }}>
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem' }}>
                        <input type="text" className="glass-input" placeholder="e.g. 2026-27" value={newYearInput} onChange={e=>setNewYearInput(e.target.value)} style={{ flex: 1 }} />
                        <button className="btn btn-primary" onClick={async () => {
                            if (!newYearInput) return;
                            try {
                                const list = Array.from(new Set([...academicYears, newYearInput])).join(',');
                                await certApi.saveSetting('academic_years_list', list);
                                toast.success("Year List Updated");
                                fetchData();
                                setNewYearInput('');
                            } catch (err) { toast.error(err.message || "Failed to update year"); }
                        }}>Add Year</button>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '1rem' }}>
                        <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: '8px' }}>Active Session</label>
                        <select className="glass-input" value={backendSettings.active_year || ''} onChange={async (e) => {
                            try {
                                await certApi.saveSetting('active_year', e.target.value);
                                toast.success("Global Year Updated");
                                fetchData();
                            } catch (err) { toast.error(err.message || "Update failed"); }
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
                            {diagnostics.map(d => <div key={d.sheet} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}><span>{d.sheet}:</span> <b>{d.rows}</b></div>)}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <div className="animate-fade-in" style={{ padding: '2rem' }}>
            <style>{`.hover-row:hover { background: rgba(255,255,255,0.08) !important; }`}</style>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '50px', height: '50px', background: 'var(--color-accent-gradient)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}><GraduationCap size={30} /></div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800 }}>Certificates HUB</h1>
                        <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>LAMS 2.0 institutional Control Panel</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div 
                        onClick={() => setLiveMode(!liveMode)}
                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderRadius: '20px',
                            background: liveMode ? 'rgba(0, 255, 150, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                            border: `1px solid ${liveMode ? 'rgba(0, 255, 150, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`, transition: 'all 0.3s ease' }}
                    >
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: liveMode ? '#00ff96' : '#666',
                            boxShadow: liveMode ? '0 0 10px #00ff96' : 'none', animation: liveMode ? 'pulse 2s infinite' : 'none' }} />
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: liveMode ? '#00ff96' : '#999' }}>
                            {liveMode ? 'LIVE SYNC' : 'CACHED'}
                        </span>
                    </div>
                    <button className="btn btn-secondary" onClick={() => fetchData(true)} title="Force Refresh"><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /></button>
                    {sheetUrl && <a href={sheetUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" title="Google Sheet"><Layout size={18} /> Sheet</a>}
                </div>
            </div>

            <div className="glass-panel" style={{ padding: '0.5rem', display: 'flex', gap: '5px', marginBottom: '1.5rem', width: 'fit-content', flexWrap: 'wrap' }}>
                <button className={`btn tab-btn ${activeTab === 'requests' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('requests')}><FileText size={16} /> Applications</button>
                <button className={`btn tab-btn ${activeTab === 'branches' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('branches')}><Building2 size={16} /> Departments</button>
                <button className={`btn tab-btn ${activeTab === 'companies' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('companies')}><Briefcase size={16} /> Companies</button>
                <button className={`btn tab-btn ${activeTab === 'audit' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('audit')}><Activity size={16} /> Audit Logs</button>
                <button className={`btn tab-btn ${activeTab === 'settings' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('settings')}><Settings size={16} /> Settings</button>
            </div>

            {activeTab === 'requests' && renderApplications()}
            {(activeTab === 'branches' || activeTab === 'companies' || activeTab === 'audit') && renderExplorer()}
            {activeTab === 'settings' && renderSettings()}

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
                                    {/* eslint-disable-next-line react-hooks/exhaustive-deps */}
                                    {explorerData.headers.filter(h => h && h !== '_row' && !h.toLowerCase().includes('timestamp')).map(h => (
                                        <div key={h}>
                                            <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '6px', display: 'block', opacity: 0.6 }}>{h}</label>
                                            <input className="glass-input" value={editFormData[h] || ''} onChange={e=>setEditFormData({...editFormData, [h]: e.target.value})} style={{ width: '100%' }} />
                                        </div>
                                    ))}
                                </div>
                                <div style={{ marginTop: '2.5rem', display: 'flex', gap: '1rem' }}>
                                    <button type="button" className="btn btn-secondary" onClick={()=>setShowEditModal(false)} style={{ flex: 1 }}>Discard</button>
                                    <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>Commit Database</button>
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
