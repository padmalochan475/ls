importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

console.log("LAMS Worker Loaded via importScripts");

// Custom Listeners (Optional Fallback)
self.addEventListener('push', (event) => {
    // console.log("LAMS SW: Push Event:", event.data ? event.data.text() : "No Data");
    // OneSignal usually handles this. Only uncomment manual showNotification if OneSignal fails strictly.
});
