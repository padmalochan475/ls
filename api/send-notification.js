/* eslint-env node */
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

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
            // Fallback to Application Default Credentials
            admin.initializeApp();
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
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-secret-key'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // 🔒 SECURITY: Verify Firebase Auth Token instead of relying on a shared secret
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }
    const idToken = authHeader.split('Bearer ')[1];


    try {
        console.log("API: send-notification (FCM) called.");
        const { targetUids, title, body, data, targetType } = req.body;

        if (!admin.apps.length) {
            throw new Error("Firebase Admin not initialized");
        }

        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const callerUid = decodedToken.uid;
        
        // Ensure caller is authorized (exists in users collection)
        const callerDoc = await getDb().collection('users').doc(callerUid).get();
        if (!callerDoc.exists) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        if (targetUids !== 'ALL' && (!targetUids || !Array.isArray(targetUids) || targetUids.length === 0)) {
            console.log("No targets provided.");
            return res.status(200).json({ success: false, successCount: 0, failureCount: 0 });
        }

        console.log(`Sending FCM Push to ${targetUids === 'ALL' ? 'ALL USERS' : targetUids.length + ' IDs'} (${targetType || 'auto'})`);

        // Fetch tokens for the users
        let tokens = [];
        if (targetUids === 'ALL') {
            const usersSnap = await getDb().collection('users').get();
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
                const refs = chunkUids.map(uid => getDb().collection('users').doc(uid));
                
                try {
                    const userDocs = await getDb().getAll(...refs);
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
            const response = await getMessaging().sendEachForMulticast(chunkMessage);
            
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

