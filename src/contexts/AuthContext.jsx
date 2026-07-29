import React, { createContext, useContext, useEffect, useState, useRef, useMemo } from 'react';
import { auth, db } from '../lib/firebase';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, getDocs, query, where } from 'firebase/firestore';
// FlaskConical and Logo removed (unused)
import toast from 'react-hot-toast';
import { sendWhatsAppNotification } from '../utils/whatsappUtils';

const AuthContext = createContext({
    currentUser: null,
    userProfile: null,
    loading: true,
    login: async () => { },
    signup: async () => { },
    logout: async () => { },
    resetPassword: async () => { }
});

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);

const cleanYears = (years) => {
    if (!Array.isArray(years)) return [];

    // Normalize: Trim strings, deduplicate, and remove nulls/empty
    let unique = Array.from(new Set(
        years.filter(y => y).map(y => y.toString().trim())
    ));

    // Identify existing specific years (e.g. "2025-2026 (EVEN)")
    const specificYears = unique.filter(y => y.includes('('));
    const baseOfSpecific = specificYears.map(y => y.replace(/ \((ODD|EVEN)\)/i, '').trim());

    // Filter out plain base years if their specific version exists
    unique = unique.filter(y => {
        const isBase = !y.includes('(');
        const trimmedY = y.trim();
        // Keep non-base years OR base years whose specific version doesn't exist
        return !isBase || !baseOfSpecific.includes(trimmedY);
    });

    // Filter valid patterns (YYYY-YYYY), sort descending
    const valid = unique.filter(y => /^\d{4}-\d{4}/.test(y));
    return valid.sort().reverse();
};



const STORAGE_KEYS = {
    SELECTED_YEAR: 'lams_sel_year',
    SYSTEM_YEAR: 'lams_sys_year',
    ALL_YEARS: 'lams_all_years'
};

export const AuthProvider = ({ children }) => {
    // --- ROBUST STATE INITIALIZATION ---

    const [currentUser, setCurrentUser] = useState(null);
    const [userProfile, setUserProfile] = useState(null);

    // 3. State: Academic Years List (STRICT SERVER MODE)
    // IMPROVED: Try to hydrate from cache first to avoid content flashing, fall back to prediction.
    const [academicYears, setAcademicYears] = useState(() => {
        try {
            const cached = localStorage.getItem(STORAGE_KEYS.ALL_YEARS);
            if (cached) return JSON.parse(cached);
        } catch (e) {
            console.warn("Failed to parse cached years", e);
        }
        return [];
    });

    // 4. State: Active/System Year
    const [systemAcademicYear, setSystemAcademicYear] = useState(() => {
        const stored = localStorage.getItem(STORAGE_KEYS.SYSTEM_YEAR);
        return (stored && stored !== 'null') ? stored : null;
    });

    // 5. State: User Selection (Persist this, it's a user preference)
    const [selectedAcademicYear, setSelectedAcademicYear] = useState(() => {
        const stored = localStorage.getItem(STORAGE_KEYS.SELECTED_YEAR);
        return (stored && stored !== 'null') ? stored : null;
    });

    const [maxFacultyLoad, setMaxFacultyLoad] = useState(18);
    const [yearConfigs, setYearConfigs] = useState({});
    const [loading, setLoading] = useState(true);
    const [isSystemSyncing, setIsSystemSyncing] = useState(false); // Global Sync Shield
    const [isConfigLoaded, setIsConfigLoaded] = useState(false);

    const selectedAcademicYearRef = useRef(null);
    const previousSystemYear = useRef(null);

    // Initialize Ref from storage on mount (handling page reloads)
    useEffect(() => {
        previousSystemYear.current = localStorage.getItem(STORAGE_KEYS.SYSTEM_YEAR);
    }, []);

    // Keep Ref in sync with State
    useEffect(() => {
        selectedAcademicYearRef.current = selectedAcademicYear;
    }, [selectedAcademicYear]);

    const login = async (identifier, password) => {
        let email = identifier;
        if (!identifier.includes('@')) {
            try {
                const lookupDoc = await getDoc(doc(db, 'emp_lookups', identifier));
                if (lookupDoc.exists()) {
                    email = lookupDoc.data().email;
                } else {
                    console.warn(`EmpID ${identifier} not found in secure lookup.`);
                    throw new Error("Employee ID not linked. Please ask Admin to link your profile.");
                }
            } catch (err) {
                console.error("Login Lookup Error:", err);
                if (err.message.includes("not linked")) throw err;
                throw new Error("Login failed. Please use your Email Address.");
            }
        }
        return signInWithEmailAndPassword(auth, email, password);
    };

    const signup = async (empId, password, name, recoveryEmail, mobileNumber) => {
        const { user } = await createUserWithEmailAndPassword(auth, recoveryEmail, password);

        let isFirstUser = false;
        try {
            const usersSnapshot = await getDocs(collection(db, 'users'));
            isFirstUser = usersSnapshot.empty;
        } catch (e) {
            console.warn("First-user check failed, defaulting to pending user:", e);
        }

        let linkedDept = null;
        let isFaculty = false;
        try {
            let facultySnap = await getDocs(query(collection(db, 'faculty'), where('empId', '==', empId)));
            if (facultySnap.empty && recoveryEmail) {
                facultySnap = await getDocs(query(collection(db, 'faculty'), where('email', '==', recoveryEmail)));
            }
            if (!facultySnap.empty) {
                const facDoc = facultySnap.docs[0];
                const facData = facDoc.data();
                linkedDept = facData.department || facData.dept;
                isFaculty = true;
                await updateDoc(doc(db, 'faculty', facDoc.id), {
                    uid: user.uid,
                    isRegistered: true,
                    email: recoveryEmail,
                    empId: empId
                });
            }
        } catch (facErr) {
            console.warn("Faculty lookup/link failed during signup:", facErr);
        }

        const userProfileData = {
            empId,
            name,
            email: recoveryEmail,
            mobile: mobileNumber,
            role: isFirstUser ? 'admin' : 'user',
            status: isFirstUser ? 'approved' : 'pending',
            dept: linkedDept,
            isFaculty: isFaculty,
            whatsappEnabled: true,
            createdAt: new Date().toISOString()
        };

        // Always create user profile document in Firestore
        try {
            await setDoc(doc(db, 'users', user.uid), userProfileData);
        } catch (err) {
            console.error("Critical error creating Firestore profile:", err);
            // Rollback Auth User to prevent zombie accounts
            try {
                await user.delete();
            } catch (rollbackErr) {
                console.error("Failed to rollback auth user:", rollbackErr);
            }
            throw new Error("Failed to create user profile in database. Please try again.");
        }

        if (empId) {
            try {
                await setDoc(doc(db, 'emp_lookups', empId), { email: recoveryEmail, uid: user.uid });
            } catch (lookupErr) {
                console.warn("Emp lookup write failed:", lookupErr);
            }
        }

        // WhatsApp Notification on Signup
        if (mobileNumber) {
            try {
                const welcomeMsg = `🤖 *Welcome to LAMS* 🤖\n\nHi ${name},\nYour account has been successfully created and is pending approval.\n\n_You will receive updates directly on this number._`;
                sendWhatsAppNotification(mobileNumber, welcomeMsg);
            } catch (waErr) {
                console.warn("WhatsApp notification failed:", waErr);
            }
        }

        return user;
    };

    const resetPassword = (email) => {
        return sendPasswordResetEmail(auth, email);
    };

    const logout = () => {
        return signOut(auth);
    };

    const handleSetSelectedYear = (year) => {
        setSelectedAcademicYear(year);
        if (year) localStorage.setItem(STORAGE_KEYS.SELECTED_YEAR, year);
        else localStorage.removeItem(STORAGE_KEYS.SELECTED_YEAR);
    };

    const [allowUserYearChange, setAllowUserYearChange] = useState(false);

    // --- LOGIC: SYNC WITH SERVER CONFIG (The Single Source of Truth) ---
    // Switched to Real-Time (onSnapshot) to ensure new years appear instantly.
    useEffect(() => {
        if (!currentUser) return;

        const unsub = onSnapshot(doc(db, 'settings', 'config'), (docSnap) => {
            try {
                if (docSnap.exists()) {
                    setIsSystemSyncing(true); // TRIGGER LOADERS
                    const data = docSnap.data();

                    // A. Validate & Clean Server Data
                    const fetchedSystemYear = data.activeAcademicYear || null;
                    const fetchedYears = cleanYears(data.academicYears || []);
                    const fetchedConfigs = data.yearConfigs || {};
                    const fetchedAllowChange = data.allowUserYearChange || false;

                    // B. Source of Truth: Server Data + Active System Year.
                    const finalYears = cleanYears([...fetchedYears, fetchedSystemYear]);

                    // C. Update States
                    setSystemAcademicYear(fetchedSystemYear);
                    setAcademicYears(finalYears);
                    setYearConfigs(fetchedConfigs);
                    setAllowUserYearChange(fetchedAllowChange);

                    // D. Auto-Heal: If User Selection is now invalid (ghost), reset it
                    const currentSelection = localStorage.getItem(STORAGE_KEYS.SELECTED_YEAR);
                    if (currentSelection && !finalYears.includes(currentSelection)) {
                        console.warn(`Auto-Healing: Invalid selection ${currentSelection} removed.`);
                        setSelectedAcademicYear(null);
                        localStorage.removeItem(STORAGE_KEYS.SELECTED_YEAR);
                    }

                    // NEW ROBUST SYNC: Prevent Race Conditions across Tabs
                    // We compare against a Ref (memory) instead of localStorage (disk) inside the callback.
                    // This ensures EVERY active tab detects the change independently, even if another tab updated storage first.
                    if (previousSystemYear.current && previousSystemYear.current !== fetchedSystemYear) {
                        console.log(`System Year Change Detected (Ref): ${previousSystemYear.current} -> ${fetchedSystemYear}`);
                        setSelectedAcademicYear(null);
                        localStorage.removeItem(STORAGE_KEYS.SELECTED_YEAR);
                    }

                    // Update the Ref and Storage for next time
                    previousSystemYear.current = fetchedSystemYear;
                    if (fetchedSystemYear) {
                        localStorage.setItem(STORAGE_KEYS.SYSTEM_YEAR, fetchedSystemYear);
                    } else {
                        localStorage.removeItem(STORAGE_KEYS.SYSTEM_YEAR);
                    }

                    // E. Persistence
                    localStorage.setItem(STORAGE_KEYS.ALL_YEARS, JSON.stringify(finalYears));

                    // Short artificial delay to let contexts catch up visually
                    setTimeout(() => setIsSystemSyncing(false), 800);
                    setIsConfigLoaded(true);

                } else {
                    console.log("No Remote Config Found - Running in Offline/Fallback Mode");
                    const cachedSysYear = localStorage.getItem(STORAGE_KEYS.SYSTEM_YEAR);
                    const cachedAllYears = JSON.parse(localStorage.getItem(STORAGE_KEYS.ALL_YEARS) || '[]');
                    
                    if (cachedSysYear) {
                        setSystemAcademicYear(cachedSysYear);
                    }
                    if (cachedAllYears && cachedAllYears.length > 0) {
                        setAcademicYears(cachedAllYears);
                    }
                    setTimeout(() => setIsSystemSyncing(false), 800);
                    setIsConfigLoaded(true);
                }
            } catch (err) {
                console.error("Global Config Sync Error:", err);
                const cachedSysYear = localStorage.getItem(STORAGE_KEYS.SYSTEM_YEAR);
                if (cachedSysYear) setSystemAcademicYear(cachedSysYear);
                setIsSystemSyncing(false); // Force dismiss loader on error
                setIsConfigLoaded(true);
            }
        }, (err) => {
            console.error("Config Snapshot Error:", err);
            const cachedSysYear = localStorage.getItem(STORAGE_KEYS.SYSTEM_YEAR);
            const cachedAllYears = JSON.parse(localStorage.getItem(STORAGE_KEYS.ALL_YEARS) || '[]');
            if (cachedSysYear) setSystemAcademicYear(cachedSysYear);
            if (cachedAllYears && cachedAllYears.length > 0) setAcademicYears(cachedAllYears);
            setIsSystemSyncing(false); // Force dismiss loader on snapshot error
            setIsConfigLoaded(true);
        });

        return () => unsub();
    }, [currentUser]);

    // ENFORCE YEAR LOCK: Kick user back to Active Year if they are restricted
    useEffect(() => {
        if (!userProfile) return;
        const isAdmin = userProfile.role === 'admin';

        // If User is NOT Admin AND Year Change is DISABLED AND they are on a custom year
        if (!isAdmin && !allowUserYearChange && selectedAcademicYear) {
            console.log("Year Lock Enforced: Resetting user to System Year");
            setSelectedAcademicYear(null);
            localStorage.removeItem(STORAGE_KEYS.SELECTED_YEAR);
            toast("Year navigation is locked by Admin", { icon: '🔒', style: { borderRadius: '10px', background: '#333', color: '#fff' } });
        }
    }, [allowUserYearChange, userProfile, selectedAcademicYear]);

    // Update Max Load when Year or Configs Change
    useEffect(() => {
        const currentYear = selectedAcademicYear || systemAcademicYear;
        const currentConfig = yearConfigs[currentYear] || {};
        const maxLoad = currentConfig.maxFacultyLoad || 18;
        setMaxFacultyLoad(maxLoad);
    }, [selectedAcademicYear, systemAcademicYear, yearConfigs]);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);

            if (!user) {
                setLoading(false);
            }
        });

        // SAFETY: If Auth hangs (Limit Exhausted), force load after 7s to try offline mode
        const safetyTimer = setTimeout(() => {
            setLoading(prev => {
                if (prev) console.warn("Auth initialization timed out (Likely Firestore Limit). Forcing degraded mode.");
                setIsConfigLoaded(true); // Must also force this to true, otherwise value.loading stays true forever
                return false;
            });
        }, 7000);

        return () => {
            unsubscribe();
            clearTimeout(safetyTimer);
        };
    }, []);

    useEffect(() => {
        let unsubscribeProfile = () => { };

        if (currentUser) {
            // Using onSnapshot for Real-Time Role/Profile Updates
            // This allows Admins to Ban/Promote users instantly.
            if (!userProfile) setLoading(true);
            const docRef = doc(db, 'users', currentUser.uid);

            unsubscribeProfile = onSnapshot(docRef,
                (docSnap) => {
                    if (docSnap.exists()) {
                        const newData = docSnap.data();
                        setUserProfile(prev => {
                            if (!prev) return newData;
                            
                            // Prevent re-renders from background 'lastSeen' updates (Heartbeat)
                            // We ignore 'lastSeen', 'sessions', and 'isOnline'
                            const ignoreKeys = ['lastSeen', 'sessions', 'isOnline'];
                            const keys1 = Object.keys(prev).filter(k => !ignoreKeys.includes(k));
                            const keys2 = Object.keys(newData).filter(k => !ignoreKeys.includes(k));
                            
                            let isMeaningfulChange = keys1.length !== keys2.length;
                            if (!isMeaningfulChange) {
                                for (let key of keys1) {
                                    if (JSON.stringify(prev[key]) !== JSON.stringify(newData[key])) {
                                        isMeaningfulChange = true;
                                        break;
                                    }
                                }
                            }
                                
                            return isMeaningfulChange ? newData : prev;
                        });
                    } else {
                        console.warn("User Profile Missing!");
                        setUserProfile(null);
                    }
                    setLoading(false);
                },
                (err) => {
                    console.error("Profile Sync Error:", err);
                    setLoading(false);
                }
            );

        } else {
            setUserProfile(null);
        }

        return () => unsubscribeProfile();
    }, [currentUser]);

    const value = useMemo(() => ({
        currentUser,
        userProfile,
        activeAcademicYear: selectedAcademicYear || systemAcademicYear, // Fallback to system if null
        systemAcademicYear, // Expose system default if needed
        academicYears,
        maxFacultyLoad, // Expose the dynamic limit
        setSelectedAcademicYear: handleSetSelectedYear, // Allow changing view with persistence
        login,
        signup,
        resetPassword,
        logout,
        loading: loading || (currentUser && !isConfigLoaded),
        isSystemSyncing,
        allowUserYearChange // Expose the new setting
    }), [
        currentUser,
        userProfile,
        selectedAcademicYear,
        systemAcademicYear,
        academicYears,
        maxFacultyLoad,
        loading,
        isConfigLoaded,
        isSystemSyncing,
        allowUserYearChange
    ]);

    return (
        <AuthContext.Provider value={value}>
            {loading ? <div style={{ position:'fixed', inset:0, background:'#050505', zIndex:9999 }} /> : children}
        </AuthContext.Provider>
    );
};
