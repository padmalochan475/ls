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
      // Unregister anything that is NOT our Firebase worker, or broken workers
      if (!scriptURL.includes('firebase-messaging-sw.js')) {
        console.log("Unregistering Conflicting/Broken SW:", scriptURL || 'unknown');
        registration.unregister();
      }
    }
  });
}
// Catch Vite chunk load errors globally
window.addEventListener('error', (e) => {
  const message = e.message || '';
  if (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    message.includes('Unable to preload CSS')
  ) {
    const hasReloaded = sessionStorage.getItem('vite_hmr_reloaded');
    if (!hasReloaded) {
      sessionStorage.setItem('vite_hmr_reloaded', 'true');
      console.warn('[Global] Dynamic import error detected. Auto-reloading immediately...');
      window.location.reload();
    }
  }
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>,
)
