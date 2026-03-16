import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, addDoc, deleteDoc, updateDoc, doc, onSnapshot, serverTimestamp, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useScheduleContext } from '../contexts/ScheduleContext';
import {
    LayoutDashboard, UserX, History, AlertOctagon, BarChart2, Trash2,
    RefreshCw, CheckCircle, Clock, Search, MapPin, Calendar,
    ArrowRight, AlertTriangle, ShieldAlert, Check
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useWritePermission } from '../hooks/useWritePermission'; // Import Hook
import { normalizeStr, normalizeTime, getDayName, parseTimeSlot } from '../utils/timeUtils';
import { sendNotification } from '../utils/notificationUtils';
import { sendWhatsAppNotification } from '../utils/whatsappUtils';

// UI Component Helpers - Moved outside/before main component to avoid hoisting issues
const StatCard = ({ icon, label, value, color }) => {
    const Icon = icon;
    return (
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', right: -10, bottom: -10, opacity: 0.1 }}>
                <Icon size={80} color={color} />
            </div>
            <div style={{ padding: '12px', borderRadius: '12px', background: `${color}20`, color: color }}>
                <Icon size={24} />
            </div>
            <div>
                <div style={{ fontSize: '2rem', fontWeight: '800', lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '4px' }}>{label}</div>
            </div>
        </div>
    );
};

const TabBtn = ({ id, icon, label, count, activeTab, setActiveTab }) => {
    const Icon = icon;
    return (
        <button
            type="button"
            onClick={() => setActiveTab(id)}
            style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '12px', border: 'none', background: activeTab === id ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                borderBottom: activeTab === id ? '2px solid #3b82f6' : '2px solid transparent',
                color: activeTab === id ? '#3b82f6' : '#94a3b8',
                fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s'
            }}
        >
            <Icon size={18} /> {label}
            {count > 0 && <span style={{ background: '#ef4444', color: 'white', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '10px' }}>{count}</span>}
        </button>
    );
};

const SubstitutionManager = () => {
    const { userProfile, activeAcademicYear } = useAuth();
    const { schedule: fullSchedule } = useScheduleContext();
    const { checkWritePermission } = useWritePermission();

    // Core Data
    const [faculty, setFaculty] = useState([]);
    const [adjustments, setAdjustments] = useState([]); // All active substitutions
    const [requests, setRequests] = useState([]); // All requests (pending + processed)

    // UI State
    const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'manual' | 'requests' | 'history'
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

    // Manual Entry State
    const [selectedAbsentee, setSelectedAbsentee] = useState('');
    const [loading, setLoading] = useState(false);
    const [expandedId, setExpandedId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    // Derived State: Day Name
    const selectedDayName = useMemo(() => {
        return getDayName(selectedDate);
    }, [selectedDate]);

    const handleDeleteAdjustment = async (id) => {
        // STRICT PERMISSION CHECK
        if (!checkWritePermission()) return;

        if (!window.confirm("Are you sure you want to delete this substitution? The schedule will revert to original.")) return;
        try {
            // 1. Get adjustment details before deleting
            const adjRef = doc(db, 'adjustments', id);
            const adjSnap = await getDoc(adjRef);

            if (adjSnap.exists()) {
                const adjData = adjSnap.data();

                // 2. Find linked 'approved' request (matches date & scheduleId)
                const q = query(
                    collection(db, 'substitution_requests'),
                    where('date', '==', adjData.date),
                    where('originalScheduleId', '==', adjData.originalScheduleId),
                    where('status', '==', 'approved')
                );

                const reqSnap = await getDocs(q);

                // 3. Update request status to 'cancelled'
                const batchUpdates = reqSnap.docs.map(d =>
                    updateDoc(doc(db, 'substitution_requests', d.id), {
                        status: 'cancelled',
                        targetResponse: 'cancelled',
                        adminComment: 'Substitution deleted by Administrator'
                    })
                );
                await Promise.all(batchUpdates);
            }

            // 4. Delete the Adjustment
            await deleteDoc(adjRef);
            toast.success("Substitution deleted & linked request cancelled");
        } catch (e) {
            console.error("Delete Error:", e);
            toast.error("Failed to delete substitution");
        }
    };

    // --- DATA FETCHING ---
    useEffect(() => {
        if (!activeAcademicYear || !userProfile || userProfile.role !== 'admin') return;

        let unsubAdj = () => { };
        let unsubReq = () => { };
        let active = true;

        const handleAdjSnap = (snap) => {
            setAdjustments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        };

        const handleAdjError = (err) => {
            console.error("Adjustments listener error:", err.code);
            if (err.code !== 'permission-denied') {
                toast.error(`Adjustments sync failed: ${err.code}`);
            }
        };

        const handleReqSnap = (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setRequests(data);
        };

        const handleReqError = (err) => {
            console.error("Requests listener error:", err.code);
            if (err.code !== 'permission-denied') {
                toast.error(`Requests sync failed: ${err.code}`);
            }
        };

        const fetchFaculty = async () => {
            try {
                const snap = await getDocs(collection(db, 'faculty'));
                const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                setFaculty(data);
            } catch (err) { console.error("Error fetching faculty:", err); }
        };

        const fetchAdjustments = () => {
            const q = query(collection(db, 'adjustments'), where('academicYear', '==', activeAcademicYear));
            return onSnapshot(q, handleAdjSnap, handleAdjError);
        };

        const fetchRequests = () => {
            const q = query(collection(db, 'substitution_requests'), where('academicYear', '==', activeAcademicYear));
            return onSnapshot(q, handleReqSnap, handleReqError);
        };

        // Small delay ensures Auth state has fully propagated to internal Firestore engine
        const timeout = setTimeout(() => {
            if (!active) return;
            fetchFaculty();
            unsubAdj = fetchAdjustments();
            unsubReq = fetchRequests();
        }, 500);

        return () => {
            active = false;
            clearTimeout(timeout);
            unsubAdj();
            unsubReq();
        };
    }, [activeAcademicYear, userProfile]);

    // --- METRICS CALCULATION ---
    const stats = useMemo(() => {
        const todayStr = new Date().toISOString().split('T')[0];
        const todaysAdjustments = adjustments.filter(a => a.date === todayStr);
        const pendingReqs = requests.filter(r => r.status === 'pending');
        const urgentPending = pendingReqs.filter(r => r.date === todayStr).length;

        return {
            activeToday: todaysAdjustments.length,
            pendingTotal: pendingReqs.length,
            urgentPending: urgentPending,
            totalHistory: adjustments.length
        };
    }, [adjustments, requests]);


    // --- SMART LOGIC ---


    // 1. Identify Classes for Absentee
    const impactedClasses = useMemo(() => {
        if (!selectedAbsentee || !selectedDayName) return [];
        const targetDay = normalizeStr(selectedDayName);
        const searchName = normalizeStr(selectedAbsentee);

        return fullSchedule
            .filter(item =>
                normalizeStr(item.day) === targetDay &&
                (normalizeStr(item.faculty) === searchName || normalizeStr(item.faculty2) === searchName)
            )
            .sort((a, b) => (parseTimeSlot(a.time)?.start || 0) - (parseTimeSlot(b.time)?.start || 0));
    }, [fullSchedule, selectedAbsentee, selectedDayName]);

    // 2. Weekly Load Calculator (Basic for now)
    const getWeeklyLoad = useCallback((facultyName) => {
        const search = normalizeStr(facultyName);
        return adjustments.filter(a => normalizeStr(a.substituteName) === search).length;
    }, [adjustments]);

    // 3. Smart Recommendation Lookup
    const recommendationsByClass = useMemo(() => {
        if (!selectedAbsentee || !selectedDayName || !impactedClasses.length) return {};

        const lookup = {};

        // Pre-map busy status for all time slots of impacted classes
        impactedClasses.forEach(ic => {
            const timeSlot = ic.time;
            const busyMap = new Set();

            // Check permanent schedule (Robust Matching)
            fullSchedule.forEach(item => {
                if (normalizeStr(item.day) === normalizeStr(selectedDayName) && normalizeTime(item.time) === normalizeTime(timeSlot)) {
                    if (item.faculty) busyMap.add(normalizeStr(item.faculty));
                    if (item.faculty2) busyMap.add(normalizeStr(item.faculty2));
                    if (item.facultyEmpId) busyMap.add(item.facultyEmpId);
                    if (item.faculty2EmpId) busyMap.add(item.faculty2EmpId);
                }
            });

            // Check date-specific adjustments (Robust Matching)
            adjustments.forEach(adj => {
                if (adj.date === selectedDate && normalizeTime(adj.time) === normalizeTime(timeSlot)) {
                    if (adj.substituteName) busyMap.add(normalizeStr(adj.substituteName));
                    if (adj.substituteEmpId) busyMap.add(adj.substituteEmpId);
                }
            });

            const targetDeptNorm = normalizeStr(ic.dept);

            const recs = faculty.map(f => {
                const fNameNorm = normalizeStr(f.name);
                const fId = f.empId;
                const isBusy = busyMap.has(fNameNorm) || busyMap.has(fId);
                const isAbsentee = fNameNorm === normalizeStr(selectedAbsentee) || (fId && fId === ic.facultyEmpId);
                if (isAbsentee) return null;

                let score = 0;
                if (!isBusy) score += 50;
                if (normalizeStr(f.dept) === targetDeptNorm) score += 20;
                const load = getWeeklyLoad(f.name);
                score -= (load * 2);

                return {
                    ...f,
                    isBusy,
                    score,
                    tags: [
                        !isBusy ? 'Available' : 'Busy',
                        normalizeStr(f.dept) === targetDeptNorm ? 'Same Dept' : null,
                    ].filter(Boolean)
                };
            }).filter(Boolean).sort((a, b) => b.score - a.score);

            lookup[ic.id] = recs;
        });

        return lookup;
    }, [fullSchedule, faculty, adjustments, selectedAbsentee, selectedDate, selectedDayName, impactedClasses, getWeeklyLoad]);

    // --- ACTIONS ---

    const handleAssign = async (scheduleId, subName, itemDetails) => {
        // STRICT PERMISSION CHECK
        if (!checkWritePermission()) return;

        if (!activeAcademicYear) return toast.error("Academic Year not loaded. Please wait.");
        if (!confirm(`Assign ${subName} to cover ${itemDetails.subject}?`)) return;
        setLoading(true);
        try {
            // Use Deterministic ID to preventing double-booking at the DB level
            const adjustmentId = `${selectedDate}_${scheduleId}`;
            const adjRef = doc(db, 'adjustments', adjustmentId);

            // Check if already exists (safe guard)
            const exists = (await getDoc(adjRef)).exists();
            if (exists) {
                toast.error("This class is already covered.");
                setLoading(false);
                return;
            }

            await setDoc(adjRef, {
                academicYear: activeAcademicYear,
                originalScheduleId: scheduleId || "",
                date: selectedDate || "",
                originalFaculty: selectedAbsentee || "",
                originalFacultyEmpId: faculty.find(f => f.name === selectedAbsentee)?.empId || "",
                substituteName: subName || "",
                substituteEmpId: faculty.find(f => f.name === subName)?.empId || "",
                status: 'active',
                createdAt: serverTimestamp(),
                time: itemDetails.time || "N/A",
                subject: itemDetails.subject || "N/A",
                room: itemDetails.room || "N/A",
                dept: itemDetails.dept || "N/A",
                group: itemDetails.section || itemDetails.grp || "N/A",
                subGroup: itemDetails.group || itemDetails.subgrp || "All"
            });

            // NOTIFY SUBSTITUTE
            const substituteUser = faculty.find(f => f.name === subName);
            const subEmpId = substituteUser?.empId;
            const subPhone = substituteUser?.phone; // Pulling phone from user collection

            if (subEmpId) {
                sendNotification({
                    empIds: [subEmpId],
                    title: "New Substitution Assigned",
                    body: `You have been assigned to cover ${itemDetails.subject} for ${selectedAbsentee} on ${selectedDate} at ${itemDetails.time}.`,
                    type: 'substitution_request',
                    data: { type: 'substitution', date: selectedDate }
                });
            }

            toast.success("Substitute Assigned");
        } catch (e) {
            console.error("Assignment Error:", e);
            toast.error(`Failed to assign: ${e.message}`);
        }
        setLoading(false);
    };

    const handleRemoveAdjustment = async (id) => {
        // STRICT PERMISSION CHECK
        if (!checkWritePermission()) return;

        if (!confirm("Remove this substitution?")) return;
        try {
            // 1. Get Details for Cleanup
            const adjRef = doc(db, 'adjustments', id);
            const adjSnap = await getDoc(adjRef);

            if (!adjSnap.exists()) {
                toast.error("Adjustment not found.");
                return;
            }
            const adjData = adjSnap.data();

            // 2. Delete Adjustment
            await deleteDoc(adjRef);

            // 3. Clean up linked "Approved" Requests (Ghost Cleanup)
            if (adjData.originalScheduleId && adjData.date) {
                const q = query(
                    collection(db, 'substitution_requests'),
                    where('originalScheduleId', '==', adjData.originalScheduleId),
                    where('date', '==', adjData.date),
                    where('status', '==', 'approved')
                );

                const reqSnaps = await getDocs(q);
                if (!reqSnaps.empty) {
                    const updates = reqSnaps.docs.map(d => updateDoc(d.ref, {
                        status: 'cancelled',
                        adminComment: 'Adjustment deleted by Admin'
                    }));
                    await Promise.all(updates);
                    // console.log(`Cleaned up ${updates.length} linked requests.`);
                }
            }

            toast.success("Removed");
        }
        catch (e) {
            console.error(e);
            toast.error("Failed to remove: " + e.message);
        }
    };

    const handleRequestAction = async (reqId, action, reqData) => {
        // STRICT PERMISSION CHECK
        if (!checkWritePermission()) return;

        if (!confirm(`Confirm ${action} this request?`)) return;
        setLoading(true);
        try {
            if (action === 'approve') {
                // Safely extract details with fallbacks
                const details = reqData.scheduleDetails || {};
                await addDoc(collection(db, 'adjustments'), {
                    academicYear: reqData.academicYear || activeAcademicYear,
                    originalScheduleId: reqData.originalScheduleId || "",
                    date: reqData.date || "",
                    originalFaculty: reqData.requesterName || "",
                    originalFacultyEmpId: reqData.requesterId || "",
                    substituteName: reqData.targetFacultyName || "",
                    substituteEmpId: reqData.targetFacultyId || "",
                    status: 'active',
                    createdAt: serverTimestamp(),
                    time: details.time || "N/A",
                    subject: details.subject || "N/A",
                    room: details.room || "N/A",
                    dept: details.dept || "N/A",
                    group: details.grp || "N/A",
                    subGroup: details.subgrp || "All"
                });
                await updateDoc(doc(db, 'substitution_requests', reqId), { status: 'approved' });

                // NOTIFY REQUESTER
                if (reqData.requesterId) {
                    sendNotification({
                        empIds: [reqData.requesterId],
                        title: "Substitution Approved",
                        body: `Your request for ${reqData.targetFacultyName} to cover your class on ${reqData.date} has been APPROVED.`,
                        data: { type: 'request_update', status: 'approved' }
                    });
                }
                // NOTIFY SUBSTITUTE
                if (reqData.targetFacultyId) {
                    sendNotification({
                        empIds: [reqData.targetFacultyId],
                        title: "Substitution Confirmed",
                        body: `You are confirmed to cover ${reqData.requesterName}'s class on ${reqData.date} at ${details.time}.`,
                        type: 'substitution_approved',
                        data: { type: 'substitution', date: reqData.date }
                    });
                }

                toast.success("Request Approved");
            } else {
                await updateDoc(doc(db, 'substitution_requests', reqId), { status: 'rejected' });

                // NOTIFY REQUESTER
                if (reqData.requesterId) {
                    sendNotification({
                        empIds: [reqData.requesterId],
                        title: "Substitution Rejected",
                        body: `Your request for ${reqData.targetFacultyName} to cover your class on ${reqData.date} was REJECTED by Admin.`,
                        type: 'substitution_rejected',
                        data: { type: 'request_update', status: 'rejected' }
                    });
                }

                toast.success("Request Rejected");
            }
        } catch (e) {
            console.error("Action Error:", e);
            toast.error(`Action Failed: ${e.message}`);
        }
        setLoading(false);
    };



    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', color: '#e2e8f0' }}>
            <div style={{ marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.8rem', fontWeight: '800', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <ShieldAlert size={32} color="#f59e0b" /> Substitution Manager
                </h2>

                <div className="responsive-grid">
                    <StatCard icon={Calendar} label="Active Today" value={stats.activeToday} color="#3b82f6" />
                    <StatCard icon={AlertTriangle} label="Urgent Pending" value={stats.urgentPending} color="#f59e0b" />
                    <StatCard icon={Clock} label="Total Pending" value={stats.pendingTotal} color="#a855f7" />
                    <StatCard icon={History} label="History Log" value={stats.totalHistory} color="#10b981" />
                </div>
            </div>

            <div className="glass-panel mobile-scroll-tabs" style={{ padding: 0, marginBottom: '2rem', flexWrap: 'nowrap' }}>
                <TabBtn id="overview" icon={LayoutDashboard} label="Overview" activeTab={activeTab} setActiveTab={setActiveTab} />
                <TabBtn id="manual" icon={UserX} label="Manual Entry" activeTab={activeTab} setActiveTab={setActiveTab} />
                <TabBtn id="requests" icon={RefreshCw} label="Approval Queue" count={stats.pendingTotal} activeTab={activeTab} setActiveTab={setActiveTab} />
                <TabBtn id="history" icon={History} label="History" activeTab={activeTab} setActiveTab={setActiveTab} />
            </div>

            <div style={{ minHeight: '400px' }}>

                {/* --- OVERVIEW TAB --- */}
                {activeTab === 'overview' && (
                    <div style={{ textAlign: 'center', padding: '4rem', color: '#64748b' }}>
                        <BarChart2 size={64} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                        <h3>Dashboard View</h3>
                        <p>Select a tab above to manage substitutions.</p>
                        <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                            <button onClick={() => setActiveTab('manual')} className="btn btn-primary">Make Adjustment</button>
                            <button onClick={() => setActiveTab('requests')} className="btn" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.1)' }}>Review Requests</button>
                        </div>
                    </div>
                )}

                {/* --- MANUAL ENTRY --- */}
                {activeTab === 'manual' && (
                    <div style={{ animation: 'fadeIn 0.3s ease' }}>
                        <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem', display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'end' }}>
                            <div style={{ flex: 1, minWidth: '250px' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#94a3b8' }}>Target Date</label>
                                <input
                                    type="date"
                                    value={selectedDate}
                                    onChange={e => setSelectedDate(e.target.value)}
                                    className="glass-input"
                                    style={{ width: '100%', colorScheme: 'dark' }}
                                />
                            </div>
                            <div style={{ flex: 1, minWidth: '250px' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#94a3b8' }}>Absent Faculty</label>
                                <select
                                    value={selectedAbsentee}
                                    onChange={e => setSelectedAbsentee(e.target.value)}
                                    className="glass-input"
                                    style={{ width: '100%', background: '#1e293b', color: 'white' }}
                                >
                                    <option value="" style={{ background: '#1e293b', color: 'white' }}>-- Select Faculty member --</option>
                                    {faculty.map(f => <option key={f.id} value={f.name} style={{ background: '#1e293b', color: 'white' }}>{f.name}</option>)}
                                </select>
                            </div>
                        </div>

                        {selectedAbsentee && (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                                    <h3 style={{ margin: 0, color: '#cbd5e1' }}>Impacted Schedule ({selectedDayName})</h3>
                                    <div style={{ position: 'relative', width: '250px', maxWidth: '100%' }}>
                                        <input
                                            type="text"
                                            placeholder="Search substitute name..."
                                            className="glass-input"
                                            style={{ width: '100%', paddingLeft: '35px', fontSize: '0.9rem' }}
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                        />
                                        <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                                    </div>
                                </div>
                                {impactedClasses.length === 0 ? (
                                    <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                                        No classes scheduled for {selectedAbsentee} on this date.
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gap: '1.5rem' }}>
                                        {impactedClasses.map(item => {
                                            const existingAdj = adjustments.find(a => a.originalScheduleId === item.id && a.date === selectedDate);
                                            const recoList = (recommendationsByClass[item.id] || []).filter(f => f.name.toLowerCase().includes(searchTerm.toLowerCase()));

                                            return (
                                                <div key={item.id} className="glass-panel" style={{ borderLeft: existingAdj ? '4px solid #10b981' : '4px solid #ef4444', padding: '0' }}>
                                                    <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                                            <div>
                                                                <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{item.time}</div>
                                                                <div style={{ color: '#94a3b8', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                                                                    <span>{item.subject}</span>
                                                                    <span style={{ opacity: 0.3 }}>•</span>
                                                                    <span>Room {item.room}</span>
                                                                    <span style={{ opacity: 0.3 }}>•</span>
                                                                    <span style={{ color: '#60a5fa', fontWeight: '800', letterSpacing: '0.5px', background: 'rgba(59, 130, 246, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                                                                        {[item.dept, (item.section || item.grp), (item.group || item.subgrp)].filter(v => v && !['All', 'N/A', 'None', 'all'].includes(v)).join('-')}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            {existingAdj ? (
                                                                <div style={{ textAlign: 'right', minWidth: '100px' }}>
                                                                    <div style={{ color: '#10b981', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}><CheckCircle size={16} /> Covered</div>
                                                                    <div style={{ fontSize: '0.9rem' }}>by {existingAdj.substituteName}</div>
                                                                    <button onClick={() => handleRemoveAdjustment(existingAdj.id)} style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Remove</button>
                                                                </div>
                                                            ) : (
                                                                <div style={{ color: '#ef4444', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}><AlertOctagon size={16} /> Uncovered</div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {!existingAdj && (
                                                        <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                                <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Recommended Substitutes:</div>
                                                                {recoList.length > 5 && (
                                                                    <button
                                                                        onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                                                                        style={{
                                                                            background: 'none', border: 'none', color: '#3b82f6',
                                                                            fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'bold'
                                                                        }}
                                                                    >
                                                                        {expandedId === item.id ? 'Show Less' : `Show All (${recoList.length})`}
                                                                    </button>
                                                                )}
                                                            </div>
                                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
                                                                {(expandedId === item.id ? recoList : recoList.slice(0, 5)).map(rec => (
                                                                    <button
                                                                        key={rec.id}
                                                                        disabled={rec.isBusy || loading}
                                                                        onClick={() => handleAssign(item.id, rec.name, item)}
                                                                        style={{
                                                                            textAlign: 'left', padding: '0.75rem', borderRadius: '8px',
                                                                            border: '1px solid rgba(255,255,255,0.05)',
                                                                            background: rec.isBusy ? 'rgba(255,255,255,0.02)' : 'rgba(59, 130, 246, 0.1)',
                                                                            opacity: rec.isBusy ? 0.5 : 1,
                                                                            cursor: rec.isBusy ? 'not-allowed' : 'pointer',
                                                                            transition: 'all 0.2s',
                                                                            position: 'relative'
                                                                        }}
                                                                    >
                                                                        <div style={{ fontWeight: '600', fontSize: '0.9rem', color: rec.isBusy ? '#64748b' : '#e2e8f0' }}>{rec.name}</div>
                                                                        <div style={{ fontSize: '0.75rem', marginTop: '4px', display: 'flex', gap: '6px' }}>
                                                                            {rec.isBusy ? <span style={{ color: '#f87171' }}>Busy</span> : <span style={{ color: '#10b981' }}>Available</span>}
                                                                            {rec.dept === item.dept && <span style={{ color: '#60a5fa' }}>Same Dept</span>}
                                                                        </div>
                                                                        {!rec.isBusy && <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}><Check size={16} /></div>}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* --- APPROVAL QUEUE --- */}
                {activeTab === 'requests' && (
                    <div style={{ animation: 'fadeIn 0.3s ease' }}>
                        {requests.filter(r => r.status === 'pending').length === 0 ? (
                            <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center', color: '#64748b' }}>
                                <CheckCircle size={48} style={{ marginBottom: '1rem', opacity: 0.3 }} />
                                <p>All caught up! No pending requests.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gap: '1rem' }}>
                                {requests.filter(r => r.status === 'pending').map(req => (
                                    <div key={req.id} className="glass-panel" style={{ borderLeft: '4px solid #a855f7', padding: '1.5rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: '1rem' }}>
                                            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                                                <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0.5rem', height: 'fit-content' }}>
                                                    <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>{new Date(req.date).toLocaleDateString('en-US', { month: 'short' })}</div>
                                                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>{new Date(req.date).getDate()}</div>
                                                </div>
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.1rem', fontWeight: 'bold', flexWrap: 'wrap' }}>
                                                        {req.requesterName} <ArrowRight size={16} color="#94a3b8" /> {req.targetFacultyName}
                                                    </div>
                                                    <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '4px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                                        {req.scheduleDetails.subject} • {req.scheduleDetails.time} • Room {req.scheduleDetails.room} •
                                                        <span style={{ color: '#a855f7', fontWeight: '800', letterSpacing: '0.3px', borderBottom: '2px solid rgba(168, 85, 247, 0.3)' }}>
                                                            {(() => {
                                                                const s = req.scheduleDetails || {};
                                                                const m = fullSchedule?.find(i => i.id === req.originalScheduleId) || {};
                                                                return [s.dept || m.dept, s.grp || m.section || m.grp, s.subgrp || m.group].filter(v => v && !['All', 'N/A', 'None', 'all'].includes(v)).join('-');
                                                            })()}
                                                        </span>
                                                    </div>
                                                    <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#eaebed', fontStyle: 'italic', background: 'rgba(255,255,255,0.05)', padding: '6px 10px', borderRadius: '4px', display: 'inline-block' }}>
                                                        "{req.reason}"
                                                    </div>

                                                    <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', flexWrap: 'wrap' }}>
                                                        <span style={{ opacity: 0.7 }}>Peer Response:</span>
                                                        {req.targetResponse === 'accepted' ? (
                                                            <span style={{ color: '#4ade80', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle size={14} /> Accepted</span>
                                                        ) : (
                                                            <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={14} /> Pending</span>
                                                        )}
                                                        {(() => {
                                                            // BUSY CHECK: Is the substitute already booked at this time?
                                                            const isBusy = adjustments.some(adj =>
                                                                adj.date === req.date &&
                                                                adj.time === req.scheduleDetails.time &&
                                                                adj.substituteName === req.targetFacultyName
                                                            );
                                                            if (isBusy) {
                                                                return (
                                                                    <span style={{
                                                                        marginLeft: 'auto',
                                                                        background: 'rgba(239, 68, 68, 0.2)', color: '#f87171',
                                                                        padding: '2px 8px', borderRadius: '4px',
                                                                        fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid rgba(248, 113, 113, 0.3)'
                                                                    }}>
                                                                        <AlertTriangle size={12} /> ALREADY BOOKED
                                                                    </span>
                                                                );
                                                            }
                                                            return null;
                                                        })()}
                                                    </div>
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%', maxWidth: '200px' }}>
                                                <button onClick={() => handleRequestAction(req.id, 'approve', req)} className="btn" style={{ background: '#10b981', border: 'none', width: '100%' }}>Approve</button>
                                                <button onClick={() => handleRequestAction(req.id, 'reject', req)} className="btn" style={{ background: 'rgba(239,68,68,0.2)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)', width: '100%' }}>Reject</button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* --- HISTORY TAB --- */}
                {activeTab === 'history' && (
                    <div style={{ animation: 'fadeIn 0.3s ease' }} className="table-responsive">
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left', color: '#94a3b8' }}>
                                    <th style={{ padding: '1rem' }}>Date</th>
                                    <th style={{ padding: '1rem' }}>Original Faculty</th>
                                    <th style={{ padding: '1rem' }}>Substitute</th>
                                    <th style={{ padding: '1rem' }}>Class</th>
                                    <th style={{ padding: '1rem' }}>Status</th>
                                    <th style={{ padding: '1rem' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {adjustments.sort((a, b) => new Date(b.date) - new Date(a.date)).map(adj => (
                                    <tr key={adj.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <td style={{ padding: '1rem' }}>{new Date(adj.date).toLocaleDateString('en-GB')}</td>
                                        <td style={{ padding: '1rem', color: '#fca5a5' }}>{adj.originalFaculty}</td>
                                        <td style={{ padding: '1rem', color: '#6ee7b7' }}>{adj.substituteName}</td>
                                        <td style={{ padding: '1rem', fontSize: '0.9rem', color: '#cbd5e1' }}>
                                            <div style={{ fontWeight: '600' }}>{adj.subject}</div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#60a5fa', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {adj.time} • {(() => {
                                                    const m = fullSchedule?.find(i => i.id === adj.originalScheduleId) || {};
                                                    return [adj.dept || m.dept, adj.group || m.section || m.grp, adj.subGroup || m.group].filter(v => v && !['All', 'N/A', 'None', 'all'].includes(v)).join('-');
                                                })()}
                                                <span style={{ opacity: 0.3 }}>•</span>
                                                <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}>
                                                    <MapPin size={12} /> {adj.room || (fullSchedule?.find(i => i.id === adj.originalScheduleId)?.room) || "N/A"}
                                                </span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem' }}>Active</span>
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            <button onClick={() => handleDeleteAdjustment(adj.id)} style={{ padding: '8px', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: 'none', cursor: 'pointer' }} title="Delete">
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                    </div>
                )}
            </div>
        </div>
    );
};
export default SubstitutionManager;
