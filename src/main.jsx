import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from "@vercel/analytics/react"
import './styles/design-system.css'
import App from './App.jsx'

// Cleanup old OneSignal Workers to allow Firebase to take over
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    for (const registration of registrations) {
      const scriptURL = registration.active?.scriptURL || "";
      if (scriptURL.includes('OneSignal')) {
        console.log("Unregistering Legacy OneSignal SW:", scriptURL);
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
