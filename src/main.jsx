import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from "@vercel/analytics/react"
import './styles/design-system.css'
import App from './App.jsx'

// Cleanup old Firebase Workers to allow OneSignal to take over
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    for (const registration of registrations) {
      const scriptURL = registration.active?.scriptURL || "";
      if (scriptURL.includes('firebase-messaging-sw')) {
        // console.log("Unregistering Legacy Firebase SW:", scriptURL);
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
