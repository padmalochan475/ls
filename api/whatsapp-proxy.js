/* eslint-env node */
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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
            initializeApp();
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
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-api-key'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { path } = req.query;
    if (!path) {
        return res.status(400).json({ error: 'Missing path parameter' });
    }

    try {
        const db = getDb();
        const configDoc = await db.collection('settings').doc('config').get();
        let whatsappApiUrl = 'http://129.225.114.212:2785'; // Fallback

        if (configDoc.exists && configDoc.data().whatsappApiUrl) {
            whatsappApiUrl = configDoc.data().whatsappApiUrl;
        }

        // Clean up URL in case it has trailing slashes
        whatsappApiUrl = whatsappApiUrl.replace(/\/+$/, '');
        // Ensure path starts with /
        const formattedPath = path.startsWith('/') ? path : `/${path}`;

        const targetUrl = `${whatsappApiUrl}${formattedPath}`;
        
        console.log(`[WhatsApp Proxy] Relaying ${req.method} to: ${targetUrl}`);

        const fetchOptions = {
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...(req.headers['x-api-key'] ? { 'x-api-key': req.headers['x-api-key'] } : {})
            },
        };

        if (req.method !== 'GET' && req.method !== 'HEAD') {
            fetchOptions.body = JSON.stringify(req.body);
        }

        const response = await fetch(targetUrl, fetchOptions);
        
        // Handle non-JSON responses gracefully
        const textResponse = await response.text();
        let data;
        try {
            data = JSON.parse(textResponse);
        } catch(e) {
            data = { text: textResponse };
        }

        res.status(response.status).json(data || {});

    } catch (error) {
        console.error("[WhatsApp Proxy] Error:", error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
}
