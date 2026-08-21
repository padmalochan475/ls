import React, { createContext, useContext, useEffect, useState, useRef, useMemo } from 'react';
import { auth, db } from '../lib/firebase';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, getDocs, query, where, writeBatch } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { sendWhatsAppNotification } from '../utils/whatsappUtils';
import { useDynamicListener } from '../hooks/useDynamicListener';

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
    const [profileMissing, setProfileMissing] = useState(false);
    const [authError, setAuthError] = useState(null);

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
    // Registration guard: prevents the profile-missing detector from firing
    // during the window between account creation and Firestore profile write.
    const isRegisteringRef = useRef(false);
    // Track whether we currently have a profile, without creating a stale closure
    // inside the useDynamicListener callback (which only re-runs when currentUser changes).
    const hasProfileRef = useRef(false);

    // Initialize Ref from storage on mount (handling page reloads)
    useEffect(() => {
        previousSystemYear.current = localStorage.getItem(STORAGE_KEYS.SYSTEM_YEAR);
    }, []);

    // Keep Ref in sync with State
    useEffect(() => {
        selectedAcademicYearRef.current = selectedAcademicYear;
    }, [selectedAcademicYear]);

    const login = async (identifier, password) => {
        const cleanIdentifier = String(identifier).trim().toLowerCase();
        let email = cleanIdentifier;
        if (!cleanIdentifier.includes('@')) {
            try {
                const lookupDoc = await getDoc(doc(db, 'emp_lookups', String(identifier).trim())); // EmpID keeps casing/numbers but is trimmed
                if (lookupDoc.exists()) {
                    email = lookupDoc.data().email.toLowerCase();
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

    const resetPassword = (email) => {
        const normalizedEmail = String(email).trim().toLowerCase();
        return sendPasswordResetEmail(auth, normalizedEmail);
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
    // Switched to Real-Time (useDynamicListener) to ensure new years appear instantly and conserve quota.
    useDynamicListener((isActiveRef) => {
        let syncTimer;

        const unsub = onSnapshot(doc(db, 'settings', 'config'), (docSnap) => {
            if (!isActiveRef.current) return;
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
                    if (syncTimer) clearTimeout(syncTimer);
                    syncTimer = setTimeout(() => {
                        if (isActiveRef.current) setIsSystemSyncing(false);
                    }, 800);
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
                    if (syncTimer) clearTimeout(syncTimer);
                    syncTimer = setTimeout(() => {
                        if (isActiveRef.current) setIsSystemSyncing(false);
                    }, 800);
                    setIsConfigLoaded(true);
                }
            } catch (err) {
                console.error("Global Config Sync Error:", err);
                const cachedSysYear = localStorage.getItem(STORAGE_KEYS.SYSTEM_YEAR);
                if (cachedSysYear) setSystemAcademicYear(cachedSysYear);
                if (isActiveRef.current) setIsSystemSyncing(false); // Force dismiss loader on error
                if (isActiveRef.current) setIsConfigLoaded(true);
            }
        }, (err) => {
            console.error("Config Snapshot Error:", err);
            const cachedSysYear = localStorage.getItem(STORAGE_KEYS.SYSTEM_YEAR);
            const cachedAllYears = JSON.parse(localStorage.getItem(STORAGE_KEYS.ALL_YEARS) || '[]');
            if (cachedSysYear) setSystemAcademicYear(cachedSysYear);
            if (cachedAllYears && cachedAllYears.length > 0) setAcademicYears(cachedAllYears);
            if (isActiveRef.current) setIsSystemSyncing(false); // Force dismiss loader on snapshot error
            if (isActiveRef.current) setIsConfigLoaded(true);
        });

        return () => {
            unsub();
            if (syncTimer) clearTimeout(syncTimer);
        };
    }, [currentUser], {
        enabled: !!currentUser,
        suspendOnHidden: true,
        suspendDelayMs: 30000
    });

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
        let isResolved = false;
        
        // SAFETY: If onAuthStateChanged never fires (Firebase SDK init failure, network),
        // force loading:false after 10s so the user sees the login page instead of
        // an infinite black screen. 10s is chosen to be > the profile listener's 8s
        // serverTimeout, so the profile has a full chance to load before we give up.
        const safetyTimer = setTimeout(() => {
            if (!isResolved) {
                console.warn('[Auth] onAuthStateChanged timed out. Forcing degraded mode.');
                setIsConfigLoaded(true);
                setLoading(false);
            }
        }, 10000);

        const unsubscribe = onAuthStateChanged(auth, (user) => {
            isResolved = true;
            clearTimeout(safetyTimer);
            setCurrentUser(user);

            if (!user) {
                // Logged out: clear all user state immediately
                setUserProfile(null);
                setProfileMissing(false);
                hasProfileRef.current = false;
                setLoading(false);
            }
            // If user exists: loading stays true until the profile listener resolves it.
            // Do NOT call setLoading(false) here — that's the profile listener's job.
        });

        return () => {
            unsubscribe();
            clearTimeout(safetyTimer);
        };
    }, []);

    // --- PROFILE LISTENER ---
    // Uses includeMetadataChanges: true so we receive TWO snapshots when Firestore
    // loads from its persistent local cache:
    //
    //   Snapshot 1 — fromCache: true  → came from IndexedDB / local cache
    //   Snapshot 2 — fromCache: false → came from the Firestore server
    //
    // This is the ONLY architecturally correct way to distinguish between:
    //   a) "Cache doesn't have this doc yet"  (wait — don't declare missing)
    //   b) "Server confirmed doc doesn't exist" (act — declare missing or guard)
    //
    // All previous timer/flag approaches were working around the symptom of not
    // making this distinction. This is the fix, not a patch.
    useDynamicListener((isActiveRef) => {
        if (!currentUser) {
            setUserProfile(null);
            setProfileMissing(false);
            return () => {};
        }

        // Do NOT set loading:true here. Loading is managed by onAuthStateChanged (set to true
        // implicitly when currentUser exists but profile hasn't arrived yet) and cleared
        // by the profile listener below. Setting it here would cause a flash on tab-refocus.
        // The only exception: profileMissing may be stale from a previous session.
        setProfileMissing(false);
        setAuthError(null);

        // Timeout: if the server hasn't responded in 8s (quota/offline), attempt
        // a direct getDocFromServer call. This is the last-resort recovery — not
        // the primary mechanism. If this also fails, we show a graceful degraded
        // state rather than kicking the user out.
        let serverTimeout = setTimeout(async () => {
            if (!isActiveRef.current) return;
            console.warn('[Auth] Server has not confirmed profile in 8s. Attempting direct server fetch...');
            try {
                // getDoc with persistent cache enabled will try cache first, then server.
                // We explicitly want server data here to break out of any cache stall.
                const { getDocFromServer } = await import('firebase/firestore');
                const snap = await getDocFromServer(doc(db, 'users', currentUser.uid));
                if (!isActiveRef.current) return;
                if (snap.exists()) {
                    console.log('[Auth] Direct server fetch succeeded.');
                    setUserProfile(snap.data());
                    setProfileMissing(false);
                } else if (!isRegisteringRef.current) {
                    setUserProfile(null);
                    setProfileMissing(true);
                }
            } catch (e) {
                // Firestore is genuinely unreachable (quota exhausted, offline).
                // Do NOT declare profile missing — the user is still authenticated.
                // They'll be in a degraded state until connectivity returns.
                console.error('[Auth] Direct server fetch failed (quota/offline):', e.code);
            } finally {
                if (isActiveRef.current) setLoading(false);
            }
        }, 8000);

        const docRef = doc(db, 'users', currentUser.uid);

        const unsubscribeProfile = onSnapshot(
            docRef,
            { includeMetadataChanges: true }, // ← The key architectural decision
            (docSnap) => {
                if (!isActiveRef.current) return;

                if (docSnap.exists()) {
                    // ✅ Profile found — whether from cache or server, accept it.
                    // The server snapshot (fromCache: false) will follow if data differs,
                    // and the change-detection below will update state only if meaningful.
                    clearTimeout(serverTimeout);
                    setProfileMissing(false);
                    setAuthError(null);

                    const newData = docSnap.data();

                    if (newData.status === 'disabled' || newData.status === 'rejected') {
                        console.warn('[Auth] Account disabled or rejected. Forcing logout.');
                        signOut(auth).catch(console.error);
                        setUserProfile(null);
                        setProfileMissing(true);
                        setAuthError('ACCOUNT_DISABLED');
                        return;
                    }

                    setUserProfile(prev => {
                        if (!prev) {
                            hasProfileRef.current = true;
                            return newData;
                        }

                        // Suppress re-renders caused by heartbeat-only writes
                        // (lastSeen, session tokens, FCM tokens, etc.)
                        const HEARTBEAT_KEYS = new Set([
                            'lastSeen', 'sessions', 'isOnline',
                            'fcmTokens', 'fcmDeviceTokens', 'webPushActive'
                        ]);
                        const isMeaningful = Object.keys({ ...prev, ...newData }).some(k => {
                            if (HEARTBEAT_KEYS.has(k)) return false;
                            return JSON.stringify(prev[k]) !== JSON.stringify(newData[k]);
                        });
                        if (isMeaningful) hasProfileRef.current = true;
                        return isMeaningful ? newData : prev;
                    });

                    setLoading(false);

                } else if (docSnap.metadata.fromCache) {
                    // ⏳ Cache miss — the local cache has no record of this document.
                    // This is completely normal and expected for:
                    //   • New registrations (doc hasn't been written yet)
                    //   • First login on a new browser/device (cold cache)
                    //   • Tab reopen after cache was cleared
                    //
                    // IMPORTANT: Do NOT declare profile missing here.
                    // Keep loading: true and wait for the server snapshot to arrive.
                    // The serverTimeout above handles the case where server never responds.
                    console.log('[Auth] Cache miss for profile — waiting for server confirmation...');

                } else {
                    // ❌ fromCache: false → the Firestore SERVER confirmed the document
                    // does not exist. This is authoritative.
                    clearTimeout(serverTimeout);

                    // Guard: active registration. The signup function sets isRegisteringRef
                    // before calling createUserWithEmailAndPassword and clears it after setDoc.
                    // If it's set, the setDoc write is still in flight — do not declare missing.
                    if (isRegisteringRef.current) {
                        console.log('[Auth] Server confirmed no doc, but registration write is in flight. Holding...');
                        return; // Spinner stays up — setDoc snapshot will resolve this
                    }

                    // Guard: extremely fresh account. Belt-and-suspenders check.
                    // If creationTime is within 30s, give the write a final chance.
                    const creationTime = currentUser.metadata?.creationTime;
                    if (creationTime) {
                        const age = Date.now() - Date.parse(creationTime);
                        if (age < 30000 && age > -10000) {
                            console.log('[Auth] Account is < 30s old. Holding for write to complete...');
                            return;
                        }
                    }

                    // All guards passed. The profile genuinely does not exist on the server.
                    console.warn('[Auth] Server-confirmed profile missing. uid:', currentUser.uid);
                    setUserProfile(null);
                    setProfileMissing(true);
                    setLoading(false);
                }
            },
            (err) => {
                if (!isActiveRef.current) return;
                console.error('[Auth] Profile listener error:', err.code);

                if (err.code === 'permission-denied') {
                    // Security rules rejected the read. This won't self-heal.
                    clearTimeout(serverTimeout);
                    setAuthError('PERMISSION_DENIED');
                    setLoading(false);
                } else {
                    setAuthError('NETWORK_ERROR');
                }
                // quota-resource-exhausted, unavailable, network errors:
                // Let the serverTimeout handle the recovery attempt above.
            }
        );

        return () => {
            clearTimeout(serverTimeout);
            unsubscribeProfile();
        };
    }, [currentUser], {
        enabled: true,
        suspendOnHidden: true,
        suspendDelayMs: 30000
    });

    // Keep hasProfileRef in sync when profile is cleared (logout)
    useEffect(() => {
        hasProfileRef.current = !!userProfile;
    }, [userProfile]);

    const value = useMemo(() => ({
        currentUser,
        userProfile,
        activeAcademicYear: selectedAcademicYear || systemAcademicYear, // Fallback to system if null
        systemAcademicYear, // Expose system default if needed
        academicYears,
        maxFacultyLoad, // Expose the dynamic limit
        setSelectedAcademicYear: handleSetSelectedYear, // Allow changing view with persistence
        login,
        resetPassword,
        logout,
        loading: loading || (currentUser && !isConfigLoaded),
        isSystemSyncing,
        allowUserYearChange,
        profileMissing,
        authError
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
        allowUserYearChange,
        profileMissing,
        authError
    ]);

    return (
        <AuthContext.Provider value={value}>
            {loading ? <div style={{ position:'fixed', inset:0, background:'#050505', zIndex:9999 }} /> : children}
        </AuthContext.Provider>
    );
};
