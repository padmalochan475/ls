import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getMessaging } from "firebase/messaging";

import firebaseConfig from './firebaseConfig';

// Guard: Only initialize once. During Vite HMR, this module may re-execute —
// getApps() checks if Firebase is already initialized to prevent duplicate-app errors
// which cause Firestore WebSocket assertion failures (ID: b815 / ca9).
let app;
let db;
let auth;
let storage;

try {
    // Guard: Only initialize once. During Vite HMR, this module may re-execute
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    
    // Enable offline caching and multi-tab persistence
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})
    });
    auth = getAuth(app);
    storage = getStorage(app);
} catch (error) {
    console.error("🔥 CRITICAL: Firebase failed to initialize. Check environment variables (.env.local).", error);
}

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
