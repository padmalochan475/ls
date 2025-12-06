import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { auth, db } from '../lib/firebase';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail
} from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, collection, getDocs, query, where } from 'firebase/firestore';
import { FlaskConical } from 'lucide-react';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [systemAcademicYear, setSystemAcademicYear] = useState('2024-2025'); // Global System Default
    const [selectedAcademicYear, setSelectedAcademicYear] = useState(null); // User's View Choice (Defaults to System)
    const [academicYears, setAcademicYears] = useState(['2024-2025']); // List of all years
    const [maxFacultyLoad, setMaxFacultyLoad] = useState(18); // Default Max Load
    const [yearConfigs, setYearConfigs] = useState({});
    const [loading, setLoading] = useState(true);

    const login = async (identifier, password) => {
        let email = identifier;

        // Check if input is NOT an email (assume it is EmpID)
        if (!identifier.includes('@')) {
            try {
                // 1. Try Secure "Lookup Doc" (Best Logic / Zero-Cost)
                // We read a single doc from 'emp_lookups' where ID is the EmpID.
                // Security Rules allow 'get' but deny 'list', preventing scraping.
                const lookupDoc = await getDoc(doc(db, 'emp_lookups', identifier));

                if (lookupDoc.exists()) {
                    email = lookupDoc.data().email;
                } else {
                    // "Best Logic" for Spark Plan:
                    // If secure lookup fails, do NOT fallback to insecure methods or paid Cloud Functions.
                    // Instead, enforce data consistency.
                    console.warn(`EmpID ${identifier} not found in secure lookup.`);
                    throw new Error("Employee ID not linked. Please ask Admin to link your profile.");
                }
            } catch (err) {
                console.error("Login Lookup Error:", err);
                // Preserve the specific error message if we threw it above
                if (err.message.includes("not linked")) throw err;
                throw new Error("Login failed. Please use your Email Address.");
            }
        }

        return signInWithEmailAndPassword(auth, email, password);
    };

    const signup = async (empId, password, name, recoveryEmail, mobileNumber) => {
        // Use Real Email for Firebase Auth
        const { user } = await createUserWithEmailAndPassword(auth, recoveryEmail, password);

        // Check if this is the first user
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const isFirstUser = usersSnapshot.empty;

        // Create user profile in Firestore
        await setDoc(doc(db, 'users', user.uid), {
            empId,
            name,
            email: recoveryEmail, // Store real email for recovery
            mobile: mobileNumber,
            role: isFirstUser ? 'admin' : 'user', // First user is Admin
            status: isFirstUser ? 'approved' : 'pending', // First user is Approved
            createdAt: new Date().toISOString()
        });

        // Create Secure Lookup Entry (for Login)
        if (empId) {
            await setDoc(doc(db, 'emp_lookups', empId), {
                email: recoveryEmail,
                uid: user.uid
            });
        }

        return user;
    };

    const resetPassword = (email) => {
        return sendPasswordResetEmail(auth, email);
    };

    const logout = () => {
        localStorage.removeItem('selectedAcademicYear'); // Clear preference on logout
        return signOut(auth);
    };

    const handleSetSelectedYear = (year) => {

        setSelectedAcademicYear(year);
    };

    const previousSystemYear = useRef(null);

    // Listen for Academic Year Changes (Global Config)
    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, 'settings', 'config'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const fetchedSystemYear = data.activeAcademicYear || '2024-2025';
                const fetchedYears = data.academicYears || ['2024-2025'];
                const fetchedConfigs = data.yearConfigs || {};

                // Update Global Context State
                setSystemAcademicYear(fetchedSystemYear);
                setAcademicYears(fetchedYears);
                setYearConfigs(fetchedConfigs);

                // Validation: If currently viewed year is deleted, reset to system default
                if (selectedAcademicYear && !fetchedYears.includes(selectedAcademicYear)) {
                    setSelectedAcademicYear(null);
                }
            } else {
                // Initialize Default Config if Missing
                setDoc(doc(db, 'settings', 'config'), {
                    activeAcademicYear: '2024-2025',
                    academicYears: ['2024-2025'],
                    yearConfigs: {
                        '2024-2025': { maxFacultyLoad: 18 }
                    }
                });
            }
        });
        return () => unsubscribe();
    }, [selectedAcademicYear]);

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

        return unsubscribe;
    }, []);

    useEffect(() => {
        let unsubscribeProfile = () => { };

        if (currentUser) {
            const docRef = doc(db, 'users', currentUser.uid);
            unsubscribeProfile = onSnapshot(docRef, (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();

                    // Standard Profile Processing
                    // (Hardcoded overrides removed for authenticity)


                    setUserProfile(data);
                } else {
                    console.error("No user profile found in Firestore!");
                    setUserProfile(null);
                }
                setLoading(false);
            }, (err) => {
                console.error("Error fetching user profile:", err);
                setLoading(false);
            });
        } else {
            setUserProfile(null);
        }

        return () => unsubscribeProfile();
    }, [currentUser]);

    const value = {
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
        loading
    };

    return (
        <AuthContext.Provider value={value}>
            {loading ? (
                <div style={{
                    height: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    color: 'white',
                    background: 'radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)',
                    zIndex: 9999,
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0
                }}>
                    <div style={{
                        position: 'relative',
                        marginBottom: '2rem'
                    }}>
                        {/* Glow Effect */}
                        <div style={{
                            position: 'absolute',
                            top: '50%', left: '50%',
                            transform: 'translate(-50%, -50%)',
                            width: '120px', height: '120px',
                            background: 'radial-gradient(circle, rgba(59,130,246,0.4) 0%, transparent 70%)',
                            borderRadius: '50%',
                            animation: 'pulse-glow 2s infinite'
                        }}></div>

                        {/* Logo */}
                        <div style={{
                            width: '80px', height: '80px',
                            background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                            borderRadius: '20px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 10px 25px rgba(59, 130, 246, 0.5)',
                            position: 'relative',
                            zIndex: 2
                        }}>
                            <FlaskConical size={40} color="white" />
                        </div>
                    </div>

                    <div style={{ textAlign: 'center', zIndex: 2 }}>
                        <h2 style={{
                            fontSize: '1.5rem', fontWeight: 'bold', margin: '0 0 0.5rem 0',
                            background: 'linear-gradient(to right, #fff, #94a3b8)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
                        }}>
                            LAMS 2.0
                        </h2>
                        <div style={{
                            fontSize: '0.9rem', color: '#64748b',
                            display: 'flex', alignItems: 'center', gap: '0.5rem'
                        }}>
                            <span style={{
                                display: 'inline-block', width: '8px', height: '8px',
                                borderRadius: '50%', background: '#3b82f6',
                                animation: 'pulse-glow 1s infinite'
                            }}></span>
                            Initializing System...
                        </div>
                    </div>
                </div>
            ) : (
                children
            )}
        </AuthContext.Provider>
    );
};
