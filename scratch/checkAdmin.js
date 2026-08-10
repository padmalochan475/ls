import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import * as dotenv from 'dotenv';
dotenv.config();

const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
    try {
        console.log("Fetching emp_lookups...");
        const snapshot = await getDocs(collection(db, 'emp_lookups'));
        snapshot.forEach(doc => {
            console.log(doc.id, "=>", doc.data());
        });
        
        console.log("\nFetching users...");
        const usersSnapshot = await getDocs(collection(db, 'users'));
        usersSnapshot.forEach(doc => {
            console.log(doc.id, "=>", doc.data().empId, doc.data().email, doc.data().role);
        });
    } catch (e) {
        console.error("Error:", e.message);
    }
    process.exit();
}

run();
