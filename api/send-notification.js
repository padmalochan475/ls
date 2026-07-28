/* eslint-env node */
import admin from 'firebase-admin';

// Singleton Initialization
if (!admin.apps.length) {
    try {
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log("Firebase Admin Initialized Successfully from ENV");
        } else {
            // Fallback to Application Default Credentials
            admin.initializeApp();
            console.log("Firebase Admin Initialized Successfully with Default Credentials");
        }
    } catch (error) {
        console.error("Firebase Admin Init Failed:", error);
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // 🔒 SECURITY: Shared Secret Check
    const SECURITY_KEY = process.env.LAMS_SECRET || process.env.VITE_LAMS_SECRET || 'lams_secure_notification_v1';

    if (req.headers['x-secret-key'] !== SECURITY_KEY) {
        console.warn("Unauthorized API Access Attempt");
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        console.log("API: send-notification (FCM) called.");
        const { targetUids, title, body, data, targetType } = req.body;

        if (!admin.apps.length) {
            throw new Error("Firebase Admin not initialized");
        }

        if (targetUids !== 'ALL' && (!targetUids || !Array.isArray(targetUids) || targetUids.length === 0)) {
            console.log("No targets provided.");
            return res.status(200).json({ success: false, successCount: 0, failureCount: 0 });
        }

        console.log(`Sending FCM Push to ${targetUids === 'ALL' ? 'ALL USERS' : targetUids.length + ' IDs'} (${targetType || 'auto'})`);

        // Fetch tokens for the users
        let tokens = [];
        if (targetUids === 'ALL') {
            const usersSnap = await admin.firestore().collection('users').get();
            usersSnap.forEach(doc => {
                const userData = doc.data();
                if (userData.fcmDeviceTokens) {
                    tokens.push(...Object.values(userData.fcmDeviceTokens));
                }
                if (userData.fcmTokens && Array.isArray(userData.fcmTokens)) {
                    tokens.push(...userData.fcmTokens);
                } else if (userData.fcmToken && typeof userData.fcmToken === 'string') {
                    tokens.push(userData.fcmToken);
                }
            });
        } else {
            // Find by uids using batched getAll for extreme speed and to avoid Vercel 10s timeouts
            const CHUNK_SIZE = 100;
            for (let i = 0; i < targetUids.length; i += CHUNK_SIZE) {
                const chunkUids = targetUids.slice(i, i + CHUNK_SIZE);
                const refs = chunkUids.map(uid => admin.firestore().collection('users').doc(uid));
                
                try {
                    const userDocs = await admin.firestore().getAll(...refs);
                    userDocs.forEach(userDoc => {
                        if (userDoc.exists) {
                            const userData = userDoc.data();
                            if (userData.fcmDeviceTokens) {
                                tokens.push(...Object.values(userData.fcmDeviceTokens));
                            }
                            if (userData.fcmTokens && Array.isArray(userData.fcmTokens)) {
                                tokens.push(...userData.fcmTokens);
                            } else if (userData.fcmToken && typeof userData.fcmToken === 'string') {
                                tokens.push(userData.fcmToken);
                            }
                        }
                    });
                } catch (err) {
                    console.error("Batch fetch error for tokens:", err);
                }
            }
        }

        // Deduplicate tokens
        tokens = [...new Set(tokens)].filter(t => t && typeof t === 'string');

        if (tokens.length === 0) {
            console.log("No valid FCM tokens found for the targets.");
            return res.status(200).json({ success: false, successCount: 0, failureCount: 1, message: "No devices registered for push." });
        }

        // Ensure all data values are strings (FCM requirement)
        const fcmData = {};
        if (data && typeof data === 'object') {
            for (const [key, value] of Object.entries(data)) {
                fcmData[key] = String(value);
            }
        }

        const message = {
            notification: {
                title: title || 'LAMS Update',
                body: body || 'You have a new notification.'
            },
            data: fcmData,
            tokens: tokens,
            android: {
                priority: 'high',
                notification: {
                    channelId: 'lams_alerts_channel',
                    priority: 'max',
                    defaultSound: true,
                    defaultVibrateTimings: true,
                    visibility: 'public'
                }
            },
            apns: {
                headers: {
                    'apns-priority': '10',
                    'apns-push-type': 'alert'
                },
                payload: {
                    aps: {
                        sound: 'default'
                    }
                }
            },
            webpush: {
                headers: {
                    Urgency: 'high'
                },
                notification: {
                    icon: 'https://lams.vercel.app/logo.png',
                    badge: 'https://lams.vercel.app/logo.png',
                    vibrate: [200, 100, 200],
                    requireInteraction: true
                },
                fcmOptions: {
                    link: fcmData.url || 'https://lams.vercel.app/'
                }
            }
        };

        let successCount = 0;
        let failureCount = 0;
        const failedTokens = [];
        const chunkSize = 500;

        for (let i = 0; i < tokens.length; i += chunkSize) {
            const chunk = tokens.slice(i, i + chunkSize);
            const chunkMessage = { ...message, tokens: chunk };
            const response = await admin.messaging().sendEachForMulticast(chunkMessage);
            
            successCount += response.successCount;
            failureCount += response.failureCount;

            if (response.failureCount > 0) {
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        const error = resp.error;
                        if (error.code === 'messaging/invalid-registration-token' ||
                            error.code === 'messaging/registration-token-not-registered') {
                            failedTokens.push(chunk[idx]);
                        }
                    }
                });
            }
        }
        
        console.log(`FCM sendMulticast result: ${successCount} successful, ${failureCount} failed.`);
        
        // Clean up invalid tokens
        if (failedTokens.length > 0) {
            console.log(`Need to clean up ${failedTokens.length} dead tokens (This usually is done via client sync, but could be handled here).`);
        }

        return res.status(200).json({
            success: true,
            successCount: successCount,
            failureCount: failureCount,
            errors: [] // FCM handles its own errors per token
        });

    } catch (error) {
        console.error('FCM API Error:', error);

        return res.status(500).json({
            error: 'Internal Server Error',
            details: error.message
        });
    }
}

