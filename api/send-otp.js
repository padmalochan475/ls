/* eslint-env node */
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';

// --- Microsoft Graph API Email Service ---
let cachedToken = null;
let tokenExpiresAt = null;

async function getMicrosoftGraphToken() {
    const { MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET } = process.env;
    if (!MS_TENANT_ID || !MS_CLIENT_ID || !MS_CLIENT_SECRET) {
        throw new Error('OAuth2_Config_Missing');
    }

    if (cachedToken && tokenExpiresAt && Date.now() < tokenExpiresAt) {
        return cachedToken;
    }

    const url = `https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`;
    const params = new URLSearchParams({
        client_id: MS_CLIENT_ID,
        client_secret: MS_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials'
    });

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
    });

    if (!response.ok) {
        let errDetails = '';
        try { errDetails = await response.text(); } catch(e) {}
        throw new Error(`Token_Fetch_Failed|HTTP_${response.status}`);
    }

    const data = await response.json();
    cachedToken = data.access_token;
    // Expire 5 minutes early for safety
    tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000; 

    return cachedToken;
}

async function sendEmail({ to, subject, html }) {
    const { MS_SENDER_EMAIL } = process.env;
    if (!MS_SENDER_EMAIL) {
        throw new Error('Sender_Config_Missing');
    }

    const token = await getMicrosoftGraphToken();
    const url = `https://graph.microsoft.com/v1.0/users/${MS_SENDER_EMAIL}/sendMail`;

    const messagePayload = {
        message: {
            subject: subject,
            body: {
                contentType: 'HTML',
                content: html
            },
            toRecipients: [{ emailAddress: { address: to } }]
        },
        saveToSentItems: 'false'
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(messagePayload)
    });

    if (!response.ok) {
        let errDetails = '';
        try { errDetails = await response.text(); } catch(e) {}
        throw new Error(`Graph_API_Failed|HTTP_${response.status}`);
    }
    return true;
}
// -----------------------------------------

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
        
        // Rate limiting logic: Check existing OTP requests (Per-Email)
        const otpRef = db.collection('otps').doc(email);
        const existingOtp = await otpRef.get();
        if (existingOtp.exists) {
            const data = existingOtp.data();
            if (data.createdAt && Date.now() - data.createdAt.toMillis() < 60000) {
                // Prevent sending more than 1 OTP per minute
                return res.status(429).json({ error: 'Please wait a minute before requesting another OTP.' });
            }
        }

        // Rate limiting logic: Global/IP abuse protection
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown_ip';
        const ipRef = db.collection('rate_limits').doc(`ip_${clientIp.replace(/\./g, '_')}`);
        const ipData = await ipRef.get();
        let requestCount = 1;
        if (ipData.exists) {
            const data = ipData.data();
            if (data.windowStart && Date.now() - data.windowStart.toMillis() < 15 * 60 * 1000) { // 15 min window
                if (data.count >= 10) {
                    console.warn(JSON.stringify({ event: "RateLimit_Exceeded", ip: clientIp, email }));
                    return res.status(429).json({ error: 'Too many requests from this IP. Please try again later.' });
                }
                requestCount = data.count + 1;
            }
        }
        await ipRef.set({
            count: requestCount,
            windowStart: requestCount === 1 ? FieldValue.serverTimestamp() : (ipData.exists ? ipData.data().windowStart : FieldValue.serverTimestamp())
        });

        await otpRef.set({
            otpHash,
            createdAt: FieldValue.serverTimestamp(),
            expiresAt,
            attempts: 0,
            actionType: actionType || 'signup'
        });

        // 4. Send Email via Microsoft Graph API Service
        let subject = "LAMS Registration - Email Verification";
        let messageText = "Please verify your email to complete registration.";
        
        if (actionType === 'admin_auth') {
            subject = "LAMS Admin Security Alert";
            messageText = "Action Required: Granting Administrator Privileges. Please verify your identity.";
        } else if (actionType === 'password_reset') {
            subject = "LAMS Password Reset";
            messageText = "Action Required: Password Reset. Please use this OTP to securely reset your LAMS password.";
        }

        const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px;">
            <h2 style="color: #333; text-align: center;">LAMS Authentication</h2>
            <p style="color: #555; font-size: 16px;">Hello ${name},</p>
            <p style="color: #555; font-size: 16px;">${messageText}</p>
            <div style="background-color: #f4f4f4; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #000;">${otp}</span>
            </div>
            <p style="color: #888; font-size: 12px; text-align: center;">This code will expire in 10 minutes. If you did not request this, please ignore this email.</p>
            <p style="color: #888; font-size: 12px; text-align: center;">Time of request: ${new Date().toLocaleString()}</p>
        </div>
        `;

        await sendEmail({
            to: email,
            subject: subject,
            html: htmlContent
        });

        // Structured success logging (Sanitized)
        console.log(JSON.stringify({
            event: "OTP_Sent_Successfully",
            actionType,
            recipientDomain: email.split('@')[1],
            timestamp: new Date().toISOString()
        }));

        return res.status(200).json({ success: true, message: 'OTP sent securely.' });

    } catch (error) {
        // Structured error logging (Sanitized - no credentials, no OTPs, no raw MS errors)
        console.error(JSON.stringify({
            event: "OTP_Delivery_Failed",
            actionType: req.body?.actionType || 'signup',
            errorCategory: error.message || 'Unknown',
            timestamp: new Date().toISOString()
        }));

        return res.status(500).json({
            error: 'Unable to send verification code. Please try again.'
        });
    }
}
