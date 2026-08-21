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

        // 2. Verify Token
        const decodedToken = await getAuth().verifyIdToken(idToken);
        const callerUid = decodedToken.uid;

        // 3. Verify Caller is Admin
        const callerDoc = await getFirestore().collection('users').doc(callerUid).get();
        if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
            console.warn(`Unauthorized delete attempt by UID: ${callerUid}`);
            return res.status(403).json({ error: 'Forbidden: Requires admin privileges' });
        }

        // 4. Get Target UID
        const { targetUid } = req.body;
        if (!targetUid) {
            return res.status(400).json({ error: 'targetUid is required' });
        }

        if (callerUid === targetUid) {
            return res.status(400).json({ error: 'Cannot delete yourself' });
        }

        // 5. Multi-stage atomic/retryable deletion state machine
        const db = getFirestore();
        const targetUserRef = db.collection('users').doc(targetUid);
        const userSnap = await targetUserRef.get();
        let userData = userSnap.exists ? userSnap.data() : null;

        try {
            if (userSnap.exists) {
                // A. Mark Pending and Audit
                const batch1 = db.batch();
                batch1.update(targetUserRef, {
                    deletionStatus: 'pending',
                    deletionRetryable: true
                });

                const auditRef = db.collection('audit_logs').doc();
                batch1.set(auditRef, {
                    action: 'DELETE_USER_REQUESTED',
                    targetUid,
                    adminUid: callerUid,
                    timestamp: new Date().toISOString(),
                    details: `Admin initiated deletion for user ${targetUid} (${userData.email || 'unknown'})`
                });
                await batch1.commit();

                // B. Unlink Firestore Identity References
                const batch2 = db.batch();
                if (userData.empId) {
                    const lookupRef = db.collection('emp_lookups').doc(String(userData.empId));
                    batch2.delete(lookupRef);

                    const facSnap = await db.collection('faculty').where('uid', '==', targetUid).get();
                    if (!facSnap.empty) {
                        facSnap.forEach((d) => {
                            batch2.update(d.ref, {
                                uid: null,
                                isRegistered: false
                            });
                        });
                    }
                }
                await batch2.commit();
            }

            // C. Delete User from Firebase Auth (idempotent)
            try {
                await getAuth().deleteUser(targetUid);
                console.log(`Successfully deleted user ${targetUid} from Firebase Auth by Admin ${callerUid}`);
            } catch (authErr) {
                if (authErr.code === 'auth/user-not-found') {
                    console.log(`User ${targetUid} already deleted from Auth. Proceeding with cleanup.`);
                } else {
                    throw authErr;
                }
            }

            // D. Complete Deletion
            if (userSnap.exists) {
                await targetUserRef.delete();
                console.log(`Successfully purged Firestore profile for user ${targetUid}`);
            }

            return res.status(200).json({ success: true, message: 'User permanently deleted from Authentication and Firestore.' });

        } catch (processErr) {
            console.error('Deletion Process Error:', processErr);
            if (userSnap.exists) {
                try {
                    await targetUserRef.update({
                        deletionStatus: 'failed',
                        deletionError: processErr.message || processErr.code || 'Unknown error',
                        deletionRetryable: true
                    });
                } catch (updateErr) {
                    console.error('Failed to write deletionStatus=failed:', updateErr);
                }
            }
            return res.status(500).json({
                error: 'Account deletion failed partially. Please retry.',
                details: processErr.message
            });
        }

    } catch (error) {
        console.error('Delete User Error:', error);
        return res.status(500).json({
            error: 'Failed to delete user',
            details: error.message
        });
    }
}
