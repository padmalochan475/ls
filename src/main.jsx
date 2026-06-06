import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from "@vercel/analytics/react"
import './styles/design-system.css'
import App from './App.jsx'

// Cleanup old/conflicting Service Workers to allow Firebase to take over exclusively
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    for (const registration of registrations) {
      const scriptURL = registration.active?.scriptURL || registration.installing?.scriptURL || registration.waiting?.scriptURL || "";
      // Unregister anything that is NOT our Firebase worker
      if (!scriptURL.includes('firebase-messaging-sw.js') && scriptURL !== "") {
        console.log("Unregistering Conflicting SW:", scriptURL);
        registration.unregister();
      }
    }
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>,
)
