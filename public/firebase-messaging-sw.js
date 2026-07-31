// Firebase Cloud Messaging Service Worker
// Automatically intercepts background push notifications

importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Force immediate activation to prevent getting stuck in "waiting" state
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

// Parse Firebase config from the URL query parameters
const urlParams = new URLSearchParams(self.location.search);
const firebaseConfig = {
    apiKey: urlParams.get('apiKey'),
    authDomain: urlParams.get('authDomain'),
    projectId: urlParams.get('projectId'),
    storageBucket: urlParams.get('storageBucket'),
    messagingSenderId: urlParams.get('messagingSenderId'),
    appId: urlParams.get('appId'),
};

// Initialize Firebase App in the Service Worker ONLY if config is synchronously present
if (firebaseConfig.projectId) {
    firebase.initializeApp(firebaseConfig);
    const messaging = firebase.messaging();

    // Background message handler (Registered SYNCHRONOUSLY so the browser doesn't drop the push event)
    messaging.onBackgroundMessage((payload) => {
        console.log('[firebase-messaging-sw.js] Received background message ', payload);

        // CRITICAL FIX: Always manually handle the display and return the Promise
        // If we don't return the promise, Android kills the background thread instantly before it displays.
        const notificationTitle = payload.notification?.title || payload.data?.title || 'New Notification';
        const notificationOptions = {
            body: payload.notification?.body || payload.data?.body || '',
            icon: payload.data?.icon || 'https://cdn-icons-png.flaticon.com/512/2522/2522055.png',
            data: payload.data || {},
        };

        return self.registration.showNotification(notificationTitle, notificationOptions);
    });
}

// Custom notificationclick handler removed. FCM handles clicks automatically via fcmOptions.link.
