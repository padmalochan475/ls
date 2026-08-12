import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import dotenv from 'dotenv';

// Load env
const envConfig = dotenv.parse(fs.readFileSync('.env.production'));
for (const k in envConfig) {
    process.env[k] = envConfig[k];
}

let serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT;
if (serviceAccountStr.startsWith('"') && serviceAccountStr.endsWith('"')) {
    serviceAccountStr = serviceAccountStr.slice(1, -1);
}
// Fix actual newlines inside the JSON string
serviceAccountStr = serviceAccountStr.replace(/\n/g, '\\n').replace(/\\\\n/g, '\\n');
const serviceAccount = JSON.parse(serviceAccountStr);

const app = initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore(app);
const auth = getAuth(app);

async function fix() {
    console.log('--- Scanning Faculty Collection ---');
    const f1 = await db.collection('faculty').where('empId', '==', '1').get();
    for (const d of f1.docs) {
        console.log('Deleting Faculty (String 1):', d.id, d.data().name);
        await db.collection('faculty').doc(d.id).delete();
    }
    const f2 = await db.collection('faculty').where('empId', '==', 1).get();
    for (const d of f2.docs) {
        console.log('Deleting Faculty (Number 1):', d.id, d.data().name);
        await db.collection('faculty').doc(d.id).delete();
    }

    console.log('--- Scanning Users Collection ---');
    const u1 = await db.collection('users').where('empId', '==', '1').get();
    for (const d of u1.docs) {
        console.log('Deleting User (String 1):', d.id, d.data().name);
        await auth.deleteUser(d.id).catch(e => console.log('Auth delete failed:', e.message));
        await db.collection('users').doc(d.id).delete();
    }
    const u2 = await db.collection('users').where('empId', '==', 1).get();
    for (const d of u2.docs) {
        console.log('Deleting User (Number 1):', d.id, d.data().name);
        await auth.deleteUser(d.id).catch(e => console.log('Auth delete failed:', e.message));
        await db.collection('users').doc(d.id).delete();
    }
    
    console.log('--- Scanning emp_lookups Collection ---');
    try {
        await db.collection('emp_lookups').doc('1').delete();
        console.log('Deleted emp_lookups/1');
    } catch (e) {
        console.log('Failed to delete emp_lookups/1', e.message);
    }
    
    console.log('--- Done! ---');
    process.exit(0);
}

fix().catch(console.error);
