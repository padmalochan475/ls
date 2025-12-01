import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../lib/firebase';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    // Helper to convert Emp ID to Email
    const getEmail = (empId) => `${empId}@lams.app`;

    const login = async (empId, password) => {
        const email = getEmail(empId);
        return signInWithEmailAndPassword(auth, email, password);
    };

    const signup = async (empId, password, name, recoveryEmail) => {
        const email = getEmail(empId);
        const { user } = await createUserWithEmailAndPassword(auth, email, password);

        // Create user profile in Firestore
        await setDoc(doc(db, 'users', user.uid), {
            empId,
            name,
            email: recoveryEmail, // Store real email for recovery
            role: 'user', // Default role
            status: 'pending', // Pending admin approval
            createdAt: new Date().toISOString()
        });

        return user;
    };

    const logout = () => {
        return signOut(auth);
    };

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
                        console.error("No user profile found in Firestore!");
                        setUserProfile(null);
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
        login,
        signup,
        logout,
        loading
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
