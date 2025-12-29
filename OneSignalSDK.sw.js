console.log("LAMS Worker Starting...");
self.addEventListener('install', (event) => {
    self.skipWaiting(); // Force update
    console.log("LAMS Worker Installed & skipped waiting");
});
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim()); // Take control immediately
    console.log("LAMS Worker Activated & claimed clients");
});

try {
    importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDKWorker.js");
    console.log("LAMS Worker Imported.");
} catch (e) {
    console.error("LAMS Worker Import Failed:", e);
}

// FORCE MANUAL OVERRIDE LISTENER
self.addEventListener('push', (event) => {
    console.log("MANUAL PUSH LISTENER TRIGGERED");
    if (event.data) {
        try {
            // Clone data because reading it might lock it? No, event.data.json() returns new obj.
            const payload = event.data.json();
            // Check if OneSignal is handling it... OneSignal usually handles it internally.
            // But if it fails, we show this.
            // We can't detect failure easily. We will just SHOW IT.

            // Title & Body extraction
            const title = payload.title || payload.headings?.en || "LAMS Notification";
            const body = payload.alert || payload.body || payload.contents?.en || "New Alert";
            const icon = payload.icon || "https://cdn-icons-png.flaticon.com/512/2522/2522055.png";

            // Only show if we suspect OneSignal won't?
            // Let's just show it. Duplicate is better than nothing right now.
            const options = {
                body: body,
                icon: icon,
                vibrate: [300, 100, 400], // Strong Vibrate
                requireInteraction: true, // Stay on screen
                tag: 'manual-override-' + Date.now()
            };

            event.waitUntil(
                self.registration.showNotification(title, options)
            );
        } catch (err) {
            console.error("Manual Push Failed:", err);
        }
    }
});
