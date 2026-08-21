/* eslint-env node */
import { initializeApp, getApps, cert } from 'firebase-admin/app';
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
        let { email, otp, actionType } = req.body;
        
        if (!email || !otp) {
            return res.status(400).json({ error: 'Missing email or OTP parameter' });
        }
        
        email = String(email).trim().toLowerCase();
        
        const db = getDb();
        const otpRef = db.collection('otps').doc(email);
        
        return await db.runTransaction(async (transaction) => {
            const otpDoc = await transaction.get(otpRef);
            
            if (!otpDoc.exists) {
                return res.status(400).json({ success: false, error: 'OTP expired or does not exist.' });
            }
            
            const data = otpDoc.data();
            
            // Check attempts
            if (data.attempts >= 5) {
                transaction.delete(otpRef); // Clear after max attempts
                return res.status(400).json({ success: false, error: 'Too many failed attempts. Please request a new OTP.' });
            }
            
            // Check expiration
            if (Date.now() > data.expiresAt.toMillis()) {
                transaction.delete(otpRef);
                return res.status(400).json({ success: false, error: 'OTP has expired. Please request a new one.' });
            }
            
            // Verify actionType if provided
            if (actionType && data.actionType !== actionType) {
                return res.status(400).json({ success: false, error: 'Invalid OTP context.' });
            }
            
            // Verify hash
            if (!process.env.OTP_PEPPER) {
                return res.status(500).json({ success: false, error: 'Server misconfiguration: OTP_PEPPER is missing.' });
            }
            const pepper = process.env.OTP_PEPPER;
            const inputHash = crypto.createHmac('sha256', pepper).update(String(otp).trim()).digest('hex');
            
            if (inputHash === data.otpHash) {
                // Success! Delete the OTP to prevent reuse
                transaction.delete(otpRef);
                return res.status(200).json({ success: true, message: 'OTP verified successfully.' });
            } else {
                // Failure! Increment attempts
                transaction.update(otpRef, { attempts: FieldValue.increment(1) });
                return res.status(400).json({ success: false, error: 'Invalid OTP.' });
            }
        });
        
    } catch (error) {
        console.error('Verify OTP Error:', error);
        return res.status(500).json({
            error: 'Failed to verify OTP',
            details: error.message
        });
    }
}
