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

    // Parse data payload (backend sends data-only to ensure SW handling)
    const notificationTitle = payload.notification?.title || payload.data?.title;
    const notificationBody = payload.notification?.body || payload.data?.body;
    const notificationOptions = {
        body: notificationBody,
        icon: '/logo.svg',
        badge: '/logo.svg',
        data: payload.data // Pass data (including url) to the notification
    };

    if (notificationTitle) {
        self.registration.showNotification(notificationTitle, notificationOptions);
    }
});

// 3. Handle Notification Clicks
self.addEventListener('notificationclick', function (event) {
    console.log('[firebase-messaging-sw.js] Notification click received.');
    event.notification.close();

    const targetUrl = (event.notification.data && event.notification.data.url) || '/';

    // Open the app and navigate
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windowClients) {
            // Check if there is already a window open with this URL
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes(targetUrl) && 'focus' in client) {
                    return client.focus();
                }
            }
            // If not, open a new window
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
