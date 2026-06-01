import React from 'react';
import ReactDOM from 'react-dom/client';
// import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles.css';

// registerSW({ immediate: true });

console.log('Golf beta app bundle loaded', 'course-default-empty-2026-05-23');

async function clearLegacyPwaCache() {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));

      if (navigator.serviceWorker.controller && !sessionStorage.getItem('legacy-pwa-cache-cleared')) {
        sessionStorage.setItem('legacy-pwa-cache-cleared', 'true');
        window.location.reload();
        return;
      }
    }

    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((cacheName) => /workbox|precache|vite-pwa|golf/i.test(cacheName))
          .map((cacheName) => caches.delete(cacheName))
      );
    }
  } catch {
    // Keep the beta app usable if a browser blocks cache/service-worker access.
  }
}

clearLegacyPwaCache();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
