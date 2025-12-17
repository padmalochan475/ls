importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

// 1. Initialize Firebase (COMPAT VERSION)
// Unlike the main app, SW runs in a different context.
// Ideally, use environment variables during build, but for simplicity/robustness in PWA:
// We rely on standard config passing or hardcoded generic init for the project.

// Note: If you encounter errors, you may need to hardcode the 'messagingSenderId' here.
const firebaseConfig = {
    // It is safe to expose this in client-side code
    messagingSenderId: "160195982823"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

console.log("[SW] Service Worker Loaded");

// 2. Handle Background Messages
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);

    // Customize notification presence
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/logo.svg', // Ensure this exists in public/
        badge: '/logo.svg',
        data: payload.data
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});
