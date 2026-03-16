import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../lib/firebase';
import { collection, getDocs, getDoc, addDoc, setDoc, deleteDoc, doc, updateDoc, query, where, writeBatch, onSnapshot, FieldPath } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import ConfirmModal from '../components/ConfirmModal';
import '../styles/design-system.css';
import { Settings, Plus, Search, Edit2, Trash2, Check, ChevronDown, RefreshCw, ShieldAlert, Users, Layers, BookOpen, MapPin, Box, Calendar, Clock, Hash, CalendarOff, Eye } from 'lucide-react';
import QuantumLoader from '../components/QuantumLoader';
import toast from 'react-hot-toast';
import { useWritePermission } from '../hooks/useWritePermission';
import { normalizeStr, parseTimeToDate } from '../utils/timeUtils';
import { FacultyCard, DepartmentCard, SubjectCard, RoomCard, GroupCard, DayCard, TimeSlotCard, SemesterCard, HolidayCard } from '../components/MasterDataCards';

const GroupFields = ({ formData, setFormData }) => {
    const handleAddSubGroup = () => {
        const input = document.getElementById('subgroup-input');
        const val = input.value.trim();
        if (val) {
            const current = formData.subGroups || [];
            if (!current.includes(val)) {
                setFormData({ ...formData, subGroups: [...current, val] });
            }
            input.value = '';
        }
    };

    return (
        <>
            <input className="glass-input" placeholder="Group Name (e.g. Group A)" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>Sub-Groups</label>

                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <input
                        id="subgroup-input"
                        className="glass-input"
                        placeholder="Add Sub-Group (e.g. 1)"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddSubGroup();
                            }
                        }}
                    />
                    <button
                        type="button"
                        className="btn"
                        onClick={handleAddSubGroup}
                        style={{ padding: '0.5rem', background: 'var(--color-accent)' }}
                    >
                        <Plus size={18} />
                    </button>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {formData.subGroups && formData.subGroups.map((sg, idx) => (
                        <span key={idx} style={{
                            background: 'rgba(59, 130, 246, 0.2)',
                            color: '#93c5fd',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '0.85rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}>
                            {formData.name ? `${formData.name}-${sg}` : sg}
                            <button
                                type="button"
                                onClick={() => {
                                    const newGroups = formData.subGroups.filter((_, i) => i !== idx);
                                    setFormData({ ...formData, subGroups: newGroups });
                                }}
                                style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', padding: 0, display: 'flex' }}
                            >
                                <Trash2 size={12} />
                            </button>
                        </span>
                    ))}
                </div>
            </div>
        </>
    );
};

const MasterData = ({ initialTab }) => {
    const { userProfile } = useAuth();
    const { checkWritePermission } = useWritePermission();
    const [activeTab, setActiveTab] = useState(initialTab || 'faculty');
    const tabsRef = useRef(null);

    // Keep active tab visible using premium scroll behavior
    useEffect(() => {
        if (tabsRef.current) {
            const activeNode = tabsRef.current.querySelector(`[data-tab-id="${activeTab}"]`);
            if (activeNode) {
                activeNode.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        }
    }, [activeTab]);

    // Security Sync State
    const [syncStatus, setSyncStatus] = useState('');



    // eslint-disable-next-line sonarjs/cognitive-complexity
    const runSecuritySync = async () => {
        setSyncStatus('Starting Sync...');
        try {
            const usersSnap = await getDocs(collection(db, 'users'));
            if (usersSnap.empty) {
                setSyncStatus('No users found to sync.');
                return;
            }

            const BATCH_SIZE = 450; // Safety margin below 500
            let count = 0;
            let batch = writeBatch(db);
            let batchCount = 0;

            // 1. Sync Emp Lookups
            for (const userDoc of usersSnap.docs) {
                const userData = userDoc.data();
                if (userData.empId && userData.email) {
                    const lookupRef = doc(db, 'emp_lookups', userData.empId);
                    batch.set(lookupRef, {
                        email: userData.email,
                        uid: userDoc.id,
                        syncedAt: new Date().toISOString()
                    });
                    count++;
                    batchCount++;

                    // Check batch limit
                    if (batchCount >= BATCH_SIZE) {
                        await batch.commit();
                        batch = writeBatch(db);
                        batchCount = 0;
                    }
                }
            }

            // 2. FORCE SYNC PHOTOS (Fix for "Wrong Photos")
            // Iterate all FACTULTY and find matching USER to update photoURL
            const facultySnap = await getDocs(collection(db, 'faculty'));
            let photoCount = 0;

            let skippedCount = 0;
            let missingUidCount = 0;

            for (const facDoc of facultySnap.docs) {
                const facData = facDoc.data();
                if (facData.uid) {
                    const userDoc = usersSnap.docs.find(u => u.id === facData.uid);
                    if (userDoc) {
                        const userData = userDoc.data();
                        batch.update(doc(db, 'faculty', facDoc.id), {
                            photoURL: userData.photoURL || null,
                            email: userData.email || facData.email,
                            name: userData.name || facData.name
                        });
                        count++;
                        batchCount++;
                        photoCount++;

                        if (batchCount >= BATCH_SIZE) {
                            await batch.commit();
                            batch = writeBatch(db);
                            batchCount = 0;
                        }
                    } else {
                        skippedCount++; // UID exists but User not found (Deleted user?)
                    }
                } else {
                    missingUidCount++; // Faculty has no linked User
                }
            }

            if (batchCount > 0) {
                await batch.commit();
            }

            let msg = `Success! Synced ${count} records (${photoCount} photos).`;
            if (missingUidCount > 0) msg += ` Warning: ${missingUidCount} faculty have no linked User account.`;
            if (skippedCount > 0) msg += ` Warning: ${skippedCount} faculty linked to non-existent users.`;

            setSyncStatus(msg);

            // Auto revert tab after 3 seconds
            setTimeout(() => { setSyncStatus(''); setActiveTab('faculty'); }, 3000);

        } catch (err) {
            console.error("Sync Failed:", err);
            setSyncStatus(`Error: ${err.message}`);
        }
    };

    useEffect(() => {
        if (activeTab === 'security') {
            runSecuritySync();
        } else if (initialTab) {
            // Only set if not security
            // Removed strictly forced set to avoid loop, simple check is enough
        }
    }, [activeTab, initialTab]);

    useEffect(() => {
        if (initialTab && initialTab !== 'security') setActiveTab(initialTab);
    }, [initialTab]);
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({});
    const [editingId, setEditingId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [newYearInput, setNewYearInput] = useState('');
    const [newYearType, setNewYearType] = useState('ODD'); // New State

    const handleAddYear = async () => {
        // STRICT PERMISSION CHECK
        if (!checkWritePermission()) return;

        if (!newYearInput.trim()) return;

        // Combine Input + Type
        // Using Parentheses (ODD) instead of brackets [ODD] for cleaner UI and safer DB handling
        const combinedYear = `${newYearInput.trim()} (${newYearType})`;

        try {
            const configRef = doc(db, 'settings', 'config');
            const currentData = data.find(d => d.id === 'config') || {};
            const currentYears = currentData.academicYears || [];
            const currentConfigs = currentData.yearConfigs || {};

            if (currentYears.includes(combinedYear)) {
                toast.error('Academic Year already exists!');
                return;
            }

            const updatedYears = [...currentYears, combinedYear].sort().reverse();
            const yearKey = combinedYear;

            await setDoc(configRef, {
                academicYears: updatedYears,
                // Ensure we don't overwrite existing active year if it exists
                ...(currentData.activeAcademicYear ? {} : { activeAcademicYear: yearKey }),
                yearConfigs: {
                    ...currentConfigs,
                    [yearKey]: { maxFacultyLoad: 18 }
                }
            }, { merge: true });

            setNewYearInput('');
            // fetchData(); // Removed: Handled by listener
        } catch (e) {
            console.error("Error adding year:", e);
            alert("Failed to add academic year.");
        }
    };

    // Dependencies
    const [deptOptions, setDeptOptions] = useState([]);
    const [usersList, setUsersList] = useState([]);

    const isAdmin = userProfile && userProfile.role === 'admin';

    // Define Tabs and their corresponding Firestore collections
    const tabs = [
        { id: 'faculty', label: 'Faculty', icon: <Users size={18} />, collection: 'faculty' },
        { id: 'departments', label: 'Departments', icon: <Layers size={18} />, collection: 'departments' },
        { id: 'subjects', label: 'Subjects', icon: <BookOpen size={18} />, collection: 'subjects' },
        { id: 'rooms', label: 'Rooms', icon: <MapPin size={18} />, collection: 'rooms' },
        { id: 'groups', label: 'Groups', icon: <Box size={18} />, collection: 'groups' },
        { id: 'days', label: 'Days', icon: <Calendar size={18} />, collection: 'days' },
        { id: 'timeslots', label: 'Time Slots', icon: <Clock size={18} />, collection: 'timeslots' },
        { id: 'semesters', label: 'Semesters', icon: <Hash size={18} />, collection: 'semesters' },
        { id: 'holidays', label: 'Holidays', icon: <CalendarOff size={18} />, collection: 'settings' },
        { id: 'settings', label: 'Settings', icon: <Settings size={18} />, collection: 'settings' },
        // Security Sync (Hidden: Run once during migration)
        { id: 'security', label: 'Sync Security', icon: <RefreshCw size={18} />, collection: 'users', isAction: true },
    ];

    const activeCollection = tabs.find(t => t.id === activeTab)?.collection;

    // Clear search term when switching tabs
    useEffect(() => {
        setSearchTerm('');
    }, [activeTab]);

    // Real-Time Data Listener
    useEffect(() => {
        if (!activeCollection || !userProfile) return;
        setData([]); // Clear previous data to prevent ghosting
        setLoading(true);

        let unsubscribe = () => { };

        try {
            if (activeTab === 'settings') {
                const docRef = doc(db, 'settings', 'config');
                unsubscribe = onSnapshot(docRef,
                    (docSnap) => {
                        if (docSnap.exists()) {
                            setData([{ id: 'config', ...docSnap.data() }]);
                        }
                        setLoading(false);
                    },
                    (err) => {
                        console.error("Config listener error:", err);
                        toast.error(`Sync error: ${err.code}`);
                        setLoading(false);
                    }
                );
            } else if (activeTab === 'holidays') {
                const q = query(collection(db, 'settings'), where('type', '==', 'holiday'));
                unsubscribe = onSnapshot(q,
                    (snapshot) => {
                        const items = [];
                        snapshot.forEach((doc) => {
                            items.push({ id: doc.id, ...doc.data() });
                        });
                        items.sort((a, b) => new Date(a.date) - new Date(b.date));
                        setData(items);
                        setLoading(false);
                    },
                    (err) => {
                        console.error("Holidays listener error:", err);
                        toast.error(`Sync error: ${err.code}`);
                        setLoading(false);
                    }
                );
            } else {
                unsubscribe = onSnapshot(collection(db, activeCollection), (snapshot) => {
                    const items = [];
                    snapshot.forEach((doc) => {
                        items.push({ id: doc.id, ...doc.data() });
                    });

                    // Sort items logic (Client-side sort for now, cheap for Master Data)
                    if (activeCollection === 'days') {
                        items.sort((a, b) => a.order - b.order);
                    } else if (activeCollection === 'timeslots') {
                        items.sort((a, b) => {
                            const t1 = parseTimeToDate(a.startTime).getTime();
                            const t2 = parseTimeToDate(b.startTime).getTime();
                            return t1 - t2;
                        });
                        const naturalSort = (a, b) => {
                            // eslint-disable-next-line sonarjs/no-nested-functions
                            const splitAlphaNum = (str) => {
                                // eslint-disable-next-line sonarjs/slow-regex
                                const match = String(str).match(/^(\D*)(\d+)(.*)$/);
                                if (!match) return [String(str), 0, ''];
                                return [match[1], parseInt(match[2] || 0, 10), match[3]];
                            };
                            const [aPre, aNum, aSuf] = splitAlphaNum(a);
                            const [bPre, bNum, bSuf] = splitAlphaNum(b);
                            const preCmp = aPre.localeCompare(bPre);
                            if (preCmp !== 0) return preCmp;
                            if (aNum !== bNum) return aNum - bNum;
                            return aSuf.localeCompare(bSuf);
                        };
                        items.sort((a, b) => naturalSort(a.name || '', b.name || ''));
                    }

                    setData(items);
                    setLoading(false);
                    if (activeCollection === 'faculty') {
                        toast.success(`Debug: Found ${items.length} faculty entries in DB`);
                    }
                }, (error) => {
                    console.error("Error fetching data:", error);
                    toast.error(`Sync error: ${error.code}`);
                    setLoading(false);
                });
            }
        } catch (err) {
            console.error("Listener setup error:", err);
            setLoading(false);
        }

        return () => unsubscribe();
    }, [activeTab, activeCollection, userProfile]);

    const fetchDependencies = async () => {
        try {
            const [deptSnap, usersSnap] = await Promise.all([
                getDocs(collection(db, 'departments')),
                getDocs(collection(db, 'users'))
            ]);
            setDeptOptions(deptSnap.docs.map(d => d.data().name));
            setUsersList(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
            console.error("Error fetching dependencies:", e);
        }
    };

    useEffect(() => {
        if (isModalOpen) fetchDependencies();
    }, [isModalOpen]);

    const handleUpdateConfig = async (year, newLoad) => {
        // STRICT PERMISSION CHECK
        if (!checkWritePermission()) return;

        if (!newLoad || isNaN(newLoad)) {
            toast.error("Please enter a valid number for faculty load.");
            return;
        }
        try {
            const configRef = doc(db, 'settings', 'config');
            const currentData = data.find(d => d.id === 'config');
            if (!currentData) throw new Error("Config document not found in current view");
            const currentConfigs = currentData.yearConfigs || {};

            const updatedConfigs = { ...currentConfigs };
            updatedConfigs[year] = {
                ...(updatedConfigs[year] || {}),
                maxFacultyLoad: parseInt(newLoad)
            };

            // Best Practice: Use FieldPath to target specific nested key with special chars
            // This avoids overwriting other years (Race Conditions) and handles brackets []
            const targetPath = new FieldPath('yearConfigs', year);
            const newValue = {
                ...(updatedConfigs[year] || {}),
                maxFacultyLoad: parseInt(newLoad)
            };

            await updateDoc(configRef, targetPath, newValue);

            // fetchData(); // Removed: Handled by listener
        } catch (e) {
            console.error("Error updating config:", e);
            alert(`Failed to update settings: ${e.message}`);
        }
    };




    // Delete Confirmation State
    const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, id: null, type: 'item' });

    const confirmDelete = (id, e) => {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        setDeleteConfirm({ isOpen: true, id, type: 'item' });
    };

    const handleDeleteYear = (yearToDelete) => {
        // STRICT PERMISSION CHECK
        if (!checkWritePermission()) return;

        setDeleteConfirm({ isOpen: true, id: yearToDelete, type: 'year' });
    };

    const performDeleteYear = async (id) => {
        // STRICT PERMISSION CHECK
        if (!checkWritePermission()) return;

        const configRef = doc(db, 'settings', 'config');
        const currentData = data.find(d => d.id === 'config');
        if (!currentData) {
            alert("System Error: Config data invalid. Please refresh.");
            return;
        }
        const currentYears = currentData.academicYears || [];
        const currentConfigs = currentData.yearConfigs || {};

        // Integrity Check 1: Cannot delete the Active System Year
        if (id === currentData.activeAcademicYear) {
            alert("CRITICAL: Cannot delete the Active System Year. Change the active year in Settings first.");
            return;
        }

        // Integrity Check 2: Cannot delete the last remaining year
        if (currentYears.length <= 1) {
            alert("CRITICAL: Cannot delete the only remaining academic year. The system requires at least one year.");
            return;
        }

        // Integrity Check 3: Cannot delete a year that has existing Schedule Data
        const scheduleQ = query(collection(db, 'schedule'), where('academicYear', '==', id));
        const scheduleSnap = await getDocs(scheduleQ);
        if (!scheduleSnap.empty) {
            alert(`Cannot delete Academic Year "${id}". It contains ${scheduleSnap.size} schedule entries.\nPlease clear the schedule for this year first.`);
            return;
        }

        const updatedYears = currentYears.filter(y => y !== id);
        const updatedConfigs = { ...currentConfigs };
        delete updatedConfigs[id];

        await updateDoc(configRef, {
            academicYears: updatedYears,
            yearConfigs: updatedConfigs
        });
    };

    const getValidYears = async (db) => {
        try {
            const configSnap = await getDoc(doc(db, 'settings', 'config'));
            return configSnap.exists() ? (configSnap.data().academicYears || []) : [];
        } catch (e) {
            console.error("Config fetch error", e);
            return [];
        }
    };

    const checkDependencyUsage = async (field, value, itemName, validYears, db) => {
        const q = query(collection(db, 'schedule'), where(field, '==', value));
        const snap = await getDocs(q);

        if (snap.empty) return null;

        const activeConflicts = snap.docs.filter(d => validYears.includes(d.data().academicYear));
        const orphanedConflicts = snap.docs.filter(d => !validYears.includes(d.data().academicYear));

        if (activeConflicts.length > 0) {
            const uses = activeConflicts.slice(0, 3).map(d => `${d.data().day} ${d.data().time.substring(0, 5)} (${d.data().subject})`).join('\n- ');
            const more = activeConflicts.length > 3 ? `\n...and ${activeConflicts.length - 3} more.` : '';
            return `Cannot delete "${itemName}". It is currently assigned to ${activeConflicts.length} active class(es):\n- ${uses}${more}\n\nPlease remove these assignments first.`;
        }

        if (orphanedConflicts.length > 0) {
            const confirmPurge = window.confirm(
                `"${itemName}" is linked to ${orphanedConflicts.length} assignment(s) in DELETED Academic Years.\n` +
                `These are orphaned records.\n` +
                `Do you want to PERMANENTLY DELETE these orphaned assignments and proceed?`
            );
            if (confirmPurge) {
                const batch = writeBatch(db);
                orphanedConflicts.forEach(d => batch.delete(d.ref));
                await batch.commit();
                return null; // Cleared, safe to proceed
            } else {
                return "Deletion cancelled by user.";
            }
        }
        return null;
    };

    const checkFacultyUsage = async (item, validYears, db) => {
        let q1, q2;
        if (item.empId) {
            q1 = query(collection(db, 'schedule'), where('facultyEmpId', '==', item.empId));
            q2 = query(collection(db, 'schedule'), where('faculty2EmpId', '==', item.empId));
        } else {
            q1 = query(collection(db, 'schedule'), where('faculty', '==', item.name));
            q2 = query(collection(db, 'schedule'), where('faculty2', '==', item.name));
        }

        const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
        const allDocs = [...snap1.docs, ...snap2.docs];

        if (allDocs.length > 0) {
            const uniqueIds = new Set();
            const dedupedDocs = allDocs.filter(d => {
                if (uniqueIds.has(d.id)) return false;
                uniqueIds.add(d.id);
                return true;
            });

            const activeConflicts = dedupedDocs.filter(d => validYears.includes(d.data().academicYear));
            const orphanedConflicts = dedupedDocs.filter(d => !validYears.includes(d.data().academicYear));

            if (activeConflicts.length > 0) {
                const count = activeConflicts.length;
                const uses = activeConflicts.slice(0, 3).map(d => `${d.data().day} ${d.data().time.substring(0, 5)} (${d.data().subject})`).join('\n- ');
                const more = count > 3 ? `\n...and ${count - 3} more.` : '';
                return `Cannot delete Faculty "${item.name}". They are assigned to ${count} active class(es):\n- ${uses}${more}`;
            }

            if (orphanedConflicts.length > 0) {
                const confirmPurge = window.confirm(
                    `Faculty "${item.name}" is assigned to ${orphanedConflicts.length} older classes in deleted years.\n` +
                    `Do you want to FORCE DELETE them and the faculty member?`
                );
                if (confirmPurge) {
                    const batch = writeBatch(db);
                    orphanedConflicts.forEach(d => batch.delete(d.ref));
                    await batch.commit();
                    return null;
                } else {
                    return "Deletion cancelled by user.";
                }
            }
        }
        return null;
    };

    const checkDepartmentUsage = async (item, validYears, db) => {
        const identifiers = [];
        if (item.name) identifiers.push(item.name);
        if (item.code) identifiers.push(item.code);

        for (const id of identifiers) {
            // 1. Check Schedule
            const scheduleError = await checkDependencyUsage('dept', id, id, validYears, db);
            if (scheduleError) return scheduleError;

            // 2. Check Faculty (department and dept fields)
            const facQ = query(collection(db, 'faculty'), where('department', '==', id));
            const facSnap = await getDocs(facQ);
            if (!facSnap.empty) {
                return `Cannot delete Department "${id}". It has ${facSnap.size} faculty member(s) assigned.`;
            }
            const facQ2 = query(collection(db, 'faculty'), where('dept', '==', id));
            const facSnap2 = await getDocs(facQ2);
            if (!facSnap2.empty) return `Cannot delete Department "${id}". It has faculty assigned (legacy field).`;

            // 3. Check Users
            const userQ = query(collection(db, 'users'), where('dept', '==', id));
            const userSnap = await getDocs(userQ);
            if (!userSnap.empty) return `Cannot delete Department "${id}". It has assigned users.`;
        }

        return null;
    };

    // eslint-disable-next-line sonarjs/cognitive-complexity
    const performDeleteItem = async (id) => {
        if (!activeCollection) return;
        const item = data.find(d => d.id === id);
        if (!item) {
            alert("System Error: Could not find item details to verify safety. Please refresh the page and try again.");
            return;
        }

        const validYears = await getValidYears(db);
        let error = null;

        if (activeTab === 'faculty') {
            error = await checkFacultyUsage(item, validYears, db);
        } else if (activeTab === 'departments') {
            error = await checkDepartmentUsage(item, validYears, db);
        } else if (activeTab === 'subjects') {
            error = await checkDependencyUsage('subject', item.name, item.name, validYears, db);
        } else if (activeTab === 'rooms') {
            error = await checkDependencyUsage('room', item.name, item.name, validYears, db);
        } else if (activeTab === 'groups') {
            error = await checkDependencyUsage('section', item.name, item.name, validYears, db);
        } else if (activeTab === 'days') {
            error = await checkDependencyUsage('day', item.name, item.name, validYears, db);
        } else if (activeTab === 'timeslots') {
            // Updated Check: Robust Time Parsing
            const formatTimeRobust = (t) => {
                const d = parseTimeToDate(t);
                return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            };
            const start = formatTimeRobust(item.startTime);
            const end = formatTimeRobust(item.endTime);
            const timeStr = `${start} - ${end}`;
            error = await checkDependencyUsage('time', timeStr, item.label || timeStr, validYears, db);
        }

        if (error) {
            alert(error);
            return;
        }

        // CLEANUP: If deleting Faculty, remove secure lookup and unlink user
        if (activeTab === 'faculty') {
            const batch = writeBatch(db);
            batch.delete(doc(db, activeCollection, id)); // Delete Faculty Doc

            // 1. Delete Secure Lookup (if exists)
            if (item.empId) {
                batch.delete(doc(db, 'emp_lookups', item.empId));
            }

            // 2. Unlink User Profile (if linked)
            if (item.uid) {
                const userRef = doc(db, 'users', item.uid);
                // Safety Check: Verify User exists before unlinking
                const userSnap = await getDoc(userRef);
                if (userSnap.exists()) {
                    batch.update(userRef, {
                        empId: null,      // Remove ID
                        isFaculty: false, // Revoke status
                        dept: null        // clear dept linking
                    });
                }
            }

            await batch.commit();
        } else {
            // Standard Delete for other items
            await deleteDoc(doc(db, activeCollection, id));
        }
    };

    const executeDelete = async () => {
        const { id, type } = deleteConfirm;
        if (!id) return;

        // STRICT PERMISSION CHECK
        if (!checkWritePermission()) {
            setDeleteConfirm({ isOpen: false, id: null, type: 'item' });
            return;
        }

        setDeleteConfirm({ isOpen: false, id: null, type: 'item' });

        try {
            if (type === 'year') {
                await performDeleteYear(id);
            } else {
                await performDeleteItem(id);
            }
        } catch (error) {
            console.error("Error deleting:", error);
            alert(`Error deleting: ${error.message}`);
        }
    };

    const openModal = (item = null) => {
        setFormData(item || {});
        setEditingId(item ? item.id : null);
        setIsModalOpen(true);
    };

    const handleUserSelect = (userId) => {
        // Prevent linking a user who is ALREADY linked to another faculty profile
        // (unless it's the one we are currently editing)
        const existingLink = data.find(f => f.uid === userId && f.id !== editingId);
        if (existingLink) {
            alert(`Error: User is already linked to faculty profile "${existingLink.name}" (${existingLink.empId}).\nA user can only be linked to one faculty profile.`);
            return;
        }

        const selectedUser = usersList.find(u => u.id === userId);
        if (selectedUser) {
            setFormData({
                ...formData,
                uid: selectedUser.id, // Store linkage
                name: selectedUser.name || formData.name || '',
                email: selectedUser.email || formData.email || '',
                empId: selectedUser.empId || formData.empId || '',
                // Smart Feature: Generate Initials for Short Code (e.g. "John Doe" -> "JD")
                shortCode: selectedUser.name ? selectedUser.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 3) : (formData.shortCode || ''),
                photoURL: selectedUser.photoURL || formData.photoURL || '',
                // Preserve other fields
                department: formData.department || '',
                designation: formData.designation || '',
                phone: selectedUser.mobile || selectedUser.phone || formData.phone || '',
                whatsappEnabled: formData.whatsappEnabled !== undefined ? formData.whatsappEnabled : true
            });
        } else {
            // Handle unselection
            setFormData(prev => ({ ...prev, uid: null }));
        }
    };

    // Helper to format time for comparison/update
    const formatTimeForSchedule = (time) => {
        if (!time) return '';
        const d = parseTimeToDate(time);
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    };

    // --- Cascade Update Helpers ---
    const handleTimeSlotCascade = async (oldData, newData, db, addToBatch, formatTimeForSchedule) => {
        // Helper to generate format variants (e.g. "9:00 AM" and "09:00 AM")
        const getFormatVariants = (tStr) => {
            const t = formatTimeForSchedule(tStr); // "9:00 AM"
            const parts = t.split(' '); // ["9:00", "AM"]
            const [h, m] = parts[0].split(':');

            const variant1 = `${parseInt(h)}:${m} ${parts[1]}`; // "9:00 AM"
            const variant2 = `${h.padStart(2, '0')}:${m} ${parts[1]}`; // "09:00 AM"

            const set = new Set([variant1, variant2]);
            return Array.from(set);
        };

        const oldStartVariants = getFormatVariants(oldData.startTime);
        const oldEndVariants = getFormatVariants(oldData.endTime);
        const newTimeStr = `${formatTimeForSchedule(newData.startTime)} - ${formatTimeForSchedule(newData.endTime)}`;

        // Construct all possible "Old Time Strings" that might exist in DB
        const queries = [];
        oldStartVariants.forEach(s => {
            oldEndVariants.forEach(e => {
                queries.push(`${s} - ${e}`);
            });
        });

        const uniqueOldStrings = [...new Set(queries)];

        for (const oldStr of uniqueOldStrings) {
            if (oldStr === newTimeStr) continue; // Skip if no change for this exact formatting

            console.log(`Cascade: Checking for assignments with time "${oldStr}" -> "${newTimeStr}"`);
            const q = query(collection(db, 'schedule'), where('time', '==', oldStr));
            const snap = await getDocs(q);

            if (!snap.empty) {
                console.log(`Found ${snap.size} docs to update from "${oldStr}"`);
                for (const doc of snap.docs) {
                    await addToBatch(doc.ref, { time: newTimeStr });
                }
            }
        }
    };

    const handleFacultySecuritySync = async (oldData = {}, newData, db, addToBatch) => {
        // AUTOMATIC SECURITY SYNC: Handle emp_lookups updates immediately

        // 1. Update/Create New Lookup (Priority)
        if (newData.uid && newData.email && newData.empId) {
            await addToBatch(doc(db, 'emp_lookups', newData.empId), {
                uid: newData.uid,
                email: newData.email,
                syncedAt: new Date().toISOString(),
                source: 'auto-sync'
            }, 'set');
        }

        // 2. Cleanup Old Lookup
        if (oldData.empId) {
            // Case A: ID Changed -> Delete Old ID
            if (oldData.empId !== newData.empId) {
                await addToBatch(doc(db, 'emp_lookups', oldData.empId), null, 'delete');
            }
            // Case B: User Unlinked (UID removed) -> Delete Old ID (even if ID string is same)
            // eslint-disable-next-line sonarjs/no-duplicated-branches
            else if (oldData.uid && !newData.uid) {
                await addToBatch(doc(db, 'emp_lookups', oldData.empId), null, 'delete');
            }
        }
    };

    // eslint-disable-next-line sonarjs/cognitive-complexity
    const handleFacultyCascade = async (oldData, newData, db, addToBatch) => {
        if (oldData.name !== newData.name || oldData.empId !== newData.empId) {
            // Update: Prioritize ID search to find old records
            let q1, q2;
            if (oldData.empId) {
                q1 = query(collection(db, 'schedule'), where('facultyEmpId', '==', oldData.empId));
                q2 = query(collection(db, 'schedule'), where('faculty2EmpId', '==', oldData.empId));
            } else {
                q1 = query(collection(db, 'schedule'), where('faculty', '==', oldData.name));
                q2 = query(collection(db, 'schedule'), where('faculty2', '==', oldData.name));
            }

            // Update faculty 1 & 2 (Smart Merge to prevent batch collision)
            const snap1 = await getDocs(q1);
            const snap2 = await getDocs(q2);

            const updates = new Map(); // Map<DocId, { ref, data }>

            // Process Snap 1 (Faculty 1 slot)
            snap1.docs.forEach(doc => {
                updates.set(doc.id, {
                    ref: doc.ref,
                    data: {
                        faculty: newData.name,
                        facultyEmpId: newData.empId || null
                    }
                });
            });

            // Process Snap 2 (Faculty 2 slot) - Merge if exists
            snap2.docs.forEach(doc => {
                const existing = updates.get(doc.id);
                const updateData = {
                    faculty2: newData.name,
                    faculty2EmpId: newData.empId || null
                };

                if (existing) {
                    // Merge updates
                    existing.data = { ...existing.data, ...updateData };
                } else {
                    updates.set(doc.id, {
                        ref: doc.ref,
                        data: updateData
                    });
                }
            });

            // Apply Aggregated Updates
            for (const update of updates.values()) {
                await addToBatch(update.ref, update.data);
            }
        }

        // 3. Handle User Profile Linkage (Switching Users / Updating Details)
        // Check if UID changed OR critical details changed
        const uidChanged = oldData.uid !== newData.uid;
        const dataChanged = oldData.name !== newData.name || oldData.empId !== newData.empId || oldData.department !== newData.department || oldData.dept !== newData.dept;

        if (uidChanged || (newData.uid && dataChanged)) {
            // A. Downgrade OLD User (if they exist and are being replaced/removed)
            if (oldData.uid && uidChanged) {
                const oldUserRef = doc(db, 'users', oldData.uid);
                // Safety Check: Verify User exists before updating
                const oldUserSnap = await getDoc(oldUserRef);
                if (oldUserSnap.exists()) {
                    await addToBatch(oldUserRef, {
                        empId: null,
                        isFaculty: false,
                        dept: null
                    }, 'update');
                }
            }

            // B. Upgrade/Update NEW User
            if (newData.uid) {
                const newUserRef = doc(db, 'users', newData.uid);
                // Safety Check: Verify User exists (should exist as selected from list, but good practice)
                const newUserSnap = await getDoc(newUserRef);
                if (newUserSnap.exists()) {
                    await addToBatch(newUserRef, {
                        empId: newData.empId,
                        name: newData.name,
                        isFaculty: true,
                        dept: newData.department || newData.dept
                    }, 'update');
                }
            }
        }

        await handleFacultySecuritySync(oldData, newData, db, addToBatch);
    };

    // eslint-disable-next-line sonarjs/cognitive-complexity
    const handleStandardCascade = async (collectionName, oldData, newData, db, addToBatch) => {
        // Helper for Cascade Updates
        const updateScheduleRef = async (field, oldVal, newVal) => {
            if (oldVal !== newVal) {
                const q = query(collection(db, 'schedule'), where(field, '==', oldVal));
                const snap = await getDocs(q);
                for (const d of snap.docs) {
                    await addToBatch(d.ref, { [field]: newVal });
                }
            }
        };

        if (collectionName === 'subjects') {
            await updateScheduleRef('subject', oldData.name, newData.name);
        } else if (collectionName === 'rooms') {
            await updateScheduleRef('room', oldData.name, newData.name);
        } else if (collectionName === 'departments') {
            // CASCADE NAME CHANGE
            const processedScheduleIds = new Set();
            const processedUserIds = new Set();

            if (oldData.name !== newData.name) {
                // Update Schedule
                const q = query(collection(db, 'schedule'), where('dept', '==', oldData.name));
                const snap = await getDocs(q);
                for (const d of snap.docs) {
                    await addToBatch(d.ref, { dept: newData.name });
                    processedScheduleIds.add(d.id);
                }

                // Users
                const userQ = query(collection(db, 'users'), where('dept', '==', oldData.name));
                const userSnap = await getDocs(userQ);
                userSnap.forEach(u => {
                    addToBatch(u.ref, { dept: newData.name });
                    processedUserIds.add(u.id);
                });

                // Faculty
                const facQ = query(collection(db, 'faculty'), where('department', '==', oldData.name));
                const facSnap = await getDocs(facQ);
                facSnap.forEach(f => addToBatch(f.ref, { department: newData.name }));
            }

            // CASCADE CODE CHANGE
            if (oldData.code && newData.code && oldData.code !== newData.code) {
                // Update Schedule (Skip if already processed)
                const q = query(collection(db, 'schedule'), where('dept', '==', oldData.code));
                const snap = await getDocs(q);
                for (const d of snap.docs) {
                    if (!processedScheduleIds.has(d.id)) {
                        await addToBatch(d.ref, { dept: newData.code });
                    }
                }

                // Users (checking code usage)
                const userQ = query(collection(db, 'users'), where('dept', '==', oldData.code));
                const userSnap = await getDocs(userQ);
                userSnap.forEach(u => {
                    if (!processedUserIds.has(u.id)) {
                        addToBatch(u.ref, { dept: newData.code });
                    }
                });
            }
        } else if (collectionName === 'semesters') {
            await updateScheduleRef('sem', oldData.name, newData.name);
        } else if (collectionName === 'groups') {
            // Groups map to 'section' in schedule (Legacy mapping)
            await updateScheduleRef('section', oldData.name, newData.name);
        } else if (collectionName === 'days') {
            await updateScheduleRef('day', oldData.name, newData.name);
        }
    };
    const handleCascadeUpdate = async (collectionName, oldData, newData) => {
        let batch = writeBatch(db);
        let updateCount = 0;
        let batchOpCount = 0;
        const BATCH_LIMIT = 450;

        const commitAndReset = async () => {
            if (batchOpCount > 0) {
                await batch.commit();
                batch = writeBatch(db);
                batchOpCount = 0;
            }
        };

        const addToBatch = async (ref, data, type = 'update') => {
            if (type === 'update') batch.update(ref, data);
            else if (type === 'set') batch.set(ref, data);
            else if (type === 'delete') batch.delete(ref);

            updateCount++;
            batchOpCount++;

            if (batchOpCount >= BATCH_LIMIT) {
                await commitAndReset();
            }
        };

        try {
            if (collectionName === 'timeslots') {
                await handleTimeSlotCascade(oldData, newData, db, addToBatch, formatTimeForSchedule);
            } else if (collectionName === 'faculty') {
                await handleFacultyCascade(oldData, newData, db, addToBatch);
            } else {
                await handleStandardCascade(collectionName, oldData, newData, db, addToBatch);
            }

            // Final commit if anything is pending
            await commitAndReset();

            if (updateCount > 0) {
                toast.success(`Cascade Update: Synced ${updateCount} records.`);
            }
        } catch (err) {
            console.error("Cascade Update Failed:", err);
            toast.error("Warning: Some related records might not have synced.");
        }
    };



    // eslint-disable-next-line sonarjs/cognitive-complexity
    const handleSave = async (e) => {
        e.preventDefault();

        // STRICT PERMISSION CHECK
        if (!checkWritePermission()) return;

        if (!activeCollection) {
            alert("Error: No active collection selected.");
            return;
        }

        // DUPLICATE CHECK (Smart AI Feature)
        // Prevent creating duplicate entries which confuse the schedule.
        // We use a JIT getDocs query to verify uniqueness before writing.
        try {
            let uniqueField = 'name';
            let formattedValue = formData.name;

            if (activeTab === 'departments' || activeTab === 'subjects') {
                uniqueField = 'code'; // Depts and Subjects are unique by Code
                formattedValue = formData.code;
            } else if (activeTab === 'faculty') {
                uniqueField = 'empId'; // Check duplicate Emp ID
                formattedValue = formData.empId;
            }

            if (formattedValue) {
                const dupQ = query(
                    collection(db, activeCollection),
                    where(uniqueField, '==', formattedValue)
                );
                const dupSnap = await getDocs(dupQ);

                // If found AND it's not the one we are currently editing
                const isDuplicate = dupSnap.docs.some(d => d.id !== editingId);

                if (isDuplicate) {
                    alert(`Duplicate Error: An item with ${uniqueField} "${formattedValue}" already exists.`);
                    return;
                }
            }

            // EXTRA CHECK: If Faculty, ensure UID is unique too (One User -> One Faculty Profile)
            if (activeTab === 'faculty' && formData.uid) {
                const uidQ = query(
                    collection(db, 'faculty'),
                    where('uid', '==', formData.uid)
                );
                const uidSnap = await getDocs(uidQ);
                const isUidDuplicate = uidSnap.docs.some(d => d.id !== editingId);

                if (isUidDuplicate) {
                    alert(`Duplicate Error: The selected User is already linked to another Faculty profile.`);
                    return;
                }
            }
        } catch (e) {
            console.warn("Duplicate check warning:", e);
            // Proceed with caution if check fails? No, safest to warn but maybe allow if it's just a permission issue?
            // For now, we assume admin has read access.
        }

        try {
            if (editingId) {
                // Perform cascade update if needed
                const originalItem = data.find(i => i.id === editingId);
                if (originalItem) {
                    await handleCascadeUpdate(activeCollection, originalItem, formData);
                }

                await updateDoc(doc(db, activeCollection, editingId), formData);

                // FORCE SYNC: Ensure User Profile is always up to date when editing Faculty
                if (activeCollection === 'faculty' && formData.uid) {
                    try {
                        const userRef = doc(db, 'users', formData.uid);
                        // Passive update: Check if exists first
                        const userSnap = await getDoc(userRef);
                        if (userSnap.exists()) {
                            await updateDoc(userRef, {
                                empId: formData.empId || null,
                                isFaculty: true,
                                dept: formData.department || formData.dept || null
                            });
                        }
                    } catch (uErr) {
                        console.warn("User Profile Sync Skipped:", uErr);
                        // Do not fail the faculty save, just warn
                        toast.error("Warning: Linked User Profile could not be updated.");
                    }
                }
            } else {
                let dataToSave = { ...formData };
                if (activeTab === 'holidays') {
                    dataToSave.type = 'holiday';
                }
                await addDoc(collection(db, activeCollection), dataToSave);

                // AUTOMATIC SECURITY SYNC: Handle New Faculty
                if (activeCollection === 'faculty' && formData.uid) {
                    try {
                        const batch = writeBatch(db);

                        // 1. Upgrade User Profile (Must happen if UID is linked)
                        const userRef = doc(db, 'users', formData.uid);
                        const userSnap = await getDoc(userRef);
                        if (userSnap.exists()) {
                            batch.update(userRef, {
                                isFaculty: true,
                                empId: formData.empId || null,
                                dept: formData.department || formData.dept || null
                            });
                        }

                        // 2. Secure Lookup (Only if we have all data)
                        if (formData.empId && formData.email) {
                            batch.set(doc(db, 'emp_lookups', formData.empId), {
                                uid: formData.uid,
                                email: formData.email,
                                syncedAt: new Date().toISOString(),
                                source: 'auto-sync-create'
                            });
                        }

                        await batch.commit();
                    } catch (syncErr) {
                        console.error("Auto-sync failed:", syncErr);
                        toast.error("Warning: Linked User Profile sync failed.");
                    }
                }
            }
            setIsModalOpen(false);
            setFormData({});
            setEditingId(null);
            // fetchData(); // Removed: Handled by listener
        } catch (error) {
            console.error("Error saving document: ", error);
            alert(`Failed to save: ${error.message}`);
        }
    };

    const filteredData = data.filter(item =>
        Object.values(item).some(val =>
            normalizeStr(String(val)).includes(normalizeStr(searchTerm))
        )
    );

    // --- Render Helpers ---

    const renderCardContent = (item) => {
        const CARD_COMPONENTS = {
            faculty: FacultyCard,
            departments: DepartmentCard,
            subjects: SubjectCard,
            rooms: RoomCard,
            groups: GroupCard,
            days: DayCard,
            timeslots: TimeSlotCard,
            semesters: SemesterCard,
            holidays: HolidayCard
        };

        const Component = CARD_COMPONENTS[activeTab];
        return Component ? <Component item={item} /> : <div>{JSON.stringify(item)}</div>;
    };

    const renderFormFields = () => {
        switch (activeTab) {
            case 'faculty':
                return (
                    <>
                        <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)', marginBottom: '0.5rem' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: '#93c5fd', marginBottom: '0.5rem' }}>Link Registered User (Syncs Data)</label>
                            <select
                                className="glass-input"
                                value={formData.uid || ''}
                                onChange={(e) => handleUserSelect(e.target.value)}
                                style={{ background: 'rgba(0, 0, 0, 0.3)', color: 'white' }}
                            >
                                <option value="" style={{ background: '#1e293b', color: 'white' }}>Select User to Link...</option>
                                {usersList.map(u => (
                                    <option key={u.id} value={u.id} style={{ background: '#1e293b', color: 'white' }}>
                                        {u.name} ({u.empId || u.email || 'No ID'})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <input className="glass-input" placeholder="Full Name" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                        {/* Hidden field to store profile picture URL */}
                        {formData.photoURL && <input type="hidden" value={formData.photoURL} />}
                        <input className="glass-input" placeholder="Employee ID (Optional / Temp)" value={formData.empId || ''} onChange={e => setFormData({ ...formData, empId: e.target.value })} />
                        <input className="glass-input" placeholder="Short Code (e.g. PLM)" value={formData.shortCode || ''} onChange={e => setFormData({ ...formData, shortCode: e.target.value })} />
                        <input className="glass-input" placeholder="Email" type="email" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                        <select className="glass-input" value={formData.department || ''} onChange={e => setFormData({ ...formData, department: e.target.value })}>
                            <option value="" style={{ background: '#1e293b', color: 'white' }}>Select Department</option>
                            {deptOptions.map(d => <option key={d} value={d} style={{ background: '#1e293b', color: 'white' }}>{d}</option>)}
                        </select>
                        <input className="glass-input" placeholder="Designation" value={formData.designation || ''} onChange={e => setFormData({ ...formData, designation: e.target.value })} />
                        <input className="glass-input" placeholder="Phone Number (10 digits)" type="tel" value={formData.phone || ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white', marginTop: '0.5rem' }}>
                            <input
                                type="checkbox"
                                checked={formData.whatsappEnabled !== false}
                                onChange={e => setFormData({ ...formData, whatsappEnabled: e.target.checked })}
                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                            />
                            <label>Enable WhatsApp Notifications</label>
                        </div>
                    </>
                );
            case 'departments':
                return (
                    <>
                        <input className="glass-input" placeholder="Department Name" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                        <input className="glass-input" placeholder="Code (e.g. CSE)" value={formData.code || ''} onChange={e => setFormData({ ...formData, code: e.target.value })} required />
                    </>
                );
            case 'subjects':
                return (
                    <>
                        <input className="glass-input" placeholder="Subject Code" value={formData.code || ''} onChange={e => setFormData({ ...formData, code: e.target.value })} />
                        <input className="glass-input" placeholder="Short Code (e.g. DS)" value={formData.shortCode || ''} onChange={e => setFormData({ ...formData, shortCode: e.target.value })} />
                        <input className="glass-input" placeholder="Subject Name" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                        <select className="glass-input" value={formData.type || 'theory'} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                            <option value="theory" style={{ background: '#1e293b', color: 'white' }}>Theory</option>
                            <option value="lab" style={{ background: '#1e293b', color: 'white' }}>Lab</option>
                        </select>
                    </>
                );
            case 'rooms':
                return (
                    <>
                        <input className="glass-input" placeholder="Room Name" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                        <input className="glass-input" placeholder="Capacity" type="number" value={formData.capacity || ''} onChange={e => setFormData({ ...formData, capacity: e.target.value })} />
                        <select className="glass-input" value={formData.type || 'lab'} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                            <option value="lab" style={{ background: '#1e293b', color: 'white' }}>Lab</option>
                            <option value="lecture" style={{ background: '#1e293b', color: 'white' }}>Lecture Hall</option>
                            <option value="seminar" style={{ background: '#1e293b', color: 'white' }}>Seminar Hall</option>
                        </select>
                    </>
                );
            case 'groups':
                return (
                    <GroupFields formData={formData} setFormData={setFormData} />
                );
            case 'days':
                return (
                    <>
                        <input className="glass-input" placeholder="Day Name (e.g. Monday)" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                        <input className="glass-input" type="number" placeholder="Order (1 for Monday, 7 for Sunday)" value={formData.order || ''} onChange={e => setFormData({ ...formData, order: parseInt(e.target.value) })} required />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white' }}>
                            <input
                                type="checkbox"
                                checked={formData.isVisible !== false}
                                onChange={e => setFormData({ ...formData, isVisible: e.target.checked })}
                                style={{ width: '18px', height: '18px' }}
                            />
                            <label>Visible in Schedule</label>
                        </div>
                    </>
                );
            case 'timeslots':
                return (
                    <>
                        <input className="glass-input" placeholder="Label" value={formData.label || ''} onChange={e => setFormData({ ...formData, label: e.target.value })} required />
                        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                            {/* Start Time Picker */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Start Time</label>
                                <div style={{ display: 'flex', gap: '5px' }}>
                                    <select
                                        className="glass-input"
                                        style={{ padding: '0.5rem', minWidth: '60px' }}
                                        value={(() => {
                                            const h = parseInt((formData.startTime || '09:00').split(':')[0]);
                                            return h % 12 || 12;
                                        })()}
                                        onChange={e => {
                                            const currentH = parseInt((formData.startTime || '09:00').split(':')[0]);
                                            const currentM = (formData.startTime || '09:00').split(':')[1];
                                            const isPM = currentH >= 12;
                                            let newH = parseInt(e.target.value);
                                            if (isPM && newH < 12) newH += 12;
                                            if (!isPM && newH === 12) newH = 0;
                                            setFormData({ ...formData, startTime: `${newH.toString().padStart(2, '0')}:${currentM.padStart(2, '0')}` });
                                        }}
                                    >
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(x => <option key={x} value={x} style={{ background: '#1e293b' }}>{x}</option>)}
                                    </select>
                                    <select
                                        className="glass-input"
                                        style={{ padding: '0.5rem', minWidth: '60px' }}
                                        value={(formData.startTime || '09:00').split(':')[1]}
                                        onChange={e => {
                                            const currentH = (formData.startTime || '09:00').split(':')[0];
                                            setFormData({ ...formData, startTime: `${currentH.padStart(2, '0')}:${e.target.value}` });
                                        }}
                                    >
                                        {['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].map(x => <option key={x} value={x} style={{ background: '#1e293b' }}>{x}</option>)}
                                    </select>
                                    <select
                                        className="glass-input"
                                        style={{ padding: '0.5rem', minWidth: '70px' }}
                                        value={parseInt((formData.startTime || '09:00').split(':')[0]) >= 12 ? 'PM' : 'AM'}
                                        onChange={e => {
                                            let h = parseInt((formData.startTime || '09:00').split(':')[0]);
                                            const m = (formData.startTime || '09:00').split(':')[1];
                                            if (e.target.value === 'PM' && h < 12) h += 12;
                                            if (e.target.value === 'AM' && h >= 12) h -= 12;
                                            setFormData({ ...formData, startTime: `${h.toString().padStart(2, '0')}:${m}` });
                                        }}
                                    >
                                        <option value="AM" style={{ background: '#1e293b' }}>AM</option>
                                        <option value="PM" style={{ background: '#1e293b' }}>PM</option>
                                    </select>
                                </div>
                            </div>

                            {/* End Time Picker */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>End Time</label>
                                <div style={{ display: 'flex', gap: '5px' }}>
                                    <select
                                        className="glass-input"
                                        style={{ padding: '0.5rem', minWidth: '60px' }}
                                        value={(() => {
                                            const h = parseInt((formData.endTime || '10:00').split(':')[0]);
                                            return h % 12 || 12;
                                        })()}
                                        onChange={e => {
                                            const currentH = parseInt((formData.endTime || '10:00').split(':')[0]);
                                            const currentM = (formData.endTime || '10:00').split(':')[1];
                                            const isPM = currentH >= 12;
                                            let newH = parseInt(e.target.value);
                                            if (isPM && newH < 12) newH += 12;
                                            if (!isPM && newH === 12) newH = 0;
                                            setFormData({ ...formData, endTime: `${newH.toString().padStart(2, '0')}:${currentM.padStart(2, '0')}` });
                                        }}
                                    >
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(x => <option key={x} value={x} style={{ background: '#1e293b' }}>{x}</option>)}
                                    </select>
                                    <select
                                        className="glass-input"
                                        style={{ padding: '0.5rem', minWidth: '60px' }}
                                        value={(formData.endTime || '10:00').split(':')[1]}
                                        onChange={e => {
                                            const currentH = (formData.endTime || '10:00').split(':')[0];
                                            setFormData({ ...formData, endTime: `${currentH.padStart(2, '0')}:${e.target.value}` });
                                        }}
                                    >
                                        {['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].map(x => <option key={x} value={x} style={{ background: '#1e293b' }}>{x}</option>)}
                                    </select>
                                    <select
                                        className="glass-input"
                                        style={{ padding: '0.5rem', minWidth: '70px' }}
                                        value={parseInt((formData.endTime || '10:00').split(':')[0]) >= 12 ? 'PM' : 'AM'}
                                        onChange={e => {
                                            let h = parseInt((formData.endTime || '10:00').split(':')[0]);
                                            const m = (formData.endTime || '10:00').split(':')[1];
                                            if (e.target.value === 'PM' && h < 12) h += 12;
                                            if (e.target.value === 'AM' && h >= 12) h -= 12;
                                            setFormData({ ...formData, endTime: `${h.toString().padStart(2, '0')}:${m}` });
                                        }}
                                    >
                                        <option value="AM" style={{ background: '#1e293b' }}>AM</option>
                                        <option value="PM" style={{ background: '#1e293b' }}>PM</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </>
                );
            case 'semesters':
                return (
                    <>
                        <input className="glass-input" placeholder="Semester Name (e.g. 3rd Sem)" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                        <input className="glass-input" type="number" placeholder="Semester Number (e.g. 3)" value={formData.number || ''} onChange={e => setFormData({ ...formData, number: parseInt(e.target.value) })} required />
                    </>
                );
            case 'holidays':
                return (
                    <>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: '#93c5fd', marginBottom: '0.5rem' }}>Select Date</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                className="glass-input"
                                type="text"
                                placeholder="DD/MM/YYYY"
                                value={formData.date ? new Date(formData.date).toLocaleDateString('en-GB') : ''}
                                readOnly
                            />
                            <input
                                type="date"
                                style={{
                                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                                    opacity: 0, cursor: 'pointer', border: 'none'
                                }}
                                value={formData.date || ''}
                                onChange={e => setFormData({ ...formData, date: e.target.value })}
                                onClick={(e) => {
                                    try {
                                        if (e.target.showPicker) e.target.showPicker();
                                    } catch {
                                        // Fallback if showPicker is not supported or allowed
                                    }
                                }}
                                required
                            />
                            <Calendar size={18} style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--color-text-muted)' }} />
                        </div>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: '#93c5fd', marginBottom: '0.5rem', marginTop: '1rem' }}>Holiday Name</label>
                        <input className="glass-input" placeholder="e.g. Christmas" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                    </>
                );
            default: return null;
        }
    };

    if (loading) return <QuantumLoader />;

    if (userProfile && userProfile.role !== 'admin') {
        return (
            <div className="flex flex-col items-center justify-center p-12 glass-panel text-center">
                <ShieldAlert size={64} className="text-red-400 mb-4 animate-pulse" />
                <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
                <p className="text-gray-400 max-w-md">
                    You do not have the required permissions to access Master Data management.
                    Please contact an administrator if you believe this is an error.
                </p>
                <button
                    onClick={() => window.history.back()}
                    className="mt-8 btn-primary"
                >
                    <ChevronDown className="rotate-90 mr-2" size={18} />
                    Go Back
                </button>
            </div>
        );
    }

    return (
        <div className="animate-fade-in" style={{ paddingBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h2 style={{
                        fontSize: '2.5rem', fontWeight: '800', margin: 0,
                        background: 'linear-gradient(to right, #fff, #94a3b8)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        letterSpacing: '-1px'
                    }}>
                        Master Data
                    </h2>
                    <p style={{ color: 'var(--color-text-muted)', margin: '0.5rem 0 0 0', fontSize: '1.1rem' }}>
                        Configure your academic resources
                    </p>
                </div>

                {isAdmin && activeTab !== 'settings' && (
                    <button
                        onClick={() => openModal()}
                        style={{
                            padding: '0.75rem 1.5rem',
                            background: 'linear-gradient(135deg, var(--color-accent) 0%, #2563eb 100%)',
                            border: 'none', borderRadius: '12px', color: 'white',
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            cursor: 'pointer', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                            fontWeight: 600, transition: 'all 0.2s'
                        }}
                    >
                        <Plus size={20} />
                        Add New
                    </button>
                )}
            </div>

            {/* Navigation & Search */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Tabs */}
                <div
                    ref={tabsRef}
                    className="premium-scroll-x"
                    style={{
                        display: 'flex', gap: '1rem',
                        borderBottom: '1px solid rgba(255,255,255,0.1)',
                        width: '100%'
                    }}
                >
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            data-tab-id={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                padding: '0.75rem 1rem',
                                background: 'transparent',
                                border: 'none',
                                borderBottom: activeTab === tab.id ? '2px solid var(--color-accent)' : '2px solid transparent',
                                color: activeTab === tab.id ? 'white' : 'var(--color-text-muted)',
                                cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                fontSize: '1rem', fontWeight: activeTab === tab.id ? 600 : 400,
                                whiteSpace: 'nowrap', transition: 'all 0.2s'
                            }}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>

                {activeTab === 'settings' && (
                    <div className="settings-panel animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                        {/* HIGH PRIORITY: PERMISSIONS (Moved to top for max visibility) */}
                        <div className="glass-panel" style={{ padding: '2rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                <div style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}>
                                    <Users size={20} color="#fff" />
                                </div>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Permissions</h3>
                            </div>
                            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.95rem', lineHeight: '1.5', marginBottom: '1rem' }}>
                                Control user access to historical data.
                            </p>

                            <div style={{
                                background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '1.25rem',
                                border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                            }}>
                                <div>
                                    <div style={{ fontSize: '1rem', fontWeight: 600, color: 'white' }}>Unlock Year Navigation</div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                                        Allow non-admins to view past academic years {data[0]?.allowUserYearChange ? '(Active)' : '(Locked)'}
                                    </div>
                                </div>
                                <label className="toggle-switch" style={{ position: 'relative', display: 'inline-block', width: '50px', height: '26px' }}>
                                    <input
                                        type="checkbox"
                                        checked={data[0]?.allowUserYearChange || false}
                                        onChange={async (e) => {
                                            try {
                                                await updateDoc(doc(db, 'settings', 'config'), { allowUserYearChange: e.target.checked });
                                                toast.success(`Year Navigation ${e.target.checked ? 'Unlocked' : 'Locked'}`);
                                            } catch (err) {
                                                console.error(err);
                                                toast.error('Failed to update permission');
                                            }
                                        }}
                                        style={{ opacity: 0, width: 0, height: 0 }}
                                    />
                                    <span className="slider round" style={{
                                        position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                                        backgroundColor: data[0]?.allowUserYearChange ? 'var(--color-accent)' : '#ccc',
                                        transition: '.4s', borderRadius: '34px'
                                    }}>
                                        <span style={{
                                            position: 'absolute', content: "", height: '20px', width: '20px', left: '3px', bottom: '3px',
                                            backgroundColor: 'white', transition: '.4s', borderRadius: '50%',
                                            transform: data[0]?.allowUserYearChange ? 'translateX(24px)' : 'translateX(0)'
                                        }} />
                                    </span>
                                </label>
                            </div>
                        </div>


                        {/* Grid for Year Management */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
                            {/* Left Column: View Data For */}

                            {/* Panel 1: View Data For */}
                            <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', height: 'fit-content' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                    <div style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}>
                                        <Eye size={20} color="#fff" />
                                    </div>
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>View Data For</h3>
                                </div>

                                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.95rem', lineHeight: '1.5' }}>
                                    Select the year you want to manage (Assignments, Schedule, etc).
                                </p>

                                <div style={{ position: 'relative' }}>
                                    <select
                                        className="glass-input"
                                        style={{
                                            width: '100%', padding: '1rem', paddingRight: '2.5rem',
                                            appearance: 'none', cursor: 'pointer',
                                            fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-accent)'
                                        }}
                                        value={data[0]?.activeAcademicYear || ''}
                                        onChange={async (e) => {
                                            try {
                                                await updateDoc(doc(db, 'settings', 'config'), { activeAcademicYear: e.target.value });
                                            } catch (err) {
                                                console.error(err);
                                                alert('Failed to update active year');
                                            }
                                        }}
                                    >
                                        {data[0]?.academicYears?.map(year => (
                                            <option key={year} value={year} style={{ color: 'black' }}>{year}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={20} style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: 0.7 }} />
                                </div>

                                <div style={{
                                    background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '1.25rem',
                                    border: '1px solid rgba(255,255,255,0.05)', marginTop: '1rem'
                                }}>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>Current System Default:</div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#4ade80', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        {data[0]?.activeAcademicYear} <span style={{ fontSize: '0.8rem', background: 'rgba(74, 222, 128, 0.1)', padding: '2px 8px', borderRadius: '12px' }}>(Active)</span>
                                    </div>
                                </div>
                            </div>



                        </div>

                        {/* Right Column: Create & Manage */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            {/* Create New Year */}
                            <div className="glass-panel" style={{ padding: '2rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                    <div style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}>
                                        <Plus size={20} color="#fff" />
                                    </div>
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Create New Year</h3>
                                </div>

                                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
                                    Add a new academic year to the system.
                                </p>

                                <div className="create-year-grid" style={{ display: 'grid', gap: '0.75rem', alignItems: 'center' }}>
                                    <div style={{ position: 'relative' }}>
                                        <Calendar size={16} color="rgba(255,255,255,0.4)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                                        <input
                                            type="text"
                                            placeholder="e.g. 2025-2026"
                                            className="glass-input"
                                            value={newYearInput}
                                            onChange={(e) => setNewYearInput(e.target.value)}
                                            style={{ paddingLeft: '2.5rem', width: '100%' }}
                                        />
                                    </div>

                                    <div style={{ position: 'relative' }}>
                                        <select
                                            className="glass-input"
                                            value={newYearType}
                                            onChange={(e) => setNewYearType(e.target.value)}
                                            style={{
                                                width: '100%',
                                                fontWeight: '600',
                                                color: { ODD: '#60a5fa', EVEN: '#f472b6', FULL: '#a78bfa' }[newYearType] || '#a78bfa',
                                                cursor: 'pointer',
                                                appearance: 'none',
                                                paddingRight: '2rem'
                                            }}
                                        >
                                            <option value="ODD" style={{ background: '#0f172a' }}>ODD SEM</option>
                                            <option value="EVEN" style={{ background: '#0f172a' }}>EVEN SEM</option>
                                            <option value="FULL" style={{ background: '#0f172a' }}>FULL YEAR</option>
                                        </select>
                                        <ChevronDown size={14} color="rgba(255,255,255,0.5)" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                                    </div>

                                    <button
                                        onClick={handleAddYear}
                                        style={{
                                            background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                                            padding: '0 1.5rem',
                                            height: '42px',
                                            fontSize: '0.95rem', fontWeight: 600,
                                            borderRadius: '8px', border: 'none', color: 'white', cursor: 'pointer',
                                            boxShadow: '0 4px 15px rgba(139, 92, 246, 0.3)',
                                            transition: 'transform 0.2s',
                                            display: 'flex', alignItems: 'center', gap: '0.5rem'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                                        onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                                    >
                                        <Plus size={18} />
                                        Add
                                    </button>
                                </div>
                            </div>
                        </div>
                        {/* Manage Years */}
                        <div className="glass-panel" style={{ padding: '2rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                <div style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}>
                                    <Settings size={20} color="#fff" />
                                </div>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Manage Years</h3>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '300px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                                {data[0]?.academicYears?.map(year => {
                                    const config = data[0].yearConfigs?.[year] || {};
                                    const load = config.maxFacultyLoad || 18;
                                    const isDefault = year === data[0].activeAcademicYear;

                                    return (
                                        <div key={year} style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px',
                                            border: isDefault ? '1px solid rgba(74, 222, 128, 0.3)' : '1px solid rgba(255,255,255,0.05)'
                                        }}>
                                            <div>
                                                <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'white' }}>
                                                    {year} {isDefault && <span style={{ fontSize: '0.75rem', color: '#4ade80', marginLeft: '0.5rem' }}>(Default)</span>}
                                                </div>
                                                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                                                    Max Load: {load} hrs/week
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <input
                                                    type="number"
                                                    defaultValue={load}
                                                    className="glass-input"
                                                    style={{ width: '70px', padding: '0.5rem', fontSize: '0.9rem' }}
                                                    id={`load-${year}`}
                                                />
                                                <button
                                                    className="btn"
                                                    style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.1)' }}
                                                    onClick={() => {
                                                        const val = document.getElementById(`load-${year}`).value;
                                                        handleUpdateConfig(year, val);
                                                    }}
                                                    title="Save Config"
                                                >
                                                    <Check size={16} />
                                                </button>
                                                {!isDefault && (
                                                    <button
                                                        className="btn"
                                                        style={{ padding: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', color: '#f87171' }}
                                                        onClick={() => handleDeleteYear(year)}
                                                        title="Delete Year"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );

                                })}
                            </div>
                        </div>
                    </div>

                )}
                {
                    activeTab === 'security' && (
                        <div className="glass-panel animate-fade-in" style={{ padding: '3rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{ marginBottom: '1.5rem', position: 'relative' }}>
                                <RefreshCw size={64} className={syncStatus.includes('Starting') ? 'spin-animation' : ''} color="#60a5fa" />
                                {syncStatus.includes('Starting') && (
                                    <div style={{
                                        position: 'absolute', inset: -10, borderRadius: '50%',
                                        border: '2px solid rgba(96, 165, 250, 0.3)',
                                        borderTopColor: '#60a5fa',
                                        animation: 'rotate 1s linear infinite'
                                    }} />
                                )}
                            </div>
                            <h3 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 1rem 0' }}>
                                {syncStatus || 'Initializing Security Sync...'}
                            </h3>
                            <p style={{ color: 'var(--color-text-muted)', maxWidth: '400px', lineHeight: '1.6' }}>
                                {syncStatus.includes('Success')
                                    ? 'Your user database is now synchronized with the secure lookup table. You can safely lock the main users collection.'
                                    : 'This process securely copies Employee IDs to a restricted lookup table, enabling secure login without exposing your user list.'}
                            </p>
                        </div>
                    )
                }
                {
                    !['settings', 'security'].includes(activeTab) && (
                        <>
                            {/* Search */}
                            <div className="glass-panel-static" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <Search size={20} color="var(--color-text-muted)" />
                                <input
                                    type="text"
                                    placeholder={`Search ${tabs.find(t => t.id === activeTab)?.label}...`}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    style={{
                                        background: 'transparent', border: 'none', color: 'white',
                                        fontSize: '1rem', width: '100%', outline: 'none'
                                    }}
                                />
                            </div>

                            {/* Grid Content */}
                            {loading && (
                                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-text-muted)' }}>Loading...</div>
                            )}
                            {!loading && filteredData.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-text-muted)', background: 'rgba(255,255,255,0.02)', borderRadius: '16px' }}>
                                    <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>📂</div>
                                    <div>No items found.</div>
                                </div>
                            )}
                            {!loading && filteredData.length > 0 && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
                                    {filteredData.map(item => (
                                        <div key={item.id} className="glass-panel" style={{
                                            padding: '1.5rem',
                                            display: 'flex', flexDirection: 'column', gap: '1rem',
                                            position: 'relative', overflow: 'hidden',
                                            border: '1px solid rgba(255,255,255,0.05)',
                                            transition: 'transform 0.2s, box-shadow 0.2s',
                                            cursor: 'default'
                                        }}
                                            onMouseEnter={e => {
                                                e.currentTarget.style.transform = 'translateY(-4px)';
                                                e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.3)';
                                                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                                            }}
                                            onMouseLeave={e => {
                                                e.currentTarget.style.transform = 'translateY(0)';
                                                e.currentTarget.style.boxShadow = 'none';
                                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                            }}
                                        >
                                            {/* Card Content */}
                                            <div style={{ flex: 1 }}>
                                                {renderCardContent(item)}
                                            </div>

                                            {/* Actions */}
                                            {isAdmin && (
                                                <div style={{
                                                    display: 'flex', justifyContent: 'flex-end', gap: '0.5rem',
                                                    paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)'
                                                }}>
                                                    <button
                                                        onClick={() => openModal(item)}
                                                        style={{
                                                            background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa',
                                                            border: 'none', borderRadius: '6px', padding: '6px 12px',
                                                            cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500,
                                                            display: 'flex', alignItems: 'center', gap: '4px'
                                                        }}
                                                    >
                                                        <Edit2 size={14} /> Edit
                                                    </button>
                                                    <button
                                                        onClick={(e) => confirmDelete(item.id, e)}
                                                        style={{
                                                            background: 'rgba(239, 68, 68, 0.1)', color: '#f87171',
                                                            border: 'none', borderRadius: '6px', padding: '6px 12px',
                                                            cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500,
                                                            display: 'flex', alignItems: 'center', gap: '4px'
                                                        }}
                                                    >
                                                        <Trash2 size={14} /> Delete
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )
                }
            </div >

            {/* Modal */}
            {
                isModalOpen && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
                        display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
                    }}>
                        <div className="glass-panel" style={{ width: '90%', maxWidth: '450px', padding: '2.5rem', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', maxHeight: '90vh', overflowY: 'auto' }}>
                            <h3 style={{ marginBottom: '2rem', fontSize: '1.5rem', fontWeight: 700 }}>{editingId ? 'Edit' : 'Add'} {tabs.find(t => t.id === activeTab)?.label.slice(0, -1)}</h3>
                            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                {renderFormFields()}
                                <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                                    <button type="button" onClick={() => setIsModalOpen(false)} className="btn" style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>Cancel</button>
                                    <button type="submit" className="btn" style={{ flex: 1, background: 'var(--color-accent)', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)' }}>Save</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
            {/* Delete Confirmation Modal */}
            {
                deleteConfirm.isOpen && createPortal(
                    <ConfirmModal
                        isOpen={deleteConfirm.isOpen}
                        onCancel={() => setDeleteConfirm({ isOpen: false, id: null, type: 'item' })}
                        onConfirm={executeDelete}
                        title={deleteConfirm.type === 'year' ? "Delete Academic Year" : "Delete Item"}
                        message={deleteConfirm.type === 'year'
                            ? `Are you sure you want to delete the academic year ${deleteConfirm.id}? This cannot be undone.`
                            : "Are you sure you want to delete this item? This action cannot be undone."
                        }
                        isDangerous={true}
                    />,
                    document.body
                )
            }
        </div >
    );
};

export default MasterData;
