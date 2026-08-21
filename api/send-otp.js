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
            console.log("Firebase Admin Initialized Successfully from ENV");
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
        let { email, name, templateId, actionType } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Missing email parameter' });
        }
        
        // Normalize
        email = String(email).trim().toLowerCase();
        name = name ? String(name).trim() : 'User';

        if (!process.env.OTP_PEPPER) {
            throw new Error('Server misconfiguration: OTP_PEPPER is missing.');
        }

        // 1. Generate OTP using crypto-secure randomness
        const otp = crypto.randomInt(100000, 1000000).toString();
        
        // 2. Hash OTP using HMAC with a server-side pepper for secure storage
        // A 6-digit OTP is instantly crackable if a DB leak occurs. Using a server-side pepper protects it.
        const pepper = process.env.OTP_PEPPER;
        const otpHash = crypto.createHmac('sha256', pepper).update(otp).digest('hex');

        // 3. Store in Firestore with TTL (10 minutes)
        const db = getDb();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
        
        // Rate limiting logic: Check existing OTP requests
        const otpRef = db.collection('otps').doc(email);
        const existingOtp = await otpRef.get();
        if (existingOtp.exists) {
            const data = existingOtp.data();
            if (data.createdAt && Date.now() - data.createdAt.toMillis() < 60000) {
                // Prevent sending more than 1 OTP per minute
                return res.status(429).json({ error: 'Please wait a minute before requesting another OTP.' });
            }
        }

        await otpRef.set({
            otpHash,
            createdAt: FieldValue.serverTimestamp(),
            expiresAt,
            attempts: 0,
            actionType: actionType || 'signup'
        });

        // 4. Send Email via EmailJS REST API
        const serviceId = process.env.EMAILJS_SERVICE_ID;
        const targetTemplateId = templateId || process.env.EMAILJS_TEMPLATE_ID;
        const publicKey = process.env.EMAILJS_PUBLIC_KEY;

        if (!serviceId || !targetTemplateId || !publicKey) {
            throw new Error("Missing EmailJS environment variables on the server.");
        }

        const emailJsResponse = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                service_id: serviceId,
                template_id: targetTemplateId,
                user_id: publicKey,
                template_params: {
                    to_name: name,
                    to_email: email,
                    email: email, // some templates use 'email'
                    passcode: otp,
                    time: new Date().toLocaleString(),
                    message: actionType === 'admin_auth' 
                        ? "Action Required: Granting Administrator Privileges. Please verify your identity."
                        : "Please verify your email to complete registration."
                }
            })
        });

        if (!emailJsResponse.ok) {
            const errorText = await emailJsResponse.text();
            throw new Error(`EmailJS Error: ${errorText}`);
        }

        return res.status(200).json({ success: true, message: 'OTP sent securely.' });

    } catch (error) {
        console.error('Send OTP Error:', error.message || error);
        return res.status(500).json({
            error: 'Unable to send verification code. Please try again.'
        });
    }
}
