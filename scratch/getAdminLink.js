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
        }
        for (const doc of snapshot.docs) {
            const data = doc.data();
            console.log("\nFound Admin:", doc.id);
            console.log("Data:", data);
            
            try {
                const link = await auth.generatePasswordResetLink(data.email);
                console.log("====================================");
                console.log(`PASSWORD RESET LINK FOR ${data.empId} (${data.email}):`);
                console.log(link);
                console.log("====================================");
            } catch (e) {
                console.log("Could not find Auth user for this email:", e.message);
            }
        }
    } catch (e) {
        console.error(e);
    }
    process.exit();
}

run();
