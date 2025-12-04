import React, { createContext, useContext, useEffect, useState } from 'react';
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
    const [selectedAcademicYear, setSelectedAcademicYear] = useState(localStorage.getItem('selectedAcademicYear') || null); // User's View Choice
    const [academicYears, setAcademicYears] = useState(['2024-2025']); // List of all years
    const [loading, setLoading] = useState(true);



    const login = async (identifier, password) => {
        let email = identifier;

        // Check if input is NOT an email (assume it is EmpID)
        if (!identifier.includes('@')) {
            // Query Firestore to find email associated with this EmpID
            const q = query(collection(db, 'users'), where('empId', '==', identifier));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                throw new Error("Employee ID not found.");
            }

            const userData = querySnapshot.docs[0].data();
            if (!userData.email) {
                throw new Error("No email linked to this Employee ID.");
            }
            email = userData.email;
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
        console.log("Setting Selected Year:", year);
        setSelectedAcademicYear(year);
        localStorage.setItem('selectedAcademicYear', year);
    };
    // Listen for Academic Year Changes (Global Config)
    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, 'settings', 'config'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const fetchedSystemYear = data.activeAcademicYear;
                const fetchedYears = data.academicYears || [];

                setSystemAcademicYear(fetchedSystemYear);
                setAcademicYears([...fetchedYears]); // Force new reference

                // Validate User's Selection
                const storedYear = localStorage.getItem('selectedAcademicYear');
                if (storedYear) {
                    if (fetchedYears.includes(storedYear)) {
                        setSelectedAcademicYear(storedYear);
                    } else {
                        // Stored year is invalid (removed from system), reset to default
                        console.warn("Stored academic year is invalid, resetting to system default.");
                        localStorage.removeItem('selectedAcademicYear');
                        setSelectedAcademicYear(fetchedSystemYear);
                    }
                } else {
                    // No selection, use system default
                    setSelectedAcademicYear(fetchedSystemYear);
                }
            } else {
                // Initialize if missing
                setDoc(doc(db, 'settings', 'config'), {
                    activeAcademicYear: '2024-2025',
                    academicYears: ['2024-2025']
                });
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            console.log("Auth State Changed:", user ? user.uid : "No User");
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

                    // Emergency Admin Override
                    if (currentUser.email === 'padmalochan.maharana@tat.ac.in') {
                        data.role = 'admin';
                        data.status = 'approved';
                    }

                    console.log("User Profile Updated:", data);
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
