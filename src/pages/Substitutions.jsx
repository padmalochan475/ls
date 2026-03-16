/* eslint-disable sonarjs/no-nested-conditional */

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, onSnapshot, serverTimestamp, getDoc, runTransaction } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useScheduleContext } from '../contexts/ScheduleContext';
import { useMasterData } from '../contexts/MasterDataContext';
import { UserPlus, Calendar, Clock, Check, X, Search, AlertCircle, ArrowRight, Loader, Ghost, ChevronLeft, MapPin, Inbox, Send, ThumbsUp, ThumbsDown, History, Users, CheckCircle, ShieldAlert, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import { sendNotification } from '../utils/notificationUtils';
import { useWritePermission } from '../hooks/useWritePermission';
import { normalizeStr, normalizeTime, formatDateLocal, getDayName, parseTimeSlot } from '../utils/timeUtils';


// eslint-disable-next-line sonarjs/cognitive-complexity
const Substitutions = () => {
    const { currentUser, userProfile, activeAcademicYear } = useAuth();
    const { checkWritePermission } = useWritePermission();
    const { schedule: fullSchedule } = useScheduleContext();
    const { faculty: facultyList } = useMasterData();
    const [outgoingRequests, setOutgoingRequests] = useState([]);
    const [incomingRequests, setIncomingRequests] = useState([]);
    const [outgoingAdjustments, setOutgoingAdjustments] = useState([]);
    const [incomingAdjustments, setIncomingAdjustments] = useState([]);
    const [view, setView] = useState('list'); // 'list' or 'create'
    const [activeTab, setActiveTab] = useState('received'); // 'sent' | 'received' | 'history'
    const [historySubTab, setHistorySubTab] = useState('all'); // 'all' | 'approved' | 'awaiting' | 'declined' | 'rejected' | 'cancelled'

    // Create Mode State
    const [step, setStep] = useState(1);
    const [selectedDate, setSelectedDate] = useState('');
    const [myClasses, setMyClasses] = useState([]);
    const [selectedClassId, setSelectedClassId] = useState('');
    const [availableFaculty, setAvailableFaculty] = useState([]);
    const [targetFacultyId, setTargetFacultyId] = useState('');
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    const [searchQuery, setSearchQuery] = useState(''); // New search state

    // 1. Fetch Outgoing Requests (I asked someone)
    useEffect(() => {
        if (!userProfile?.empId || !currentUser) return;

        const q = query(
            collection(db, 'substitution_requests'),
            where('requesterId', '==', userProfile.empId)
        );
        const unsub = onSnapshot(q,
            (snap) => {
                const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
                setOutgoingRequests(data);
            },
            (err) => {
                console.error("Outgoing Requests Sync Error:", err.code, err.message);
            }
        );
        return unsub;
    }, [userProfile?.empId, currentUser]);

    // 2. Fetch Incoming Requests (Someone asked me)
    useEffect(() => {
        if (!userProfile?.empId || !currentUser) return;

        // Note: Using EmpID match. Ensure targetFacultyId is stored as EmpID.
        const q = query(
            collection(db, 'substitution_requests'),
            where('targetFacultyId', '==', userProfile.empId)
        );
        const unsub = onSnapshot(q,
            (snap) => {
                const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
                setIncomingRequests(data);
            },
            (err) => {
                console.error("Incoming Requests Sync Error:", err.code, err.message);
            }
        );
        return unsub;
    }, [userProfile?.empId, currentUser]);

    // 3. Fetch Outgoing Adjustments (I am absent, assigned by Admin or Request)
    useEffect(() => {
        if (!userProfile?.empId || !currentUser) return;
        const q = query(
            collection(db, 'adjustments'),
            where('originalFacultyEmpId', '==', userProfile.empId)
        );
        const unsub = onSnapshot(q, (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data(), isAdjustment: true }));
            data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setOutgoingAdjustments(data);
        }, (err) => console.error(err));
        return unsub;
    }, [userProfile?.empId, currentUser]);

    // 4. Fetch Incoming Adjustments (I am covering, assigned by Admin or Request)
    useEffect(() => {
        if (!userProfile?.empId || !currentUser) return;
        const q = query(
            collection(db, 'adjustments'),
            where('substituteEmpId', '==', userProfile.empId)
        );
        const unsub = onSnapshot(q, (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data(), isAdjustment: true }));
            data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setIncomingAdjustments(data);
        }, (err) => console.error(err));
        return unsub;
    }, [userProfile?.empId, currentUser]);

    // Combined Unified Streams
    const unifiedIncoming = useMemo(() => {
        const stream = [...incomingRequests];
        // Add adjustments that DON'T have a matching request in this list (Admin assigned)
        incomingAdjustments.forEach(adj => {
            const hasRequest = incomingRequests.some(r =>
                r.date === adj.date &&
                r.originalScheduleId === adj.originalScheduleId &&
                (r.status === 'approved' || r.status === 'active')
            );
            if (!hasRequest) {
                stream.push({
                    id: adj.id,
                    requesterName: adj.originalFaculty || "Administrator",
                    targetFacultyName: adj.substituteName,
                    date: adj.date,
                    status: 'approved',
                    isAdminAssigned: true,
                    reason: "Assigned by Administrator",
                    scheduleDetails: {
                        subject: adj.subject,
                        time: adj.time,
                        room: adj.room,
                        dept: adj.dept,
                        grp: adj.group || "N/A",
                        subgrp: adj.subGroup || "All"
                    },
                    createdAt: adj.createdAt
                });
            }
        });
        return stream.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    }, [incomingRequests, incomingAdjustments]);

    const unifiedOutgoing = useMemo(() => {
        const stream = [...outgoingRequests];
        outgoingAdjustments.forEach(adj => {
            const hasRequest = outgoingRequests.some(r =>
                r.date === adj.date &&
                r.originalScheduleId === adj.originalScheduleId
            );
            if (!hasRequest) {
                stream.push({
                    id: adj.id,
                    requesterName: adj.originalFaculty,
                    targetFacultyName: adj.substituteName,
                    date: adj.date,
                    status: 'approved',
                    isAdminAssigned: true,
                    reason: "Assigned by Administrator",
                    scheduleDetails: {
                        subject: adj.subject,
                        time: adj.time,
                        room: adj.room,
                        dept: adj.dept,
                        grp: adj.group || "N/A",
                        subgrp: adj.subGroup || "All"
                    },
                    createdAt: adj.createdAt
                });
            }
        });
        return stream.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    }, [outgoingRequests, outgoingAdjustments]);

    // Handle Response to Request
    // Handle Response to Request
    const handleResponse = async (requestId, responseType) => {
        // STRICT PERMISSION CHECK
        if (!checkWritePermission()) return;

        // Validate user profile
        if (!userProfile?.empId) {
            toast.error("User profile incomplete. Please refresh and try again.");
            console.error("handleResponse error: userProfile.empId is missing", userProfile);
            return;
        }

        if (!currentUser?.uid) {
            toast.error("Authentication error. Please log in again.");
            console.error("handleResponse error: currentUser.uid is missing");
            return;
        }

        setLoading(true);
        try {
            await runTransaction(db, async (transaction) => {
                const reqRef = doc(db, 'substitution_requests', requestId);
                const reqSnap = await transaction.get(reqRef);

                if (!reqSnap.exists()) {
                    throw "Request not found";
                }

                const reqData = reqSnap.data();
                console.log("Processing request:", { requestId, responseType, reqData });

                if (reqData.status !== 'pending') {
                    throw `Request is already ${reqData.status}`;
                }

                if (responseType === 'accepted') {
                    // Validate required data
                    if (!reqData.date || !reqData.originalScheduleId) {
                        console.error("Invalid request data:", reqData);
                        throw "Invalid request data: missing date or schedule ID";
                    }

                    if (!reqData.academicYear) {
                        console.error("Invalid request data: missing academic year", reqData);
                        throw "Invalid request data: missing academic year";
                    }

                    // Check Deterministic ID for Double Booking
                    const adjustmentId = `${reqData.date}_${reqData.originalScheduleId}`;
                    const adjRef = doc(db, 'adjustments', adjustmentId);
                    const adjSnap = await transaction.get(adjRef);

                    if (adjSnap.exists()) {
                        throw "Class is already covered by someone else.";
                    }

                    const originalItem = fullSchedule.find(i => i.id === reqData.originalScheduleId) || {};
                    const subject = originalItem.subject || reqData.scheduleDetails?.subject || "N/A";
                    const time = originalItem.time || reqData.scheduleDetails?.time || "N/A";

                    const adjustmentData = {
                        academicYear: reqData.academicYear,
                        date: reqData.date,
                        originalFaculty: reqData.requesterName || "Unknown",
                        substituteName: reqData.targetFacultyName || userProfile.name || "Unknown",
                        originalScheduleId: reqData.originalScheduleId,
                        originalFacultyEmpId: reqData.requesterId || "",
                        substituteEmpId: userProfile.empId,
                        subject,
                        time,
                        room: originalItem.room || reqData.scheduleDetails?.room || "N/A",
                        dept: originalItem.dept || reqData.scheduleDetails?.dept || "N/A",
                        section: originalItem.section || originalItem.grp || reqData.scheduleDetails?.grp || "N/A",
                        group: originalItem.group || originalItem.subGroup || reqData.scheduleDetails?.subgrp || "All",
                        sem: originalItem.sem || "N/A",
                        createdAt: serverTimestamp(),
                        createdBy: currentUser.uid,
                        status: 'active'
                    };

                    console.log("Creating adjustment:", adjustmentData);
                    transaction.set(adjRef, adjustmentData);

                    transaction.update(reqRef, {
                        targetResponse: 'accepted',
                        targetResponseAt: serverTimestamp(),
                        status: 'approved',
                        adminComment: 'Auto-approved via Peer Acceptance'
                    });
                } else {
                    transaction.update(reqRef, {
                        status: 'rejected',
                        rejectionReason: 'Faculty declined',
                        targetResponse: 'rejected',
                        targetResponseAt: serverTimestamp()
                    });
                }
            });

            if (responseType === 'accepted') {
                const reqSnap = await getDoc(doc(db, 'substitution_requests', requestId));
                const reqData = reqSnap.data();

                // Cancel Siblings
                const siblingsQ = query(
                    collection(db, 'substitution_requests'),
                    where('originalScheduleId', '==', reqData.originalScheduleId),
                    where('date', '==', reqData.date),
                    where('status', '==', 'pending')
                );
                const siblingsSnap = await getDocs(siblingsQ);
                const cancelPromises = siblingsSnap.docs
                    .filter(d => d.id !== requestId)
                    .map(d => updateDoc(d.ref, {
                        status: 'cancelled',
                        adminComment: 'Auto-cancelled: Another faculty accepted'
                    }));

                await Promise.all(cancelPromises);

                // Send notification
                try {
                    await sendNotification({
                        empIds: [reqData.requesterId],
                        title: 'Request Accepted',
                        body: `${reqData.targetFacultyName} confirmed your request.`,
                        type: 'substitution_accepted'
                    });
                } catch (notifError) {
                    console.error("Notification error (non-critical):", notifError);
                }
                toast.success("Substitution Confirmed & Scheduled!");
            } else {
                toast.success("Request Declined");
            }
        } catch (e) {
            console.error("Transaction Error:", e);
            const errorMessage = typeof e === 'string' ? e : (e.message || "Action failed. Please try again.");
            toast.error(errorMessage);
        } finally {
            setLoading(false);
        }
    };



    // Cancel Outgoing Request
    const handleCancelRequest = async (requestId) => {
        // Show confirmation dialog
        const confirmed = window.confirm("Are you sure you want to cancel this substitution request?");

        if (!confirmed) return;

        setLoading(true);
        try {
            const ref = doc(db, 'substitution_requests', requestId);
            const reqSnap = await getDoc(ref);

            if (!reqSnap.exists()) {
                toast.error("Request not found");
                setLoading(false);
                return;
            }

            const reqData = reqSnap.data();

            // Update request status to cancelled
            await updateDoc(ref, {
                status: 'cancelled',
                cancelledAt: serverTimestamp(),
                cancelledBy: currentUser.uid,
                adminComment: 'Cancelled by requester'
            });

            // Send notification to the target faculty
            if (reqData.targetFacultyId) {
                const det = reqData.scheduleDetails || {};
                // eslint-disable-next-line sonarjs/no-nested-template-literals
                const cGroupStr = `${det.dept || '?'}-${det.grp || '?'}${det.subgrp ? `-${det.subgrp}` : ''}`;
                const cCoFac = det.faculty2 ? ` WITH ${det.faculty2}` : '';
                // formatting best effort without full schedule fetch

                await sendNotification({
                    empIds: [reqData.targetFacultyId],
                    title: 'Request Cancelled',
                    body: `${reqData.requesterName} cancelled their substitution request for ${det.subject || 'class'} of (${cGroupStr})${cCoFac}.`,
                    type: 'substitution_cancelled',
                    data: {
                        type: 'substitution_cancelled',
                        requestId: requestId
                    }
                });
            }

            toast.success("Request cancelled successfully");
        } catch (error) {
            console.error("Error cancelling request:", error);
            toast.error("Failed to cancel request");
        } finally {
            setLoading(false);
        }
    };

    // --- EXISTING "CREATE" LOGIC ---
    const handleDateSelect = async (date) => {
        setSelectedDate(date);
        const dayName = getDayName(date);
        const now = new Date();
        const todayStr = formatDateLocal(now);
        const isToday = date === todayStr;

        // Filter user's classes
        let classes = fullSchedule.filter(s => {
            if (s.day !== dayName) return false;

            // 1. Match by EmpID (Gold Standard)
            if (userProfile?.empId) {
                if (s.facultyEmpId === userProfile.empId || s.faculty2EmpId === userProfile.empId) return true;
            }

            // 2. Match by Name (Robust Fallback)
            if (!userProfile?.name) return false;
            const search = normalizeStr(userProfile.name);
            const f1 = normalizeStr(s.faculty);
            const f2 = normalizeStr(s.faculty2);

            return f1.includes(search) || f2.includes(search);
        });

        // Check for existing requests/adjustments to prevent duplicates
        classes = classes.map(c => {
            const activeRequest = outgoingRequests.find(r =>
                r.date === date &&
                r.originalScheduleId === c.id &&
                (r.status === 'pending')
            );

            const activeAdjustment = outgoingAdjustments.find(a =>
                a.date === date &&
                a.originalScheduleId === c.id
            );

            let status = 'available';
            let statusLabel = '';
            let isCompleted = false;

            // Check if class is in the past for today
            if (isToday) {
                const timeData = parseTimeSlot(c.time);
                if (timeData) {
                    const classEndTime = new Date(now);
                    const slotEnd = new Date(timeData.end);
                    classEndTime.setHours(slotEnd.getHours(), slotEnd.getMinutes(), 0, 0);

                    if (now > classEndTime) {
                        isCompleted = true;
                        status = 'completed';
                        statusLabel = 'Class Completed';
                    }
                }
            }

            if (!isCompleted) {
                if (activeAdjustment) {
                    status = 'substituted';
                    statusLabel = `Covered by ${activeAdjustment.substituteName}`;
                } else if (activeRequest) {
                    status = 'pending';
                    statusLabel = 'Request Sent';
                }
            }

            return { ...c, status, statusLabel, isCompleted };
        });

        setMyClasses(classes);
        setStep(2);
    };

    const handleClassSelect = async (classId) => {
        setLoading(true);
        setSelectedClassId(classId);
        const selectedClass = myClasses.find(c => c.id === classId);
        if (!selectedClass) return;
        if (!activeAcademicYear) {
            toast.error("Academic Year not loaded. Please try again.");
            setLoading(false);
            return;
        }

        try {
            // Fetch everything relevant for this specific slot
            const [facSnap, adjSnap] = await Promise.all([
                getDocs(collection(db, 'faculty')),
                getDocs(query(collection(db, 'adjustments'),
                    where('date', '==', selectedDate),
                    where('academicYear', '==', activeAcademicYear)
                ))
            ]);

            const allFaculty = facSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const currentAdjustments = adjSnap.docs.map(d => d.data());

            const dayName = new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long' });
            const busyNames = new Set();

            // Check permanent schedule
            fullSchedule.forEach(item => {
                if (item.day === dayName && normalizeTime(item.time) === normalizeTime(selectedClass.time)) {
                    if (item.faculty) busyNames.add(normalizeStr(item.faculty));
                    if (item.faculty2) busyNames.add(normalizeStr(item.faculty2));
                    // Also check by ID if available in schedule
                    if (item.facultyEmpId) busyNames.add(item.facultyEmpId);
                    if (item.faculty2EmpId) busyNames.add(item.faculty2EmpId);
                }
            });

            // Check dynamic adjustments (someone subbing elsewhere at this exact time)
            currentAdjustments.forEach(adj => {
                if (normalizeTime(adj.time) === normalizeTime(selectedClass.time)) {
                    if (adj.substituteName) busyNames.add(normalizeStr(adj.substituteName));
                    if (adj.substituteEmpId) busyNames.add(adj.substituteEmpId);
                }
            });

            // 3. AI Workload Analysis (Load Balancing)
            const workloadMap = {};
            fullSchedule.forEach(item => {
                if (item.day === dayName) {
                    if (item.faculty) {
                        const f = normalizeStr(item.faculty);
                        workloadMap[f] = (workloadMap[f] || 0) + 1;
                    }
                    if (item.faculty2) {
                        const f = normalizeStr(item.faculty2);
                        workloadMap[f] = (workloadMap[f] || 0) + 1;
                    }
                    if (item.facultyEmpId) workloadMap[item.facultyEmpId] = (workloadMap[item.facultyEmpId] || 0) + 1;
                    if (item.faculty2EmpId) workloadMap[item.faculty2EmpId] = (workloadMap[item.faculty2EmpId] || 0) + 1;
                }
            });

            const mySearch = normalizeStr(userProfile.name);
            const myId = userProfile.empId;
            const targetDeptNorm = normalizeStr(selectedClass.dept);

            const available = allFaculty
                .filter(f => {
                    const fNameNorm = normalizeStr(f.name);
                    const fId = f.empId;
                    return (fNameNorm !== mySearch && fId !== myId) && !busyNames.has(fNameNorm) && !busyNames.has(fId);
                })
                .map(f => {
                    const fNameNorm = normalizeStr(f.name);
                    let matchType = [];
                    let score = 0;

                    if (normalizeStr(f.dept) === targetDeptNorm) {
                        matchType.push('Dept Match');
                        score += 50;
                    }

                    const load = workloadMap[fNameNorm] || 0;
                    if (load === 0) {
                        const dayName = getDayName(selectedDate);
                        const dateObj = new Date(selectedDate);
                        const shortDay = dayName.substring(0, 3).toUpperCase();
                        const month = dateObj.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
                        const day = dateObj.getDate();
                        matchType.push(`FREE ON ${shortDay}, ${month} ${day}`);
                        score += 30;
                    } else if (load < 2) {
                        matchType.push('Light Load');
                        score += 15;
                    }

                    return { ...f, matchType, score };
                })
                .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

            setAvailableFaculty(available);
            setAvailableFaculty(available);
            // setStep(3); // Wait for explicit Next button click
        } catch (e) {
            console.error(e);
            toast.error("Error finding faculty availability");
        }
        setLoading(false);
    };

    const handleSubmit = async () => {
        if (!activeAcademicYear) return toast.error("Academic Year not loaded. Please wait.");

        // STRICT PERMISSION CHECK
        if (!checkWritePermission()) return;


        if (!userProfile?.empId) return toast.error("User profile incomplete (No EmpID).");
        if (!targetFacultyId || !reason) return toast.error("Please select faculty and reason");

        setLoading(true);
        const targetFac = availableFaculty.find(f => f.id === targetFacultyId);
        const originalClass = myClasses.find(c => c.id === selectedClassId);

        if (!targetFac || !originalClass) {
            setLoading(false);
            return toast.error("Selection error. Please try again.");
        }

        try {
            await addDoc(collection(db, 'substitution_requests'), {
                academicYear: activeAcademicYear,
                requesterUid: currentUser?.uid || "system", // For permission checks
                requesterId: userProfile.empId,
                requesterName: userProfile.name || "Unknown",
                targetFacultyId: targetFac.empId || "Unknown",
                targetFacultyName: targetFac.name || "Unknown",
                originalScheduleId: selectedClassId || "",
                scheduleDetails: {
                    subject: originalClass.subject || "N/A",
                    room: originalClass.room || "N/A",
                    time: originalClass.time || "N/A",
                    dept: originalClass.dept || "N/A",
                    grp: originalClass.section || originalClass.grp || "N/A",
                    subgrp: originalClass.group || originalClass.subgrp || "All"
                },
                date: selectedDate || "",
                reason: reason || "No reason provided",
                status: 'pending',
                targetResponse: null, // Will be set to 'accepted' or 'declined' when faculty responds
                createdAt: serverTimestamp()
            });
            toast.success("Request sent!");
            setView('list'); setActiveTab('sent');
            setStep(1); setSelectedDate(''); setSelectedClassId(''); setTargetFacultyId(''); setReason('');
        } catch (e) {
            console.error("Submission Error:", e);
            toast.error(`Failed to submit: ${e.message} `);
        }
        setLoading(false);
    };
    // -------------------------------------------

    if (view === 'create') {
        return (
            <div className="page-container" style={{ maxWidth: '800px', margin: '0 auto', padding: isMobile ? '1rem' : '2rem' }}>
                {/* Premium Wizard Header */}
                <div style={{
                    marginBottom: '2rem',
                    display: 'flex',
                    alignItems: isMobile ? 'flex-start' : 'center',
                    justifyContent: 'space-between',
                    flexDirection: isMobile ? 'column' : 'row',
                    gap: isMobile ? '1.5rem' : '0'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '1rem' : '1.5rem' }}>
                        <button
                            onClick={() => step > 1 ? setStep(step - 1) : setView('list')}
                            className="btn glass-panel"
                            style={{
                                width: '45px', height: '45px', borderRadius: '12px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                padding: 0, border: '1px solid rgba(255,255,255,0.1)',
                                transition: 'all 0.2s', background: 'rgba(255,255,255,0.03)'
                            }}
                        >
                            <ChevronLeft size={22} color="#e2e8f0" />
                        </button>
                        <div>
                            <h2 style={{
                                margin: 0, fontSize: isMobile ? '1.4rem' : '1.8rem', fontWeight: 800,
                                background: 'linear-gradient(to right, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
                            }}>New Request</h2>
                            <p style={{ margin: 0, color: '#64748b', fontSize: isMobile ? '0.8rem' : '0.9rem', fontWeight: 600 }}>
                                { }
                                Step {step} of 3 • {step === 1 ? 'Select Date' : (step === 2 ? 'Choose Class' : 'Find Substitute')}
                            </p>
                        </div>
                    </div>

                    {!isMobile && (
                        <button
                            onClick={() => setView('list')}
                            style={{
                                width: '40px', height: '40px', borderRadius: '50%',
                                background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)',
                                color: '#ef4444', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'all 0.2s', boxShadow: '0 0 15px rgba(239, 68, 68, 0.1)'
                            }}
                        >
                            <X size={20} />
                        </button>
                    )}
                </div>

                <div className="glass-panel" style={{ padding: isMobile ? '1.2rem' : '2rem', minHeight: '500px' }}>
                    {/* Progress Stepper */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: isMobile ? '4rem' : '3rem', position: 'relative' }}>
                        {[
                            { step: 1, label: 'Date' },
                            { step: 2, label: 'Select Class' },
                            { step: 3, label: 'Find Proxy' }
                        ].map((s, idx) => ( // eslint-disable-line sonarjs/cognitive-complexity
                            <React.Fragment key={s.step}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 2 }}>
                                    <div style={{
                                        width: isMobile ? '32px' : '40px', height: isMobile ? '32px' : '40px', borderRadius: '50%',
                                        background: step >= s.step ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : 'rgba(255,255,255,0.05)',
                                        border: step >= s.step ? 'none' : '1px solid rgba(255,255,255,0.1)',
                                        color: step >= s.step ? 'white' : '#94a3b8',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontWeight: 'bold', fontSize: isMobile ? '0.9rem' : '1.1rem',
                                        boxShadow: step >= s.step ? '0 4px 12px rgba(37, 99, 235, 0.4)' : 'none',
                                        transition: 'all 0.3s ease'
                                    }}>
                                        {step > s.step ? <Check size={isMobile ? 16 : 20} /> : s.step}
                                    </div>
                                    <span style={{
                                        position: 'absolute', top: isMobile ? '38px' : '45px',
                                        fontSize: isMobile ? '0.7rem' : '0.85rem', fontWeight: 600,
                                        color: step >= s.step ? '#e2e8f0' : '#64748b',
                                        whiteSpace: 'nowrap'
                                    }}>{s.label}</span>
                                </div>
                                {idx < 2 && (
                                    <div style={{
                                        width: isMobile ? '40px' : '80px', height: '2px',
                                        background: step > s.step ? '#3b82f6' : 'rgba(255,255,255,0.1)',
                                        margin: isMobile ? '0 5px' : '0 10px', marginTop: '-20px'
                                    }}></div>
                                )}
                            </React.Fragment>
                        ))}
                    </div>

                    <div style={{ animation: 'fadeIn 0.3s ease' }}>
                        {step === 1 && (
                            <div style={{ maxWidth: '500px', margin: '0 auto', textAlign: 'center', animation: 'fadeIn 0.4s ease' }}>
                                <div style={{
                                    width: isMobile ? '60px' : '72px', height: isMobile ? '60px' : '72px', borderRadius: '24px',
                                    background: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    marginBottom: '1.5rem', margin: '0 auto 1.5rem',
                                    border: '1px solid rgba(59, 130, 246, 0.2)', boxShadow: '0 0 20px rgba(59, 130, 246, 0.2)'
                                }}>
                                    <Calendar size={isMobile ? 28 : 36} color="#60a5fa" />
                                </div>
                                <h3 style={{ marginBottom: '0.5rem', fontSize: isMobile ? '1.3rem' : '1.6rem', fontWeight: '800' }}>When will you be absent?</h3>
                                <p style={{ color: '#94a3b8', marginBottom: '2rem', fontSize: isMobile ? '0.9rem' : '1rem' }}>We'll pull up your schedule for that day.</p>

                                <div style={{ background: 'rgba(255,255,255,0.03)', padding: isMobile ? '1.2rem' : '2rem', borderRadius: '24px', position: 'relative', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    {/* Custom Date Input for DD/MM/YYYY Display */}
                                    <div
                                        onClick={() => document.getElementById('hidden-date-picker').showPicker()}
                                        style={{ position: 'relative', width: '100%', cursor: 'pointer' }}
                                    >
                                        {/* 1. VISIBLE LAYER (The Pretty Text) */}
                                        <div className="glass-input" style={{
                                            width: '100%', padding: isMobile ? '1rem' : '1.25rem',
                                            fontSize: isMobile ? '1.1rem' : '1.4rem', textAlign: 'center',
                                            background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: '16px', fontWeight: 'bold', letterSpacing: isMobile ? '1px' : '2px',
                                            color: selectedDate ? '#fff' : '#64748b',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                                            transition: 'border 0.2s',
                                        }}
                                            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.4)'}
                                            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
                                        >
                                            {selectedDate
                                                ? new Date(selectedDate).toLocaleDateString('en-GB') // Forces 30/12/2025
                                                : "DD/MM/YYYY" // Exact Placeholder request
                                            }
                                        </div>

                                        {/* 2. HIDDEN ANCHOR LAYER (The Functional Input) */}
                                        {/* Positioned at the bottom-center so popover opens downwards nicely */}
                                        <input
                                            id="hidden-date-picker"
                                            type="date"
                                            onChange={(e) => handleDateSelect(e.target.value)}
                                            min={new Date().toISOString().split('T')[0]}
                                            style={{
                                                position: 'absolute',
                                                top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                                                width: '0px', height: '0px',
                                                opacity: 0, padding: 0, border: 'none', margin: 0,
                                                overflow: 'hidden'
                                            }}
                                        />

                                        {/* Icon (Decorative) */}
                                        <div style={{ position: 'absolute', right: '1.5rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: 0.8 }}>
                                            <Calendar size={24} color={selectedDate ? "#60a5fa" : "#64748b"} />
                                        </div>
                                    </div>

                                    <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                                        <button
                                            onClick={() => handleDateSelect(formatDateLocal(new Date()))}
                                            style={{
                                                padding: '0.6rem 1.2rem', borderRadius: '20px',
                                                background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa',
                                                fontWeight: '600', cursor: 'pointer', fontSize: '0.9rem',
                                                transition: 'all 0.2s', border: '1px solid rgba(59, 130, 246, 0.2)'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.25)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)'}
                                        >
                                            Today
                                        </button>
                                        <button
                                            onClick={() => {
                                                const tmrw = new Date(); tmrw.setDate(tmrw.getDate() + 1);
                                                handleDateSelect(formatDateLocal(tmrw));
                                            }}
                                            style={{
                                                padding: '0.6rem 1.2rem', borderRadius: '20px', border: 'none',
                                                background: 'rgba(255,255,255,0.08)', color: '#94a3b8',
                                                fontWeight: '600', cursor: 'pointer', fontSize: '0.9rem',
                                                transition: 'all 0.2s'
                                            }}
                                            onMouseEnter={e => {
                                                e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                                                e.currentTarget.style.color = '#e2e8f0';
                                            }}
                                            onMouseLeave={e => {
                                                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                                                e.currentTarget.style.color = '#94a3b8';
                                            }}
                                        >
                                            Tomorrow
                                        </button>
                                    </div>
                                </div>
                                <div style={{ marginTop: '2.5rem', display: 'flex', justifyContent: 'center' }}>
                                    <button
                                        onClick={() => {
                                            if (selectedDate) setStep(2);
                                            else toast.error("Please select a date first");
                                        }}
                                        disabled={!selectedDate}
                                        style={{
                                            padding: '0.8rem 2.5rem', borderRadius: '14px', border: 'none',
                                            background: selectedDate ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : 'rgba(255,255,255,0.05)',
                                            color: selectedDate ? 'white' : '#64748b',
                                            cursor: selectedDate ? 'pointer' : 'not-allowed',
                                            fontWeight: 'bold', fontSize: '1.05rem',
                                            display: 'flex', alignItems: 'center', gap: '10px',
                                            boxShadow: selectedDate ? '0 8px 20px rgba(37, 99, 235, 0.4)' : 'none',
                                            transition: 'all 0.3s ease',
                                            opacity: selectedDate ? 1 : 0.6
                                        }}
                                    >
                                        Next Step <ArrowRight size={20} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <div style={{ animation: 'fadeIn 0.4s ease' }}>
                                <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                                    <h3 style={{ fontSize: isMobile ? '1.3rem' : '1.6rem', fontWeight: '800', marginBottom: '0.5rem' }}>Which class needs a substitute?</h3>
                                    <p style={{ color: '#94a3b8', fontSize: isMobile ? '0.85rem' : '1rem' }}>Select the class you won't be able to attend on <span style={{ color: '#fff', fontWeight: 'bold' }}>{new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>.</p>
                                </div>

                                {myClasses.length === 0
                                    ? (
                                        <div style={{
                                            padding: '3rem', textAlign: 'center',
                                            background: 'rgba(239, 68, 68, 0.05)', borderRadius: '24px',
                                            border: '1px dashed rgba(239, 68, 68, 0.3)'
                                        }}>
                                            <div style={{ background: 'rgba(239, 68, 68, 0.1)', width: '60px', height: '60px', borderRadius: '50%', margin: '0 auto 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Ghost size={30} color="#f87171" />
                                            </div>
                                            <h4 style={{ margin: '0 0 0.5rem 0', color: '#fca5a5', fontSize: '1.2rem' }}>No Classes Found</h4>
                                            <p style={{ color: '#fca5a5', opacity: 0.8, marginBottom: '2rem' }}>You don't have any classes scheduled for this date.</p>
                                            <button
                                                onClick={() => setStep(1)}
                                                className="btn"
                                                style={{ background: '#27272a', border: '1px solid rgba(255,255,255,0.1)', padding: '0.8rem 1.5rem', borderRadius: '12px' }}
                                            >
                                                Select Different Date
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? '280px' : '320px'}, 1fr))`, gap: isMobile ? '1rem' : '1.5rem' }}>
                                            {myClasses.map(c => (
                                                <div
                                                    key={c.id}
                                                    onClick={() => {
                                                        if (c.status !== 'available') return;
                                                        if (!loading) handleClassSelect(c.id);
                                                    }}
                                                    className="glass-panel hover-card"
                                                    style={{
                                                        padding: '0',
                                                        cursor: (loading || c.status !== 'available') ? 'not-allowed' : 'pointer',
                                                        border: selectedClassId === c.id ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.08)',
                                                        background: selectedClassId === c.id ? 'rgba(59, 130, 246, 0.15)' : (c.status !== 'available' ? 'rgba(30, 41, 59, 0.2)' : 'rgba(30, 41, 59, 0.4)'),
                                                        opacity: c.status !== 'available' ? 0.6 : 1,
                                                        transition: 'all 0.2s ease',
                                                        transform: selectedClassId === c.id ? 'scale(1.02)' : 'scale(1)',
                                                        position: 'relative', overflow: 'hidden',
                                                        display: 'flex', flexDirection: 'column',
                                                        boxShadow: selectedClassId === c.id ? '0 0 25px rgba(59, 130, 246, 0.2)' : 'none'
                                                    }}
                                                >
                                                    {/* Card Header (Time) */}
                                                    <div style={{
                                                        padding: '1.2rem',
                                                        background: selectedClassId === c.id ? 'rgba(59, 130, 246, 0.2)' : 'linear-gradient(to right, rgba(59,130,246,0.1), transparent)',
                                                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#60a5fa', fontWeight: 'bold' }}>
                                                            <Clock size={16} />
                                                            {c.time}
                                                        </div>
                                                        <div style={{
                                                            width: '24px', height: '24px', borderRadius: '50%',
                                                            border: selectedClassId === c.id ? 'none' : '2px solid rgba(255,255,255,0.2)',
                                                            background: selectedClassId === c.id ? '#3b82f6' : 'transparent',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                        }}>
                                                            {selectedClassId === c.id && <Check size={14} color="white" />}
                                                        </div>
                                                    </div>

                                                    {/* Card Body */}
                                                    <div style={{ padding: '1.5rem' }}>
                                                        <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.3rem', fontWeight: '800', lineHeight: '1.3' }}>{c.subject}</h4>

                                                        {/* Day Badge */}
                                                        <div style={{
                                                            display: 'inline-block',
                                                            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(124, 58, 237, 0.1))',
                                                            color: '#a78bfa',
                                                            fontSize: '0.8rem',
                                                            fontWeight: '700',
                                                            padding: '0.3rem 0.8rem',
                                                            borderRadius: '8px',
                                                            border: '1px solid rgba(139, 92, 246, 0.3)',
                                                            marginBottom: '1rem'
                                                        }}>
                                                            {getDayName(selectedDate)}
                                                        </div>

                                                        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', color: '#cbd5e1' }}>
                                                                <MapPin size={14} color="#f59e0b" />
                                                                {c.room}
                                                            </div>
                                                            <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
                                                            <div style={{ fontSize: '0.9rem', color: '#94a3b8' }}>
                                                                {c.dept} • {c.section}{c.group && c.group !== 'All' ? ` • ${c.group}` : ''}
                                                            </div>
                                                        </div>

                                                        {/* Co-Faculty Badge */}
                                                        {c.faculty2 && (
                                                            <div style={{
                                                                marginTop: '1rem',
                                                                background: 'rgba(34, 211, 238, 0.1)',
                                                                border: '1px solid rgba(34, 211, 238, 0.3)',
                                                                borderRadius: '10px',
                                                                padding: '0.6rem 0.9rem',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '8px'
                                                            }}>
                                                                <Users size={14} color="#22d3ee" />
                                                                <span style={{ fontSize: '0.85rem', color: '#67e8f9', fontWeight: '600' }}>
                                                                    {(() => {
                                                                        // Determine if current user is primary faculty or co-faculty
                                                                        const userNameNorm = normalizeStr(userProfile?.name || '');
                                                                        const userEmpId = userProfile?.empId;
                                                                        // f1Norm unused
                                                                        const f2Norm = normalizeStr(c.faculty2);

                                                                        // Check if user is faculty2 (co-faculty)
                                                                        const isCoFaculty = (f2Norm === userNameNorm) || (userEmpId && c.faculty2EmpId === userEmpId);

                                                                        if (isCoFaculty) {
                                                                            return `w/ ${c.faculty}`;
                                                                        } else {
                                                                            return `Co-Faculty: ${c.faculty2}`;
                                                                        }
                                                                    })()}
                                                                </span>
                                                            </div>
                                                        )}

                                                        {/* Status Badge */}
                                                        {c.status !== 'available' && (
                                                            <div style={{
                                                                marginTop: '1rem',
                                                                background: c.status === 'substituted' ? 'rgba(16, 185, 129, 0.2)' :
                                                                    c.status === 'completed' ? 'rgba(148, 163, 184, 0.15)' : 'rgba(245, 158, 11, 0.2)',
                                                                color: c.status === 'substituted' ? '#34d399' :
                                                                    c.status === 'completed' ? '#94a3b8' : '#fbbf24',
                                                                fontSize: '0.85rem', fontWeight: 'bold',
                                                                padding: '0.4rem 0.8rem', borderRadius: '8px',
                                                                display: 'flex', alignItems: 'center', gap: '6px',
                                                                border: c.status === 'substituted' ? '1px solid rgba(16, 185, 129, 0.3)' :
                                                                    c.status === 'completed' ? '1px solid rgba(148, 163, 184, 0.2)' : '1px solid rgba(245, 158, 11, 0.3)'
                                                            }}>
                                                                {c.status === 'substituted' ? <Check size={14} /> :
                                                                    c.status === 'completed' ? <History size={14} /> : <AlertCircle size={14} />}
                                                                {c.statusLabel}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                <div style={{ marginTop: '2.5rem', display: 'flex', justifyContent: 'center' }}>
                                    <button
                                        onClick={() => {
                                            if (selectedClassId && !loading) setStep(3);
                                        }}
                                        disabled={!selectedClassId || loading}
                                        style={{
                                            padding: '0.8rem 2.5rem', borderRadius: '14px', border: 'none',
                                            background: (selectedClassId && !loading) ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : 'rgba(255,255,255,0.05)',
                                            color: (selectedClassId && !loading) ? 'white' : '#64748b',
                                            cursor: (selectedClassId && !loading) ? 'pointer' : 'not-allowed',
                                            fontWeight: 'bold', fontSize: '1.05rem',
                                            display: 'flex', alignItems: 'center', gap: '10px',
                                            boxShadow: (selectedClassId && !loading) ? '0 8px 20px rgba(37, 99, 235, 0.4)' : 'none',
                                            transition: 'all 0.3s ease',
                                            opacity: (selectedClassId && !loading) ? 1 : 0.6
                                        }}
                                    >
                                        {loading
                                            ? (
                                                <>Checking Availability <Loader className="spin" size={20} /></>
                                            ) : (
                                                <>Find Substitute <ArrowRight size={20} /></>
                                            )}
                                    </button>
                                </div>
                            </div>
                        )}

                        {step === 3 && (
                            <div style={{ animation: 'fadeIn 0.5s ease' }}>
                                <h3 style={{
                                    marginBottom: '0.5rem',
                                    fontSize: isMobile ? '1.5rem' : '1.8rem',
                                    fontWeight: '800',
                                    textAlign: 'center',
                                    background: 'linear-gradient(to right, #fff, #94a3b8)',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                    padding: isMobile ? '0 1rem' : '0'
                                }}>
                                    Find a Substitute
                                </h3>
                                <p style={{ textAlign: 'center', color: '#94a3b8', marginBottom: '2rem', fontSize: isMobile ? '0.85rem' : '1rem' }}>
                                    Select a faculty member to cover your class at <strong style={{ color: '#fff' }}>{myClasses.find(c => c.id === selectedClassId)?.time}</strong>
                                    {' '}on <strong style={{ color: '#fbbf24' }}>{new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</strong>
                                </p>

                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: isMobile ? '1.5rem' : '2rem' }}>
                                    {/* LEFT COLUMN: Faculty List (Flex Grow) */}
                                    <div style={{ flex: isMobile ? '1 1 100%' : '1 1 400px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        {/* Search Bar */}
                                        <div style={{ position: 'relative' }}>
                                            <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                            <input
                                                type="text"
                                                placeholder="Search faculty by name..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                className="glass-input"
                                                style={{
                                                    width: '100%', padding: '0.8rem 1rem 0.8rem 2.8rem',
                                                    fontSize: '0.95rem', borderRadius: '12px',
                                                    background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)'
                                                }}
                                            />
                                        </div>

                                        {/* Scrollable List */}
                                        <div style={{
                                            maxHeight: '450px', overflowY: 'auto',
                                            display: 'flex', flexDirection: 'column', gap: '0.8rem',
                                            paddingRight: '6px'
                                        }}>
                                            {availableFaculty
                                                .filter(f => normalizeStr(f.name).includes(normalizeStr(searchQuery)))
                                                .map(f => (
                                                    <div
                                                        key={f.id}
                                                        onClick={() => setTargetFacultyId(f.id)}
                                                        className="hover-card"
                                                        style={{
                                                            padding: '1rem',
                                                            background: targetFacultyId === f.id ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(37, 99, 235, 0.2) 100%)' : 'rgba(255,255,255,0.03)',
                                                            border: targetFacultyId === f.id ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.05)',
                                                            borderRadius: '12px', cursor: 'pointer',
                                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                            transition: 'all 0.2s', position: 'relative', overflow: 'hidden'
                                                        }}
                                                    >
                                                        {targetFacultyId === f.id && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: '#3b82f6' }} />}

                                                        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '0.7rem' : '1rem' }}>
                                                            <div style={{
                                                                width: isMobile ? '36px' : '42px', height: isMobile ? '36px' : '42px', borderRadius: '10px',
                                                                background: targetFacultyId === f.id ? '#3b82f6' : '#1e293b',
                                                                color: targetFacultyId === f.id ? 'white' : '#94a3b8',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                fontWeight: 'bold', fontSize: isMobile ? '1rem' : '1.1rem', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                                            }}>
                                                                {f.name.charAt(0)}
                                                            </div>
                                                            <div>
                                                                <div style={{ fontWeight: '600', fontSize: isMobile ? '0.85rem' : '0.95rem', color: targetFacultyId === f.id ? '#fff' : '#e2e8f0' }}>{f.name}</div>
                                                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                    <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#64748b' }} />
                                                                    {f.dept} Dept
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {f.matchType && f.matchType.length > 0 && (
                                                            <div style={{ display: 'flex', gap: '4px', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                                {f.matchType.slice(0, 2).map((m, i) => (
                                                                    <span key={i} style={{
                                                                        fontSize: '0.65rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px',
                                                                        background: m.includes('Dept') ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                                                                        color: m.includes('Dept') ? '#34d399' : '#60a5fa',
                                                                        whiteSpace: 'nowrap',
                                                                        padding: '3px 6px', borderRadius: '4px', border: m.includes('Dept') ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(59, 130, 246, 0.3)'
                                                                    }}>
                                                                        {m}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}

                                            {availableFaculty.filter(f => normalizeStr(f.name).includes(normalizeStr(searchQuery))).length === 0 && (
                                                <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                                                    <Ghost size={32} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                                                    <p>No faculty found matching "{searchQuery}"</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* RIGHT COLUMN: Action Panel */}
                                    <div className="glass-panel" style={{
                                        flex: isMobile ? '1 1 100%' : '1 1 300px',
                                        padding: '1.5rem', height: 'fit-content',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.7) 100%)',
                                        position: isMobile ? 'relative' : 'sticky', top: '20px'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Send size={16} />
                                            </div>
                                            <h4 style={{ margin: 0, fontSize: '1.1rem' }}>Request Details</h4>
                                        </div>

                                        <div style={{ marginBottom: '1.5rem' }}>
                                            <label style={{ display: 'block', marginBottom: '0.6rem', fontSize: '0.85rem', color: '#cbd5e1', fontWeight: '500' }}>Reason for Absence</label>
                                            <textarea
                                                className="glass-input"
                                                style={{
                                                    width: '100%', minHeight: '120px', resize: 'vertical',
                                                    background: 'rgba(0,0,0,0.2)', padding: '1rem', fontSize: '0.9rem', lineHeight: '1.5'
                                                }}
                                                placeholder="Briefly explain why you need a substitute (e.g. Health issue, Personal emergency)..."
                                                value={reason}
                                                onChange={e => setReason(e.target.value)}
                                            />
                                        </div>

                                        <button
                                            onClick={handleSubmit}
                                            disabled={loading || !targetFacultyId || !reason.trim()}
                                            className="btn btn-primary"
                                            style={{
                                                width: '100%', padding: '1rem', borderRadius: '12px',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem',
                                                background: (!targetFacultyId || !reason.trim()) ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                                color: (!targetFacultyId || !reason.trim()) ? '#64748b' : 'white',
                                                cursor: (!targetFacultyId || !reason.trim()) ? 'not-allowed' : 'pointer',
                                                fontSize: '1rem', fontWeight: 'bold', letterSpacing: '0.5px',
                                                boxShadow: (!targetFacultyId || !reason.trim()) ? 'none' : '0 4px 15px rgba(37, 99, 235, 0.4)'
                                            }}
                                        >
                                            {loading ? <Loader className="spin" size={20} /> : <>Submit Request <ArrowRight size={20} /></>}
                                        </button>

                                        {!targetFacultyId && (
                                            <p style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.8rem', color: '#64748b' }}>
                                                Please select a faculty member from the list.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div >
        );
    }

    // List View with Priority Sorting
    // Priority: 1 = Confirmed/Approved, 2 = Pending/Awaiting, 3 = Rejected/Cancelled
    const getStatusPriority = (item) => {
        if (item.status === 'approved' || item.targetResponse === 'accepted') return 1;
        if (item.status === 'pending' && !item.targetResponse) return 2;
        return 3; // rejected, cancelled, or declined
    };

    const todayStr = formatDateLocal(new Date());

    // Include all active requests: pending, approved, and rejected
    // Exclude cancelled requests for the receiver as they no longer appear in 'Active' but in History
    // CRITICAL FIX: Filter out past dates so they don't clutter the view
    const activeIncoming = unifiedIncoming
        .filter(r => (r.status === 'pending' || r.status === 'approved' || r.status === 'rejected') && r.date >= todayStr)
        .sort((a, b) => {
            const priorityDiff = getStatusPriority(a) - getStatusPriority(b);
            if (priorityDiff !== 0) return priorityDiff;
            return new Date(b.date) - new Date(a.date); // Most recent first within same priority
        });

    // Include all status for requester feedback, including cancelled
    // CRITICAL FIX: Filter out past dates
    const activeOutgoing = unifiedOutgoing
        .filter(r => (r.status === 'pending' || r.status === 'approved' || r.status === 'rejected' || r.status === 'cancelled') && r.date >= todayStr)
        .sort((a, b) => {
            const priorityDiff = getStatusPriority(a) - getStatusPriority(b);
            if (priorityDiff !== 0) return priorityDiff;
            return new Date(b.date) - new Date(a.date); // Most recent first within same priority
        });
    const allHistoryItems = [...unifiedIncoming, ...unifiedOutgoing]
        .filter(r => ['pending', 'approved', 'rejected', 'cancelled'].includes(r.status))
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    const filteredHistoryItems = allHistoryItems.filter(item => {
        if (historySubTab === 'all') return true;
        if (historySubTab === 'awaiting') return item.status === 'pending';
        if (historySubTab === 'approved') return item.status === 'approved';
        if (historySubTab === 'cancelled') return item.status === 'cancelled';

        const isOutgoing = item.requesterId === userProfile.empId || (item.requesterName && item.requesterName.toLowerCase() === userProfile.name.toLowerCase());
        if (historySubTab === 'declined') return item.status === 'rejected' && !isOutgoing;
        if (historySubTab === 'rejected') return item.status === 'rejected' && isOutgoing;

        return item.status === historySubTab;
    });
    return (
        <div className="page-container" style={{
            maxWidth: '1100px',
            margin: '0 auto',
            padding: isMobile ? '1rem' : '2rem'
        }}>
            {/* Premium Header & Navigation */}
            <div style={{ marginBottom: isMobile ? '1.5rem' : '2rem' }}>
                <div style={{
                    display: 'flex',
                    flexDirection: isMobile ? 'column' : 'row',
                    justifyContent: 'space-between',
                    alignItems: isMobile ? 'flex-start' : 'flex-end',
                    gap: isMobile ? '1.2rem' : '2rem',
                    marginBottom: '2rem'
                }}>
                    <div>
                        <h2 style={{
                            margin: 0,
                            fontSize: isMobile ? '1.8rem' : '2.5rem',
                            fontWeight: '800',
                            letterSpacing: '-1px',
                            background: 'linear-gradient(to right, #fff, #94a3b8)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '15px'
                        }}>
                            { }
                            {activeTab === 'received' ? 'Inbox' : (activeTab === 'sent' ? 'Outbox' : 'Archive')}
                        </h2>
                        <p style={{ color: 'var(--color-text-muted)', fontSize: '1.1rem', marginTop: '0.5rem' }}>
                            { }
                            {activeTab === 'received'
                                ? 'Review and respond to incoming requests.'
                                : (activeTab === 'sent' ? 'Track your substitution requests.' : 'View past history and logs.')}
                        </p>
                    </div>

                    <button
                        onClick={() => setView('create')}
                        className="btn"
                        style={{
                            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                            padding: isMobile ? '0.7rem 1.2rem' : '0.8rem 1.5rem',
                            fontSize: isMobile ? '0.9rem' : '1rem',
                            fontWeight: 'bold', color: 'white',
                            borderRadius: '12px', border: 'none',
                            boxShadow: '0 4px 15px rgba(37, 99, 235, 0.3)',
                            display: 'flex', alignItems: 'center', gap: '8px',
                            transition: 'all 0.2s transform',
                            width: isMobile ? '100%' : 'auto',
                            justifyContent: 'center'
                        }}
                    >
                        <UserPlus size={20} /> New Request
                    </button>
                </div>

                {/* Segmented Control Tab Bar */}
                <div className="glass-panel" style={{
                    padding: isMobile ? '3px' : '5px',
                    display: 'flex',
                    borderRadius: '16px',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
                }}>
                    {/* Tab: Received */}
                    <button
                        onClick={() => setActiveTab('received')}
                        style={{
                            flex: 1,
                            padding: isMobile ? '10px 4px' : '12px',
                            borderRadius: '12px',
                            cursor: 'pointer',
                            background: activeTab === 'received' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                            color: activeTab === 'received' ? 'white' : '#94a3b8',
                            border: activeTab === 'received' ? '1px solid rgba(59, 130, 246, 0.3)' : 'none',
                            fontWeight: activeTab === 'received' ? '700' : '600',
                            transition: 'all 0.3s ease',
                            display: 'flex',
                            flexDirection: isMobile ? 'column' : 'row',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: isMobile ? '4px' : '8px',
                            position: 'relative',
                            fontSize: isMobile ? '0.75rem' : '1rem'
                        }}
                    >
                        <Inbox size={isMobile ? 16 : 18} />
                        <span>{isMobile ? "Inbox" : "Received"}</span>
                        {unifiedIncoming.filter(r => !r.targetResponse && !r.isAdminAssigned && r.status === 'pending' && r.date >= todayStr).length > 0 &&
                            <span style={{
                                background: '#ef4444', color: 'white', borderRadius: '50%',
                                width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.7rem', marginLeft: '6px', fontWeight: 'bold'
                            }}>
                                {unifiedIncoming.filter(r => !r.targetResponse && !r.isAdminAssigned && r.status === 'pending' && r.date >= todayStr).length}
                            </span>
                        }
                    </button>

                    {/* Tab: Sent */}
                    <button
                        onClick={() => setActiveTab('sent')}
                        style={{
                            flex: 1,
                            padding: isMobile ? '10px 4px' : '12px',
                            borderRadius: '12px',
                            cursor: 'pointer',
                            background: activeTab === 'sent' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                            color: activeTab === 'sent' ? 'white' : '#94a3b8',
                            border: activeTab === 'sent' ? '1px solid rgba(59, 130, 246, 0.3)' : 'none',
                            fontWeight: activeTab === 'sent' ? '700' : '600',
                            transition: 'all 0.3s ease',
                            display: 'flex',
                            flexDirection: isMobile ? 'column' : 'row',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: isMobile ? '4px' : '8px',
                            fontSize: isMobile ? '0.75rem' : '1rem'
                        }}
                    >
                        <Send size={isMobile ? 16 : 18} />
                        <span>Sent</span> { }
                    </button>

                    {/* Tab: History */}
                    <button
                        onClick={() => setActiveTab('history')}
                        style={{
                            flex: 1,
                            padding: isMobile ? '10px 4px' : '12px',
                            borderRadius: '12px',
                            cursor: 'pointer',
                            background: activeTab === 'history' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                            color: activeTab === 'history' ? 'white' : '#94a3b8',
                            border: activeTab === 'history' ? '1px solid rgba(59, 130, 246, 0.3)' : 'none',
                            fontWeight: activeTab === 'history' ? '700' : '600',
                            transition: 'all 0.3s ease',
                            display: 'flex',
                            flexDirection: isMobile ? 'column' : 'row',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: isMobile ? '4px' : '8px',
                            fontSize: isMobile ? '0.75rem' : '1rem'
                        }}
                    >
                        <History size={isMobile ? 16 : 18} />
                        <span>{isMobile ? "Logs" : "History"}</span>
                    </button>
                </div>
            </div>

            <div className="glass-panel" style={{ padding: '0', overflow: 'hidden', minHeight: '400px', background: 'rgba(23, 23, 23, 0.4)' }}>
                {/* RENDER CONTENT BASED ON TAB */}
                { }
                {activeTab === 'received'
                    ? (
                        activeIncoming.length === 0 ? (
                            <EmptyState icon={Inbox} text="No pending requests" subtext="You're all caught up!" />
                        ) : (
                            <div style={{ padding: '1.5rem' }}>
                                {/* Group cards by priority */}
                                {(() => {
                                    const confirmed = activeIncoming.filter(r => r.status === 'approved' || r.targetResponse === 'accepted');
                                    const awaiting = activeIncoming.filter(r => r.status === 'pending' && !r.targetResponse);
                                    const declined = activeIncoming.filter(r => r.targetResponse === 'rejected' || r.status === 'rejected');

                                    return (
                                        <>
                                            {/* Confirmed Section */}
                                            <RequestSectionHeader
                                                icon={CheckCircle}
                                                title="Confirmed"
                                                count={confirmed.length}
                                                color="rgba(34, 197, 94, 0.5)"
                                                gradient={['rgba(34, 197, 94, 0.15)', 'rgba(16, 185, 129, 0.15)']}
                                                isMobile={isMobile}
                                            />
                                            {confirmed.length > 0 && (
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.2rem', marginBottom: '1rem' }}>
                                                    {confirmed.map(req => (
                                                        <RequestCard
                                                            key={req.id}
                                                            req={req}
                                                            type="received"
                                                            isMobile={isMobile}
                                                            onAction={handleResponse}
                                                            fullSchedule={fullSchedule}
                                                            facultyList={facultyList}
                                                            loading={loading}
                                                        />
                                                    ))}
                                                </div>
                                            )}

                                            {/* Awaiting Section */}
                                            <RequestSectionHeader
                                                icon={AlertCircle}
                                                title="Awaiting Response"
                                                count={awaiting.length}
                                                color="rgba(245, 158, 11, 0.5)"
                                                gradient={['rgba(245, 158, 11, 0.15)', 'rgba(251, 191, 36, 0.15)']}
                                                isMobile={isMobile}
                                            />
                                            {awaiting.length > 0 && (
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.2rem', marginBottom: '1rem' }}>
                                                    {awaiting.map(req => (
                                                        <RequestCard
                                                            key={req.id}
                                                            req={req}
                                                            type="received"
                                                            isMobile={isMobile}
                                                            onAction={handleResponse}
                                                            fullSchedule={fullSchedule}
                                                            facultyList={facultyList}
                                                            loading={loading}
                                                        />
                                                    ))}
                                                </div>
                                            )}

                                            {/* Declined Section */}
                                            <RequestSectionHeader
                                                icon={X}
                                                title="Declined"
                                                count={declined.length}
                                                color="rgba(239, 68, 68, 0.5)"
                                                gradient={['rgba(239, 68, 68, 0.15)', 'rgba(220, 38, 38, 0.15)']}
                                                isMobile={isMobile}
                                            />
                                            {declined.length > 0 && (
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.2rem' }}>
                                                    {declined.map(req => (
                                                        <RequestCard
                                                            key={req.id}
                                                            req={req}
                                                            type="received"
                                                            isMobile={isMobile}
                                                            onAction={handleResponse}
                                                            fullSchedule={fullSchedule}
                                                            facultyList={facultyList}
                                                            loading={loading}
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        )
                    ) : activeTab === 'sent' ? (
                        // OUTGOING CONTENT
                        activeOutgoing.length === 0 ? (
                            <EmptyState icon={Ghost} text="No pending requests" subtext="Create a new request to find a substitute." />
                        ) : (
                            <div style={{ padding: '1.5rem' }}>
                                {(() => {
                                    const confirmed = activeOutgoing.filter(r => r.status === 'approved' || r.targetResponse === 'accepted');
                                    const awaiting = activeOutgoing.filter(r => !r.targetResponse && r.status === 'pending');
                                    const rejected = activeOutgoing.filter(r => r.targetResponse === 'rejected' || r.status === 'rejected' || r.status === 'cancelled');

                                    return (
                                        <>
                                            {/* Confirmed Section */}
                                            <RequestSectionHeader
                                                icon={CheckCircle}
                                                title="Confirmed"
                                                count={confirmed.length}
                                                color="rgba(34, 197, 94, 0.5)"
                                                gradient={['rgba(34, 197, 94, 0.15)', 'rgba(16, 185, 129, 0.15)']}
                                                isMobile={isMobile}
                                            />
                                            {confirmed.length > 0 && (
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.2rem', marginBottom: '1rem' }}>
                                                    {confirmed.map(req => (
                                                        <RequestCard
                                                            key={req.id}
                                                            req={req}
                                                            type="sent"
                                                            isMobile={isMobile}
                                                            onCancel={handleCancelRequest}
                                                            fullSchedule={fullSchedule}
                                                            facultyList={facultyList}
                                                            loading={loading}
                                                        />
                                                    ))}
                                                </div>
                                            )}

                                            {/* Awaiting Section */}
                                            <RequestSectionHeader
                                                icon={AlertCircle}
                                                title="Awaiting Response"
                                                count={awaiting.length}
                                                color="rgba(245, 158, 11, 0.5)"
                                                gradient={['rgba(245, 158, 11, 0.15)', 'rgba(251, 191, 36, 0.15)']}
                                                isMobile={isMobile}
                                            />
                                            {awaiting.length > 0 && (
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.2rem', marginBottom: '1rem' }}>
                                                    {awaiting.map(req => (
                                                        <RequestCard
                                                            key={req.id}
                                                            req={req}
                                                            type="sent"
                                                            isMobile={isMobile}
                                                            onCancel={handleCancelRequest}
                                                            fullSchedule={fullSchedule}
                                                            facultyList={facultyList}
                                                            loading={loading}
                                                        />
                                                    ))}
                                                </div>
                                            )}

                                            {/* Rejected/Cancelled Section */}
                                            <RequestSectionHeader
                                                icon={X}
                                                title="Declined / Cancelled"
                                                count={rejected.length}
                                                color="rgba(239, 68, 68, 0.5)"
                                                gradient={['rgba(239, 68, 68, 0.15)', 'rgba(220, 38, 38, 0.15)']}
                                                isMobile={isMobile}
                                            />
                                            {rejected.length > 0 && (
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.2rem' }}>
                                                    {rejected.map(req => (
                                                        <RequestCard
                                                            key={req.id}
                                                            req={req}
                                                            type="sent"
                                                            isMobile={isMobile}
                                                            onCancel={handleCancelRequest}
                                                            fullSchedule={fullSchedule}
                                                            facultyList={facultyList}
                                                            loading={loading}
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        )
                    ) : (
                        // HISTORY TAB CONTENT
                        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            {/* Status Filter Sub-tabs */}
                            <div className="mobile-scroll-tabs" style={{ display: 'flex', gap: '8px', padding: '1.2rem', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)', flexWrap: 'nowrap' }}>
                                {[
                                    { id: 'all', label: 'All', icon: <History size={14} />, color: '#94a3b8' },
                                    { id: 'approved', label: 'Confirmed', icon: <CheckCircle size={14} />, color: '#4ade80' },
                                    { id: 'awaiting', label: 'Awaiting', icon: <Clock size={14} />, color: '#f59e0b' },
                                    { id: 'declined', label: 'Declined', icon: <X size={14} />, color: '#f87171' },
                                    { id: 'rejected', label: 'Rejected', icon: <X size={14} />, color: '#ef4444' },
                                    { id: 'cancelled', label: 'Cancelled', icon: <X size={14} />, color: '#94a3b8' }
                                ].map(tab => {
                                    const count = allHistoryItems.filter(r => {
                                        if (tab.id === 'all') return true;
                                        if (tab.id === 'awaiting') return r.status === 'pending';
                                        if (tab.id === 'approved') return r.status === 'approved';
                                        if (tab.id === 'cancelled') return r.status === 'cancelled';
                                        const isOut = r.requesterId === userProfile.empId || (r.requesterName && r.requesterName.toLowerCase() === userProfile.name.toLowerCase());
                                        if (tab.id === 'declined') return r.status === 'rejected' && !isOut;
                                        if (tab.id === 'rejected') return r.status === 'rejected' && isOut;
                                        return r.status === tab.id;
                                    }).length;

                                    return (
                                        <button
                                            key={tab.id}
                                            onClick={() => setHistorySubTab(tab.id)}
                                            style={{
                                                padding: isMobile ? '4px 10px' : '6px 14px',
                                                borderRadius: '10px',
                                                fontSize: isMobile ? '0.7rem' : '0.8rem',
                                                fontWeight: '800',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                                border: historySubTab === tab.id ? `1px solid ${tab.color}` : '1px solid rgba(255,255,255,0.08)',
                                                background: historySubTab === tab.id ? `${tab.color}15` : 'rgba(255,255,255,0.03)',
                                                color: historySubTab === tab.id ? tab.color : '#94a3b8',
                                                cursor: 'pointer',
                                                letterSpacing: '0.5px'
                                            }}
                                        >
                                            {tab.icon} {tab.label.toUpperCase()}
                                            {count > 0 && (
                                                <span style={{ marginLeft: '4px', opacity: 0.6, fontSize: '0.7rem' }}>
                                                    ({count})
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {filteredHistoryItems.length === 0
                                ? (
                                    <EmptyState
                                        icon={historySubTab === 'all' ? History : (historySubTab === 'approved' ? CheckCircle : Clock)}
                                        text={historySubTab === 'all' ? "No history yet" : `No ${historySubTab} requests`}
                                        subtext={historySubTab === 'all' ? "Completed requests will appear here." : "Try choosing a different filter."}
                                    />
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? '280px' : '320px'}, 1fr))`, gap: '1.2rem', padding: isMobile ? '1rem' : '1.5rem' }}>
                                        {filteredHistoryItems.map(item => (
                                            <RequestCard
                                                key={item.id}
                                                req={item}
                                                type={item.requesterId === userProfile?.empId || item.requesterName === userProfile?.name ? 'sent' : 'received'}
                                                isMobile={isMobile}
                                                fullSchedule={fullSchedule}
                                                facultyList={facultyList}
                                                loading={loading}
                                            />
                                        ))}
                                    </div>
                                )}
                        </div>
                    )}
            </div>
        </div >
    );
};

// Helper Components
const RequestSectionHeader = ({ icon: Icon, title, count, color, gradient, isMobile }) => (
    count > 0 && (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: '1rem',
            marginTop: title !== 'Confirmed'
                ? (isMobile ? '1.5rem' : '2rem') : '0',
            padding: isMobile ? '0.6rem 1rem' : '0.8rem 1.2rem',
            background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
            borderRadius: '12px',
            border: `1px solid ${color}`,
            boxShadow: `0 4px 15px ${color}20`
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '12px', flex: 1 }}>
                <div style={{
                    width: isMobile ? '28px' : '32px',
                    height: isMobile ? '28px' : '32px',
                    borderRadius: '8px',
                    background: 'rgba(255,255,255,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white'
                }}>
                    <Icon size={isMobile ? 16 : 18} />
                </div>
                <div>
                    <div style={{ fontSize: isMobile ? '0.95rem' : '1.1rem', fontWeight: '800', color: 'white', letterSpacing: '0.5px' }}>
                        {title}
                    </div>
                    {!isMobile && (
                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', marginTop: '2px' }}>
                            {count} {count === 1 ? 'request' : 'requests'}
                        </div>
                    )}
                </div>
            </div>
            <div style={{
                background: 'rgba(255,255,255,0.2)',
                padding: isMobile ? '4px 10px' : '6px 14px',
                borderRadius: '20px',
                fontSize: isMobile ? '0.9rem' : '1.1rem',
                fontWeight: 'bold',
                color: 'white'
            }}>
                {count}
            </div>
        </div>
    )
);

const RequestCard = ({ req, type, isMobile, onAction, onCancel, fullSchedule, facultyList, loading }) => {
    const isSent = type === 'sent';
    const isReceived = type === 'received';

    const isActionRequired = isReceived && !req.targetResponse && req.status === 'pending';
    const isAccepted = req.targetResponse === 'accepted' || req.status === 'approved';
    const isDeclined = req.targetResponse === 'rejected' || req.status === 'rejected';
    const isCancelled = req.status === 'cancelled';
    const isPending = !req.targetResponse && req.status === 'pending';

    const m = fullSchedule?.find(i => i.id === req.originalScheduleId) || {};
    const reqName = (isSent ? (req.targetFacultyName || "") : (req.requesterName || "")).toLowerCase().trim();
    const f1 = (m.faculty || "").toLowerCase().trim();
    const f2 = (m.faculty2 || "").toLowerCase().trim();

    let coFaculty = null;
    if (m.faculty && m.faculty2) {
        const checkName = (isSent ? (req.requesterName || "") : (req.requesterName || "")).toLowerCase().trim();
        const checkId = req.requesterId;

        if (checkId === m.facultyEmpId || f1.includes(checkName) || checkName.includes(f1)) {
            coFaculty = { name: m.faculty2, type: 'Secondary' };
        } else if (checkId === m.faculty2EmpId || f2.includes(checkName) || checkName.includes(f2)) {
            coFaculty = { name: m.faculty, type: 'Primary' };
        }
    }

    let borderColor = 'rgba(245, 158, 11, 0.4)';
    let statusLabel = isSent ? "AWAITING RESPONSE" : "ACTION REQUIRED";
    let statusColor = "#f59e0b";

    if (req.isAdminAssigned) {
        borderColor = 'rgba(16, 185, 129, 0.4)';
        statusLabel = "OFFICIAL ASSIGNMENT";
        statusColor = "#4ade80";
    } else if (isAccepted) {
        borderColor = 'rgba(34, 197, 94, 0.5)';
        statusLabel = "CONFIRMED";
        statusColor = "#4ade80";
    } else if (isDeclined) {
        borderColor = 'rgba(239, 68, 68, 0.5)';
        statusLabel = "DECLINED";
        statusColor = "#f87171";
    } else if (isCancelled) {
        borderColor = 'rgba(255, 255, 255, 0.2)';
        statusLabel = "CANCELLED";
        statusColor = "#94a3b8";
    }

    return (
        <div className="glass-panel"
            style={{
                padding: '0',
                border: `2px solid ${borderColor}`,
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
                position: 'relative', overflow: 'hidden',
                background: 'rgba(30,30,30,0.6)',
                transition: 'transform 0.2s ease',
                display: 'flex',
                flexDirection: 'column'
            }}>

            {/* Status Stripe */}
            <div style={{
                background: isActionRequired ? 'linear-gradient(to right, #ef4444, #f87171)' :
                    isAccepted ? 'linear-gradient(to right, #22c55e, #16a34a)' :
                        isPending ? 'linear-gradient(to right, #f59e0b, #d97706)' :
                            'rgba(0,0,0,0.3)',
                padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'white', fontWeight: 'bold', fontSize: '0.8rem', letterSpacing: '0.5px'
            }}>
                {isActionRequired ? <AlertCircle size={14} /> : isAccepted ? <CheckCircle size={14} /> : isDeclined || isCancelled ? <X size={14} /> : <Clock size={14} />}
                {statusLabel}
            </div>

            <div style={{ padding: isMobile ? '1rem' : '1.2rem', flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.2rem', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: isMobile ? '8px' : '10px', alignItems: 'center' }}>
                        <div style={{
                            width: isMobile ? '32px' : '36px', height: isMobile ? '32px' : '36px', borderRadius: '50%',
                            background: req.isAdminAssigned ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'rgba(255,255,255,0.1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? '0.9rem' : '1rem', fontWeight: 'bold',
                            border: '1px solid rgba(255,255,255,0.1)', color: 'white'
                        }}>
                            {req.isAdminAssigned ? <ShieldAlert size={isMobile ? 16 : 18} color="white" /> : (isSent ? (req.targetFacultyName?.charAt(0) || "?") : (req.requesterName?.charAt(0) || "?"))}
                        </div>
                        <div>
                            <h4 style={{ margin: 0, fontSize: isMobile ? '0.9rem' : '1rem', color: 'white', fontWeight: 'bold' }}>
                                {isSent ? `To: ${req.targetFacultyName || "Unknown"}` : (req.requesterName || "Unknown")}
                            </h4>
                            <div style={{ color: '#94a3b8', fontSize: isMobile ? '0.7rem' : '0.75rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                {req.isAdminAssigned ? (isMobile ? 'Admin' : 'Official Assignment') : (isSent ? 'Sent coverage request' : 'Requests coverage')}

                                {coFaculty && (() => {
                                    const facultyData = facultyList?.find(f =>
                                        normalizeStr(f.name) === normalizeStr(coFaculty.name)
                                    );
                                    const label = isMobile ? (facultyData?.shortCode || coFaculty.name) : coFaculty.name;
                                    let gradientColors = 'linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #b45309 100%)';
                                    if (isAccepted) gradientColors = 'linear-gradient(135deg, #22c55e 0%, #16a34a 50%, #059669 100%)';
                                    else if (isDeclined) gradientColors = 'linear-gradient(135deg, #ef4444 0%, #dc2626 50%, #b91c1c 100%)';

                                    return (
                                        <span style={{
                                            fontSize: isMobile ? '0.6rem' : '0.7rem',
                                            background: gradientColors,
                                            color: '#ffffff',
                                            padding: isMobile ? '3px 7px' : '5px 10px',
                                            borderRadius: '8px',
                                            fontWeight: '800',
                                            border: '1.5px solid rgba(255, 255, 255, 0.3)',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            marginLeft: '4px'
                                        }}>
                                            <Users size={isMobile ? 9 : 10} strokeWidth={2.5} />
                                            {!isMobile && <span style={{ opacity: 0.85, fontSize: '0.65rem', fontWeight: '600' }}>with</span>}
                                            {label}
                                        </span>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                    {isSent && isPending && (
                        <button
                            onClick={() => onCancel(req.id)}
                            style={{
                                padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.3)',
                                background: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5', fontSize: '0.75rem', cursor: 'pointer',
                                fontWeight: 'bold'
                            }}
                        >
                            Cancel
                        </button>
                    )}
                </div>

                <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: isMobile ? '0.8rem' : '1rem', marginBottom: '1.2rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontSize: isMobile ? '1rem' : '1.05rem', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>
                        {req.scheduleDetails?.subject || "Subject N/A"}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Calendar size={13} color="#60a5fa" />
                            {isMobile ? new Date(req.date).toLocaleDateString('en-GB') : `${getDayName(req.date)}, ${new Date(req.date).toLocaleDateString('en-GB')}`}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={13} color="#f59e0b" /> {req.scheduleDetails?.time || "N/A"}
                        </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', alignItems: 'center', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8' }}>
                            <MapPin size={13} color="#60a5fa" /> {req.scheduleDetails?.room || "N/A"}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(96, 165, 250, 0.1)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', color: '#60a5fa', fontWeight: 'bold', border: '1px solid rgba(96, 165, 250, 0.2)', textTransform: 'uppercase' }}>
                            {req.scheduleDetails?.dept || "N/A"}-{req.scheduleDetails?.grp || "N/A"}
                            {req.scheduleDetails?.subgrp && req.scheduleDetails.subgrp.toLowerCase() !== 'all' && `-${req.scheduleDetails.subgrp}`}
                        </div>
                    </div>
                </div>

                {/* Reason for Absence (Received view only) */}
                {isReceived && req.reason && (
                    <div style={{
                        background: 'rgba(59, 130, 246, 0.08)',
                        border: '1px solid rgba(59, 130, 246, 0.2)',
                        borderRadius: '10px',
                        padding: '0.9rem',
                        marginBottom: '1.2rem'
                    }}>
                        <div style={{
                            fontSize: '0.7rem', color: '#60a5fa', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px',
                            marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px'
                        }}>
                            <MessageSquare size={12} /> Reason for Absence
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#e2e8f0', lineHeight: '1.5', fontStyle: 'italic' }}>
                            "{req.reason}"
                        </div>
                    </div>
                )}

                {/* Actions */}
                {isActionRequired ? (
                    <div style={{ display: 'flex', gap: '0.8rem', flexDirection: isMobile ? 'column' : 'row' }}>
                        <button
                            onClick={() => onAction(req.id, 'rejected')}
                            disabled={loading}
                            style={{ flex: 1, padding: isMobile ? '0.7rem' : '0.8rem', borderRadius: '10px', border: '1px solid rgba(239, 68, 68, 0.3)', background: 'transparent', color: '#fca5a5', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: isMobile ? '0.85rem' : '0.9rem' }}
                        >
                            <ThumbsDown size={isMobile ? 14 : 16} /> Decline
                        </button>
                        <button
                            onClick={() => onAction(req.id, 'accepted')}
                            disabled={loading}
                            style={{ flex: 1, padding: isMobile ? '0.7rem' : '0.8rem', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', color: 'white', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)', fontSize: isMobile ? '0.85rem' : '0.9rem' }}
                        >
                            <ThumbsUp size={isMobile ? 14 : 16} /> Accept
                        </button>
                    </div>
                ) : (
                    <div style={{
                        padding: '0.8rem', borderRadius: '10px',
                        background: isAccepted ? 'rgba(34, 197, 94, 0.1)' : isPending ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        color: isAccepted ? '#4ade80' : isPending ? '#fbbf24' : '#f87171',
                        textAlign: 'center', fontWeight: 'bold', fontSize: '0.85rem',
                        border: `1px solid ${isAccepted ? 'rgba(34, 197, 94, 0.2)' : isPending ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                            {isAccepted ? <CheckCircle size={14} /> : isPending ? <Clock size={14} /> : <X size={14} />}
                            {isSent
                                ? (isAccepted ? 'Request Accepted' : isPending ? 'Waiting for Response' : isCancelled ? 'You Cancelled' : 'Request Declined')
                                : (isAccepted ? 'You Accepted' : isPending ? 'Waiting for Action' : 'You Declined')
                            }
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const EmptyState = ({ icon, text, subtext }) => {
    const Icon = icon;
    const isMobile = window.innerWidth <= 768;
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: isMobile ? '3rem 1rem' : '5rem', color: '#64748b'
        }}>
            <div style={{
                width: isMobile ? '60px' : '80px', height: isMobile ? '60px' : '80px', borderRadius: '50%', background: 'rgba(255,255,255,0.03)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem',
                border: '1px solid rgba(255,255,255,0.05)'
            }}>
                <Icon size={isMobile ? 30 : 40} opacity={0.5} />
            </div>
            <h3 style={{ color: 'var(--color-text-muted)', fontWeight: 500, fontSize: isMobile ? '1.1rem' : '1.2rem', textAlign: 'center' }}>{text}</h3>
            <p style={{ fontSize: isMobile ? '0.8rem' : '0.9rem', opacity: 0.6, textAlign: 'center' }}>{subtext}</p>
        </div>
    );
};

const StatusBadge = ({ status, mini }) => {
    const isMobile = window.innerWidth <= 768;
    const styles = {
        pending: { bg: 'rgba(234, 179, 8, 0.1)', color: '#eab308', border: 'rgba(234, 179, 8, 0.2)', icon: Clock },
        approved: { bg: 'rgba(34, 197, 94, 0.1)', color: '#4ade80', border: 'rgba(34, 197, 94, 0.2)', icon: Check },
        rejected: { bg: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'rgba(239, 68, 68, 0.2)', icon: X },
        cancelled: { bg: 'rgba(255, 255, 255, 0.1)', color: '#94a3b8', border: 'rgba(255, 255, 255, 0.2)', icon: X },
        completed: { bg: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', border: 'rgba(148, 163, 184, 0.2)', icon: History }
    };
    const s = styles[status] || styles.pending;
    const Icon = s.icon;

    if (mini) {
        return (
            <span style={{
                color: s.color, fontWeight: '700', fontSize: isMobile ? '0.7rem' : '0.75rem',
                background: s.bg, padding: isMobile ? '1px 6px' : '2px 8px', borderRadius: '10px',
                height: 'fit-content', textTransform: 'uppercase'
            }}>
                {status}
            </span>
        );
    }

    return (
        <span style={{
            background: s.bg, color: s.color,
            padding: isMobile ? '4px 10px' : '6px 12px', borderRadius: '20px',
            fontSize: isMobile ? '0.75rem' : '0.85rem', fontWeight: '600', textTransform: 'capitalize',
            border: `1px solid ${s.border} `, display: 'inline-flex', alignItems: 'center', gap: '6px'
        }}>
            <Icon size={isMobile ? 12 : 14} />
            {status}
        </span>
    );
};

export default Substitutions;
