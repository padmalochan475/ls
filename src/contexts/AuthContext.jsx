import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../lib/firebase';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail
} from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, collection, getDocs } from 'firebase/firestore';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [systemAcademicYear, setSystemAcademicYear] = useState('2024-2025'); // Global System Default
    const [selectedAcademicYear, setSelectedAcademicYear] = useState(localStorage.getItem('selectedAcademicYear') || null); // User's View Choice
    const [academicYears, setAcademicYears] = useState(['2024-2025']); // List of all years
    const [loading, setLoading] = useState(true);

    // Helper to convert Emp ID to Email
    const getEmail = (empId) => `${empId}@lams.app`;

    const login = async (empId, password) => {
        const email = getEmail(empId);
        return signInWithEmailAndPassword(auth, email, password);
    };

    const signup = async (empId, password, name, recoveryEmail, mobileNumber) => {
        const email = getEmail(empId);
        const { user } = await createUserWithEmailAndPassword(auth, email, password);

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
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            console.log("Auth State Changed:", user ? user.uid : "No User");
            setCurrentUser(user);

            if (user) {
                // Fetch user profile
                const docRef = doc(db, 'users', user.uid);
                try {
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        console.log("User Profile Loaded:", data);
                        setUserProfile(data);
                    } else {
                        console.error("No user profile found in Firestore! Forcing logout.");
                        setUserProfile(null);
                        // Use setTimeout to avoid state update loops during render
                        setTimeout(() => {
                            signOut(auth).catch(e => console.error("Signout error:", e));
                        }, 100);
                    }
                } catch (err) {
                    console.error("Error fetching user profile:", err);
                }
            } else {
                setUserProfile(null);
            }

            setLoading(false);
        });

        return unsubscribe;
    }, []);

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

    console.log("AuthContext State:", {
        selected: selectedAcademicYear,
        system: systemAcademicYear,
        active: value.activeAcademicYear,
        localStorage: localStorage.getItem('selectedAcademicYear'),
        years: academicYears
    });

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
