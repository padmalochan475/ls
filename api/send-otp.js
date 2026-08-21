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

        // 4. Send Email via Nodemailer
        const { SMTP_USER, SMTP_PASSWORD } = process.env;
        
        if (!SMTP_USER || !SMTP_PASSWORD) {
            throw new Error("Missing SMTP_USER or SMTP_PASSWORD environment variables.");
        }

        // We use nodemailer to connect to Gmail, Outlook, Office365 etc.
        const nodemailer = require('nodemailer');
        
        // Dynamically determine host if not specified, default to office365 if microsoft, else gmail
        let smtpHost = 'smtp.gmail.com';
        if (SMTP_USER.includes('@outlook') || SMTP_USER.includes('@hotmail') || SMTP_USER.includes('@live') || SMTP_USER.includes('@office365') || process.env.SMTP_HOST === 'smtp.office365.com') {
            smtpHost = 'smtp.office365.com';
        }

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || smtpHost,
            port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587,
            secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
            auth: {
                user: SMTP_USER,
                pass: SMTP_PASSWORD
            }
        });

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

        const senderEmail = process.env.SMTP_FROM || SMTP_USER;
        await transporter.sendMail({
            from: `"LAMS Security" <${senderEmail}>`,
            to: email,
            subject: subject,
            text: `${messageText} Your OTP is: ${otp}`,
            html: htmlContent
        });

        return res.status(200).json({ success: true, message: 'OTP sent securely via SMTP.' });

    } catch (error) {
        console.error('Send OTP Error:', error.message || error);
        return res.status(500).json({
            error: 'Unable to send verification code. Please try again.'
        });
    }
}
