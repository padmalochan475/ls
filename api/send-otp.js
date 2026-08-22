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

        let htmlContent = `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>LAMS Secure Verification</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap');
        
        body, table, td, div, p, span, h1, h2, h3 {
            font-family: 'Outfit', 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif;
            margin: 0;
            padding: 0;
        }

        body {
            background-color: #020617; /* Very dark slate */
            -webkit-font-smoothing: antialiased;
        }

        .wrapper {
            width: 100%;
            background: #020617;
            background-image: radial-gradient(circle at top right, #1e1b4b, #020617), radial-gradient(circle at bottom left, #064e3b, #020617);
            padding: 60px 0;
        }

        .main-card {
            background-color: #0f172a;
            border-radius: 24px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8);
            border: 1px solid #1e293b;
            overflow: hidden;
            /* Entrance Animation */
            animation: slideUp 1s ease-out forwards;
        }

        @keyframes slideUp {
            from { opacity: 0; transform: translateY(40px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .header-bg {
            background: linear-gradient(-45deg, #2563eb, #7c3aed, #db2777, #059669);
            background-size: 300% 300%;
            animation: gradientSpin 8s ease infinite;
            padding: 50px 20px;
            text-align: center;
        }

        @keyframes gradientSpin {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }

        .brand-logo {
            color: #ffffff;
            font-size: 46px;
            font-weight: 800;
            letter-spacing: 8px;
            margin: 0;
            text-shadow: 0 4px 20px rgba(255,255,255,0.4);
            animation: logoGlow 2.5s ease-in-out infinite alternate;
        }

        @keyframes logoGlow {
            0% { text-shadow: 0 4px 15px rgba(255,255,255,0.3); transform: scale(1); }
            100% { text-shadow: 0 4px 35px rgba(255,255,255,0.8); transform: scale(1.02); }
        }

        .otp-container {
            margin: 40px auto;
            background: #1e293b;
            border-radius: 16px;
            padding: 30px;
            width: 80%;
            max-width: 320px;
            position: relative;
            /* Neon Border Pulse */
            box-shadow: 0 0 0 2px #3b82f6, 0 0 20px rgba(59, 130, 246, 0.4);
            animation: neonPulse 2s infinite alternate;
        }

        @keyframes neonPulse {
            0% { box-shadow: 0 0 0 2px #3b82f6, 0 0 15px rgba(59, 130, 246, 0.3); }
            100% { box-shadow: 0 0 0 2px #8b5cf6, 0 0 35px rgba(139, 92, 246, 0.7); }
        }

        .otp-code {
            font-size: 48px;
            font-weight: 800;
            color: #f8fafc;
            letter-spacing: 12px;
            display: block;
            text-align: center;
            /* Text gradient fallback */
            background: -webkit-linear-gradient(45deg, #60a5fa, #c084fc, #f472b6);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .warning-box {
            background-color: rgba(225, 29, 72, 0.1);
            border-left: 4px solid #e11d48;
            border-radius: 6px 12px 12px 6px;
            padding: 16px 20px;
            margin-top: 40px;
        }
    </style>
</head>
<body style="margin:0;padding:0;">
    <center class="wrapper">
        <div style="width: 100%; padding: 40px 0;">
            <table role="presentation" class="main-content" align="center" width="600" border="0" cellpadding="0" cellspacing="0" style="width:600px; margin:0 auto;">
                <tr>
                    <td align="center" class="main-card">
                        
                        <!-- Header -->
                        <div class="header-bg">
                            <h1 class="brand-logo">LAMS</h1>
                            <p style="color:rgba(255,255,255,0.8); font-size:14px; letter-spacing:3px; margin-top:10px; font-weight:600; text-transform:uppercase;">Secure Verification</p>
                        </div>

                        <!-- Content Area -->
                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                            <tr>
                                <td style="padding:50px; text-align:center;">
                                    <h2 style="color:#f8fafc; font-size:26px; font-weight:800; margin:0 0 15px 0;">Hello, ${name} ✨</h2>
                                    
                                    <p style="color:#94a3b8; font-size:16px; line-height:1.7; margin:0 0 30px 0;">
                                        ${messageText}
                                    </p>

                                    <!-- OTP Box -->
                                    <div class="otp-container">
                                        <span class="otp-code">${otp}</span>
                                    </div>

                                    <p style="color:#64748b; font-size:14px; margin:0; font-weight:600;">
                                        This highly secure passcode expires in <span style="color:#f8fafc;">10 minutes</span>.
                                    </p>

                                    <!-- Warning Alert -->
                                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="warning-box">
                                        <tr>
                                            <td style="text-align:left;">
                                                <p style="color:#fb7185; font-size:13px; margin:0; line-height:1.6;">
                                                    <strong style="color:#f43f5e;">⚠️ Security Alert:</strong> LAMS staff will NEVER ask for this code. If you verify this email, you are confirming you own this LAMS account. Do not share this code.
                                                </p>
                                            </td>
                                        </tr>
                                    </table>

                                </td>
                            </tr>
                        </table>

                        <!-- Footer -->
                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#020617; border-top:1px solid #1e293b;">
                            <tr>
                                <td style="padding:25px; text-align:center; color:#475569; font-size:12px; font-weight:600;">
                                    <p style="margin:0 0 8px 0; letter-spacing:1px; text-transform:uppercase;">Sent securely by LAMS</p>
                                    <p style="margin:0;">&copy; 2026 Lab Assignment Management System</p>
                                    <p style="margin:8px 0 0 0; color:#334155;">Time of request: ${new Date().toLocaleString()}</p>
                                </td>
                            </tr>
                        </table>

                    </td>
                </tr>
            </table>
        </div>
    </center>
</body>
</html>`;

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
