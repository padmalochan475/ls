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
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>Welcome to LAMS</title>
    <!--[if mso]>
    <noscript>
        <xml>
            <o:OfficeDocumentSettings>
                <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
        </xml>
    </noscript>
    <![endif]-->
    <style>
        table,
        td,
        div,
        h1,
        p {
            font-family: 'Segoe UI', Arial, sans-serif;
        }

        /* Desktop Base */
        body {
            margin: 0;
            padding: 0;
            background-color: #f0fdf4;
        }

        .wrapper {
            width: 100%;
            table-layout: fixed;
            background-color: #f0fdf4;
            padding-bottom: 60px;
        }

        /* The "Premium" Card Look */
        .main-card {
            background-color: #ffffff;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.08);
            overflow: hidden;
            border: 1px solid rgba(0, 0, 0, 0.02);
        }

        /* Header Gradient */
        .header-bg {
            background: linear-gradient(120deg, #059669 0%, #10b981 100%);
            padding: 40px;
            text-align: center;
        }

        .otp-container {
            margin: 30px auto;
            background: #ecfdf5;
            border: 2px dashed #34d399;
            border-radius: 12px;
            padding: 20px;
            width: 80%;
            max-width: 300px;
        }

        .otp-code {
            font-size: 36px;
            font-weight: 800;
            color: #064e3b;
            letter-spacing: 5px;
            display: block;
            text-align: center;
        }

        /* Mobile Responsive Styles */
        @media only screen and (max-width: 600px) {
            .wrapper {
                padding-bottom: 0;
                background-color: #ffffff;
            }

            /* Remove body bg on mobile */
            .main-content {
                width: 100% !important;
            }

            .main-card {
                box-shadow: none !important;
                border: none !important;
                border-radius: 0 !important;
            }

            .header-bg {
                padding: 30px 20px !important;
            }

            .body-padding {
                padding: 20px !important;
            }

            .otp-container {
                width: 100% !important;
                max-width: none !important;
                box-sizing: border-box;
            }

            .otp-code {
                font-size: 32px !important;
                letter-spacing: 3px !important;
            }

            h1 {
                font-size: 24px !important;
            }

            .greeting-text {
                font-size: 20px !important;
            }
        }
    </style>
</head>

<body style="margin:0;padding:0;">
    <center class="wrapper">
        <div style="background-color: #f0fdf4; height: 100%; width: 100%;">

            <!-- Spacer for Desktop -->
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
                style="background-color: #f0fdf4;" class="desktop-spacer">
                <tr>
                    <td height="40" style="font-size:40px; line-height:40px;">&nbsp;</td>
                </tr>
            </table>

            <!-- Main Container -->
            <table role="presentation" class="main-content" align="center" width="600" border="0" cellpadding="0"
                cellspacing="0" style="width:600px; margin:0 auto;">
                <tr>
                    <td align="center" class="main-card">

                        <!-- Header -->
                        <div class="header-bg">
                            <h1
                                style="color:#ffffff; margin:0; font-size:28px; letter-spacing:1px; text-transform: uppercase;">
                                LAMS</h1>
                        </div>

                        <!-- Content -->
                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                            <tr>
                                <td class="body-padding" style="padding:40px 50px; text-align:center;">

                                    <h2 class="greeting-text" style="color:#064e3b; font-size:24px; margin:0 0 10px 0;">
                                        Hello, ${name}! 👋</h2>
                                    <p
                                        style="color:#059669; font-size:14px; font-weight:600; text-transform:uppercase; letter-spacing:1px; margin:0 0 25px 0;">
                                        Welcome to LAMS</p>

                                    <p style="color:#4b5563; font-size:16px; line-height:1.6; margin:0 0 30px 0;">
                                        ${messageText}
                                    </p>

                                    <!-- OTP Box -->
                                    <div class="otp-container">
                                        <span class="otp-code">${otp}</span>
                                    </div>

                                    <p style="color:#6b7280; font-size:14px; margin:0;">
                                        This code expires in <strong>10 minutes</strong>.
                                    </p>

                                    <!-- Warning -->
                                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
                                        style="margin-top:30px;">
                                        <tr>
                                            <td
                                                style="background-color:#fff1f2; border-radius:8px; padding:15px; text-align:left;">
                                                <p style="color:#9f1239; font-size:13px; margin:0; line-height:1.5;">
                                                    <strong>⚠️ Security Alert:</strong> If you verify this email, you
                                                    are confirming you own this LAMS account. Do not share this code.
                                                </p>
                                            </td>
                                        </tr>
                                    </table>

                                </td>
                            </tr>
                        </table>

                        <!-- Footer -->
                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
                            style="background-color:#f9fafb; border-top:1px solid #e5e7eb;">
                            <tr>
                                <td style="padding:20px; text-align:center; color:#9ca3af; font-size:12px;">
                                    <p style="margin:0 0 10px 0;">Sent securely by LAMS - Lab Assignment Management
                                        System</p>
                                    <p style="margin:0;">&copy; 2026 LAMS Inc.</p>
                                </td>
                            </tr>
                        </table>

                    </td>
                </tr>
            </table>

            <!-- Spacer for Desktop -->
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
                style="background-color: #f0fdf4;">
                <tr>
                    <td height="40" style="font-size:40px; line-height:40px;">&nbsp;</td>
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
