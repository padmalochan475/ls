/* eslint-env node */
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
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
        } else {
            initializeApp();
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
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        let { email, otp, newPassword } = req.body;
        
        if (!email || !otp || !newPassword) {
            return res.status(400).json({ error: 'Missing email, OTP, or new password parameter' });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }

        email = String(email).trim().toLowerCase();
        
        const db = getDb();
        const otpRef = db.collection('otps').doc(email);
        
        // Use a transaction to securely verify and consume the OTP
        const otpValid = await db.runTransaction(async (transaction) => {
            const otpDoc = await transaction.get(otpRef);
            
            if (!otpDoc.exists) {
                throw new Error('OTP expired or does not exist.');
            }
            
            const data = otpDoc.data();
            
            // Check attempts
            if (data.attempts >= 5) {
                transaction.delete(otpRef);
                throw new Error('Too many failed attempts. Please request a new OTP.');
            }
            
            // Check expiration
            if (Date.now() > data.expiresAt.toMillis()) {
                transaction.delete(otpRef);
                throw new Error('OTP has expired. Please request a new one.');
            }
            
            // Verify actionType
            if (data.actionType !== 'password_reset') {
                throw new Error('Invalid OTP context. This OTP was not generated for password reset.');
            }
            
            // Verify hash
            if (!process.env.OTP_PEPPER) {
                throw new Error('Server misconfiguration: OTP_PEPPER is missing.');
            }
            const pepper = process.env.OTP_PEPPER;
            const inputHash = crypto.createHmac('sha256', pepper).update(String(otp).trim()).digest('hex');
            
            if (inputHash === data.otpHash) {
                // Success! Delete the OTP to prevent reuse
                transaction.delete(otpRef);
                return true; // Indicate success
            } else {
                // Failure! Increment attempts
                transaction.update(otpRef, { attempts: data.attempts + 1 });
                throw new Error('Invalid OTP code.');
            }
        });

        if (otpValid) {
            // Update password using Admin SDK
            const auth = getAuth();
            
            try {
                const userRecord = await auth.getUserByEmail(email);
                await auth.updateUser(userRecord.uid, {
                    password: newPassword
                });
                
                return res.status(200).json({ success: true, message: 'Password updated successfully.' });
            } catch (authError) {
                if (authError.code === 'auth/user-not-found') {
                    // This handles the Orphan Profile scenario perfectly
                    return res.status(400).json({ error: 'Your account profile exists but the underlying authentication account is missing or deleted. Please contact your administrator to repair your orphaned profile.' });
                }
                throw authError;
            }
        }

    } catch (error) {
        console.error('Reset Password Error:', error.message || error);
        // We only send back friendly messages, don't leak stack traces
        const message = error.message && (error.message.includes('OTP') || error.message.includes('account profile exists'))
            ? error.message 
            : 'Unable to reset password. Please try again.';
            
        return res.status(400).json({
            error: message
        });
    }
}
