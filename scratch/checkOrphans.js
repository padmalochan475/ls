import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  if (!getApps().length) {
      let serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (serviceAccountStr.startsWith('"') && serviceAccountStr.endsWith('"')) {
          serviceAccountStr = serviceAccountStr.slice(1, -1);
      }
      serviceAccountStr = serviceAccountStr.replace(/\n/g, '\\n').replace(/\\\\n/g, '\\n');
      const serviceAccount = JSON.parse(serviceAccountStr);
      initializeApp({ credential: cert(serviceAccount) });
  }

  const auth = getAuth();
  const db = getFirestore();
  const users = await auth.listUsers(1000);
  console.log('Total Auth Users:', users.users.length);
  const dbUsers = await db.collection('users').get();
  console.log('Total Firestore Users:', dbUsers.size);
  let missing = 0;
  for (const u of users.users) {
     const doc = await db.collection('users').doc(u.uid).get();
     if (!doc.exists) {
        missing++;
        console.log('Missing in Firestore:', u.email, u.uid);
     }
  }
  console.log('Total Missing:', missing);
}

run().catch(console.error);
