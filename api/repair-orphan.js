/* eslint-env node */
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
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
        if (!getApps().length) {
            throw new Error("Firebase Admin not initialized. Check server logs.");
        }

        // 2. Verify Token & Admin Status
        const decodedToken = await getAuth().verifyIdToken(idToken);
        const callerUid = decodedToken.uid;

        const callerDoc = await getFirestore().collection('users').doc(callerUid).get();
        if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
            console.warn(`Unauthorized repair attempt by UID: ${callerUid}`);
            return res.status(403).json({ error: 'Forbidden: Requires admin privileges' });
        }

        // 3. Get Target and Action
        const { action, targetUid, targetEmpId } = req.body;
        if (!action) {
            return res.status(400).json({ error: 'Action is required' });
        }

        const db = getFirestore();

        // 4. Perform Safe Admin Repair Actions
        if (action === 'DELETE_ZOMBIE_AUTH') {
            if (!targetUid) return res.status(400).json({ error: 'targetUid is required' });
            try {
                await getAuth().deleteUser(targetUid);
                return res.status(200).json({ success: true, message: `Auth account ${targetUid} deleted.` });
            } catch (err) {
                return res.status(500).json({ error: err.message });
            }
        } 
        
        if (action === 'DELETE_ORPHANED_LOOKUP') {
            if (!targetEmpId) return res.status(400).json({ error: 'targetEmpId is required' });
            await db.collection('emp_lookups').doc(String(targetEmpId)).delete();
            return res.status(200).json({ success: true, message: `Lookup ${targetEmpId} deleted.` });
        }

        if (action === 'UNLINK_FACULTY') {
            if (!targetEmpId) return res.status(400).json({ error: 'targetEmpId is required' });
            const facSnap = await db.collection('faculty').where('empId', '==', String(targetEmpId)).get();
            if (facSnap.empty) return res.status(404).json({ error: 'Faculty not found' });
            
            const batch = db.batch();
            facSnap.forEach(d => {
                batch.update(d.ref, { uid: null, isRegistered: false });
            });
            await batch.commit();
            return res.status(200).json({ success: true, message: `Faculty ${targetEmpId} unlinked.` });
        }

        return res.status(400).json({ error: 'Invalid action' });

    } catch (error) {
        console.error('Repair Error:', error);
        return res.status(500).json({
            error: 'Failed to execute repair action',
            details: error.message
        });
    }
}
