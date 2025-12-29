console.log("LAMS Worker Starting...");
self.addEventListener('install', (event) => {
    self.skipWaiting(); // Force update
});
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim()); // Take control immediately
});
try {
    importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDKWorker.js");
    console.log("LAMS Worker Imported.");
} catch (e) {
    console.error("LAMS Worker Import Failed:", e);
}
