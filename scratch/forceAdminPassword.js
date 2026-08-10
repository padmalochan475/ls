import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccount = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'service-account.json'), 'utf8'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const auth = getAuth();

async function run() {
    try {
        console.log("Looking for users with role = 'admin'");
        const snapshot = await db.collection('users').where('role', '==', 'admin').get();
        if (snapshot.empty) {
            console.log("No admins found!");
            process.exit();
        }
        for (const doc of snapshot.docs) {
            const data = doc.data();
            console.log(`\nFound Admin: ${data.empId} (${data.email})`);
            
            try {
                const userRec = await auth.getUserByEmail(data.email);
                console.log(`Auth UID: ${userRec.uid}`);
                
                const newPassword = "AdminPassword123!";
                await auth.updateUser(userRec.uid, {
                    password: newPassword
                });
                console.log(`\n✅ SUCCESS! Password for Admin (${data.empId}) has been forcefully reset to: ${newPassword}`);
                
            } catch (e) {
                console.log("Error updating user:", e.message);
            }
        }
    } catch (e) {
        console.error(e);
    }
    process.exit();
}

run();
