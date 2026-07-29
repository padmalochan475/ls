/* eslint-env node */
import admin from 'firebase-admin';

// Singleton Initialization
if (!admin.apps.length) {
    try {
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            let serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT;
            if (serviceAccountStr.startsWith('"') && serviceAccountStr.endsWith('"')) {
                serviceAccountStr = serviceAccountStr.slice(1, -1);
            }
            serviceAccountStr = serviceAccountStr.replace(/\n/g, '\\n').replace(/\\\\n/g, '\\n');
            const serviceAccount = JSON.parse(serviceAccountStr);
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
    // Enable CORS manually
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // 1. Get Token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }
    const idToken = authHeader.split('Bearer ')[1];

    try {
        if (!admin.apps.length) {
            throw new Error("Firebase Admin not initialized. Check server logs.");
        }

        // 2. Verify Token
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;

        // 3. Revoke Refresh Tokens
        await admin.auth().revokeRefreshTokens(uid);

        // 4. (Optional) Update Firestore timestamp to enforce client-side checks
        // await admin.firestore().collection('users').doc(uid).update({ 
        //    lastLogoutAt: admin.firestore.FieldValue.serverTimestamp() 
        // });

        console.log(`Sessions revoked for user: ${uid}`);
        return res.status(200).json({ success: true, message: 'All other sessions have been revoked.' });

    } catch (error) {
        console.error('Revoke Session Error:', error);
        return res.status(500).json({
            error: 'Failed to revoke sessions',
            details: error.message
        });
    }
}
