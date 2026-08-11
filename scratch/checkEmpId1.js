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
        console.log("Looking for empId: '1'");
        const docSnap = await db.collection('emp_lookups').doc('1').get();
        if (docSnap.exists) {
            console.log("emp_lookups data:", docSnap.data());
        } else {
            console.log("No emp_lookups for '1'");
        }
        
        const userDocs = await db.collection('users').where('empId', '==', '1').get();
        userDocs.forEach(d => {
            console.log("users table data for '1':", d.data());
        });
        
    } catch (e) {
        console.error(e);
    }
    process.exit();
}

run();
