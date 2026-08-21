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

        let htmlContent = "";

        if (actionType === 'password_reset') {
            htmlContent = `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>LAMS Password Reset</title>
    <style>
        body { margin: 0; padding: 0; background-color: #f3f4f6; font-family: 'Segoe UI', Inter, Arial, sans-serif; }
        .main-card { background-color: #ffffff; border-radius: 16px; box-shadow: 0 20px 40px rgba(0,0,0,0.05); overflow: hidden; }
        .header-bg {
            background: linear-gradient(135deg, #1f2937, #111827);
            padding: 40px 20px; text-align: center;
        }
        .pulse-icon {
            animation: pulse 2s infinite;
        }
        @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.1); } 100% { transform: scale(1); } }
        .otp-container {
            margin: 35px auto;
            background: #fff7ed;
            border: 2px dashed #f97316;
            border-radius: 12px;
            padding: 24px;
            width: 80%;
            max-width: 320px;
        }
        .otp-code {
            font-size: 42px;
            font-weight: 800;
            color: #ea580c;
            letter-spacing: 8px;
            display: block;
            text-align: center;
        }
    </style>
</head>
<body style="margin:0;padding:0;">
    <center style="width: 100%; background-color: #f3f4f6; padding: 40px 0;">
        <table align="center" width="600" border="0" cellpadding="0" cellspacing="0" style="width:600px; margin:0 auto;" class="main-card">
            <tr>
                <td class="header-bg">
                    <div class="pulse-icon" style="font-size: 40px; margin-bottom: 15px;">🔒</div>
                    <h1 style="color:#ffffff; margin:0; font-size:24px; letter-spacing:1px;">PASSWORD RESET</h1>
                </td>
            </tr>
            <tr>
                <td style="padding:45px 50px; text-align:center;">
                    <h2 style="color:#111827; font-size:22px; margin:0 0 15px 0;">Hi ${name},</h2>
                    <p style="color:#4b5563; font-size:16px; line-height:1.6; margin:0 0 30px 0;">
                        ${messageText}
                    </p>
                    <div class="otp-container">
                        <span class="otp-code">${otp}</span>
                    </div>
                    <p style="color:#6b7280; font-size:14px; margin:35px 0 0 0;">
                        This code will expire in 10 minutes.<br/>
                        If you didn't request this, you can safely ignore this email. Your password will remain unchanged.
                    </p>
                </td>
            </tr>
            <tr>
                <td style="padding:20px; text-align:center; background-color:#f9fafb; color:#9ca3af; font-size:12px;">
                    LAMS Security System &copy; 2026<br/>
                    Time of request: ${new Date().toLocaleString()}
                </td>
            </tr>
        </table>
    </center>
</body>
</html>`;
        } else {
            htmlContent = `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Welcome to LAMS</title>
    <style>
        table, td, div, h1, p { font-family: 'Segoe UI', Inter, Arial, sans-serif; }
        body { margin: 0; padding: 0; background-color: #f3f4f6; }
        .wrapper { width: 100%; table-layout: fixed; background-color: #f3f4f6; padding-bottom: 60px; }
        .main-card {
            background-color: #ffffff;
            border-radius: 16px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0,0,0,0.05);
            overflow: hidden;
            border: 1px solid rgba(255, 255, 255, 0.8);
        }
        .header-bg {
            background: linear-gradient(-45deg, #059669, #10b981, #047857, #34d399);
            background-size: 400% 400%;
            animation: gradientBG 10s ease infinite;
            padding: 45px 20px;
            text-align: center;
        }
        @keyframes gradientBG {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }
        .otp-container {
            margin: 35px auto;
            background: #ecfdf5;
            border: 2px dashed #10b981;
            border-radius: 12px;
            padding: 24px;
            width: 80%;
            max-width: 320px;
            box-shadow: 0 0 20px rgba(16, 185, 129, 0.15);
            transition: transform 0.3s ease;
        }
        .otp-container:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(16, 185, 129, 0.25);
        }
        .otp-code {
            font-size: 42px;
            font-weight: 800;
            color: #047857;
            letter-spacing: 8px;
            display: block;
            text-align: center;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.05);
        }
    </style>
</head>
<body style="margin:0;padding:0;">
    <center class="wrapper">
        <div style="background-color: #f3f4f6; padding: 40px 0;">
            <table align="center" width="600" border="0" cellpadding="0" cellspacing="0" style="width:600px; margin:0 auto;" class="main-card">
                <tr>
                    <td class="header-bg">
                        <h1 style="color:#ffffff; margin:0; font-size:32px; font-weight:800; letter-spacing:2px;">LAMS</h1>
                        <p style="color:#d1fae5; margin:10px 0 0 0; font-size:15px; font-weight:500; letter-spacing: 1px;">SECURE VERIFICATION</p>
                    </td>
                </tr>
                <tr>
                    <td style="padding:45px 50px; text-align:center;">
                        <h2 style="color:#111827; font-size:26px; font-weight:700; margin:0 0 12px 0;">Hello, ${name}!</h2>
                        <p style="color:#4b5563; font-size:16px; line-height:1.6; margin:0 0 30px 0;">
                            ${messageText}
                        </p>
                        <div class="otp-container">
                            <span class="otp-code">${otp}</span>
                        </div>
                        <p style="color:#6b7280; font-size:14px; margin:0;">
                            This code securely expires in <strong style="color:#111827;">10 minutes</strong>.
                        </p>
                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:35px;">
                            <tr>
                                <td style="background-color:#fff1f2; border-left: 4px solid #e11d48; border-radius:4px 8px 8px 4px; padding:16px; text-align:left;">
                                    <p style="color:#be123c; font-size:13px; margin:0; line-height:1.5;">
                                        <strong>Security Alert:</strong> LAMS staff will never ask for this code. Do not share it with anyone.
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
                <tr>
                    <td style="padding:24px; text-align:center; background-color:#f9fafb; color:#9ca3af; font-size:13px; border-top:1px solid #f3f4f6;">
                        Lab Assignment Management System &copy; 2026<br/>
                        Time of request: ${new Date().toLocaleString()}
                    </td>
                </tr>
            </table>
        </div>
    </center>
</body>
</html>`;
        }

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
