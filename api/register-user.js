/* eslint-env node */
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';

// Singleton Initialization
if (!getApps().length) {
    try {
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            let serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT;
            if (serviceAccountStr.startsWith('"') && serviceAccountStr.endsWith('"')) {
                serviceAccountStr = serviceAccountStr.slice(1, -1);
            }
            serviceAccountStr = serviceAccountStr.replace(/\n/g, '\\n').replace(/\\\\n/g, '\\n');
            const serviceAccount = JSON.parse(serviceAccountStr);
            initializeApp({
                credential: cert(serviceAccount)
            });
            console.log("Firebase Admin Initialized Successfully from ENV");
        } else {
            initializeApp();
            console.log("Firebase Admin Initialized Successfully with Default Credentials");
        }
    } catch (error) {
        console.error("Firebase Admin Init Failed:", error);
    }
}

let dbInstance = null;
function getDb() {
    if (!dbInstance) dbInstance = getFirestore();
    return dbInstance;
}

export default async function handler(req, res) {
    // Enable CORS manually
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        let { email, name, empId, mobile, password, otp } = req.body;
        
        if (!email || !empId || !password || !otp) {
            return res.status(400).json({ error: 'Missing required registration parameters.' });
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        const finalEmpId = String(empId).trim();
        const syncedName = String(name || '').trim();
        const mobileNumber = String(mobile || '').trim();

        if (!getApps().length) {
            throw new Error("Firebase Admin not initialized. Check server logs.");
        }

        const db = getDb();
        const auth = getAuth();

        // ---------------------------------------------------------------------------
        // PRE-FLIGHT SECURITY CHECKS
        // ---------------------------------------------------------------------------
        
        // 1. Check if EmpID is taken
        const lookupDoc = await db.collection('emp_lookups').doc(finalEmpId).get();
        if (lookupDoc.exists && lookupDoc.data().uid) {
            return res.status(400).json({ error: "This Employee ID is already registered. Please login or contact Admin." });
        }

        // 2. Check if Faculty exists and validate official email
        let isFaculty = false;
        let facultySnap = await db.collection('faculty').where('empId', '==', finalEmpId).get();
        
        if (facultySnap.empty) {
            facultySnap = await db.collection('faculty').where('email', '==', normalizedEmail).get();
        }
        
        if (!facultySnap.empty) {
            const facDoc = facultySnap.docs[0];
            const facData = facDoc.data();
            
            // STRICT SECURITY: If Admin has NOT set an email, block the hijack attempt!
            if (!facData.email) {
                return res.status(400).json({ error: "This Faculty profile is locked because no official email is assigned. Please ask Admin to update your email in Master Data before you can register." });
            }
            
            // STRICT SECURITY: If Admin has set an email, the signup email MUST match!
            if (facData.email.toLowerCase() !== normalizedEmail) {
                return res.status(400).json({ error: "This Employee ID is securely linked to a different official email. Please use the correct email or contact Admin." });
            }
            
            isFaculty = true;
        }

        // ---------------------------------------------------------------------------
        // OTP VERIFICATION (Transactional)
        // ---------------------------------------------------------------------------
        const otpRef = db.collection('otps').doc(normalizedEmail);
        
        const otpResult = await db.runTransaction(async (transaction) => {
            const otpDoc = await transaction.get(otpRef);
            
            if (!otpDoc.exists) {
                return { success: false, error: 'OTP expired or does not exist.' };
            }
            
            const data = otpDoc.data();
            
            if (data.attempts >= 5) {
                transaction.delete(otpRef);
                return { success: false, error: 'Too many failed attempts. Please request a new OTP.' };
            }
            
            if (Date.now() > data.expiresAt.toMillis()) {
                transaction.delete(otpRef);
                return { success: false, error: 'OTP has expired. Please request a new one.' };
            }
            
            if (data.actionType !== 'signup') {
                return { success: false, error: 'Invalid OTP context.' };
            }
            
            if (!process.env.OTP_PEPPER) {
                return { success: false, error: 'Server misconfiguration: OTP_PEPPER is missing.' };
            }
            const pepper = process.env.OTP_PEPPER;
            const inputHash = crypto.createHmac('sha256', pepper).update(String(otp).trim()).digest('hex');
            
            if (inputHash === data.otpHash) {
                // Success! Delete the OTP to prevent reuse
                transaction.delete(otpRef);
                return { success: true };
            } else {
                // Failure! Increment attempts
                transaction.update(otpRef, { attempts: FieldValue.increment(1) });
                return { success: false, error: 'Invalid OTP.' };
            }
        });

        if (!otpResult.success) {
            return res.status(400).json({ error: otpResult.error });
        }

        // ---------------------------------------------------------------------------
        // ACCOUNT CREATION & PROFILE BATCH
        // ---------------------------------------------------------------------------
        let userRecord;
        try {
            userRecord = await auth.createUser({
                email: normalizedEmail,
                password: password, // Plaintext password securely transmitted over HTTPS and passed directly to Auth SDK (never logged/stored by us)
                displayName: syncedName,
            });
        } catch (authErr) {
            console.error('Firebase Auth Creation Error:', authErr);
            if (authErr.code === 'auth/email-already-exists') {
                return res.status(400).json({ error: 'The email address is already in use by another account.' });
            }
            return res.status(500).json({ error: 'Failed to create authentication account.' });
        }

        const userProfileData = {
            empId: finalEmpId,
            name: syncedName,
            email: normalizedEmail,
            mobile: mobileNumber,
            // Strict role separation. Default unprivileged values.
            role: 'user', 
            accountStatus: 'active',
            approvalStatus: 'pending',
            masterDataLinked: false,
            isFaculty: isFaculty,
            whatsappEnabled: true,
            createdAt: new Date().toISOString()
        };

        try {
            const batch = db.batch();
            batch.set(db.collection('users').doc(userRecord.uid), userProfileData);
            batch.set(db.collection('emp_lookups').doc(finalEmpId), { email: normalizedEmail, uid: userRecord.uid });
            await batch.commit();
        } catch (err) {
            console.error("Critical error creating Firestore profile:", err);
            // Rollback Auth User to prevent zombie accounts
            try {
                await auth.deleteUser(userRecord.uid);
            } catch (rollbackErr) {
                console.error("Failed to rollback auth user:", rollbackErr);
            }
            return res.status(500).json({ error: "Failed to create user profile in database. Please try again." });
        }

        return res.status(200).json({ 
            success: true, 
            message: 'Registration successful.',
            uid: userRecord.uid
        });

    } catch (error) {
        console.error('Register User API Error:', error);
        return res.status(500).json({
            error: 'Failed to process registration',
            details: error.message
        });
    }
}
