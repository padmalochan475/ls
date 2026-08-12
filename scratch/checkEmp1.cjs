const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, getDocs, deleteDoc, doc } = require('firebase/firestore');
const fs = require('fs');

const env = fs.readFileSync('.env.production', 'utf-8');
const config = {};
env.split('\n').forEach(line => {
    const parts = line.split('=');
    const k = parts.shift();
    const v = parts.join('=');
    if (k && v) {
        config[k.trim()] = v.trim().replace(/"/g, '');
    }
});

const app = initializeApp({
    apiKey: config.VITE_FIREBASE_API_KEY,
    authDomain: config.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: config.VITE_FIREBASE_PROJECT_ID,
    storageBucket: config.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: config.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: config.VITE_FIREBASE_APP_ID
});

const db = getFirestore(app);

async function check() {
    console.log('--- Faculty Collection ---');
    let fSnap = await getDocs(query(collection(db, 'faculty'), where('empId', '==', '1')));
    fSnap.forEach(d => console.log('Faculty (String 1):', d.id, d.data()));
    
    fSnap = await getDocs(query(collection(db, 'faculty'), where('empId', '==', 1)));
    fSnap.forEach(d => console.log('Faculty (Number 1):', d.id, d.data()));

    console.log('--- Users Collection ---');
    let uSnap = await getDocs(query(collection(db, 'users'), where('empId', '==', '1')));
    uSnap.forEach(d => console.log('User (String 1):', d.id, d.data()));
    
    uSnap = await getDocs(query(collection(db, 'users'), where('empId', '==', 1)));
    uSnap.forEach(d => console.log('User (Number 1):', d.id, d.data()));
    
    process.exit(0);
}

check().catch(console.error);
