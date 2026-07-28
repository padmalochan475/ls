import admin from 'firebase-admin';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load from .env.vercel
const envPath = path.resolve(process.cwd(), '.env.vercel');
dotenv.config({ path: envPath });

let serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountStr) {
    console.error("ERROR: FIREBASE_SERVICE_ACCOUNT not found in .env.vercel");
    process.exit(1);
}

if (serviceAccountStr.startsWith('"') && serviceAccountStr.endsWith('"')) {
    serviceAccountStr = serviceAccountStr.slice(1, -1);
}
// If dotenv already converted \n to real newlines, convert them back for JSON parser
serviceAccountStr = serviceAccountStr.replace(/\n/g, '\\n');
// Also if there were literal \\n, make sure they are correct
serviceAccountStr = serviceAccountStr.replace(/\\\\n/g, '\\n');
const serviceAccount = JSON.parse(serviceAccountStr);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

async function cleanupGhostUsers() {
    console.log("Starting Firebase Authentication Cleanup...");
    try {
        // 1. Get all users from Firestore
        const db = admin.firestore();
        const usersSnap = await db.collection('users').get();
        const firestoreUids = new Set();
        usersSnap.forEach(doc => firestoreUids.add(doc.id));
        console.log(`Found ${firestoreUids.size} users in Firestore 'users' collection.`);

        // 2. Get all users from Firebase Auth
        let allAuthUsers = [];
        let pageToken;
        do {
            const listUsersResult = await admin.auth().listUsers(1000, pageToken);
            allAuthUsers = allAuthUsers.concat(listUsersResult.users);
            pageToken = listUsersResult.pageToken;
        } while (pageToken);

        console.log(`Found ${allAuthUsers.length} users in Firebase Authentication.`);

        // 3. Find Orphans (In Auth but NOT in Firestore)
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago
        
        let deletedCount = 0;
        let skippedRecentCount = 0;

        for (const userRecord of allAuthUsers) {
            if (!firestoreUids.has(userRecord.uid)) {
                // Check if account is very new (prevent race condition during active signups)
                const creationTime = new Date(userRecord.metadata.creationTime);
                if (creationTime > oneHourAgo) {
                    console.log(`Skipping recent ghost user (created <1hr ago): ${userRecord.email}`);
                    skippedRecentCount++;
                    continue;
                }

                // Delete the orphan
                console.log(`Deleting orphaned ghost user from Auth: ${userRecord.email} (UID: ${userRecord.uid})`);
                await admin.auth().deleteUser(userRecord.uid);
                deletedCount++;
            }
        }

        console.log("-----------------------------------------");
        console.log(`Cleanup Complete!`);
        console.log(`- Deleted ${deletedCount} orphaned accounts from Firebase Auth.`);
        if (skippedRecentCount > 0) {
            console.log(`- Skipped ${skippedRecentCount} very recent accounts (just in case they are currently signing up).`);
        }

    } catch (error) {
        console.error("Error during cleanup:", error);
    } finally {
        process.exit(0);
    }
}

cleanupGhostUsers();
