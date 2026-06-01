import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, enableMultiTabIndexedDbPersistence } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getMessaging } from "firebase/messaging";

import firebaseConfig from './firebaseConfig';

// Guard: Only initialize once. During Vite HMR, this module may re-execute —
// getApps() checks if Firebase is already initialized to prevent duplicate-app errors
// which cause Firestore WebSocket assertion failures (ID: b815 / ca9).
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const db = getFirestore(app);

// Enable offline caching and multi-tab persistence to save Firebase Free Tier reads
enableMultiTabIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
        console.warn('Multiple tabs open, persistence can only be enabled in one tab at a a time.');
    } else if (err.code === 'unimplemented') {
        console.warn('The current browser does not support all of the features required to enable persistence');
    }
});
const auth = getAuth(app);
const storage = getStorage(app);

let messaging;
try {
    messaging = getMessaging(app);
} catch (err) {
    // getMessaging throws in non-browser environments (SSR/service workers)
    console.warn("Firebase Messaging unavailable:", err.message);
}

const googleProvider = new GoogleAuthProvider();

export { db, auth, storage, messaging, googleProvider };
export default app;
